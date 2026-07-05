import {
  asEncryptedHandle,
  createConfidentialAirdropClient,
  encryptUint64,
  erc7984OperatorAbi,
  signClaimAuthorization,
} from "@tokenops/sdk/fhe-airdrop";
import {
  useCreateAndFundConfidentialAirdropAndGetAddress,
  useSignClaimAuthorization,
} from "@tokenops/sdk/fhe-airdrop/react";
import { useDisperse, useGetBatchLimits } from "@tokenops/sdk/fhe-disperse/react";
import { useConfidentialBalance, useZamaSDK } from "@zama-fhe/react-sdk";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createWalletClient, getAddress, http, isAddress, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount, usePublicClient, useSignMessage, useSwitchChain, useWalletClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";

import { CipherValue } from "../components/viz/CipherValue";
import { SigningProgress } from "../components/SigningProgress";
import { useWalletModal } from "../components/WalletModal";
import { campaignAuthMessage, saveCampaign } from "../lib/api";
import { claimLinkFor, portalUrl, type Campaign } from "../lib/claimLink";
import {
  DEMO_TOKEN,
  DISPERSE_SINGLETON,
  FHE_AIRDROP_FACTORY,
  OPERATOR_DEADLINE,
  TOKEN_SYMBOL,
  explorerAddr,
  explorerTx,
} from "../lib/config";
import { looksLikeEns, resolveEns } from "../lib/ens";
import { fmtToken, parseToken, shortAddr, stripDigitGroups } from "../lib/format";
import { useTokenMeta } from "../hooks/useTokenMeta";

interface Recipient {
  address: Address;
  units: bigint;
  /** The ENS name this row was entered as, when it wasn't a raw address. */
  label?: string;
}
type Phase =
  | "idle"
  | "approving"
  | "creating"
  | "securing"
  | "granting"
  | "signing"
  | "dispersing"
  | "done"
  | "error";

// Lists this size or larger sign with a throwaway batch key (one grant tx instead
// of one wallet popup per recipient). 1-2 recipients sign manually.
const EPHEMERAL_MIN = 3;
const SIGN_CONCURRENCY = 5; // parallel encrypt+sign calls when the batch signer is used
const PREVIEW_SIZE = 5; // recipients shown per page in the review preview
// Must match MAX_ENTRIES in api/_lib/handlers.ts - blocking here means an
// oversized list is caught before any funds move, not at the final save.
const MAX_RECIPIENTS = 1000;
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const SAMPLE =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 4200\n0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 1500\n0x90F79bf6EB2c4f870365E785982E1f101E93b906, 8000";

const STEPS = ["Token", "Recipients", "Method", "Review", "Send"] as const;

export function DistributePage() {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useWalletModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient();
  const [searchParams] = useSearchParams();

  // Writes need a wallet client scoped to Sepolia. wagmi only configures Sepolia,
  // so a wallet on any other network reports `isConnected` but yields NO wallet
  // client - every TokenOps write then throws MissingWalletClientError. Gate the
  // whole flow on the right chain so that can never surface as a raw SDK error.
  const wrongChain = isConnected && chainId !== sepolia.id;

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"airdrop" | "disperse">("airdrop");
  const [name, setName] = useState("");
  const [token, setToken] = useState<string>(() => {
    const t = searchParams.get("token");
    return t && isAddress(t) ? getAddress(t) : DEMO_TOKEN;
  });
  const [raw, setRaw] = useState("");
  const [lens, setLens] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // The user explicitly clicks "verify" in Review to decrypt their own balance -
  // a labelled action, so the wallet's decrypt popup has context (nobody signs an
  // unexplained request). Reset whenever the token changes (below).
  const [verifyRequested, setVerifyRequested] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | undefined>();
  const [pending, setPending] = useState<{
    airdrop: Address;
    block: number;
    endTs: number;
    auth: Hex | null;
  } | null>(null);
  const [disperseTx, setDisperseTx] = useState<Hex | undefined>();
  // True once a disperse tx has been broadcast. Disperse isn't idempotent and,
  // unlike airdrop, has no on-chain "already funded" marker - so if the send
  // errors AFTER broadcast (e.g. receipt-wait timeout) we must not offer a plain
  // re-send button, or the user could pay everyone twice.
  const [disperseSent, setDisperseSent] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number | "custom">(7);
  const [customEnd, setCustomEnd] = useState("");

  function computeEnd(now: number): number {
    if (windowDays === "custom") return customEnd ? Math.floor(new Date(customEnd).getTime() / 1000) : 0;
    return now + windowDays * 86400;
  }

  const zama = useZamaSDK();
  const createFund = useCreateAndFundConfidentialAirdropAndGetAddress();
  const signClaim = useSignClaimAuthorization();
  const disperse = useDisperse({ encryptor: () => zama.relayer });
  const batchLimits = useGetBatchLimits();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const meta = useTokenMeta(token);
  const decimals = meta.decimals;
  const symbol = meta.symbol || TOKEN_SYMBOL;
  const tokenAddr = token as `0x${string}`;

  // Decrypt the sender's OWN confidential balance to pre-flight the send.
  // ERC-7984 transfers don't revert when you overspend - they silently cap at
  // your balance (often to 0) to avoid leaking it - so an over-balance drop would
  // "succeed" but fund ~nothing. Only runs once the user clicks "verify" in Review.
  const senderBalance = useConfidentialBalance(
    { tokenAddress: tokenAddr },
    { enabled: verifyRequested && isConnected && !wrongChain && meta.valid && meta.confidential },
  );
  // A new token invalidates a prior verification - make the user re-check it.
  useEffect(() => {
    setVerifyRequested(false);
  }, [tokenAddr]);

  // ENS names resolve against mainnet as the user types; results land in this
  // map and the parser re-runs. Names not yet in the map are "resolving".
  const [ensMap, setEnsMap] = useState<Map<string, Address | null>>(new Map());
  const { rows, errors, resolving } = useMemo(
    () => parseRecipients(stripCsvHeader(raw), decimals, ensMap),
    [raw, decimals, ensMap],
  );
  useEffect(() => {
    if (resolving.length === 0) return;
    let cancelled = false;
    // Small delay so half-typed names don't fire a lookup per keystroke; the
    // resolver also memoizes, so a name costs one round trip per session.
    const t = setTimeout(() => {
      Promise.all(resolving.map(async (name) => [name.toLowerCase(), await resolveEns(name)] as const)).then(
        (entries) => {
          if (cancelled) return;
          setEnsMap((prev) => {
            const next = new Map(prev);
            for (const [k, v] of entries) next.set(k, v);
            return next;
          });
        },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [resolving]);
  const total = useMemo(() => rows.reduce((s, r) => s + r.units, 0n), [rows]);
  // Balance verification (Review step). The user must decrypt their balance and
  // clear the total before Send; a definite shortfall hard-blocks.
  const balanceKnown = senderBalance.data !== undefined;
  const insufficient = balanceKnown && total > 0n && total > (senderBalance.data ?? 0n);
  const verifiedEnough = balanceKnown && !insufficient;
  const verifyFailed = verifyRequested && senderBalance.isError;
  const busy =
    phase === "approving" ||
    phase === "granting" ||
    phase === "creating" ||
    phase === "securing" ||
    phase === "signing" ||
    phase === "dispersing";
  const phaseLabel =
    phase === "approving"
      ? "Authorizing token…"
      : phase === "creating"
        ? "Creating + funding your airdrop…"
        : phase === "securing"
          ? "Sign in your wallet to secure the claim page…"
          : phase === "granting"
            ? "Preparing the batch signer…"
            : phase === "signing"
              ? `Encrypting & signing ${progress.done}/${progress.total}…`
              : phase === "dispersing"
                ? "Encrypting & dispersing to recipients…"
                : "";

  // null = limits not loaded yet (loading or errored) - distinct from the SDK's
  // "0 = no limit", so the gate can't silently pass before the read resolves.
  const disperseLimit = batchLimits.data === undefined ? null : Number(batchLimits.data.direct);
  const disperseLimitUnknown = mode === "disperse" && disperseLimit === null;
  const overDisperseLimit =
    mode === "disperse" && disperseLimit !== null && disperseLimit > 0 && rows.length > disperseLimit;

  const previewPageCount = Math.max(1, Math.ceil(rows.length / PREVIEW_SIZE));
  const previewSafePage = Math.min(previewPage, previewPageCount - 1);
  const previewRows = rows.slice(previewSafePage * PREVIEW_SIZE, (previewSafePage + 1) * PREVIEW_SIZE);

  const fileRef = useRef<HTMLInputElement>(null);
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(stripCsvHeader(String(reader.result ?? "")));
    reader.readAsText(file);
    e.target.value = "";
  }

  async function runAirdrop() {
    if (!address || rows.length === 0 || errors.length > 0 || resolving.length > 0 || !publicClient) return;
    if (insufficient) return; // button is disabled in this state - backstop against a race
    setErrMsg(null);
    setSaveNote(null);
    setCampaign(null);
    setProgress({ done: 0, total: 0 });
    try {
      // 1. Authorize the factory to pull tokens for funding (once per token).
      setPhase("approving");
      const isOp = await publicClient.readContract({
        address: tokenAddr,
        abi: erc7984OperatorAbi,
        functionName: "isOperator",
        args: [address, FHE_AIRDROP_FACTORY],
      });
      if (!isOp) {
        const opHash = await writeContractAsync({
          address: tokenAddr,
          abi: erc7984OperatorAbi,
          functionName: "setOperator",
          args: [FHE_AIRDROP_FACTORY, OPERATOR_DEADLINE],
        });
        await publicClient.waitForTransactionReceipt({ hash: opHash });
      }

      // 2. Deploy + fund the airdrop with the encrypted total.
      setPhase("creating");
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const now = Math.floor(Date.now() / 1000);
      const endTs = computeEnd(now);
      if (endTs <= now) {
        setErrMsg("Pick a claim-window end in the future.");
        setPhase("error");
        return;
      }
      const { airdrop } = await createFund.mutateAsync({
        params: {
          token: tokenAddr,
          startTimestamp: now,
          endTimestamp: endTs,
          canExtendClaimWindow: true,
          admin: address,
        },
        userSalt: salt,
        amount: total,
        encryptor: zama.relayer,
      });
      const createBlock = Number(await publicClient.getBlockNumber());

      // One signature authorizes every store write for this campaign (draft
      // save, final save, withdrawn flag) - without it, anyone could overwrite
      // the claim file. Declining just skips the hosted claim page; the
      // self-contained link still works.
      setPhase("securing");
      let auth: Hex | null = null;
      try {
        auth = await signMessageAsync({ message: campaignAuthMessage(airdrop) });
      } catch {
        auth = null;
      }

      // Save immediately (before signing) so the funded airdrop is always
      // listable + refundable in Campaigns, even if signing fails below.
      const pend = { airdrop, block: createBlock, endTs, auth };
      setPending(pend);
      if (auth) {
        try {
          await saveCampaign({
            airdrop,
            creator: address,
            name: name.trim() || undefined,
            count: rows.length,
            token: tokenAddr,
            symbol,
            decimals,
            endTime: endTs,
            block: createBlock,
            mode: "airdrop",
            entries: {},
            complete: false,
            auth,
          });
        } catch (e) {
          console.warn("draft save failed", e);
        }
      }

      // 3-5. Grant a batch signer, sign every allocation, finalize.
      await runSigning(pend);
    } catch (e) {
      setErrMsg(cleanError(e instanceof Error ? e.message : String(e)));
      setPhase("error");
    }
  }

  // Grant a throwaway batch-signer key, sign every allocation, and finalize the
  // campaign. Split out so a signing failure can be retried with a fresh key
  // WITHOUT re-funding - the airdrop is already funded.
  async function runSigning(pend: { airdrop: Address; block: number; endTs: number; auth: Hex | null }) {
    if (!address || !publicClient) return;
    const { airdrop, block, endTs, auth } = pend;

    let ephWallet: ReturnType<typeof createWalletClient> | null = null;
    if (rows.length >= EPHEMERAL_MIN && walletClient) {
      setPhase("granting");
      const ephAccount = privateKeyToAccount(generatePrivateKey());
      const client = createConfidentialAirdropClient({ publicClient, walletClient, address: airdrop });
      const grantHash = await client.grantRole(DEFAULT_ADMIN_ROLE, ephAccount.address);
      await publicClient.waitForTransactionReceipt({ hash: grantHash });
      ephWallet = createWalletClient({ account: ephAccount, chain: sepolia, transport: http() });
    }

    setPhase("signing");
    setProgress({ done: 0, total: rows.length });
    const claims: Campaign["claims"] = {};
    let done = 0;

    const signOne = async (r: Recipient) => {
      const enc = await encryptUint64({
        encryptor: zama.relayer,
        contractAddress: airdrop,
        userAddress: r.address,
        value: r.units,
      });
      const signature: Hex = ephWallet
        ? ((await signClaimAuthorization({
            walletClient: ephWallet,
            airdropAddress: airdrop,
            recipient: r.address,
            encryptedAmountHandle: asEncryptedHandle(enc.handle),
          })) as Hex)
        : await signClaim.mutateAsync({
            airdropAddress: airdrop,
            recipient: r.address,
            encryptedAmountHandle: enc.handle,
          });
      claims[r.address.toLowerCase()] = { encryptedInput: enc, signature };
      setProgress({ done: ++done, total: rows.length });
    };

    if (ephWallet) {
      // The throwaway key signs locally (no popups), so encrypt + sign in
      // parallel batches - the relayer round-trips are the bottleneck.
      for (let i = 0; i < rows.length; i += SIGN_CONCURRENCY) {
        await Promise.all(rows.slice(i, i + SIGN_CONCURRENCY).map(signOne));
      }
    } else {
      // Manual wallet signature per recipient - sequential, one popup at a time.
      for (const r of rows) await signOne(r);
    }

    const campaignName = name.trim() || undefined;
    setCampaign({ airdrop, claims, name: campaignName });
    let ok = false;
    if (auth) {
      try {
        const res = await saveCampaign({
          airdrop,
          creator: address,
          name: campaignName,
          count: rows.length,
          token: tokenAddr,
          symbol,
          decimals,
          endTime: endTs,
          block,
          mode: "airdrop",
          entries: claims,
          complete: true,
          auth,
        });
        setSavedSlug(res.slug);
        setSaveNote(null);
        ok = true;
      } catch (e) {
        console.warn("campaign save failed", e);
        setSaveNote(
          `The campaign store rejected the save: ${e instanceof Error ? e.message : "unknown error"}. Your funds and the link below are safe.`,
        );
      }
    } else {
      setSaveNote(
        "You declined the signature that records this campaign, so it won't appear in Your campaigns. The claim link below is self-contained - copy it now.",
      );
    }
    setSaved(ok);
    setPending(null);
    setPhase("done");
  }

  // Retry the signing phase with a fresh throwaway key on the already-funded airdrop.
  async function retrySigning() {
    if (!pending) return;
    setErrMsg(null);
    setProgress({ done: 0, total: 0 });
    try {
      await runSigning(pending);
    } catch (e) {
      setErrMsg(cleanError(e instanceof Error ? e.message : String(e)));
      setPhase("error");
    }
  }

  // Disperse: push encrypted amounts straight to every recipient in one tx. No
  // claim, no signing loop - the SDK batch-encrypts all amounts in one proof.
  async function runDisperse() {
    if (!address || rows.length === 0 || errors.length > 0 || resolving.length > 0 || !publicClient) return;
    if (insufficient) return; // button is disabled in this state - backstop against a race
    setErrMsg(null);
    setDisperseTx(undefined);
    setDisperseSent(false);
    setProgress({ done: 0, total: 0 });
    try {
      // Authorize the disperse singleton to pull tokens (once per token).
      setPhase("approving");
      const isOp = await publicClient.readContract({
        address: tokenAddr,
        abi: erc7984OperatorAbi,
        functionName: "isOperator",
        args: [address, DISPERSE_SINGLETON],
      });
      if (!isOp) {
        const opHash = await writeContractAsync({
          address: tokenAddr,
          abi: erc7984OperatorAbi,
          functionName: "setOperator",
          args: [DISPERSE_SINGLETON, OPERATOR_DEADLINE],
        });
        await publicClient.waitForTransactionReceipt({ hash: opHash });
      }

      setPhase("dispersing");
      setDisperseSent(true);
      const res = await disperse.mutateAsync({
        token: tokenAddr,
        mode: "direct",
        recipients: rows.map((r) => r.address),
        amounts: rows.map((r) => r.units),
      });
      setDisperseTx(res.hash);
      // Record it in Campaigns as sent history (no claim/refund - already
      // pushed). Declining the auth signature just skips the history entry.
      try {
        const auth = await signMessageAsync({ message: campaignAuthMessage(res.hash) });
        const block = Number(await publicClient.getBlockNumber());
        await saveCampaign({
          airdrop: res.hash,
          creator: address,
          name: name.trim() || undefined,
          count: rows.length,
          token: tokenAddr,
          symbol,
          decimals,
          endTime: 0,
          block,
          mode: "disperse",
          entries: {},
          complete: true,
          auth,
        });
      } catch (e) {
        console.warn("disperse save failed", e);
      }
      setPhase("done");
    } catch (e) {
      setErrMsg(cleanError(e instanceof Error ? e.message : String(e)));
      setPhase("error");
    }
  }

  function resetAll() {
    setStep(0);
    setPhase("idle");
    setRaw("");
    setName("");
    setCampaign(null);
    setSaved(false);
    setSaveNote(null);
    setSavedSlug(undefined);
    setPending(null);
    setDisperseTx(undefined);
    setDisperseSent(false);
    setErrMsg(null);
    setPreviewPage(0);
    setProgress({ done: 0, total: 0 });
    setLens(false);
    setWindowDays(7);
    setCustomEnd("");
    setVerifyRequested(false);
  }

  // Wizard navigation clears any stale error from a previous attempt; a failed
  // run that never funded anything (no `pending`) goes back to a clean idle state.
  function goStep(s: number) {
    setErrMsg(null);
    if (phase === "error" && !pending) setPhase("idle");
    setStep(s);
  }

  // ---- step gating ----
  const customEndInvalid =
    mode === "airdrop" &&
    windowDays === "custom" &&
    (!customEnd || Math.floor(new Date(customEnd).getTime() / 1000) <= Math.floor(Date.now() / 1000));
  const tooMany = rows.length > MAX_RECIPIENTS;
  const stepReady = [
    meta.valid && meta.confidential,
    rows.length > 0 && errors.length === 0 && resolving.length === 0 && !tooMany,
    mode === "disperse" ? !overDisperseLimit && !disperseLimitUnknown : !customEndInvalid,
    verifiedEnough, // Review -> Send: must decrypt balance and clear the total first
    true,
  ];
  const continueLabel = [
    !meta.valid || !meta.confidential ? "Enter a valid confidential token" : "Continue",
    resolving.length > 0
      ? `Resolving ${resolving.length} name${resolving.length === 1 ? "" : "s"}…`
      : rows.length === 0
        ? "Add at least one recipient"
        : tooMany
          ? `Max ${MAX_RECIPIENTS.toLocaleString()} recipients per drop`
          : errors.length > 0
            ? `Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} to continue`
            : "Continue",
    overDisperseLimit
      ? `Max ${disperseLimit} recipients per disperse`
      : disperseLimitUnknown
        ? batchLimits.isError
          ? "Couldn't load disperse limits"
          : "Checking disperse limits…"
        : customEndInvalid
          ? "Pick an end in the future"
          : "Continue",
    insufficient ? "Not enough balance" : verifiedEnough ? "Continue" : "Verify your balance to continue",
    "",
  ][step];
  // Re-blocks Send if the disperse limit resolves (or a list edit lands) after
  // the user already passed the Method gate.
  const sendBlocked = mode === "disperse" && (overDisperseLimit || disperseLimitUnknown);

  // A funded-but-unsigned airdrop locks the wizard: editing the list or re-running
  // "Seal & send" against it would fund a second airdrop or sign allocations that
  // no longer match the funded total. Only retry (same list) or refund are safe.
  const awaitingRetry = phase === "error" && pending !== null;
  const executed = busy || phase === "done" || awaitingRetry;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-display text-3xl font-black tracking-tight">Start a distribution</h1>
        <p className="mt-1 text-sm text-muted">
          Five short steps. Every amount is sealed before it touches the chain.
        </p>
      </motion.div>

      {!isConnected ? (
        <div className="sheet p-6 mt-6 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to draft a distribution.</span>
          <button className="btn-primary text-sm shrink-0" onClick={open}>
            Connect
          </button>
        </div>
      ) : wrongChain ? (
        <div className="sheet p-6 mt-6">
          <span className="stamp text-neg">Wrong network</span>
          <p className="text-sm text-muted mt-3">
            Veildrop runs on the Sepolia testnet. Switch your wallet to Sepolia to draft and send a
            distribution - sealing and funding both need a Sepolia wallet.
          </p>
          <button
            className="btn-primary text-sm mt-4"
            disabled={switching}
            onClick={() => switchChain({ chainId: sepolia.id })}
          >
            {switching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      ) : (
        <>
          <StepRail step={step} onJump={(s) => !executed && s < step && goStep(s)} />

          {/* Execution states replace the wizard body */}
          {busy ? (
            <div className="mt-6">
              <SigningProgress done={progress.done} total={progress.total} label={phaseLabel} />
            </div>
          ) : phase === "done" ? (
            <div className="mt-6 space-y-4">
              <AnimatePresence>
                {mode === "airdrop" && campaign && (
                  <Results campaign={campaign} count={rows.length} saved={saved} slug={savedSlug} note={saveNote} />
                )}
                {mode === "disperse" && (
                  <DisperseResult hash={disperseTx} count={rows.length} total={total} symbol={symbol} decimals={decimals} />
                )}
              </AnimatePresence>
              <button className="btn-ghost text-sm" onClick={resetAll}>
                Send another
              </button>
            </div>
          ) : awaitingRetry && pending ? (
            /* The retry panel replaces the wizard entirely: the funded airdrop is
               bound to the current list, so no edits or re-sends until it's resolved. */
            <div className="panel border-neg/40 bg-neg/5 p-4 mt-6">
              <div className="text-sm font-bold text-neg">Signing didn't finish</div>
              <p className="text-xs text-muted mt-1">
                Your airdrop is funded and safe at{" "}
                <a className="link" href={explorerAddr(pending.airdrop)} target="_blank" rel="noreferrer">
                  {shortAddr(pending.airdrop)} ↗
                </a>
                .{" "}
                {pending.auth
                  ? "Retry signing with a fresh key, or refund it anytime from Your campaigns."
                  : "The save signature was declined, so it won't appear in Your campaigns - keep this address. Retry signing with a fresh key."}
              </p>
              {errMsg && <div className="text-xs text-neg mt-2">{errMsg}</div>}
              <div className="flex gap-2 mt-3">
                <button className="btn-primary text-xs" onClick={retrySigning}>
                  Retry signing
                </button>
                {pending.auth && (
                  <Link to="/campaigns" className="btn-ghost text-xs">
                    Refund in Campaigns
                  </Link>
                )}
              </div>
            </div>
          ) : phase === "error" && mode === "disperse" && disperseSent ? (
            /* Disperse broadcast but didn't confirm. Don't offer a plain re-send -
               it isn't idempotent and could pay everyone twice. */
            <div className="panel border-neg/40 bg-neg/5 p-4 mt-6">
              <div className="text-sm font-bold text-neg">Disperse didn't confirm</div>
              <p className="text-xs text-muted mt-1">
                Your wallet may still have broadcast the transaction.{" "}
                {address && (
                  <>
                    Check your{" "}
                    <a className="link" href={explorerAddr(address)} target="_blank" rel="noreferrer">
                      recent activity ↗
                    </a>{" "}
                  </>
                )}
                before sending again - a second disperse would pay everyone twice.
              </p>
              {errMsg && <div className="text-xs text-neg mt-2">{errMsg}</div>}
              <button className="btn-ghost text-xs mt-3" onClick={resetAll}>
                Start over
              </button>
            </div>
          ) : (
            <>
              {errMsg && <div className="text-xs text-neg mt-4">{errMsg}</div>}

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="mt-6 space-y-4"
                >
                  {step === 0 && (
                    <StepCard title="What are you sending?" hint="Any ERC-7984 confidential token on Sepolia.">
                      <div className="flex items-center justify-between gap-2">
                        <span className="label">Token address</span>
                        <button className="link text-[11px]" onClick={() => setToken(DEMO_TOKEN)}>
                          Use demo ({TOKEN_SYMBOL})
                        </button>
                      </div>
                      <input
                        className="input text-xs mt-2"
                        placeholder="0xTokenAddress"
                        value={token}
                        onChange={(e) => setToken(e.target.value.trim())}
                      />
                      <div className="mt-1.5 text-[11px] min-h-4" aria-live="polite">
                        {meta.loading ? (
                          <span className="skeleton inline-block w-28 h-3 align-middle" />
                        ) : meta.error ? (
                          <span className="text-neg">Couldn't check this token right now - try again in a moment.</span>
                        ) : token && !meta.valid ? (
                          <span className="text-neg">Not a valid token contract on Sepolia.</span>
                        ) : meta.valid && !meta.confidential ? (
                          <span className="text-neg">
                            This is a plain ERC-20. Wrap it into its confidential version first - one
                            transaction on the Create page, linked below.
                          </span>
                        ) : meta.valid ? (
                          <span className="text-pos">
                            ✓ {symbol} · {decimals} decimals
                          </span>
                        ) : null}
                      </div>
                      <div className="rule-dashed mt-4 pt-3 text-[11px] text-muted">
                        Don't have one yet?{" "}
                        <Link to="/create" className="link">
                          Create a fresh confidential token or wrap an ERC-20 →
                        </Link>{" "}
                        Need demo funds?{" "}
                        <Link to="/faucet" className="link">
                          Mint vUSD at the faucet →
                        </Link>
                      </div>
                    </StepCard>
                  )}

                  {step === 1 && (
                    <StepCard
                      title="Who gets it?"
                      hint="One per line: address or ENS name, amount. Or upload a CSV - a header row is fine."
                    >
                      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="label">Recipients</span>
                        <div className="flex items-center gap-3">
                          <button className="link text-[11px]" onClick={() => fileRef.current?.click()}>
                            Upload CSV
                          </button>
                          <button className="link text-[11px]" onClick={() => setRaw(SAMPLE)}>
                            Use sample
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="input mt-2 h-36 resize-y"
                        placeholder={"0xRecipient, 4200\nnick.eth, 1500"}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                      />
                      {resolving.length > 0 && (
                        <div className="mt-2 text-[11px] text-muted" aria-live="polite">
                          Resolving {resolving.length} ENS name{resolving.length === 1 ? "" : "s"} on mainnet…
                        </div>
                      )}
                      {errors.length > 0 && (
                        <div className="mt-2 rounded-md border border-neg/40 bg-neg/5 px-3 py-2" aria-live="polite">
                          <div className="text-[11px] font-bold text-neg">
                            {errors.length} issue{errors.length === 1 ? "" : "s"} - fix or remove these lines:
                          </div>
                          <ul className="mt-1 text-[11px] text-neg leading-relaxed">
                            {errors.slice(0, 6).map((e, i) => (
                              <li key={i}>· {e}</li>
                            ))}
                            {errors.length > 6 && <li>· +{errors.length - 6} more</li>}
                          </ul>
                        </div>
                      )}
                      {rows.length > 0 && errors.length === 0 && resolving.length === 0 && (
                        <div className="mt-2 text-[11px] text-pos" aria-live="polite">
                          ✓ {rows.length} recipient{rows.length === 1 ? "" : "s"} · {fmtToken(total, decimals)}{" "}
                          {symbol} total
                        </div>
                      )}
                      <div className="rule-dashed mt-4 pt-3">
                        <span className="label">Name this drop (optional)</span>
                        <input
                          className="input font-sans mt-2"
                          placeholder="e.g. Q3 Contributor Rewards"
                          value={name}
                          onChange={(e) => setName(e.target.value.slice(0, 24))}
                          maxLength={24}
                        />
                        <p className="text-[10px] text-muted mt-1">
                          Recipients see this on their claim page. It also becomes a readable link, like
                          /claim/q3-contributor-rewards.
                        </p>
                      </div>
                    </StepCard>
                  )}

                  {step === 2 && (
                    <StepCard title="How should it arrive?" hint="Two ways to move sealed money.">
                      <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Distribution method">
                        <ModeCard
                          active={mode === "airdrop"}
                          stamp="CLAIM"
                          title="Airdrop"
                          body="You seal an allocation per address and share one link. They claim within a window; you can refund whatever's left."
                          foot="Best for community rewards, grants, vesting unlocks"
                          onClick={() => setMode("airdrop")}
                        />
                        <ModeCard
                          active={mode === "disperse"}
                          stamp="PUSH"
                          title="Disperse"
                          body="One transaction pushes every sealed amount straight into recipients' confidential balances. No claim step."
                          foot="Best for payroll and team payouts"
                          onClick={() => setMode("disperse")}
                        />
                      </div>

                      {mode === "airdrop" && (
                        <div className="rule-dashed mt-4 pt-4">
                          <span className="label">Claim window</span>
                          <p className="text-[11px] text-muted mt-1">
                            Recipients claim until this closes. Afterwards you can refund unclaimed funds.
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2.5">
                            {([1, 7, 30] as const).map((d) => (
                              <button
                                key={d}
                                onClick={() => setWindowDays(d)}
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                  windowDays === d
                                    ? "bg-accent text-onaccent border-accent"
                                    : "bg-panel text-fg border-line hover:border-accent"
                                }`}
                              >
                                {d} day{d === 1 ? "" : "s"}
                              </button>
                            ))}
                            <button
                              onClick={() => setWindowDays("custom")}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                windowDays === "custom"
                                  ? "bg-accent text-onaccent border-accent"
                                  : "bg-panel text-fg border-line hover:border-accent"
                              }`}
                            >
                              Custom
                            </button>
                            {windowDays === "custom" && (
                              <input
                                type="datetime-local"
                                className="input text-xs w-auto"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      {mode === "disperse" && overDisperseLimit && (
                        <div className="mt-3 text-[11px] text-neg">
                          Direct disperse supports up to {disperseLimit} recipients per transaction. Trim the
                          list, or use Airdrop mode for larger drops.
                        </div>
                      )}
                      {mode === "disperse" && disperseLimitUnknown && batchLimits.isError && (
                        <div className="mt-3 text-[11px] text-neg">
                          Couldn't read the disperse limits from the chain.{" "}
                          <button className="link" onClick={() => batchLimits.refetch()}>
                            Retry
                          </button>
                        </div>
                      )}
                    </StepCard>
                  )}

                  {step === 3 && (
                    <StepCard title="Review the manifest" hint="Check the list, then flip to the chain's view.">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm">
                          <span className="font-bold">{rows.length}</span>{" "}
                          <span className="text-muted">recipients ·</span>{" "}
                          <span className="font-bold">{fmtToken(total, decimals)}</span>{" "}
                          <span className="text-muted">{symbol} total</span>
                        </div>
                        <button
                          onClick={() => setLens((l) => !l)}
                          className="link text-[11px] font-semibold"
                          title="Toggle between your ledger and what the chain sees"
                        >
                          {lens ? "Your view" : "Chain view"}
                        </button>
                      </div>
                      <div className="divide-y divide-line/60">
                        {previewRows.map((r) => (
                          <div key={r.address} className="flex items-center justify-between py-1.5 text-sm font-mono">
                            <span className="text-fg" title={r.address}>
                              {r.label ?? shortAddr(r.address)}
                              {r.label && <span className="text-muted"> · {shortAddr(r.address)}</span>}
                            </span>
                            <span>
                              <CipherValue value={fmtToken(r.units, decimals)} hidden={!lens} chars={8} />{" "}
                              <span className="text-muted">{symbol}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      {previewPageCount > 1 && (
                        <div className="flex items-center justify-center gap-3 mt-3 text-xs">
                          <button
                            className="btn-ghost text-xs"
                            disabled={previewSafePage === 0}
                            onClick={() => setPreviewPage(previewSafePage - 1)}
                          >
                            Prev
                          </button>
                          <span className="text-muted">
                            Page {previewSafePage + 1} of {previewPageCount}
                          </span>
                          <button
                            className="btn-ghost text-xs"
                            disabled={previewSafePage >= previewPageCount - 1}
                            onClick={() => setPreviewPage(previewSafePage + 1)}
                          >
                            Next
                          </button>
                        </div>
                      )}
                      <div className="rule-dashed mt-4 pt-3 grid sm:grid-cols-3 gap-2 text-[11px] text-muted">
                        <div>
                          <span className="label block">Method</span>
                          <span className="capitalize text-fg">{mode}</span>
                        </div>
                        <div>
                          <span className="label block">Token</span>
                          <span className="text-fg">
                            {symbol} · {shortAddr(tokenAddr)}
                          </span>
                        </div>
                        {mode === "airdrop" && (
                          <div>
                            <span className="label block">Claim window</span>
                            <span className="text-fg">
                              {windowDays === "custom" ? customEnd.replace("T", " ") : `${windowDays} days`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Balance verification - user-initiated decrypt so the wallet
                          popup is expected. Gates Continue: enough -> proceed, low ->
                          stop + get more, failed -> retry. */}
                      <div className="rule-dashed mt-4 pt-4" aria-live="polite">
                        <span className="label">Balance check</span>
                        {!verifyRequested ? (
                          <div className="mt-2">
                            <p className="text-[11px] text-muted leading-relaxed">
                              Your {symbol} balance is encrypted. Decrypt it (a quick wallet signature) to
                              confirm you can cover this {fmtToken(total, decimals)} {symbol} - an over-balance
                              drop would silently fund almost nothing on-chain.
                            </p>
                            <button className="btn-ghost text-xs mt-2.5" onClick={() => setVerifyRequested(true)}>
                              Decrypt my balance to verify
                            </button>
                          </div>
                        ) : senderBalance.isLoading ? (
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                            <span className="skeleton h-3 w-3 rounded-full" aria-hidden />
                            Decrypting your balance…
                          </div>
                        ) : verifyFailed ? (
                          <div className="mt-2">
                            <p className="text-[11px] text-neg">
                              Couldn't decrypt your balance - the signature may have been declined. Retry to
                              check it.
                            </p>
                            <button className="btn-ghost text-xs mt-2" onClick={() => senderBalance.refetch()}>
                              Retry
                            </button>
                          </div>
                        ) : insufficient ? (
                          <div className="mt-2 rounded-md border border-neg/40 bg-neg/5 px-3 py-2">
                            <p className="text-[11px] text-neg">
                              <strong>Not enough {symbol}.</strong> You have{" "}
                              {fmtToken(senderBalance.data ?? 0n, decimals)}, this sends {fmtToken(total, decimals)}.{" "}
                              <Link to="/faucet" className="link">
                                Mint more →
                              </Link>
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-md border border-pos/40 bg-pos/5 px-3 py-2">
                            <p className="text-[11px] text-pos">
                              ✓ You have {fmtToken(senderBalance.data ?? 0n, decimals)} {symbol} - enough to cover
                              this drop.
                            </p>
                          </div>
                        )}
                      </div>
                    </StepCard>
                  )}

                  {step === 4 && (
                    <StepCard title="Seal & send" hint="Everything your wallet will ask for, in order.">
                      <ol className="space-y-2.5">
                        <SignItem
                          n={1}
                          title="Authorize the token"
                          body={`Lets the ${mode === "disperse" ? "disperse contract" : "airdrop factory"} pull ${symbol} from your confidential balance. Once per token - you may not see this one.`}
                        />
                        {mode === "airdrop" ? (
                          <>
                            <SignItem n={2} title="Create + fund the airdrop" body="One transaction. The total is encrypted before it's sent." />
                            <SignItem n={3} title="Secure the claim page" body="A free signature that stops anyone else from editing your campaign." />
                            {rows.length >= EPHEMERAL_MIN ? (
                              <SignItem
                                n={4}
                                title="Grant the batch signer"
                                body={`One transaction arms a throwaway key that seals all ${rows.length} allocations locally - no popup storm.`}
                              />
                            ) : (
                              <SignItem
                                n={4}
                                title={`Seal ${rows.length} allocation${rows.length === 1 ? "" : "s"}`}
                                body="One quick signature per recipient."
                              />
                            )}
                          </>
                        ) : (
                          <>
                            <SignItem
                              n={2}
                              title="Disperse"
                              body={`One transaction: all ${rows.length} sealed amounts land directly in recipients' confidential balances.`}
                            />
                            <SignItem n={3} title="Save to history" body="A free signature so this run shows up in Your campaigns. Optional." />
                          </>
                        )}
                      </ol>
                      <button
                        className="btn-primary w-full mt-5"
                        disabled={sendBlocked}
                        onClick={mode === "disperse" ? runDisperse : runAirdrop}
                      >
                        {sendBlocked
                          ? overDisperseLimit
                            ? `Max ${disperseLimit} recipients per disperse`
                            : "Checking disperse limits…"
                          : mode === "disperse"
                            ? `Disperse to ${rows.length} recipient${rows.length === 1 ? "" : "s"}`
                            : `Seal & send · ${rows.length} recipient${rows.length === 1 ? "" : "s"}`}
                      </button>
                    </StepCard>
                  )}

                  {/* Wizard nav */}
                  {step < 4 && (
                    <div className="flex items-center justify-between">
                      <button className="btn-ghost text-sm" disabled={step === 0} onClick={() => goStep(step - 1)}>
                        ← Back
                      </button>
                      <button
                        className="btn-primary text-sm"
                        disabled={!stepReady[step]}
                        onClick={() => goStep(step + 1)}
                      >
                        {continueLabel} →
                      </button>
                    </div>
                  )}
                  {step === 4 && (
                    <div>
                      <button className="btn-ghost text-sm" onClick={() => goStep(3)}>
                        ← Back to review
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StepRail({ step, onJump }: { step: number; onJump: (s: number) => void }) {
  return (
    <ol className="mt-6 flex items-center gap-1" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex items-center gap-1 flex-1 min-w-0">
            <button
              onClick={() => onJump(i)}
              disabled={!done}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-semibold transition-colors min-w-0 ${
                done ? "text-accent hover:bg-panel-2 cursor-pointer" : current ? "text-fg" : "text-muted/60"
              }`}
            >
              <span
                className={`grid place-items-center w-4.5 h-4.5 rounded-full border text-[9px] font-black shrink-0 ${
                  done
                    ? "bg-accent border-accent text-onaccent"
                    : current
                      ? "border-accent text-accent"
                      : "border-line text-muted/60"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="truncate hidden sm:block">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-accent/50" : "bg-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sheet p-5">
      <h2 className="font-display font-black text-lg tracking-tight">{title}</h2>
      {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ModeCard({
  active,
  stamp,
  title,
  body,
  foot,
  onClick,
}: {
  active: boolean;
  stamp: string;
  title: string;
  body: string;
  foot: string;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        active ? "border-accent bg-manila/50 shadow-[inset_0_0_0_1px_var(--primary)]" : "border-line bg-panel hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display font-black">{title}</span>
        <span className={`stamp text-[9px] ${active ? "text-accent" : "text-muted"}`}>{stamp}</span>
      </div>
      <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{body}</p>
      <p className="text-[10px] text-muted/80 mt-2 italic">{foot}</p>
    </button>
  );
}

function SignItem({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid place-items-center w-5 h-5 rounded-full bg-manila border border-line text-[10px] font-black shrink-0 mt-0.5">
        {n}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function DisperseResult({
  hash,
  count,
  total,
  symbol,
  decimals,
}: {
  hash?: Hex;
  count: number;
  total: bigint;
  symbol: string;
  decimals: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sheet p-8 text-center">
      <span className="stamp text-pos">Delivered</span>
      <div className="font-display font-black text-2xl mt-3">Dispersed.</div>
      <p className="text-sm text-muted mt-2 max-w-sm mx-auto leading-relaxed">
        {fmtToken(total, decimals)} {symbol} sent to {count} recipient{count === 1 ? "" : "s"} - already
        in their confidential balances, no claim needed.
      </p>
      {hash && (
        <a className="link text-[11px] mt-3 inline-block" href={explorerTx(hash)} target="_blank" rel="noreferrer">
          view tx ↗
        </a>
      )}
    </motion.div>
  );
}

function Results({
  campaign,
  count,
  saved,
  slug,
  note,
}: {
  campaign: Campaign;
  count: number;
  saved: boolean;
  slug?: string;
  note?: string | null;
}) {
  const link = saved ? claimLinkFor({ slug, airdrop: campaign.airdrop }) : portalUrl(campaign);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sheet p-5">
      <div className="flex items-center justify-between">
        <span className="stamp text-pos">Live</span>
        <a className="link text-[11px]" href={explorerAddr(campaign.airdrop)} target="_blank" rel="noreferrer">
          {shortAddr(campaign.airdrop)} ↗
        </a>
      </div>

      <div className="font-display font-black text-2xl mt-3">The drop is sealed.</div>

      {saved ? (
        <div className="mt-3 rounded-md border border-pos/40 bg-pos/5 px-3 py-2 text-[11px] text-fg">
          <strong className="text-pos">Campaign saved.</strong> You can re-copy this link anytime from Your
          campaigns.
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-neg/40 bg-neg/5 px-3 py-2 text-[11px] text-fg">
          <strong className="text-neg">Not saved to the campaign store.</strong>{" "}
          {note ?? "This is a self-contained link - save it now, it can't be re-generated."}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted">
          Share this one link with all {count} recipient{count === 1 ? "" : "s"}. Each person connects
          their wallet and only their own allocation appears - amounts stay sealed.
        </p>
        <CopyRow label="Claim link" value={link} />
      </div>

      <p className="text-[11px] text-muted mt-3">
        Track claims and refund unclaimed funds anytime in{" "}
        <Link to="/campaigns" className="link">
          Your campaigns
        </Link>
        .
      </p>
    </motion.div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-panel-2 border border-line rounded-md px-3 py-2">
      <span className="font-mono text-xs text-muted shrink-0">{label}</span>
      <span className="font-mono text-xs text-muted truncate flex-1">{value}</span>
      <button
        className="link text-[11px] font-semibold shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function stripCsvHeader(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  // A data line carries an address or an ENS name; anything else that reads
  // like column labels is a header.
  if (
    lines.length &&
    !/0x[a-fA-F0-9]{40}/.test(lines[0]) &&
    !/\.eth\b/i.test(lines[0]) &&
    /address|wallet|recipient|amount|ens|name/i.test(lines[0])
  ) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function parseRecipients(
  text: string,
  decimals: number,
  ens: Map<string, Address | null>,
): { rows: Recipient[]; errors: string[]; resolving: string[] } {
  const rows: Recipient[] = [];
  const errors: string[] = [];
  const resolving: string[] = [];
  const seen = new Set<string>();
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const n = i + 1;
      // Split the address column off first, THEN strip digit grouping from the
      // remainder only. Stripping the whole line would eat a bare-comma CSV
      // delimiter whenever the address ends in a digit and the amount opens
      // with a 3-digit group ("0x…79C8,250" would fuse into one token).
      const m = line.match(/^([^\s,\t]+)[\s,\t]+(.*)$/);
      let addr = m ? m[1] : line;
      const amountTok = m ? stripDigitGroups(m[2]).split(/[\s,\t]+/).filter(Boolean)[0] : undefined;
      let label: string | undefined;
      if (looksLikeEns(addr)) {
        const resolved = ens.get(addr.toLowerCase());
        if (resolved === undefined) {
          // Lookup in flight - the caller blocks Continue until this empties.
          resolving.push(addr);
          return;
        }
        if (resolved === null) {
          errors.push(`Line ${n}: couldn't resolve ${addr} - check the name`);
          return;
        }
        label = addr.toLowerCase();
        addr = resolved;
      }
      const units = amountTok ? parseToken(amountTok, decimals) : null;
      if (!isAddress(addr)) {
        errors.push(`Line ${n}: invalid address`);
        return;
      }
      if (units === null || units <= 0n) {
        errors.push(`Line ${n}: invalid or missing amount`);
        return;
      }
      const key = addr.toLowerCase();
      if (seen.has(key)) {
        errors.push(`Line ${n}: duplicate address`);
        return;
      }
      seen.add(key);
      // Checksum the address - the Zama relayer rejects all-lowercase input.
      rows.push({ address: getAddress(addr), units, label });
    });
  return { rows, errors, resolving };
}

function cleanError(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Rejected in wallet.";
  if (/insufficient/i.test(msg)) return "Not enough balance or gas - mint demo tokens at the Faucet first.";
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

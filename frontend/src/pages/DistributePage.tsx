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
import { useZamaSDK } from "@zama-fhe/react-sdk";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createWalletClient, getAddress, http, isAddress, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount, usePublicClient, useSignMessage, useWalletClient, useWriteContract } from "wagmi";
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
import { fmtToken, parseToken, shortAddr } from "../lib/format";
import { useTokenMeta } from "../hooks/useTokenMeta";

interface Recipient {
  address: Address;
  units: bigint;
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
const PREVIEW_SIZE = 5; // recipients shown per page in the create preview
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const SAMPLE =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 4200\n0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 1500\n0x90F79bf6EB2c4f870365E785982E1f101E93b906, 8000";

export function DistributePage() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const publicClient = usePublicClient();
  const [searchParams] = useSearchParams();
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
  const [savedSlug, setSavedSlug] = useState<string | undefined>();
  const [pending, setPending] = useState<{
    airdrop: Address;
    block: number;
    endTs: number;
    auth: Hex | null;
  } | null>(null);
  const [disperseTx, setDisperseTx] = useState<Hex | undefined>();
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

  const { rows, errors } = useMemo(() => parseRecipients(stripCsvHeader(raw), decimals), [raw, decimals]);
  const total = useMemo(() => rows.reduce((s, r) => s + r.units, 0n), [rows]);
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

  const disperseLimit = Number(batchLimits.data?.direct ?? 0n);
  const overDisperseLimit = mode === "disperse" && disperseLimit > 0 && rows.length > disperseLimit;

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
    if (!address || rows.length === 0 || !publicClient) return;
    setErrMsg(null);
    setCampaign(null);
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
        ok = true;
      } catch (e) {
        console.warn("campaign save failed", e);
      }
    }
    setSaved(ok);
    setPending(null);
    setPhase("done");
  }

  // Retry the signing phase with a fresh throwaway key on the already-funded airdrop.
  async function retrySigning() {
    if (!pending) return;
    setErrMsg(null);
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
    if (!address || rows.length === 0 || !publicClient) return;
    setErrMsg(null);
    setDisperseTx(undefined);
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-black tracking-tight">Distribute</h1>
        <p className="mt-1 text-sm text-muted">Pay a whole list at once, every amount encrypted on-chain.</p>
      </motion.div>

      <div className="inline-flex p-1 mt-5 rounded-xl bg-panel-2 border border-line">
        {(["airdrop", "disperse"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
              mode === m ? "bg-accent text-onaccent" : "text-fg hover:opacity-80"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {!isConnected ? (
        <div className="panel p-6 mt-5 flex items-center justify-between">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to create a distribution.</span>
          <button className="btn-primary text-sm" onClick={open}>
            Connect
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {mode === "disperse" && (
            <div className="text-[11px] text-muted -mt-1">
              Disperse pushes encrypted amounts straight to every recipient in one tx - no claim step,
              tokens land directly in their confidential balances.
            </div>
          )}
          <div>
            <input
              className="input font-sans"
              placeholder="Name this distribution (optional), e.g. ZAMA Airdrop"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              maxLength={24}
              disabled={busy}
            />
            {name.length >= 24 && (
              <p className="text-[11px] text-neg mt-1">
                Names are capped at 24 characters - pick a shorter one so it fits on-chain.
              </p>
            )}
          </div>

          {/* Token */}
          <div className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Token - any ERC-7984 confidential token
              </label>
              <button
                className="text-[11px] text-accent-2 hover:underline disabled:opacity-50"
                onClick={() => setToken(DEMO_TOKEN)}
                disabled={busy}
              >
                Use demo ({TOKEN_SYMBOL})
              </button>
            </div>
            <input
              className="input font-mono text-xs mt-2"
              placeholder="0xTokenAddress"
              value={token}
              onChange={(e) => setToken(e.target.value.trim())}
              disabled={busy}
            />
            <div className="mt-1 text-[11px] min-h-4">
              {meta.loading ? (
                <span className="text-muted animate-pulse">Reading token…</span>
              ) : token && !meta.valid ? (
                <span className="text-neg">Not a valid ERC-7984 token on Sepolia.</span>
              ) : meta.valid ? (
                <span className="text-pos">
                  ✓ {symbol} · {decimals} decimals
                </span>
              ) : null}
            </div>
          </div>

          {/* Input */}
          <div className="panel p-5">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Recipients - CSV or one per line: address, amount
              </label>
              <div className="flex items-center gap-3">
                <button className="text-[11px] text-accent-2 hover:underline" onClick={() => fileRef.current?.click()}>
                  Upload CSV
                </button>
                <button className="text-[11px] text-accent-2 hover:underline" onClick={() => setRaw(SAMPLE)}>
                  Use sample
                </button>
              </div>
            </div>
            <textarea
              className="input mt-2 h-32 resize-y"
              placeholder={"0xRecipient, 4200\n0xRecipient, 1500"}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              disabled={busy}
            />
            {errors.length > 0 && (
              <div className="mt-2 rounded-lg border border-neg/40 bg-neg/5 px-3 py-2">
                <div className="text-[11px] font-bold text-neg">
                  {errors.length} issue{errors.length === 1 ? "" : "s"} - fix or remove these lines to
                  continue:
                </div>
                <ul className="mt-1 text-[11px] text-neg leading-relaxed">
                  {errors.slice(0, 6).map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                  {errors.length > 6 && <li>· +{errors.length - 6} more</li>}
                </ul>
              </div>
            )}
          </div>

          {/* Claim window (airdrop only - disperse is instant) */}
          {mode === "airdrop" && (
            <div className="panel p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Claim window</div>
              <p className="text-[11px] text-muted mt-1">
                Recipients claim until this closes. After it ends, you can refund unclaimed funds.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {([1, 7, 30] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setWindowDays(d)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      windowDays === d
                        ? "bg-accent text-onaccent border-accent"
                        : "bg-panel-2 text-fg border-line hover:border-accent"
                    }`}
                  >
                    {d} day{d === 1 ? "" : "s"}
                  </button>
                ))}
                <button
                  onClick={() => setWindowDays("custom")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    windowDays === "custom"
                      ? "bg-accent text-onaccent border-accent"
                      : "bg-panel-2 text-fg border-line hover:border-accent"
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

          {/* Preview */}
          {rows.length > 0 && (
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm">
                  <span className="font-bold">{rows.length}</span>{" "}
                  <span className="text-muted">recipients ·</span>{" "}
                  <span className="font-bold">{fmtToken(total, decimals)}</span>{" "}
                  <span className="text-muted">{symbol} total</span>
                </div>
                <button
                  onClick={() => setLens((l) => !l)}
                  className="text-[11px] font-semibold text-accent-2 hover:underline"
                  title="Toggle between what you see and what the chain sees"
                >
                  {lens ? "🔓 Your view" : "🔒 Chain view"}
                </button>
              </div>
              <div className="divide-y divide-line/60">
                {previewRows.map((r) => (
                  <div key={r.address} className="flex items-center justify-between py-1.5 text-sm font-mono">
                    <span className="text-fg">{shortAddr(r.address)}</span>
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
            </div>
          )}

          {busy ? (
            <SigningProgress done={progress.done} total={progress.total} label={phaseLabel} />
          ) : (
            <button
              className="btn-primary w-full"
              disabled={rows.length === 0 || errors.length > 0 || overDisperseLimit || !meta.valid}
              onClick={mode === "disperse" ? runDisperse : runAirdrop}
            >
              {!meta.valid
                ? "Enter a valid token"
                : errors.length > 0
                  ? `Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} to continue`
                  : overDisperseLimit
                    ? `Max ${disperseLimit} recipients per disperse`
                    : mode === "disperse"
                      ? `Disperse · ${rows.length || ""} recipient${rows.length === 1 ? "" : "s"}`
                      : `Create airdrop · ${rows.length || ""} recipient${rows.length === 1 ? "" : "s"}`}
            </button>
          )}
          {overDisperseLimit && (
            <div className="text-[11px] text-neg">
              Direct disperse supports up to {disperseLimit} recipients per transaction. Reduce the list,
              or use Airdrop mode for larger distributions.
            </div>
          )}
          {errMsg && <div className="text-xs text-neg">{errMsg}</div>}

          {phase === "error" && pending && (
            <div className="panel border border-neg/40 bg-neg/5 p-4">
              <div className="text-sm font-bold text-neg">Signing didn't finish</div>
              <p className="text-[11px] text-muted mt-1">
                Your airdrop is funded and safe. Retry signing with a fresh key, or refund it anytime
                from Your campaigns.
              </p>
              <div className="flex gap-2 mt-3">
                <button className="btn-primary text-xs" onClick={retrySigning}>
                  Retry signing
                </button>
                <Link to="/campaigns" className="btn-ghost text-xs">
                  Refund in Campaigns
                </Link>
              </div>
            </div>
          )}

          <AnimatePresence>
            {phase === "done" && mode === "airdrop" && campaign && (
              <Results campaign={campaign} count={rows.length} saved={saved} slug={savedSlug} />
            )}
            {phase === "done" && mode === "disperse" && (
              <DisperseResult
                hash={disperseTx}
                count={rows.length}
                total={total}
                symbol={symbol}
                decimals={decimals}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel p-6 text-center">
      <div className="text-4xl">🎉</div>
      <div className="font-black text-pos text-lg mt-1">Dispersed ✓</div>
      <p className="text-sm text-muted mt-1 max-w-sm mx-auto leading-relaxed">
        {fmtToken(total, decimals)} {symbol} sent to {count} recipient{count === 1 ? "" : "s"}. It's
        already in their confidential balances - no claim needed.
      </p>
      {hash && (
        <a
          className="text-[11px] text-accent-2 hover:underline mt-3 inline-block"
          href={explorerTx(hash)}
          target="_blank"
          rel="noreferrer"
        >
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
}: {
  campaign: Campaign;
  count: number;
  saved: boolean;
  slug?: string;
}) {
  const link = saved ? claimLinkFor({ slug, airdrop: campaign.airdrop }) : portalUrl(campaign);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="font-bold text-pos">Campaign live ✓</div>
        <a
          className="text-[11px] text-accent-2 hover:underline"
          href={explorerAddr(campaign.airdrop)}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddr(campaign.airdrop)} ↗
        </a>
      </div>

      {saved ? (
        <div className="mt-3 rounded-xl border border-pos/40 bg-pos/5 px-3 py-2 text-[11px] text-fg">
          <strong className="text-pos">Campaign saved.</strong> You can re-copy this link anytime from Your
          campaigns.
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-neg/40 bg-neg/5 px-3 py-2 text-[11px] text-fg">
          <strong className="text-neg">Couldn't reach the campaign store.</strong> This is a self-contained
          link - save it now, it can't be re-generated.
        </div>
      )}

      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted">
          Share this one link with all {count} recipient{count === 1 ? "" : "s"}. Each person connects
          their wallet and only their own allocation appears - amounts stay encrypted.
        </p>
        <CopyRow label="Claim link" value={link} />
      </div>

      <p className="text-[11px] text-muted mt-3">
        Track claims and refund unclaimed funds anytime in{" "}
        <Link to="/campaigns" className="text-accent-2 hover:underline">
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
    <div className="flex items-center gap-2 bg-panel-2 border border-line rounded-xl px-3 py-2">
      <span className="font-mono text-xs text-muted shrink-0">{label}</span>
      <span className="font-mono text-xs text-muted truncate flex-1">{value}</span>
      <button
        className="text-[11px] font-semibold text-accent-2 hover:underline shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function stripCsvHeader(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines.length && !/0x[a-fA-F0-9]{40}/.test(lines[0]) && /address|wallet|recipient|amount/i.test(lines[0])) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function parseRecipients(text: string, decimals: number): { rows: Recipient[]; errors: string[] } {
  const rows: Recipient[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const n = i + 1;
      const parts = line.split(/[\s,\t]+/);
      const addr = parts[0] ?? "";
      const units = parts[1] ? parseToken(parts[1], decimals) : null;
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
      rows.push({ address: getAddress(addr), units });
    });
  return { rows, errors };
}

function cleanError(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Rejected in wallet.";
  if (/insufficient/i.test(msg)) return "Not enough balance or gas - mint demo tokens at the Faucet first.";
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

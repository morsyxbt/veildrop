import { useConfidentialBalance, useShield, useUnshield, useWrapperDiscovery } from "@zama-fhe/react-sdk";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  useDeployContract,
  useReadContract,
  useSignMessage,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { useWalletModal } from "../components/WalletModal";
import { confidentialTokenAbi } from "../lib/abis";
import { listTokens, saveToken, tokenAuthMessage } from "../lib/api";
import { DEMO_TOKEN, explorerAddr, explorerTx } from "../lib/config";
import {
  ConfidentialMintableToken_ABI,
  ConfidentialMintableToken_BYTECODE,
  ConfidentialWrapper_ABI,
  ConfidentialWrapper_BYTECODE,
} from "../lib/deployables";
import { fmtToken, shortAddr } from "../lib/format";
import { useTokenMeta } from "../hooks/useTokenMeta";

const erc20BalAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// Register a created/wrapped token with the backend so Portfolio and the Create
// page can list it. The store requires an owner signature; declining just skips
// the convenience listing - the token itself is already live on-chain.
async function registerToken(
  signMessageAsync: (args: { message: string }) => Promise<Hex>,
  input: Omit<Parameters<typeof saveToken>[0], "auth">,
): Promise<void> {
  try {
    const auth = await signMessageAsync({ message: tokenAuthMessage(input.address) });
    await saveToken({ ...input, auth });
  } catch {
    // signature declined or save failed - nothing to roll back
  }
}

export function CreatePage() {
  const { isConnected } = useAccount();
  const { open } = useWalletModal();
  const [tab, setTab] = useState<"wrap" | "new">("new");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-display text-3xl font-black tracking-tight">Create a confidential token</h1>
        <p className="mt-1 text-sm text-muted">
          Turn a public ERC-20 into an encrypted ERC-7984 token, or mint a fresh one - then distribute it privately.
        </p>
      </motion.div>

      {!isConnected ? (
        <div className="sheet p-6 mt-6 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to deploy a token.</span>
          <button className="btn-primary text-sm shrink-0" onClick={open}>
            Connect
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 inline-flex p-1 rounded-md bg-panel-2 border border-line">
            <TabButton active={tab === "new"} onClick={() => setTab("new")}>
              Create new
            </TabButton>
            <TabButton active={tab === "wrap"} onClick={() => setTab("wrap")}>
              Wrap an ERC-20
            </TabButton>
          </div>
          <div className="mt-4">{tab === "wrap" ? <WrapTab /> : <CreateNewTab />}</div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
        active ? "bg-accent text-onaccent" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function DistributeHandoff({ token }: { token: Address }) {
  return (
    <div className="mt-4 bg-manila/50 border border-accent/40 rounded-md p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display font-black text-sm">Your confidential token is live.</div>
        <span className="stamp text-pos text-[9px]">Live</span>
      </div>
      <div className="mt-1 text-[11px] font-mono">
        <a href={explorerAddr(token)} target="_blank" rel="noreferrer" className="link">
          {token} ↗
        </a>
      </div>
      <Link to={`/distribute?token=${token}`} className="btn-primary text-sm mt-3 inline-flex">
        Distribute this token →
      </Link>
    </div>
  );
}

// ---------------- Wrap an ERC-20 ----------------

function WrapTab() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [erc20, setErc20] = useState("");
  const raw = erc20.trim();
  const erc20Addr = isAddress(raw) ? getAddress(raw) : undefined;
  const meta = useTokenMeta(erc20Addr ?? "");
  const confDecimals = Math.min(meta.decimals, 6); // wrapper caps confidential decimals at 6
  const erc20Bal = useReadErc20Balance(erc20Addr, address);

  const [wrapper, setWrapper] = useState<Address | null>(null);
  const [resume, setResume] = useState("");

  // Does a wrapper already exist for this ERC-20? Check our backend (self-deployed)
  // and the Zama curated registry.
  const [existing, setExisting] = useState<Address | null>(null);
  useEffect(() => {
    // A new ERC-20 invalidates everything derived from the old one - without the
    // wrapper reset, step 2/3 would keep operating on the previous token's wrapper.
    setExisting(null);
    setWrapper(null);
    if (!erc20Addr || !address) return;
    let cancelled = false;
    listTokens(address).then((toks) => {
      const w = toks.find((t) => t.kind === "wrapper" && t.underlying?.toLowerCase() === erc20Addr.toLowerCase());
      if (!cancelled && w) setExisting(getAddress(w.address));
    });
    return () => {
      cancelled = true;
    };
  }, [erc20Addr, address]);
  const registry = useWrapperDiscovery(
    { tokenAddress: DEMO_TOKEN, erc20Address: erc20Addr },
    { enabled: !!erc20Addr },
  );
  const known = existing ?? (registry.data ?? null);

  // Never offer a stored wrapper without confirming on-chain that it really wraps
  // this ERC-20 - a poisoned record would otherwise route a one-click shield
  // (approve + transfer) into an arbitrary contract.
  const knownUnderlying = useReadContract({
    address: known ?? undefined,
    abi: ConfidentialWrapper_ABI,
    functionName: "underlying",
    query: { enabled: !!known },
  });
  const knownVerified =
    !!known &&
    !!erc20Addr &&
    typeof knownUnderlying.data === "string" &&
    knownUnderlying.data.toLowerCase() === erc20Addr.toLowerCase();

  const deploy = useDeployContract();
  const deployRcpt = useWaitForTransactionReceipt({ hash: deploy.data });
  // Snapshot of the form at the moment "Deploy" was clicked - the receipt effect
  // must not read live inputs, which the user may have edited while waiting.
  const deployCtx = useRef<{ erc20: Address; sym: string; confDecimals: number } | null>(null);
  useEffect(() => {
    const a = deployRcpt.data?.contractAddress;
    const ctx = deployCtx.current;
    if (a && ctx && address) {
      const addr = getAddress(a);
      // Only surface it as "Ready" if the form still shows the ERC-20 it wraps.
      if (erc20Addr === ctx.erc20) setWrapper(addr);
      registerToken(signMessageAsync, {
        address: addr,
        owner: address,
        kind: "wrapper",
        symbol: `c${ctx.sym}`,
        decimals: ctx.confDecimals,
        underlying: ctx.erc20,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployRcpt.data]);

  function deployWrapper() {
    if (!erc20Addr) return;
    const sym = symOf(meta.symbol);
    deployCtx.current = { erc20: erc20Addr, sym, confDecimals };
    deploy.deployContract({
      abi: ConfidentialWrapper_ABI,
      bytecode: ConfidentialWrapper_BYTECODE,
      args: [erc20Addr, `Confidential ${sym}`, `c${sym}`, ""],
    });
  }

  const deploying = deploy.isPending || deployRcpt.isLoading;

  return (
    <div className="space-y-4">
      {/* Step 1: pick the ERC-20 */}
      <div className="sheet p-5">
        <span className="label">Public ERC-20 to wrap</span>
        <input
          value={erc20}
          onChange={(e) => setErc20(e.target.value)}
          placeholder="0x… ERC-20 token address"
          className="input mt-3"
        />
        <div className="mt-2 min-h-5 text-xs">
          {raw && !erc20Addr ? (
            <span className="text-neg">Not a valid address.</span>
          ) : erc20Addr && meta.loading ? (
            <span className="skeleton inline-block h-3 w-28 align-middle" />
          ) : erc20Addr && meta.valid ? (
            <span className="text-pos">
              ✓ {meta.symbol} · {meta.decimals} decimals
              {erc20Bal !== undefined && (
                <span className="text-muted">
                  {" "}
                  · you hold {fmtToken(erc20Bal, meta.decimals)} {meta.symbol}
                </span>
              )}
            </span>
          ) : erc20Addr ? (
            <span className="text-muted">Reads like a contract, but no ERC-20 metadata found.</span>
          ) : null}
        </div>
      </div>

      {/* Step 2: the wrapper */}
      {erc20Addr && (
        <div className="sheet p-5">
          <span className="label">Confidential wrapper</span>
          {wrapper ? (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="stamp text-pos">Ready</span>
              <a href={explorerAddr(wrapper)} target="_blank" rel="noreferrer" className="link font-mono text-[12px]">
                {shortAddr(wrapper)} ↗
              </a>
            </div>
          ) : (
            <>
              {known && knownVerified && (
                <div className="mt-3 bg-manila/50 border border-accent/40 rounded-md p-3 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    This ERC-20 already has a confidential wrapper (verified on-chain).{" "}
                    <span className="font-mono text-muted">{shortAddr(known)}</span>
                  </div>
                  <button onClick={() => setWrapper(known)} className="btn-primary text-xs whitespace-nowrap">
                    Use it
                  </button>
                </div>
              )}
              {known && !knownVerified && knownUnderlying.isLoading && (
                <div className="mt-3 text-[11px] text-muted">Checking a known wrapper for this ERC-20…</div>
              )}
              <p className="mt-3 text-xs text-muted leading-relaxed">
                {known ? "Or deploy a new one" : "Deploy a confidential wrapper bound to this ERC-20"} (one
                transaction). Wrap public tokens into an encrypted balance, distribute them privately, and
                unwrap back whenever you like.
              </p>
              <button onClick={deployWrapper} disabled={deploying} className="btn-primary text-sm mt-3">
                {deploy.isPending ? "Confirm in wallet…" : deployRcpt.isLoading ? "Deploying…" : "Deploy confidential wrapper"}
              </button>
              {deploy.data && (
                <a href={explorerTx(deploy.data)} target="_blank" rel="noreferrer" className="link ml-3 text-xs">
                  view tx ↗
                </a>
              )}
              {deploy.error && <p className="mt-2 text-xs text-neg">{cleanErr(deploy.error.message)}</p>}

              <div className="rule-dashed mt-4 pt-4">
                <div className="text-[10px] text-muted mb-2">Already have a wrapper address? Paste it:</div>
                <div className="flex gap-2">
                  <input
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    placeholder="0x… wrapper address"
                    className="input flex-1 text-xs"
                  />
                  <button
                    onClick={() => isAddress(resume.trim()) && setWrapper(getAddress(resume.trim()))}
                    className="btn-ghost text-xs whitespace-nowrap"
                  >
                    Use
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: wrap / unwrap */}
      {wrapper && (
        <WrapUnwrap
          wrapper={wrapper}
          symbol={meta.symbol || "TOKEN"}
          underlyingDecimals={meta.decimals}
          confDecimals={confDecimals}
          erc20Balance={erc20Bal}
        />
      )}
    </div>
  );
}

function WrapUnwrap({
  wrapper,
  symbol,
  underlyingDecimals,
  confDecimals,
  erc20Balance,
}: {
  wrapper: Address;
  symbol: string;
  underlyingDecimals: number;
  confDecimals: number;
  erc20Balance: bigint | undefined;
}) {
  const cfg = { tokenAddress: wrapper, wrapperAddress: wrapper };
  const shield = useShield(cfg);
  const unshield = useUnshield(cfg);
  const [wrapAmt, setWrapAmt] = useState("");
  const [unwrapAmt, setUnwrapAmt] = useState("");

  // Confidential balance in the wrapper (reveal to see + to cap unwraps).
  const [revealBal, setRevealBal] = useState(false);
  const confBal = useConfidentialBalance({ tokenAddress: wrapper }, { enabled: revealBal });

  const wrapUnits = safeParse(wrapAmt, underlyingDecimals);
  const overWrap = wrapUnits !== null && erc20Balance !== undefined && wrapUnits > erc20Balance;
  const unwrapUnits = safeParse(unwrapAmt, confDecimals);
  const overUnwrap = revealBal && confBal.data !== undefined && unwrapUnits !== null && unwrapUnits > confBal.data;

  function doWrap() {
    if (wrapUnits === null || wrapUnits === 0n || overWrap) return;
    shield.mutate({ amount: wrapUnits }, { onSuccess: () => setWrapAmt("") });
  }
  function doUnwrap() {
    if (unwrapUnits === null || unwrapUnits === 0n || overUnwrap) return;
    unshield.mutate({ amount: unwrapUnits }, { onSuccess: () => setUnwrapAmt("") });
  }

  return (
    <>
      <div className="panel p-4 flex items-center justify-between gap-3">
        <span className="label">Your confidential balance</span>
        <div className="flex items-center gap-3">
          {revealBal ? (
            confBal.isLoading ? (
              <span className="skeleton inline-block h-3.5 w-24 align-middle" />
            ) : (
              <span className="text-sm font-black">
                {fmtToken(confBal.data ?? 0n, confDecimals)} <span className="text-muted text-xs">c{symOf(symbol)}</span>
              </span>
            )
          ) : (
            <span className="redaction h-3.5 w-16" aria-label="Hidden balance" />
          )}
          <button onClick={() => setRevealBal((r) => !r)} className="btn-ghost text-xs">
            {revealBal ? "Hide" : "Reveal"}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Wrap */}
        <div className="sheet p-5">
          <span className="label">Wrap → confidential</span>
          <p className="mt-1 text-[11px] text-muted">Public {symbol} becomes an encrypted balance.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={wrapAmt}
              onChange={(e) => setWrapAmt(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount in ${symbol}`}
              className={`flex-1 ${inputCls(overWrap)}`}
            />
            {erc20Balance !== undefined && (
              <button onClick={() => setWrapAmt(formatUnits(erc20Balance, underlyingDecimals))} className="btn-ghost text-xs">
                Max
              </button>
            )}
          </div>
          <button onClick={doWrap} disabled={shield.isPending || !wrapAmt || overWrap} className="btn-primary w-full text-sm mt-3">
            {shield.isPending ? "Wrapping…" : `Wrap ${symbol}`}
          </button>
          <div className="mt-2 min-h-4 text-xs">
            {overWrap && <span className="text-neg">More than you hold.</span>}
            {!overWrap && shield.isSuccess && <span className="text-pos">Wrapped ✓ your confidential balance grew.</span>}
            {!overWrap && shield.error && <span className="text-neg">{cleanErr(shield.error.message)}</span>}
          </div>
        </div>

        {/* Unwrap */}
        <div className="sheet p-5">
          <span className="label">Unwrap → ERC-20</span>
          <p className="mt-1 text-[11px] text-muted">Redeem confidential back to public {symbol}.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={unwrapAmt}
              onChange={(e) => setUnwrapAmt(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount (${confDecimals} dp)`}
              className={`flex-1 ${inputCls(overUnwrap)}`}
            />
            {revealBal && confBal.data !== undefined && (
              <button onClick={() => setUnwrapAmt(formatUnits(confBal.data ?? 0n, confDecimals))} className="btn-ghost text-xs">
                Max
              </button>
            )}
          </div>
          <button onClick={doUnwrap} disabled={unshield.isPending || !unwrapAmt || overUnwrap} className="btn-ghost w-full text-sm mt-3">
            {unshield.isPending ? "Unwrapping…" : `Unwrap to ${symbol}`}
          </button>
          <div className="mt-2 min-h-4 text-xs">
            {overUnwrap && <span className="text-neg">More than your confidential balance.</span>}
            {!overUnwrap && unshield.isSuccess && <span className="text-pos">Unwrapped ✓ ERC-20 returned.</span>}
            {!overUnwrap && unshield.error && <span className="text-neg">{cleanErr(unshield.error.message)}</span>}
          </div>
        </div>
      </div>

      <DistributeHandoff token={wrapper} />
    </>
  );
}

// ---------------- Create a brand-new confidential token ----------------

function CreateNewTab() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("");
  const [initialMint, setInitialMint] = useState("");
  const [token, setToken] = useState<Address | null>(null);
  // What was actually minted at deploy time, for the status line - the live
  // inputs may be edited afterwards.
  const [mintNote, setMintNote] = useState<{ units: bigint; symbol: string } | null>(null);
  const mintedRef = useRef(false);

  const capUnits = maxSupply.trim() ? safeParse(maxSupply, 6) : 0n; // 0 = uncapped
  const initUnits = initialMint.trim() ? safeParse(initialMint, 6) : 0n;

  const deploy = useDeployContract();
  const deployRcpt = useWaitForTransactionReceipt({ hash: deploy.data });
  const initMint = useWriteContract();
  // Snapshot of the form at the moment "Deploy" was clicked - the receipt effect
  // must not read live inputs, which the user may have edited while waiting.
  const deployCtx = useRef<{ name: string; symbol: string; initUnits: bigint } | null>(null);

  useEffect(() => {
    const a = deployRcpt.data?.contractAddress;
    const ctx = deployCtx.current;
    if (a && !token && address && ctx) {
      const addr = getAddress(a);
      setToken(addr);
      registerToken(signMessageAsync, {
        address: addr,
        owner: address,
        kind: "created",
        name: ctx.name,
        symbol: ctx.symbol,
        decimals: 6,
      });
      if (ctx.initUnits > 0n && !mintedRef.current) {
        mintedRef.current = true;
        setMintNote({ units: ctx.initUnits, symbol: ctx.symbol });
        initMint.writeContract({
          address: addr,
          abi: confidentialTokenAbi,
          functionName: "mint",
          args: [address, ctx.initUnits],
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployRcpt.data]);

  const okName = name.trim().length > 0 && name.length <= 40;
  const okSymbol = /^[A-Za-z0-9]{1,11}$/.test(symbol.trim());
  const capBad = maxSupply.trim() !== "" && capUnits === null;
  const initBad = initialMint.trim() !== "" && initUnits === null;
  const overCap = capUnits && initUnits && capUnits > 0n ? initUnits > capUnits : false;
  const deploying = deploy.isPending || deployRcpt.isLoading;

  function deployToken() {
    if (!okName || !okSymbol || capBad || initBad || overCap) return;
    deployCtx.current = { name: name.trim(), symbol: symbol.trim(), initUnits: initUnits ?? 0n };
    deploy.deployContract({
      abi: ConfidentialMintableToken_ABI,
      bytecode: ConfidentialMintableToken_BYTECODE,
      args: [name.trim(), symbol.trim(), "", capUnits ?? 0n],
    });
  }

  return (
    <div className="space-y-4">
      <div className="sheet p-5">
        <span className="label">New confidential ERC-7984 token</span>
        <p className="mt-1 text-[11px] text-muted">
          You are the only minter. Balances are encrypted (6 decimals). The max supply is public; balances stay private.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Acme Payroll USD"
              className={inputCls()}
            />
          </Field>
          <Field label="Symbol">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              maxLength={11}
              placeholder="aUSD"
              className={inputCls() + " font-mono"}
            />
          </Field>
          <Field label="Max supply (optional)">
            <input
              value={maxSupply}
              onChange={(e) => setMaxSupply(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1000000 (blank = unlimited)"
              className={inputCls(capBad)}
            />
          </Field>
          <Field label="Mint to yourself now">
            <input
              value={initialMint}
              onChange={(e) => setInitialMint(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 100000"
              className={inputCls(initBad || overCap)}
            />
          </Field>
        </div>
        {overCap && <p className="mt-2 text-xs text-neg">Initial mint exceeds the max supply.</p>}
        {!token && (
          <button onClick={deployToken} disabled={!okName || !okSymbol || capBad || initBad || overCap || deploying} className="btn-primary text-sm mt-4">
            {deploy.isPending ? "Confirm in wallet…" : deployRcpt.isLoading ? "Deploying…" : "Deploy confidential token"}
          </button>
        )}
        {deploy.data && !token && (
          <a href={explorerTx(deploy.data)} target="_blank" rel="noreferrer" className="link ml-3 text-xs">
            view tx ↗
          </a>
        )}
        {deploy.error && <p className="mt-2 text-xs text-neg">{cleanErr(deploy.error.message)}</p>}
        {token && mintNote && mintNote.units > 0n && (
          <p className="mt-3 text-xs">
            {initMint.isPending ? (
              <span className="text-muted">Confirm the initial mint in your wallet…</span>
            ) : initMint.error ? (
              <span className="text-neg">
                Deployed ✓ but the initial mint didn't go through ({cleanErr(initMint.error.message)}). Mint below
                instead.
              </span>
            ) : (
              <span className="text-pos">
                Deployed ✓ minting {fmtToken(mintNote.units, 6)} {mintNote.symbol} to you.
              </span>
            )}
          </p>
        )}
      </div>

      {token && address && <MintPanel token={token} symbol={symbol.trim() || "token"} recipient={address} />}
      {token && <DistributeHandoff token={token} />}
    </div>
  );
}

function MintPanel({ token, symbol, recipient }: { token: Address; symbol: string; recipient: Address }) {
  const [amt, setAmt] = useState("");
  const mint = useWriteContract();
  const rcpt = useWaitForTransactionReceipt({ hash: mint.data });

  const cap = (useReadContract({ address: token, abi: ConfidentialMintableToken_ABI, functionName: "cap" }).data ?? 0n) as bigint;
  const mintedQ = useReadContract({ address: token, abi: ConfidentialMintableToken_ABI, functionName: "totalMinted" });
  const minted = (mintedQ.data ?? 0n) as bigint;

  useEffect(() => {
    if (rcpt.isSuccess) mintedQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcpt.isSuccess]);

  const units = safeParse(amt, 6);
  const remaining = cap > 0n ? (cap > minted ? cap - minted : 0n) : null;
  const overCap = remaining !== null && units !== null && units > remaining;

  function doMint() {
    if (units === null || units === 0n || overCap) return;
    mint.writeContract({ address: token, abi: confidentialTokenAbi, functionName: "mint", args: [recipient, units] });
  }

  return (
    <div className="sheet p-5">
      <div className="flex items-center justify-between">
        <span className="label">Mint more {symbol} to yourself</span>
        {cap > 0n && (
          <span className="text-[10px] text-muted">
            {fmtToken(minted, 6)} / {fmtToken(cap, 6)} minted
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
          placeholder={`Amount of ${symbol}`}
          className={`flex-1 ${inputCls(overCap)}`}
        />
        <button onClick={doMint} disabled={mint.isPending || rcpt.isLoading || !amt || overCap} className="btn-primary text-sm whitespace-nowrap">
          {mint.isPending ? "Confirm…" : rcpt.isLoading ? "Minting…" : "Mint"}
        </button>
      </div>
      <div className="mt-2 min-h-4 text-xs">
        {overCap && <span className="text-neg">Only {fmtToken(remaining ?? 0n, 6)} {symbol} left under the cap.</span>}
        {!overCap && rcpt.isSuccess && <span className="text-pos">Minted ✓ check your Portfolio.</span>}
        {!overCap && mint.error && <span className="text-neg">{cleanErr(mint.error.message)}</span>}
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function useReadErc20Balance(token: Address | undefined, owner: Address | undefined): bigint | undefined {
  const q = useReadContract({
    address: token,
    abi: erc20BalAbi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: !!token && !!owner },
  });
  return q.data as bigint | undefined;
}

function inputCls(bad?: boolean): string {
  return `w-full bg-panel border rounded-md px-3 py-2 text-sm placeholder:text-muted/70 outline-none transition-colors focus:border-accent ${
    bad ? "border-neg" : "border-line"
  }`;
}

function symOf(symbol: string | undefined): string {
  return (symbol || "TOKEN").replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "TOKEN";
}

function safeParse(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(t)) return null;
  try {
    const v = parseUnits(t, decimals);
    // euint64 ceiling - anything larger would only fail later at tx encoding.
    return v < 2n ** 64n ? v : null;
  } catch {
    return null;
  }
}

function cleanErr(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Transaction rejected.";
  if (/insufficient funds/i.test(msg)) return "Not enough Sepolia ETH for gas.";
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

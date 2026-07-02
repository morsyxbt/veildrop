import { useConfidentialBalance, useShield, useUnshield, useWrapperDiscovery } from "@zama-fhe/react-sdk";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useDeployContract, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { useWalletModal } from "../components/WalletModal";
import { confidentialTokenAbi } from "../lib/abis";
import { listTokens, saveToken } from "../lib/api";
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

export function CreatePage() {
  const { isConnected } = useAccount();
  const { open } = useWalletModal();
  const [tab, setTab] = useState<"wrap" | "new">("new");

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-black tracking-tight">Create a confidential token</h1>
        <p className="mt-1 text-sm text-muted">
          Turn a public ERC-20 into an encrypted ERC-7984 token, or mint a fresh one - then distribute it privately.
        </p>
      </motion.div>

      {!isConnected ? (
        <div className="panel p-6 mt-6 flex items-center justify-between">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to deploy a token.</span>
          <button className="btn-primary text-sm" onClick={open}>
            Connect
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 inline-flex rounded-xl bg-panel-2 border border-line p-1">
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
      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active ? "bg-accent text-onaccent" : "text-fg hover:bg-panel"
      }`}
    >
      {children}
    </button>
  );
}

function DistributeHandoff({ token }: { token: Address }) {
  return (
    <div className="mt-4 rounded-xl bg-accent/10 border border-accent/30 p-4">
      <div className="text-sm font-semibold text-pos">Your confidential token is live.</div>
      <div className="mt-1 text-[11px] font-mono text-muted">
        <a href={explorerAddr(token)} target="_blank" rel="noreferrer" className="hover:text-accent-2">
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
    setExisting(null);
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

  const deploy = useDeployContract();
  const deployRcpt = useWaitForTransactionReceipt({ hash: deploy.data });
  useEffect(() => {
    const a = deployRcpt.data?.contractAddress;
    if (a && erc20Addr && address) {
      const addr = getAddress(a);
      setWrapper(addr);
      const sym = symOf(meta.symbol);
      saveToken({
        address: addr,
        owner: address,
        kind: "wrapper",
        symbol: `c${sym}`,
        decimals: confDecimals,
        underlying: erc20Addr,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployRcpt.data]);

  function deployWrapper() {
    if (!erc20Addr) return;
    const sym = symOf(meta.symbol);
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
      <div className="panel p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Public ERC-20 to wrap</div>
        <input
          value={erc20}
          onChange={(e) => setErc20(e.target.value)}
          placeholder="0x… ERC-20 token address"
          className="mt-3 w-full rounded-xl bg-panel-2 border border-line px-3 py-2.5 text-sm font-mono outline-none focus:border-accent"
        />
        <div className="mt-2 min-h-5 text-xs">
          {raw && !erc20Addr ? (
            <span className="text-neg">Not a valid address.</span>
          ) : erc20Addr && meta.loading ? (
            <span className="text-muted animate-pulse">Reading token…</span>
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
        <div className="panel p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Confidential wrapper</div>
          {wrapper ? (
            <div className="mt-3 text-sm">
              <span className="text-pos font-semibold">Wrapper ready.</span>{" "}
              <a href={explorerAddr(wrapper)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-muted hover:text-accent-2">
                {shortAddr(wrapper)} ↗
              </a>
            </div>
          ) : (
            <>
              {known && (
                <div className="mt-3 rounded-xl bg-accent/10 border border-accent/30 p-3 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    This ERC-20 already has a confidential wrapper.{" "}
                    <span className="font-mono text-muted">{shortAddr(known)}</span>
                  </div>
                  <button onClick={() => setWrapper(known)} className="btn-primary text-xs whitespace-nowrap">
                    Use it
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs text-muted leading-relaxed">
                {known ? "Or deploy a new one" : "Deploy a confidential wrapper bound to this ERC-20"} (one transaction).
                It becomes an ERC-7984 token you can wrap into and distribute privately.
              </p>
              <button onClick={deployWrapper} disabled={deploying} className="btn-primary text-sm mt-3">
                {deploy.isPending ? "Confirm in wallet…" : deployRcpt.isLoading ? "Deploying…" : "Deploy confidential wrapper"}
              </button>
              {deploy.data && (
                <a href={explorerTx(deploy.data)} target="_blank" rel="noreferrer" className="ml-3 text-xs text-accent-2 hover:underline">
                  view tx ↗
                </a>
              )}
              {deploy.error && <p className="mt-2 text-xs text-neg">{cleanErr(deploy.error.message)}</p>}

              <div className="mt-4 pt-4 border-t border-line/60">
                <div className="text-[10px] text-muted mb-2">Already have a wrapper address? Paste it:</div>
                <div className="flex gap-2">
                  <input
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    placeholder="0x… wrapper address"
                    className="flex-1 rounded-xl bg-panel-2 border border-line px-3 py-2 text-xs font-mono outline-none focus:border-accent"
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
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Your confidential balance</span>
        <div className="flex items-center gap-3">
          {revealBal ? (
            confBal.isLoading ? (
              <span className="text-xs text-muted animate-pulse">Decrypting…</span>
            ) : (
              <span className="text-sm font-black">
                {fmtToken(confBal.data ?? 0n, confDecimals)} <span className="text-muted text-xs">c{symOf(symbol)}</span>
              </span>
            )
          ) : (
            <span className="text-sm font-black tracking-widest text-muted">••••</span>
          )}
          <button onClick={() => setRevealBal((r) => !r)} className="btn-ghost text-xs">
            {revealBal ? "🔒" : "🔓 Reveal"}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Wrap */}
        <div className="panel p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Wrap → confidential</div>
          <p className="mt-1 text-[11px] text-muted">Public {symbol} becomes an encrypted balance.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={wrapAmt}
              onChange={(e) => setWrapAmt(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount in ${symbol}`}
              className={`flex-1 rounded-xl bg-panel-2 border px-3 py-2.5 text-sm outline-none focus:border-accent ${
                overWrap ? "border-neg" : "border-line"
              }`}
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
        <div className="panel p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Unwrap → ERC-20</div>
          <p className="mt-1 text-[11px] text-muted">Redeem confidential back to public {symbol}.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={unwrapAmt}
              onChange={(e) => setUnwrapAmt(e.target.value)}
              inputMode="decimal"
              placeholder={`Amount (${confDecimals} dp)`}
              className={`flex-1 rounded-xl bg-panel-2 border px-3 py-2.5 text-sm outline-none focus:border-accent ${
                overUnwrap ? "border-neg" : "border-line"
              }`}
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
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("");
  const [initialMint, setInitialMint] = useState("");
  const [token, setToken] = useState<Address | null>(null);
  const mintedRef = useRef(false);

  const capUnits = maxSupply.trim() ? safeParse(maxSupply, 6) : 0n; // 0 = uncapped
  const initUnits = initialMint.trim() ? safeParse(initialMint, 6) : 0n;

  const deploy = useDeployContract();
  const deployRcpt = useWaitForTransactionReceipt({ hash: deploy.data });
  const initMint = useWriteContract();

  useEffect(() => {
    const a = deployRcpt.data?.contractAddress;
    if (a && !token && address) {
      const addr = getAddress(a);
      setToken(addr);
      saveToken({ address: addr, owner: address, kind: "created", name: name.trim(), symbol: symbol.trim(), decimals: 6 });
      if (initUnits && initUnits > 0n && !mintedRef.current) {
        mintedRef.current = true;
        initMint.writeContract({ address: addr, abi: confidentialTokenAbi, functionName: "mint", args: [address, initUnits] });
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
    deploy.deployContract({
      abi: ConfidentialMintableToken_ABI,
      bytecode: ConfidentialMintableToken_BYTECODE,
      args: [name.trim(), symbol.trim(), "", capUnits ?? 0n],
    });
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">New confidential ERC-7984 token</div>
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
          <a href={explorerTx(deploy.data)} target="_blank" rel="noreferrer" className="ml-3 text-xs text-accent-2 hover:underline">
            view tx ↗
          </a>
        )}
        {deploy.error && <p className="mt-2 text-xs text-neg">{cleanErr(deploy.error.message)}</p>}
        {token && initUnits && initUnits > 0n && (
          <p className="mt-3 text-xs">
            {initMint.isPending ? (
              <span className="text-muted">Confirm the initial mint in your wallet…</span>
            ) : (
              <span className="text-pos">Deployed ✓ minting {fmtToken(initUnits, 6)} {symbol.trim()} to you.</span>
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
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Mint more {symbol} to yourself</div>
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
          className={`flex-1 rounded-xl bg-panel-2 border px-3 py-2.5 text-sm outline-none focus:border-accent ${
            overCap ? "border-neg" : "border-line"
          }`}
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
      <label className="text-[10px] text-muted">{label}</label>
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
  return `w-full rounded-xl bg-panel-2 border px-3 py-2.5 text-sm outline-none focus:border-accent ${
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
    return parseUnits(t, decimals);
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

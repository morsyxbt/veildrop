import { useConfidentialBalances } from "@zama-fhe/react-sdk";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { CipherValue } from "../components/viz/CipherValue";
import { useWalletModal } from "../components/WalletModal";
import { useTokenMeta } from "../hooks/useTokenMeta";
import { listCampaigns, listMyClaims, listTokens } from "../lib/api";
import { DEMO_TOKEN, explorerAddr } from "../lib/config";
import { scanReceivedTokens } from "../lib/discovery";
import { fmtToken, shortAddr } from "../lib/format";

export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-black tracking-tight">Portfolio</h1>
        <p className="mt-1 text-sm text-muted">
          Every confidential token you hold on Sepolia. Balances are encrypted on-chain - only you can decrypt them.
        </p>
      </motion.div>

      {!isConnected || !address ? (
        <div className="panel p-6 mt-6 flex items-center justify-between">
          <span className="text-sm text-muted">Connect a wallet to view your confidential balances.</span>
          <button className="btn-primary text-sm" onClick={open}>
            Connect
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <Portfolio address={address} />
        </div>
      )}
    </div>
  );
}

function pushAddr(map: Map<string, Address>, a?: string) {
  if (a && isAddress(a)) map.set(a.toLowerCase(), getAddress(a));
}

export function Portfolio({ address }: { address: Address }) {
  const publicClient = usePublicClient();
  const [discovered, setDiscovered] = useState<Address[]>([DEMO_TOKEN]);
  const [watched, setWatched] = useState<Address[]>([]);
  const [scanning, setScanning] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [inputErr, setInputErr] = useState<string | null>(null);

  // Auto-detect: Veildrop backend (created / wrapped / sent / received) first, then
  // augment with a best-effort on-chain scan of tokens transferred to this wallet.
  useEffect(() => {
    let cancelled = false;
    setScanning(true);
    (async () => {
      const map = new Map<string, Address>();
      map.set(DEMO_TOKEN.toLowerCase(), DEMO_TOKEN);
      const [created, mine, owned] = await Promise.all([
        listCampaigns(address),
        listMyClaims(address),
        listTokens(address),
      ]);
      for (const c of created) pushAddr(map, c.token);
      for (const m of mine) pushAddr(map, m.token);
      for (const o of owned) pushAddr(map, o.address);
      if (!cancelled) setDiscovered([...map.values()]);

      if (publicClient) {
        const more = await scanReceivedTokens(publicClient, address).catch(() => [] as Address[]);
        for (const t of more) map.set(t.toLowerCase(), t);
      }
      if (!cancelled) {
        setDiscovered([...map.values()]);
        setScanning(false);
      }
    })().catch(() => {
      if (!cancelled) setScanning(false);
    });
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const tokens = useMemo(() => {
    const map = new Map<string, Address>();
    for (const t of discovered) map.set(t.toLowerCase(), t);
    for (const t of watched) map.set(t.toLowerCase(), t);
    return [...map.values()];
  }, [discovered, watched]);

  const balances = useConfidentialBalances({ tokenAddresses: tokens }, { enabled: revealed && tokens.length > 0 });
  const results = balances.data?.results;

  function addToken() {
    const raw = input.trim();
    if (!isAddress(raw)) return setInputErr("Enter a valid token address (0x…).");
    const addr = getAddress(raw);
    if (tokens.some((t) => t.toLowerCase() === addr.toLowerCase())) return setInputErr("Already in your portfolio.");
    setWatched((prev) => [...prev, addr]);
    setInput("");
    setInputErr(null);
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Your confidential balances</div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted">
            {scanning ? "scanning…" : `${tokens.length} token${tokens.length === 1 ? "" : "s"}`}
          </span>
          <button
            onClick={() => setRevealed((r) => !r)}
            disabled={tokens.length === 0}
            className="btn-ghost text-xs whitespace-nowrap"
            title="Decrypts every balance at once with your wallet - only you can read them"
          >
            {revealed ? "🔒 Hide balances" : "🔓 Reveal all"}
          </button>
        </div>
      </div>

      <div className="mt-3 divide-y divide-line/60">
        {tokens.map((t) => (
          <TokenRow
            key={t}
            token={t}
            revealed={revealed}
            loading={balances.isLoading}
            balance={results?.get(t) ?? results?.get(t.toLowerCase() as Address)}
          />
        ))}
      </div>

      {/* Watch any token */}
      <div className="mt-4 pt-4 border-t border-line/60">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputErr(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && addToken()}
            placeholder="Watch any ERC-7984 token (0x…)"
            className="flex-1 rounded-xl bg-panel-2 border border-line px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
          <button onClick={addToken} className="btn-ghost text-sm whitespace-nowrap">
            + Add
          </button>
        </div>
        {inputErr && <p className="mt-2 text-[11px] text-neg">{inputErr}</p>}
      </div>

      <p className="mt-3 text-[10px] text-muted leading-relaxed">
        Auto-detects tokens you create, wrap, send, or receive through Veildrop, plus recent on-chain transfers to your
        wallet. Add any other confidential token above.
      </p>
    </div>
  );
}

function TokenRow({
  token,
  revealed,
  loading,
  balance,
}: {
  token: Address;
  revealed: boolean;
  loading: boolean;
  balance: bigint | undefined;
}) {
  const meta = useTokenMeta(token);
  const isDemo = token.toLowerCase() === DEMO_TOKEN.toLowerCase();
  const symbol = meta.symbol || (meta.loading ? "…" : "token");

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{symbol}</span>
          {isDemo && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-accent-2 bg-accent-2/10 rounded px-1.5 py-0.5">
              demo
            </span>
          )}
        </div>
        <a
          href={explorerAddr(token)}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-mono text-muted hover:text-accent-2"
        >
          {shortAddr(token)} ↗
        </a>
      </div>

      <div className="text-right shrink-0">
        {!revealed ? (
          <CipherValue value="000000" hidden chars={7} className="text-base" />
        ) : loading ? (
          <span className="text-xs text-muted animate-pulse">Decrypting…</span>
        ) : balance === undefined ? (
          <span className="text-xs text-muted">unavailable</span>
        ) : (
          <span className="text-base font-black">
            {fmtToken(balance, meta.decimals)} <span className="text-muted text-xs font-bold">{symbol}</span>
          </span>
        )}
      </div>
    </div>
  );
}

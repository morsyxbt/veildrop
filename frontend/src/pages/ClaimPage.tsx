import { asEncryptedHandle, createConfidentialAirdropClient } from "@tokenops/sdk/fhe-airdrop";
import { useAirdropHasClaimEnded, useClaim } from "@tokenops/sdk/fhe-airdrop/react";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { zeroAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";

import { CipherValue } from "../components/viz/CipherValue";
import { useWalletModal } from "../components/WalletModal";
import { getCampaign, getCampaignBySlug, listMyClaims, type MyClaim } from "../lib/api";
import {
  entryFor,
  parseClaimLocation,
  type Campaign,
  type ClaimPayload,
  type ClaimSource,
} from "../lib/claimLink";
import { DEMO_TOKEN, TOKEN_DECIMALS, TOKEN_SYMBOL, explorerAddr, explorerTx } from "../lib/config";
import { fmtToken, shortAddr } from "../lib/format";

// A link (slug / ?a= / ?c= / #c=) opens one allocation; a bare /claim connects
// the wallet and finds every drop it can claim.
export function ClaimPage() {
  const { slug } = useParams();
  const location = useLocation();
  const source = useMemo(
    () => parseClaimLocation(location.hash, location.search),
    [location.hash, location.search],
  );
  const hasLink = !!slug || source.kind !== "none";
  const key =
    slug ?? (source.kind === "backed" ? source.airdrop : source.kind === "hosted" ? source.url : "c");
  return hasLink ? <SingleClaim key={key} slug={slug} source={source} /> : <MyDrops />;
}

function SingleClaim({ slug, source }: { slug?: string; source: ClaimSource }) {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();

  const [campaign, setCampaign] = useState<Campaign | null>(
    source.kind === "campaign" ? source.campaign : null,
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!slug || source.kind === "hosted" || source.kind === "backed");

  // Resolve the campaign by slug (/claim/<slug>), backend (?a=) or hosted file (?c=<url>).
  useEffect(() => {
    const load: Promise<Campaign | null> | null = slug
      ? getCampaignBySlug(slug)
      : source.kind === "backed"
        ? getCampaign(source.airdrop)
        : source.kind === "hosted"
          ? fetch(source.url)
              .then((r) => r.json())
              .then((j) => (j?.airdrop && j?.claims ? (j as Campaign) : null))
          : null;
    if (!load) return;
    let cancelled = false;
    setLoading(true);
    load
      .then((c) => {
        if (cancelled) return;
        if (c) setCampaign(c);
        else setLoadErr("That campaign link is invalid or was removed.");
      })
      .catch(() => !cancelled && setLoadErr("Couldn't load the campaign from that link."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, slug]);

  const payload: ClaimPayload | null = campaign && address ? entryFor(campaign, address) : null;
  const campaignName = campaign?.name ?? payload?.name;
  const symbol = campaign?.symbol ?? TOKEN_SYMBOL;
  const decimals = campaign?.decimals ?? TOKEN_DECIMALS;
  const tokenAddress = (campaign?.token ?? DEMO_TOKEN) as Address;

  // ----- claim -----
  const [claimHash, setClaimHash] = useState<Hex | undefined>();
  const [err, setErr] = useState<string | null>(null);

  const airdrop = (payload?.airdrop ?? zeroAddress) as Address;
  const claim = useClaim({ address: airdrop });
  const hasEnded = useAirdropHasClaimEnded({ address: airdrop });
  const { isLoading: confirming, isSuccess: claimed } = useWaitForTransactionReceipt({ hash: claimHash });
  const closed = !!campaign?.withdrawn || hasEnded.data === true;

  async function doClaim() {
    if (!payload) return;
    setErr(null);
    try {
      const hash = await claim.mutateAsync({
        encryptedInput: payload.encryptedInput,
        signature: payload.signature,
      });
      setClaimHash(hash);
    } catch (e) {
      setErr(cleanError(e));
    }
  }

  const haveCampaign = !!campaign;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="text-center">
          <span className="tag bg-panel-2 text-accent-2 border border-line">
            {campaignName ?? "Private allocation"}
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight">A drop is waiting for you</h1>
          <p className="mt-2 text-sm text-muted">
            Confidential {symbol} was allocated to you. Only you can decrypt and claim it.
          </p>
        </div>

        <div className="panel p-8 mt-7">
          {loading ? (
            <div className="text-center text-sm text-muted py-6 animate-pulse">Loading campaign…</div>
          ) : !haveCampaign ? (
            <NoCampaign err={loadErr} />
          ) : !payload ? (
            <NoAllocation isConnected={isConnected} onConnect={open} />
          ) : (
            <>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wider text-muted">Your allocation</div>
                <div className="mt-2 text-4xl font-black">
                  <CipherValue value="00000000" hidden chars={10} />
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  airdrop{" "}
                  <a className="text-accent-2 hover:underline" href={explorerAddr(airdrop)} target="_blank" rel="noreferrer">
                    {shortAddr(airdrop)} ↗
                  </a>
                </div>
              </div>

              {claimed ? (
                <ClaimedBanner hash={claimHash} token={tokenAddress} symbol={symbol} decimals={decimals} />
              ) : closed ? (
                <div className="mt-7 text-center">
                  <div className="text-sm font-bold text-neg">This drop is closed</div>
                  <p className="text-[11px] text-muted mt-1 leading-relaxed">
                    {campaign?.withdrawn
                      ? "The sender refunded the unclaimed funds."
                      : "The claim window has ended."}{" "}
                    There's nothing to claim here - don't spend gas on it.
                  </p>
                </div>
              ) : (
                <div className="mt-7 space-y-3">
                  <button className="btn-primary w-full" disabled={claim.isPending || confirming} onClick={doClaim}>
                    {claim.isPending ? "Confirm in wallet…" : confirming ? "Claiming…" : "Claim it"}
                  </button>
                  <p className="text-[10px] text-muted text-center leading-relaxed">
                    Claim with the wallet this allocation was issued to. You'll see the amount after you
                    claim - it never appears in cleartext on-chain.
                  </p>
                </div>
              )}

              {err && <div className="mt-3 text-xs text-neg text-center">{err}</div>}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function MyDrops() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const publicClient = usePublicClient();
  const [items, setItems] = useState<(MyClaim & { claimed: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"claimable" | "claimed">("claimable");

  useEffect(() => {
    if (!address || !publicClient) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const claims = await listMyClaims(address);
      const withStatus = await Promise.all(
        claims.map(async (c) => {
          try {
            const client = createConfidentialAirdropClient({ publicClient, address: c.airdrop });
            const done = await client.isSignatureClaimed(address, asEncryptedHandle(c.handle as Hex));
            return { ...c, claimed: done };
          } catch {
            return { ...c, claimed: false };
          }
        }),
      );
      if (!cancelled) setItems(withStatus);
    })()
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const claimableCount = items.filter((i) => !i.claimed && !isClosed(i)).length;
  const claimedCount = items.filter((i) => i.claimed).length;
  const shown = items.filter((i) => (filter === "claimed" ? i.claimed : !i.claimed));

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="text-center">
          <span className="tag bg-panel-2 text-accent-2 border border-line">Your drops</span>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Claim what's yours</h1>
          <p className="mt-2 text-sm text-muted">
            Connect your wallet and Veildrop finds every confidential allocation waiting for you.
          </p>
        </div>

        <div className="panel p-6 mt-7">
          {!isConnected ? (
            <div className="text-center">
              <p className="text-sm text-muted">Connect your wallet to see your allocations.</p>
              <button className="btn-primary mt-4" onClick={open}>
                Connect wallet
              </button>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="text-center text-sm text-muted py-6 animate-pulse">Looking for your drops…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-muted">
              No allocations found for this wallet. If you were sent a claim link, open it directly.
            </div>
          ) : (
            <>
              <div className="inline-flex p-1 rounded-lg bg-panel-2 border border-line text-xs mb-4">
                <button
                  onClick={() => setFilter("claimable")}
                  className={`px-3 py-1 rounded-md font-semibold ${filter === "claimable" ? "bg-accent text-onaccent" : "text-muted"}`}
                >
                  Claimable ({claimableCount})
                </button>
                <button
                  onClick={() => setFilter("claimed")}
                  className={`px-3 py-1 rounded-md font-semibold ${filter === "claimed" ? "bg-accent text-onaccent" : "text-muted"}`}
                >
                  Claimed ({claimedCount})
                </button>
              </div>
              {shown.length === 0 ? (
                <div className="text-center text-sm text-muted py-4">
                  {filter === "claimable" ? "You're all caught up - nothing left to claim." : "Nothing claimed yet."}
                </div>
              ) : (
                <div className="space-y-2">
                  {shown.map((i) => (
                    <DropRow key={i.airdrop} item={i} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// A drop is closed once the sender refunds it or the claim window ends.
function isClosed(i: MyClaim): boolean {
  return !!i.withdrawn || (i.endTime > 0 && Math.floor(Date.now() / 1000) >= i.endTime);
}

function DropRow({ item }: { item: MyClaim & { claimed: boolean } }) {
  const closed = isClosed(item);
  const to = item.slug ? `/claim/${item.slug}` : `/claim?a=${item.airdrop}`;
  return (
    <div
      className={`flex items-center justify-between gap-3 bg-panel-2 border border-line rounded-xl px-3 py-3 ${
        closed && !item.claimed ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{item.name || "Confidential drop"}</div>
        <div className="text-[11px] text-muted font-mono">{shortAddr(item.airdrop)}</div>
      </div>
      {item.claimed ? (
        <span className="text-[11px] font-semibold text-pos shrink-0">Claimed ✓</span>
      ) : closed ? (
        <span className="text-[11px] font-semibold text-muted shrink-0">Closed</span>
      ) : (
        <Link to={to} className="btn-primary text-xs shrink-0">
          Claim →
        </Link>
      )}
    </div>
  );
}

function NoCampaign({ err }: { err: string | null }) {
  return (
    <div className="text-center">
      <p className="text-sm text-muted">Open the private claim link you were sent to see your allocation.</p>
      {err && <div className="mt-3 text-xs text-neg">{err}</div>}
    </div>
  );
}

function NoAllocation({ isConnected, onConnect }: { isConnected: boolean; onConnect: () => void }) {
  if (!isConnected) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted">Connect your wallet to find your allocation in this airdrop.</p>
        <button className="btn-primary mt-4" onClick={onConnect}>
          Connect wallet
        </button>
      </div>
    );
  }
  return (
    <div className="text-center text-sm text-muted">
      This wallet has no allocation in this airdrop. Switch to the wallet it was issued to and try again.
    </div>
  );
}

function ClaimedBanner({
  hash,
  token,
  symbol,
  decimals,
}: {
  hash?: Hex;
  token: Address;
  symbol: string;
  decimals: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const balance = useConfidentialBalance({ tokenAddress: token }, { enabled: revealed });
  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="mt-7 text-center"
      >
        <div className="text-4xl">🎉</div>
        <div className="font-black text-pos text-lg mt-1">Claimed</div>
        <p className="text-xs text-muted mt-1">The tokens are now in your confidential balance.</p>

        <div className="mt-4 min-h-9 flex items-center justify-center">
          {!revealed ? (
            <button
              className="btn-ghost text-sm"
              onClick={() => setRevealed(true)}
              title="Decrypts your own balance with your wallet - free, off-chain"
            >
              🔓 Reveal my balance
            </button>
          ) : balance.isLoading ? (
            <span className="text-muted text-sm animate-pulse">Decrypting…</span>
          ) : (
            <span className="text-2xl font-black">
              <CipherValue value={fmtToken(balance.data ?? 0n, decimals)} hidden={false} />{" "}
              <span className="text-muted text-base font-bold">{symbol}</span>
            </span>
          )}
        </div>

        {hash && (
          <a className="text-[11px] text-accent-2 hover:underline" href={explorerTx(hash)} target="_blank" rel="noreferrer">
            view tx ↗
          </a>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Rejected in wallet.";
  if (/already claimed/i.test(msg)) return "This allocation was already claimed.";
  if (/invalid signature|signature/i.test(msg)) return "This link isn't valid for the connected wallet.";
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

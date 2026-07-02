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

// A link (slug / ?a= / ?c= / #c=) opens one sealed envelope; a bare /claim
// connects the wallet and finds every drop it can claim.
export function ClaimPage() {
  const { slug } = useParams();
  const location = useLocation();
  const source = useMemo(
    () => parseClaimLocation(location.hash, location.search),
    [location.hash, location.search],
  );
  const hasLink = !!slug || source.kind !== "none";
  // Self-contained #c= campaigns are seeded in SingleClaim's initial state, so the
  // key must change with the hash - a same-tab navigation to a second #c= link
  // would otherwise keep showing the first drop.
  const key =
    slug ??
    (source.kind === "backed"
      ? source.airdrop
      : source.kind === "hosted"
        ? source.url
        : source.kind === "campaign" || source.kind === "invalid"
          ? location.hash
          : "c");
  return hasLink ? <SingleClaim key={key} slug={slug} source={source} /> : <MyDrops />;
}

function SingleClaim({ slug, source }: { slug?: string; source: ClaimSource }) {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();

  const [campaign, setCampaign] = useState<Campaign | null>(
    source.kind === "campaign" ? source.campaign : null,
  );
  const [loadErr, setLoadErr] = useState<string | null>(
    source.kind === "invalid"
      ? "This claim link is damaged or incomplete - everything after the # matters. Ask the sender to re-copy it."
      : null,
  );
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
        else setLoadErr("That claim link is invalid or was removed.");
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
          <span className="stamp text-accent">Confidential</span>
          <h1 className="mt-4 font-display text-4xl font-black tracking-tight">
            A sealed drop, addressed to you
          </h1>
          <p className="mt-2 text-sm text-muted">
            {campaignName ? `"${campaignName}" - ` : ""}only you can break this seal and read the amount.
          </p>
        </div>

        <Envelope>
          {loading ? (
            <div className="py-8 space-y-3">
              <div className="skeleton h-4 w-40 mx-auto" />
              <div className="skeleton h-9 w-56 mx-auto" />
            </div>
          ) : !haveCampaign ? (
            <NoCampaign err={loadErr} />
          ) : !payload ? (
            <NoAllocation isConnected={isConnected} onConnect={open} />
          ) : (
            <>
              <div className="text-center">
                <div className="label">Your allocation</div>
                <div className="mt-3 text-4xl font-black">
                  <CipherValue value="00000000" hidden chars={10} />
                </div>
                <div className="mt-2 text-[11px] text-muted font-mono">
                  airdrop{" "}
                  <a className="link" href={explorerAddr(airdrop)} target="_blank" rel="noreferrer">
                    {shortAddr(airdrop)} ↗
                  </a>
                </div>
              </div>

              {claimed ? (
                <ClaimedBanner hash={claimHash} token={tokenAddress} symbol={symbol} decimals={decimals} />
              ) : closed ? (
                <div className="mt-7 text-center">
                  <span className="stamp text-neg">{campaign?.withdrawn ? "Refunded" : "Window closed"}</span>
                  <p className="text-[11px] text-muted mt-3 leading-relaxed">
                    {campaign?.withdrawn
                      ? "The sender refunded the unclaimed funds."
                      : "The claim window has ended."}{" "}
                    There's nothing to claim here - don't spend gas on it.
                  </p>
                </div>
              ) : (
                <div className="mt-7 space-y-3">
                  {/* hasEnded.isLoading: don't offer the claim before the window
                      status is known - a closed drop would just burn gas. */}
                  <button
                    className="btn-primary w-full"
                    disabled={claim.isPending || confirming || hasEnded.isLoading}
                    onClick={doClaim}
                  >
                    {claim.isPending
                      ? "Confirm in wallet…"
                      : confirming
                        ? "Breaking the seal…"
                        : hasEnded.isLoading
                          ? "Checking the claim window…"
                          : "Break the seal & claim"}
                  </button>
                  <p className="text-[10px] text-muted text-center leading-relaxed">
                    Claim with the wallet this allocation was issued to. The amount appears after you
                    claim - it never exists in cleartext on-chain.
                  </p>
                </div>
              )}

              {err && (
                <div className="mt-3 text-xs text-neg text-center" aria-live="polite">
                  {err}
                </div>
              )}
            </>
          )}
        </Envelope>
      </motion.div>
    </div>
  );
}

/** The manila envelope: flap on top, wax seal at its point, contents below. */
function Envelope({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-10">
      {/* flap */}
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        className="block w-full h-10 -mb-5 relative z-10"
        aria-hidden
      >
        <path d="M0 0 L50 12 L100 0" fill="var(--manila)" stroke="var(--line)" strokeWidth="0.35" />
      </svg>
      {/* wax seal at the flap point */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-6 z-20 w-9 h-9 rounded-full grid place-items-center"
        style={{
          background: "var(--primary)",
          boxShadow: "inset 0 2px 4px rgba(255,249,239,.25), 0 2px 6px rgba(28,23,15,.35)",
        }}
        aria-hidden
      >
        <div className="w-5 h-5 rounded-full border-2 border-onaccent/50" />
      </div>
      <div className="sheet px-8 pt-12 pb-8">{children}</div>
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

  // Two buckets: actionable drops, and everything settled (claimed or closed) -
  // so the tab count always matches the rows it labels.
  const claimable = items.filter((i) => !i.claimed && !isClosed(i));
  const history = items.filter((i) => i.claimed || isClosed(i));
  const shown = filter === "claimed" ? history : claimable;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="text-center">
          <span className="stamp text-accent-2">Your mail</span>
          <h1 className="mt-4 font-display text-4xl font-black tracking-tight">Claim what's yours</h1>
          <p className="mt-2 text-sm text-muted">
            Connect your wallet and Veildrop finds every sealed allocation waiting for you.
          </p>
        </div>

        <div className="sheet p-6 mt-8">
          {!isConnected ? (
            <div className="text-center">
              <p className="text-sm text-muted">Connect your wallet to see your allocations.</p>
              <button className="btn-primary mt-4" onClick={open}>
                Connect wallet
              </button>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="space-y-2 py-2">
              <div className="skeleton h-14 w-full" />
              <div className="skeleton h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-muted py-4">
              No allocations found for this wallet. If you were sent a claim link, open it directly.
            </div>
          ) : (
            <>
              <div className="inline-flex p-1 rounded-md bg-panel-2 border border-line text-xs mb-4">
                <button
                  onClick={() => setFilter("claimable")}
                  className={`px-3 py-1 rounded font-semibold ${filter === "claimable" ? "bg-accent text-onaccent" : "text-muted"}`}
                >
                  Claimable ({claimable.length})
                </button>
                <button
                  onClick={() => setFilter("claimed")}
                  className={`px-3 py-1 rounded font-semibold ${filter === "claimed" ? "bg-accent text-onaccent" : "text-muted"}`}
                >
                  History ({history.length})
                </button>
              </div>
              {shown.length === 0 ? (
                <div className="text-center text-sm text-muted py-4">
                  {filter === "claimable" ? "You're all caught up - nothing left to claim." : "No history yet."}
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
      className={`flex items-center justify-between gap-3 bg-manila/50 border border-line rounded-md px-3 py-3 ${
        closed && !item.claimed ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex items-center gap-2.5">
        {/* mini envelope */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="shrink-0 text-muted" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 6.5 L12 13 L21 6.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{item.name || "Confidential drop"}</div>
          <div className="text-[11px] text-muted font-mono">{shortAddr(item.airdrop)}</div>
        </div>
      </div>
      {item.claimed ? (
        <span className="stamp text-pos text-[9px] shrink-0">Claimed</span>
      ) : closed ? (
        <span className="stamp text-muted text-[9px] shrink-0">Closed</span>
      ) : (
        <Link to={to} className="btn-primary text-xs shrink-0">
          Open →
        </Link>
      )}
    </div>
  );
}

function NoCampaign({ err }: { err: string | null }) {
  return (
    <div className="text-center py-2">
      <p className="text-sm text-muted">
        Your allocation rides inside the claim link itself. Open the exact link you were sent.
      </p>
      {err && <div className="mt-3 text-xs text-neg">{err}</div>}
    </div>
  );
}

function NoAllocation({ isConnected, onConnect }: { isConnected: boolean; onConnect: () => void }) {
  if (!isConnected) {
    return (
      <div className="text-center py-2">
        <p className="text-sm text-muted">
          This envelope opens only for its addressee. Connect your wallet to check.
        </p>
        <button className="btn-primary mt-4" onClick={onConnect}>
          Connect wallet
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-2">
      <span className="stamp text-muted">Not addressed to this wallet</span>
      <p className="text-sm text-muted mt-3">
        No allocation here for the connected wallet. Switch to the wallet it was issued to and try again.
      </p>
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
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mt-7 text-center"
      >
        <span className="stamp text-pos">Claimed</span>
        <p className="text-xs text-muted mt-3">The tokens are in your confidential balance.</p>

        <div className="mt-4 min-h-10 flex items-center justify-center">
          {!revealed ? (
            <button
              className="btn-ghost text-sm"
              onClick={() => setRevealed(true)}
              title="Decrypts your own balance with your wallet - free, off-chain"
            >
              Reveal my balance
            </button>
          ) : balance.isLoading ? (
            <span className="skeleton h-8 w-40 inline-block" />
          ) : balance.isError ? (
            <button className="btn-ghost text-sm" onClick={() => balance.refetch()}>
              Couldn't decrypt the balance - retry
            </button>
          ) : (
            <span className="text-3xl font-black">
              <CipherValue value={fmtToken(balance.data ?? 0n, decimals)} hidden={false} />{" "}
              <span className="text-muted text-base font-bold">{symbol}</span>
            </span>
          )}
        </div>
        {revealed && !balance.isLoading && !balance.isError && (
          <p className="text-[10px] text-muted mt-1.5">
            Decrypted locally, for your eyes only - the chain still shows a redaction.
          </p>
        )}

        {hash && (
          <a className="link text-[11px] mt-3 inline-block" href={explorerTx(hash)} target="_blank" rel="noreferrer">
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
  // Match the SDK's actual typed-error wording ("…already been redeemed",
  // "signature is invalid…") alongside the generic phrasings.
  if (/already claimed|already been redeemed/i.test(msg)) return "This allocation was already claimed.";
  if (/invalid signature|signature is invalid/i.test(msg)) {
    return "This link isn't valid for the connected wallet.";
  }
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

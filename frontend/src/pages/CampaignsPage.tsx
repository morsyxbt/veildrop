import {
  useAirdropCanExtendClaimWindow,
  useAirdropEndTime,
  useExtendClaimWindow,
  useWithdraw,
} from "@tokenops/sdk/fhe-airdrop/react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useSignMessage } from "wagmi";

import { useWalletModal } from "../components/WalletModal";
import { campaignAuthMessage, listCampaigns, markWithdrawn, type CampaignMeta } from "../lib/api";
import { claimLinkFor } from "../lib/claimLink";
import { explorerAddr, explorerTx } from "../lib/config";
import { countClaims } from "../lib/discovery";
import { shortAddr } from "../lib/format";

export function CampaignsPage() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const [items, setItems] = useState<CampaignMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  // Read the creator's campaigns from the backend (fast, no on-chain scan).
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    listCampaigns(address)
      .then((list) => !cancelled && setItems(list))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address]);

  const PAGE_SIZE = 5;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight">Your campaigns</h1>
      <p className="mt-1 text-sm text-muted">
        Distributions you created - track claims and refund unclaimed funds.{" "}
        <Link to="/how-it-works" className="text-accent-2 hover:underline">
          How it works →
        </Link>
      </p>

      {!isConnected ? (
        <div className="panel p-6 mt-6 flex items-center justify-between">
          <span className="text-sm text-muted">Connect your wallet to see campaigns you created.</span>
          <button className="btn-primary text-sm" onClick={open}>
            Connect
          </button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="panel p-6 mt-6 text-sm text-muted animate-pulse">Loading your campaigns…</div>
      ) : items.length === 0 ? (
        <div className="panel p-6 mt-6 text-sm text-muted">
          No campaigns yet. Create one on the{" "}
          <Link to="/distribute" className="text-accent-2 hover:underline">
            Distribute
          </Link>{" "}
          page.
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {pageItems.map((d) =>
              d.mode === "disperse" ? (
                <DisperseRow key={d.airdrop} d={d} />
              ) : (
                <CampaignRow key={d.airdrop} d={d} creator={address!} />
              ),
            )}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4 text-xs">
              <button className="btn-ghost text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Prev
              </button>
              <span className="text-muted">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                className="btn-ghost text-xs"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DisperseRow({ d }: { d: CampaignMeta }) {
  const dateLabel = d.createdAt
    ? new Date(d.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {d.name || "Disperse"}
          <span className="tag bg-panel-2 text-pos border border-line">Sent</span>
        </div>
        <div className="text-[11px] text-muted">
          Dispersed to {d.count} recipient{d.count === 1 ? "" : "s"}
          {dateLabel && ` · ${dateLabel}`} ·{" "}
          <a className="text-accent-2 hover:underline" href={explorerTx(d.airdrop)} target="_blank" rel="noreferrer">
            view tx ↗
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function CampaignRow({ d, creator }: { d: CampaignMeta; creator: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(creator);
  const [err, setErr] = useState<string | null>(null);
  const [newEnd, setNewEnd] = useState("");
  const [extendErr, setExtendErr] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(!!d.withdrawn);
  const [claimedCount, setClaimedCount] = useState<number | null>(null);
  const [countFailed, setCountFailed] = useState(false);
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const withdraw = useWithdraw({ address: d.airdrop });
  const endQ = useAirdropEndTime({ address: d.airdrop });
  const canExtendQ = useAirdropCanExtendClaimWindow({ address: d.airdrop });
  const extend = useExtendClaimWindow({ address: d.airdrop });

  const endTime = Number(endQ.data ?? d.endTime ?? 0);
  const ended = endTime > 0 ? Math.floor(Date.now() / 1000) >= endTime : false;
  const endLabel =
    endTime > 0 ? new Date(endTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const headerLabel = d.name || "Airdrop you created";
  const count = d.count ?? 0;

  // Claim progress, counted live from the airdrop's `Claimed` events.
  useEffect(() => {
    if (!open || !publicClient || !d.complete) return;
    let cancelled = false;
    countClaims(publicClient, d.airdrop, d.block)
      .then((n) => {
        if (cancelled) return;
        setClaimedCount(n);
        setCountFailed(false);
      })
      .catch(() => !cancelled && setCountFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, d.airdrop, d.block, publicClient]);

  async function doWithdraw() {
    setErr(null);
    if (!isAddress(to)) {
      setErr("Enter a valid destination address.");
      return;
    }
    try {
      await withdraw.mutateAsync({ recipient: to as Address });
      setWithdrawn(true);
      // Flag it withdrawn in the store so claim pages show "closed". Needs the
      // creator's auth signature; declining skips the flag - the on-chain
      // window check still stops late claims.
      try {
        const auth = await signMessageAsync({ message: campaignAuthMessage(d.airdrop) });
        await markWithdrawn(d.airdrop, auth);
      } catch {
        // signature declined - nothing to roll back
      }
    } catch (e) {
      setErr(cleanError(e));
    }
  }

  async function doExtend() {
    setExtendErr(null);
    const ts = newEnd ? Math.floor(new Date(newEnd).getTime() / 1000) : 0;
    if (ts <= endTime) {
      setExtendErr("Pick a time later than the current window end.");
      return;
    }
    try {
      await extend.mutateAsync({ newEndTime: ts });
      setNewEnd("");
      endQ.refetch();
    } catch (e) {
      setExtendErr(cleanError(e));
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            {headerLabel}
            {!d.complete && <span className="tag bg-panel-2 text-neg border border-line">Unfinished</span>}
            {withdrawn && <span className="tag bg-panel-2 text-neg border border-line">Withdrawn</span>}
          </div>
          <div className="text-[11px] text-muted">
            {count > 0 && (
              <>
                {count} recipient{count === 1 ? "" : "s"} ·{" "}
              </>
            )}
            <a className="text-accent-2 hover:underline" href={explorerAddr(d.airdrop)} target="_blank" rel="noreferrer">
              {shortAddr(d.airdrop)} ↗
            </a>
            {endLabel && (
              <>
                {" "}
                · claim window {ended ? "ended" : "ends"} {endLabel}
              </>
            )}
          </div>
        </div>
        <button className="btn-ghost text-xs shrink-0" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line/60 pt-3">
          {!d.complete ? (
            <div className="text-[11px] text-neg">
              Signing didn't finish - recipients can't claim yet. Refund the funds below, or re-create the
              airdrop from Distribute.
            </div>
          ) : (
            <>
              {/* Claim link (recoverable - it's just the airdrop) */}
              <Copy label="Claim link" value={claimLinkFor({ slug: d.slug, airdrop: d.airdrop })} />

              {/* Claim progress */}
              <div className="text-[11px]">
                {countFailed ? (
                  <span className="text-muted">
                    Couldn't count claims right now -{" "}
                    <a
                      className="text-accent-2 hover:underline"
                      href={explorerAddr(d.airdrop)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      check the explorer ↗
                    </a>
                  </span>
                ) : claimedCount === null ? (
                  <span className="text-muted animate-pulse">Counting claims…</span>
                ) : (
                  <>
                    <span className="font-semibold text-pos">{claimedCount}</span>
                    <span className="text-muted">{count > 0 ? ` of ${count} claimed` : " claimed"}</span>
                  </>
                )}
              </div>
            </>
          )}

          {/* Withdraw / refund */}
          <div className="bg-panel-2 border border-line rounded-xl p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Withdraw unclaimed funds</div>
            <p className="text-[11px] text-muted mt-1">Sends all remaining tokens to the address below.</p>
            <div className="flex gap-2 mt-2">
              <input
                className="input flex-1 text-xs"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0xDestination"
              />
              <button
                className="btn-primary text-xs shrink-0"
                disabled={withdraw.isPending || withdrawn}
                onClick={doWithdraw}
              >
                {withdraw.isPending ? "Withdrawing…" : withdrawn ? "Withdrawn" : "Withdraw"}
              </button>
            </div>
            {err && <div className="text-[11px] text-neg mt-2">{err}</div>}
          </div>

          {/* Extend claim window */}
          {!ended && canExtendQ.data === true && (
            <div className="bg-panel-2 border border-line rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Extend claim window</div>
              <p className="text-[11px] text-muted mt-1">Give recipients more time. Must be later than the current end.</p>
              <div className="flex gap-2 mt-2">
                <input
                  type="datetime-local"
                  className="input flex-1 text-xs"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                />
                <button className="btn-ghost text-xs shrink-0" disabled={extend.isPending || !newEnd} onClick={doExtend}>
                  {extend.isPending ? "Extending…" : "Extend"}
                </button>
              </div>
              {extendErr && <div className="text-[11px] text-neg mt-2">{extendErr}</div>}
            </div>
          )}
          {!ended && canExtendQ.data === false && (
            <p className="text-[11px] text-muted">
              This airdrop's claim window can't be extended (not enabled when it was created).
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-panel-2 border border-line rounded-xl px-3 py-2">
      <span className="font-mono text-xs text-muted shrink-0">{label}</span>
      <span className="font-mono text-xs text-muted truncate flex-1">{value}</span>
      <button
        className="text-[11px] font-semibold text-accent-2 hover:underline shrink-0"
        onClick={() =>
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Rejected in wallet.";
  if (/AccessControl|role|admin/i.test(msg)) return "Only the wallet that created this campaign can withdraw.";
  if (/ClaimWindow|not.*ended|active/i.test(msg)) return "Withdraw isn't available until the claim window ends.";
  const short = msg.split("\n")[0];
  return short.length > 140 ? short.slice(0, 137) + "…" : short;
}

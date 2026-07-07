import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";

import { CipherValue } from "../components/viz/CipherValue";
import { useWalletModal } from "../components/WalletModal";
import { confidentialTokenAbi } from "../lib/abis";
import { DEMO_TOKEN, TOKEN_SYMBOL, UNIT, explorerTx } from "../lib/config";
import { fmt6 } from "../lib/format";

const PRESETS = [10_000n, 50_000n, 100_000n];

export function FaucetPage() {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useWalletModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [amount, setAmount] = useState<bigint>(50_000n);
  const [revealed, setRevealed] = useState(false);
  // Minting is a Sepolia write; a wallet on another network reports connected but
  // has no wallet client. Gate so the mint button can't throw a raw wallet error.
  const wrongChain = isConnected && chainId !== sepolia.id;

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  const balance = useConfidentialBalance({ tokenAddress: DEMO_TOKEN }, { enabled: revealed && isConnected });

  // Refresh the revealed balance once a mint confirms.
  useEffect(() => {
    if (confirmed && revealed) balance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  function mint() {
    if (!address) return;
    reset();
    writeContract({
      address: DEMO_TOKEN,
      abi: confidentialTokenAbi,
      functionName: "mint",
      args: [address, amount * UNIT],
    });
  }

  const errMsg = error ? cleanError(error.message) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-display text-3xl font-black tracking-tight">Faucet</h1>
        <p className="mt-1 text-sm text-muted">
          Mint demo {TOKEN_SYMBOL} to try a distribution on Sepolia. Want your own token?{" "}
          <Link to="/create" className="link">
            Create or wrap one
          </Link>
          .
        </p>
      </motion.div>

      {/* Getting started - the intake checklist for first-time visitors. */}
      <div className="sheet p-5 mt-6">
        <h2 className="font-display font-black text-lg tracking-tight">Getting started</h2>
        <ol className="mt-4 space-y-3">
          <ChecklistItem n={1} done={isConnected} title="Connect a wallet" hint="Any Sepolia-ready wallet works." />
          <ChecklistItem
            n={2}
            title="Get Sepolia ETH"
            hint={
              <>
                Covers gas. Free from{" "}
                <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer" className="link">
                  any Sepolia faucet
                </a>
                .
              </>
            }
          />
          <ChecklistItem
            n={3}
            title={`Mint demo ${TOKEN_SYMBOL} below`}
            hint="Test funds, minted straight into your confidential balance."
          />
          <ChecklistItem
            n={4}
            title="Send your first drop"
            hint={
              <>
                Head to{" "}
                <Link to="/distribute" className="link">
                  Distribute
                </Link>{" "}
                once you're funded.
              </>
            }
          />
        </ol>
      </div>

      {!isConnected ? (
        <div className="sheet p-6 mt-4 flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to mint.</span>
          <button className="btn-primary text-sm shrink-0" onClick={open}>
            Connect
          </button>
        </div>
      ) : wrongChain ? (
        <div className="sheet p-6 mt-4">
          <span className="stamp text-neg">Wrong network</span>
          <p className="text-sm text-muted mt-3">
            Veildrop runs on the Sepolia testnet. Switch your wallet to Sepolia to mint demo vUSD.
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
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          {/* Mint */}
          <div className="sheet p-5">
            <span className="label">Mint amount</span>
            <div className="flex gap-2 mt-3">
              {PRESETS.map((p) => (
                <button
                  key={p.toString()}
                  onClick={() => setAmount(p)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold border transition-colors ${
                    amount === p
                      ? "bg-accent text-onaccent border-accent"
                      : "bg-panel text-fg border-line hover:border-accent"
                  }`}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>

            <button onClick={mint} disabled={isPending || confirming} className="btn-primary w-full mt-4">
              {isPending ? "Confirm in wallet…" : confirming ? "Minting…" : `Mint ${amount.toLocaleString()} ${TOKEN_SYMBOL}`}
            </button>

            <div className="mt-3 min-h-5 text-xs">
              {errMsg && <span className="text-neg">{errMsg}</span>}
              {confirmed && !errMsg && (
                <span className="text-pos">
                  Minted ✓{" "}
                  {hash && (
                    <a className="link" href={explorerTx(hash)} target="_blank" rel="noreferrer">
                      view tx ↗
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Demo balance */}
          <div className="sheet p-5 flex flex-col">
            <span className="label">Your {TOKEN_SYMBOL} balance</span>

            <div className="flex-1 flex items-center justify-center py-6">
              <div className="text-center">
                {!revealed ? (
                  <CipherValue value="00000000" hidden chars={10} className="text-3xl" />
                ) : balance.isLoading ? (
                  <div className="skeleton h-4 w-32 mx-auto" />
                ) : (
                  <span className="text-3xl font-black">
                    <CipherValue value={fmt6(balance.data ?? 0n)} hidden={false} />{" "}
                    <span className="text-muted text-lg font-bold">{TOKEN_SYMBOL}</span>
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setRevealed((r) => !r)}
              className="btn-ghost w-full text-sm"
              title="Decrypts on-chain ciphertext with your wallet - only you can read it"
            >
              {revealed ? "Hide balance" : "Reveal my balance"}
            </button>
            <p className="mt-2 text-[10px] text-muted text-center leading-relaxed">
              See every token you hold on the{" "}
              <Link to="/portfolio" className="link">
                Portfolio
              </Link>{" "}
              page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistItem({
  n,
  done,
  title,
  hint,
}: {
  n: number;
  done?: boolean;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      {done ? (
        <span
          className="grid place-items-center w-5 h-5 rounded-full bg-pos text-onaccent text-[10px] font-black shrink-0 mt-0.5"
          aria-label="Done"
        >
          ✓
        </span>
      ) : (
        <span className="grid place-items-center w-5 h-5 rounded-md bg-accent text-onaccent font-display text-[10px] font-black shrink-0 mt-0.5">
          {n}
        </span>
      )}
      <div>
        <div className={`text-sm font-semibold ${done ? "text-pos" : ""}`}>{title}</div>
        {hint && <div className="text-[11px] text-muted leading-relaxed">{hint}</div>}
      </div>
    </li>
  );
}

function cleanError(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Transaction rejected.";
  if (/insufficient funds/i.test(msg)) return "Not enough Sepolia ETH for gas.";
  const short = msg.split("\n")[0];
  return short.length > 120 ? short.slice(0, 117) + "…" : short;
}

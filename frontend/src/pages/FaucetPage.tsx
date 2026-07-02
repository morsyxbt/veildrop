import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { CipherValue } from "../components/viz/CipherValue";
import { useWalletModal } from "../components/WalletModal";
import { confidentialTokenAbi } from "../lib/abis";
import { DEMO_TOKEN, TOKEN_SYMBOL, UNIT, explorerTx } from "../lib/config";
import { fmt6 } from "../lib/format";

const PRESETS = [10_000n, 50_000n, 100_000n];

export function FaucetPage() {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const [amount, setAmount] = useState<bigint>(50_000n);
  const [revealed, setRevealed] = useState(false);

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
        <h1 className="text-2xl font-black tracking-tight">Faucet</h1>
        <p className="mt-1 text-sm text-muted">
          Mint demo {TOKEN_SYMBOL} to try a distribution on Sepolia. Want your own token?{" "}
          <Link to="/create" className="text-accent-2 hover:underline">
            Create or wrap one
          </Link>
          .
        </p>
      </motion.div>

      {!isConnected ? (
        <div className="panel p-6 mt-6 flex items-center justify-between">
          <span className="text-sm text-muted">Connect a wallet on Sepolia to mint.</span>
          <button className="btn-primary text-sm" onClick={open}>
            Connect
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {/* Mint */}
          <div className="panel p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Mint amount</div>
            <div className="flex gap-2 mt-3">
              {PRESETS.map((p) => (
                <button
                  key={p.toString()}
                  onClick={() => setAmount(p)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold border transition-colors ${
                    amount === p
                      ? "bg-accent text-onaccent border-accent"
                      : "bg-panel-2 text-fg border-line hover:border-accent"
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
                    <a className="text-accent-2 hover:underline" href={explorerTx(hash)} target="_blank" rel="noreferrer">
                      view tx ↗
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Demo balance */}
          <div className="panel p-5 flex flex-col">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Your {TOKEN_SYMBOL} balance</div>

            <div className="flex-1 flex items-center justify-center py-6">
              <div className="text-center">
                {!revealed ? (
                  <CipherValue value="00000000" hidden chars={10} className="text-3xl" />
                ) : balance.isLoading ? (
                  <span className="text-muted text-sm animate-pulse">Decrypting…</span>
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
              {revealed ? "🔒 Hide" : "🔓 Reveal my balance"}
            </button>
            <p className="mt-2 text-[10px] text-muted text-center leading-relaxed">
              See every token you hold on the{" "}
              <Link to="/portfolio" className="text-accent-2 hover:underline">
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

function cleanError(msg: string): string {
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Transaction rejected.";
  if (/insufficient funds/i.test(msg)) return "Not enough Sepolia ETH for gas.";
  const short = msg.split("\n")[0];
  return short.length > 120 ? short.slice(0, 117) + "…" : short;
}

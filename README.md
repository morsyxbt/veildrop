# Veildrop

**Pay a whole list. Reveal nothing.**

Confidential token distribution on Ethereum. Airdrop, disperse, wrap, and mint **ERC-7984 confidential tokens** - amounts and recipient allocations stay encrypted on-chain (Zama FHEVM), distributed through the **TokenOps SDK**. The sender pays hundreds of recipients at once; each recipient verifies and decrypts *only their own* allocation.

The nav has three tabs - **Distribute / Claims / Portfolio** - with everything else (Your campaigns, Create, Faucet, How it works) in the menu and footer:

- **Distribute** - create a claim-based confidential airdrop (one shareable link) or push tokens directly (disperse); recipient lists accept 0x addresses and ENS names (resolved inline)
- **Claims** - recipients connect a wallet, their drops arrive as sealed envelopes; they break the seal to claim, then decrypt for their eyes only
- **Portfolio** - every confidential token you hold, one "Reveal all" to decrypt (only you can read them)
- **Your campaigns** (menu) - track claim progress, extend the window, withdraw unclaimed funds - from any device, because admin rights live on-chain, not in the browser
- **Create** (menu) - deploy a brand-new confidential token (owner-minted, optional max supply) or wrap any existing ERC-20 into a confidential version (and unwrap back)
- **Faucet** (menu) - mint demo vUSD, with a getting-started checklist for first-time reviewers
- **How it works** (menu) - the in-app explainer of the flow and the privacy model

Network: **Sepolia**.

## Architecture

```
┌──────────────────────────  Browser (React 19 + Vite)  ──────────────────────────┐
│                                                                                  │
│   Distribute / Claim / Campaigns          Create / Wrap / Portfolio              │
│          │                                       │                               │
│   @tokenops/sdk                            @zama-fhe/react-sdk v3                │
│   fhe-airdrop + fhe-disperse               (shield / unshield / decrypt)         │
│          │                                       │                               │
└──────────┼───────────────────────────────────────┼───────────────────────────────┘
           │ txs (wagmi/viem)                      │ encrypt inputs / user-decrypt
           ▼                                       ▼
┌── Sepolia ─────────────────────────┐    ┌── Zama relayer + KMS ────────────────┐
│ TokenOps airdrop factory + clones  │    │ FHE input proofs, user decryption    │
│ TokenOps disperse singleton        │    └──────────────────────────────────────┘
│ ERC-7984 tokens (OpenZeppelin      │
│ confidential-contracts, FHEVM 0.11)│    ┌── Campaign store (optional) ─────────┐
└────────────────────────────────────┘    │ Vercel functions + Upstash Redis     │
                                          │ ciphertext handles + claim sigs ONLY │
                                          │ writes gated by creator signature    │
                                          └──────────────────────────────────────┘
```

- **Contracts** ([contracts/](contracts/)) are thin, deployable concretes over audited OpenZeppelin `confidential-contracts` code. All distribution logic (factory, encrypted funding, EIP-712 claim authorizations, claim verification, withdraw/extend, single-proof batch disperse) lives in the TokenOps contracts, driven via `@tokenops/sdk`.
- **Campaign store** ([frontend/api/](frontend/api/)) hosts claim files so one short link serves any list size. It stores *only* encrypted handles, input proofs, and claim signatures - never a cleartext amount.
- **Batch signing UX** - for lists of 3+ recipients, the app grants a throwaway in-memory key on the airdrop and signs every claim authorization locally: one wallet popup instead of one per recipient, with encrypt+sign parallelized against the relayer.

## Privacy model

| Data | On-chain | Campaign store | Who can read it |
|---|---|---|---|
| Allocation / transfer amounts | Encrypted (`euint64` handle) | Encrypted handle only | Recipient (and sender) via user-decrypt |
| Recipient list before claiming | Absent | Encrypted entries keyed by address | Anyone (airdrop addresses are public in factory events) |
| Recipient address at claim time | Visible (they send the claim tx) | - | Public |
| Funded airdrop total | Encrypted | - | Sender |
| Mint / wrap amounts | Public (calldata / ERC-20 side) | - | Public |
| Campaign existence + size | Factory events | Metadata | Public |

Design decisions worth knowing:

- **Amounts are confidential everywhere.** Neither the chain nor the store ever holds a cleartext amount. During input encryption, cleartext passes through the Zama relayer - inherent to the FHE input flow.
- **Recipient lists are confidential *on-chain*, not absolutely.** The hosted claim file is fetchable by anyone - airdrop addresses are public in factory events, and the lookup key is the address - that's what makes "one link for everyone" work. Amounts stay encrypted regardless. For maximum recipient-list privacy on small lists, the app also generates a **self-contained link**: the whole campaign rides in the URL `#` fragment and never touches any server.
- **Store writes are creator-signed and verified on-chain.** Saving a campaign or flagging it withdrawn requires an EIP-191 signature from the creator wallet, verified server-side; the *first* save additionally checks on-chain that the creator holds the airdrop's admin role (or sent the disperse tx), so nobody can bind someone else's airdrop to their wallet. Entries are validated (address-shaped keys, well-formed payloads, bounded count) before they're indexed. The store is a convenience layer: even if it disappeared, funds and claims are enforced entirely on-chain, and the sender can always refund.
- **The token registry** (`/api/token`, used for portfolio auto-listing and wrapper detection) stores public metadata only, requires the owner's signature to write, and refuses re-registration under a different owner. The Create page additionally verifies `wrapper.underlying()` on-chain before offering an existing wrapper - still, verify token addresses independently before wrapping meaningful value.

## Contracts

Deployed on Sepolia (also in [frontend/src/lib/config.ts](frontend/src/lib/config.ts)):

| Contract | Address | Purpose |
| --- | --- | --- |
| `ConfidentialToken` (vUSD) | [`0xAf3bC39cb178EbCb94047095400A387bC65779Af`](https://sepolia.etherscan.io/address/0xAf3bC39cb178EbCb94047095400A387bC65779Af) | Demo ERC-7984 token, open faucet mint |
| TokenOps airdrop factory | [`0xbE6A3B78B36684fFee48De77d47Bc3393F5Acd4c`](https://sepolia.etherscan.io/address/0xbE6A3B78B36684fFee48De77d47Bc3393F5Acd4c) | Creates + funds airdrop clones (encrypted totals) |
| TokenOps disperse singleton | [`0x710dD9885Cc9986EfD234E7719483147a6d8DBb4`](https://sepolia.etherscan.io/address/0x710dD9885Cc9986EfD234E7719483147a6d8DBb4) | Direct encrypted disperse, one tx |
| `ConfidentialMintableToken` | deployed from the Create page | Owner-minted token with optional max supply |
| `ConfidentialWrapper` | deployed from the Create page | Wraps any ERC-20 into a confidential ERC-7984 token |

Contract deploys from the app happen in-browser (bytecode embedded in [frontend/src/lib/deployables.ts](frontend/src/lib/deployables.ts)), so no private key or hardhat setup is needed to use Veildrop.

## Run it locally

Requirements: **Node 22+** and npm.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. That's it - the dev server includes the backend API (in-memory store) via a Vite middleware, so no extra services are needed.

Optional env (`frontend/.env`):

```bash
VITE_WALLETCONNECT_PROJECT_ID=   # enables the WalletConnect connector
VITE_SEPOLIA_RPC_URL=            # dedicated RPC for the Zama relayer (defaults to a public one)
```

For a persistent backend in production, deploy `frontend/` to Vercel and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (see `frontend/.env.example`). `SEPOLIA_RPC_URL` is optional - the API uses it (or a public endpoint) for the one eth_call that verifies a campaign creator on-chain.

## Try it in five minutes

1. Connect a wallet on **Sepolia** (get test ETH from any Sepolia faucet).
2. **Faucet** (in the menu) - follow the getting-started checklist and mint demo vUSD. Note your wallet shows no balance: it's confidential from the moment it's minted.
3. **Distribute** - click *Use sample* (or paste `address, amount` lines / upload a CSV), pick a claim window, create the drop. Toggle the **Chain view** lens to see exactly what an observer sees.
4. **Share the one link** - open it in another browser/wallet: the drop arrives as a sealed envelope and only *that wallet's* allocation is inside. *Break the seal & claim*, then hit *Reveal my balance* - the amount decrypts off-chain, for your eyes only. Check the tx on Etherscan: no amount anywhere.
5. **Your campaigns** (in the menu) - watch claim progress, extend the window, or refund whatever's unclaimed after it ends.

Bonus: **Create** deploys a fresh confidential token or wraps an existing ERC-20; **Portfolio** bulk-decrypts every confidential balance you hold with one signature.

## Build + test the contracts

```bash
npm install          # repo root
npm run compile
npm test             # mock-FHEVM suite
```

Tests cover the demo token (encrypted mint → user-decrypt round-trip, no cleartext on-chain, metadata), the mintable token's bespoke logic (owner-only mint, cap enforcement including the exact-cap edge, uncapped mode, `totalMinted` accounting), and the wrapper (rate/decimals derivation for an 18-decimal underlying, wrap → decrypt round-trip, rate rounding, unwrap burn + publicly-decryptable request). Distribution logic is exercised through the live TokenOps contracts on Sepolia rather than re-tested here.

To deploy your own demo token (optional - a vUSD is already live): set `PRIVATE_KEY` and `SEPOLIA_RPC_URL` in `.env`, then `npm run deploy:sepolia`.

## Known limitations

- Sepolia only (the TokenOps factory/singleton and Zama relayer targets are testnet).
- Store-write auth uses EOA signature recovery - smart-contract wallets can create campaigns but can't persist them to the hosted store (self-contained links still work).
- ERC-7984 amounts use 6-decimal `euint64` units; wrapping an 18-decimal ERC-20 converts at a fixed rate with confidential decimals capped at 6.
- Direct disperse is capped by the singleton's per-tx batch limit; the UI reads the limit on-chain and suggests Airdrop mode past it.

## Stack

React 19 + Vite + wagmi/viem + Tailwind - `@tokenops/sdk` (confidential airdrop + disperse) - `@zama-fhe/react-sdk` (encrypt, decrypt, shield/unshield) - Solidity 0.8.28 with `@fhevm/solidity` + OpenZeppelin confidential contracts - Vercel serverless + Upstash Redis (encrypted handles + signatures only).

## License

MIT - see [LICENSE](LICENSE). The Solidity contracts carry SPDX-MIT headers.

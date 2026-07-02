# Veildrop frontend

The React app for Veildrop - see the [root README](../README.md) for what the project does, the architecture, and the privacy model.

```bash
npm install
npm run dev      # http://localhost:5173 - includes the /api store (in-memory) via Vite middleware
npm run build    # typecheck + production bundle in dist/
npm run lint
```

Layout:

- [src/pages/](src/pages/) - one file per route (Distribute, Claim, Campaigns, Create, Portfolio, Faucet)
- [src/lib/](src/lib/) - TokenOps/Zama glue: claim-link encoding, on-chain discovery, embedded deploy bytecode, wagmi config
- [src/components/](src/components/) - design-system pieces (CipherValue ciphertext animation, SigningProgress, wallet modal)
- [api/](api/) - Vercel serverless campaign store (Upstash Redis in prod, in-memory in dev); writes require an EIP-191 creator signature

Environment variables are documented in [.env.example](.env.example). The dev server sends COOP/COEP headers because the Zama relayer SDK needs WASM + SharedArrayBuffer.

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Serve the /api serverless functions locally (Vercel serves them in prod).
// ssrLoadModule runs the handler through Vite's transpile pipeline, so the
// server code stays out of the app tsconfig. No Upstash needed locally - the
// store falls back to an in-memory map.
function apiDevPlugin(): Plugin {
  return {
    name: "veildrop-api-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || "";
        if (!rawUrl.startsWith("/api/")) return next();
        (async () => {
          const u = new URL(rawUrl, "http://localhost");
          const query: Record<string, string | undefined> = {};
          u.searchParams.forEach((v, k) => (query[k] = v));
          let body: unknown;
          if (req.method === "POST" || req.method === "PUT") {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const raw = Buffer.concat(chunks).toString("utf8");
            body = raw ? JSON.parse(raw) : undefined;
          }
          const mod = await server.ssrLoadModule("/api/_lib/handlers.ts");
          const handleApi = mod.handleApi as (r: unknown) => Promise<{ status: number; json: unknown }>;
          const out = await handleApi({ method: req.method || "GET", path: u.pathname, query, body });
          res.statusCode = out.status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(out.json));
        })().catch((e) => {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        });
      });
    },
  };
}

// COOP/COEP headers: the Zama relayer SDK uses WASM + SharedArrayBuffer.
// optimizeDeps exclusion: Vite's pre-bundler breaks the SDK's import.meta.url
// WASM loading. Both are hard requirements, not preferences.
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevPlugin()],
  optimizeDeps: {
    exclude: ["@zama-fhe/relayer-sdk"],
  },
  worker: {
    format: "es",
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    // Project lives on /mnt/c under WSL2 — inotify events don't cross the
    // filesystem boundary, so HMR needs polling or it serves stale bundles.
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});

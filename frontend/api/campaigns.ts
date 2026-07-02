import { handleApi } from "./_lib/handlers";

// Vercel Node function. GET (?creator=) lists a wallet's campaigns.
interface VReq {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface VRes {
  status: (n: number) => VRes;
  json: (v: unknown) => void;
}

export default async function handler(req: VReq, res: VRes) {
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) query[k] = Array.isArray(v) ? v[0] : v;
  const out = await handleApi({ method: req.method ?? "GET", path: "/api/campaigns", query, body: req.body });
  res.status(out.status).json(out.json);
}

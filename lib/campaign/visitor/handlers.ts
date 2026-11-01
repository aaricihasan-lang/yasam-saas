/**
 * KM-3 — herkese açık kampanya uçlarının işleyicileri (route dosyaları yalnız bunları çağırır; testler deps ile çağırır).
 *   GET  /api/kampanya/durum  → ziyaretçi durumu (yalnız yayındaki kampanyanın herkese açık alanları + kalan kontenjan)
 *   POST /api/kampanya/analiz → analiz (aynı köken + JSON + ≤ 16 KB + bal küpü alanı; tarayıcı kimliği çerezi)
 *   GET  /api/kampanya/konum  → yerel konum araması (TR il + 973 ilçe + dünya; dış API YOK)
 * Ortam kapısı (CAMPAIGN_PUBLIC_ENABLED) kapalıyken HEPSİ 404 — yüzey görünmez. Yanıtlar no-store; kişisel veri loglanmaz.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { getServerDb } from "@/lib/supabase-server";
import { searchGlobalLocations } from "@/lib/location/server/search";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { searchLocations } from "@/lib/location";
import { searchTrDistricts } from "@/lib/human-design/location/trDistrictIndex";
import { loadVisitorState, publicEnabled } from "./publicState";
import { runVisitorAnalysis, type PipelineDeps } from "./pipeline";
import { newVisitorId, readVisitorCookie, VISITOR_COOKIE, visitorCookieHeader, visitorIp } from "./identity";

assertServerOnly("lib/campaign/visitor/handlers");

export const PUBLIC_BODY_MAX = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" } as const;
type Db = Pick<SupabaseClient, "rpc" | "from">;
export type PublicDeps = PipelineDeps & { db?: Db };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
const notFound = () => json({ ok: false, error: "Bulunamadı." }, 404);

export async function handleVisitorState(_req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  const state = await loadVisitorState(deps.db ?? getServerDb(), deps.now ?? new Date(), env);
  return json({ ok: true, state });
}

export async function handleVisitorAnalysis(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  if (!checkSameOriginRequest(req.headers, env as NodeJS.ProcessEnv).ok) return json({ ok: false, error: "İstek kaynağı doğrulanamadı." }, 403);
  if (!String(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ ok: false, error: "JSON gövde gerekli." }, 415);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PUBLIC_BODY_MAX) return json({ ok: false, error: "İstek çok büyük." }, 413);
  let text = "";
  try {
    text = await req.text();
  } catch {
    return json({ ok: false, error: "Gövde okunamadı." }, 400);
  }
  if (Buffer.byteLength(text, "utf8") > PUBLIC_BODY_MAX) return json({ ok: false, error: "İstek çok büyük." }, 413);
  let body: Record<string, unknown>;
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("x");
    body = v as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Geçersiz istek." }, 400);
  }
  // Bal küpü: insanların görmediği alan doluysa bot kabul edilir (rezervasyon açılmaz).
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: false, error: "İstek doğrulanamadı." }, 400);
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? (body.input as Record<string, unknown>) : {};
  const existing = readVisitorCookie(req.cookies.get(VISITOR_COOKIE)?.value);
  const browserId = existing ?? newVisitorId();
  const r = await runVisitorAnalysis(
    deps.db ?? getServerDb(),
    {
      techniqueKey: String(body.technique ?? ""),
      idempotencyKey: String(body.requestId ?? ""),
      input,
      ip: visitorIp(req.headers),
      browserId,
      packageToken: typeof body.packageToken === "string" ? body.packageToken : null,
    },
    deps,
  );
  const extra: Record<string, string> = existing ? {} : { "Set-Cookie": visitorCookieHeader(browserId, req.nextUrl.protocol === "https:") };
  if (r.ok) return json({ ok: true, result: r.result, packageToken: r.packageToken ?? null }, 200, extra);
  return json({ ok: false, code: r.denial.code, error: r.denial.message, retryable: r.denial.retryable, errors: r.errors ?? null }, r.status, extra);
}

export function handleLocationSearch(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  const q = (req.nextUrl.searchParams.get("q") ?? "").normalize("NFC").trim().slice(0, 60);
  if (q.length < 2) return json({ ok: true, results: [] });
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  const push = (id: string, label: string) => { if (!seen.has(id) && out.length < 12) { seen.add(id); out.push({ id, label }); } };
  for (const l of searchLocations(q, { dataset: TR_LOCATIONS, limit: 5 })) push(l.id, `${l.name}, Türkiye`);
  for (const d of searchTrDistricts(q, 6)) push(d.id, d.label);
  try {
    for (const l of searchGlobalLocations(q, { limit: 6 })) push(l.id, [l.name, l.adminRegion, l.country].filter(Boolean).join(", "));
  } catch {
    /* dünya veri seti okunamazsa yalnız Türkiye sonuçları */
  }
  return json({ ok: true, results: out });
}

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
import { loadLiveCampaign, loadVisitorState, publicEnabled } from "./publicState";
import { PUBLIC_EVENTS, eventSubjectHash, recordCampaignEvent, type PublicEvent } from "./events";
import { getCatalogEntry } from "../catalog";
import { runVisitorAnalysis, type PipelineDeps } from "./pipeline";
import { newVisitorId, readVisitorCookie, VISITOR_COOKIE, visitorCookieHeader } from "./identity";
import { campaignClientIp, campaignIpKey } from "./clientIp";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

assertServerOnly("lib/campaign/visitor/handlers");

export const PUBLIC_BODY_MAX = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" } as const;
type Db = Pick<SupabaseClient, "rpc" | "from">;
export type PublicDeps = PipelineDeps & { db?: Db };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
const notFound = () => json({ ok: false, error: "Bulunamadı." }, 404);

/** Denetim D-5: gövde akış olarak okunur; sınır aşılınca okuma kesilir (Content-Length'siz büyük gövde belleğe alınmaz). */
async function readLimited(req: NextRequest, max: number): Promise<string | null> {
  // Uzunluk bildirilmişse (sınır içinde) platformun okuyucusu kullanılır; okunan bayt yine denetlenir.
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > 0) {
    if (declared > max) return null;
    const t = await req.text();
    return Buffer.byteLength(t, "utf8") > max ? null : t;
  }
  const body = req.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export const STATE_RATE = { limit: 120, windowSeconds: 600 } as const;

export async function handleVisitorState(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  const db = deps.db ?? getServerDb();
  // Denetim D-4: durum ucu da IP başına sınırlı (her istek birkaç DB sorgusu yapar).
  const rl = deps.rateLimit ?? ((b: string, l: number, w: number) => hitDbRateLimit(db as SupabaseClient, b, l, w));
  const ip = campaignClientIp(req.headers);
  const lim = await rl(rateLimitBucket("km-durum-ip", ip ? campaignIpKey(ip) : "bilinmeyen"), STATE_RATE.limit, STATE_RATE.windowSeconds);
  if (!lim.allowed) return json({ ok: false, error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, 429);
  const state = await loadVisitorState(db, deps.now ?? new Date(), env);
  return json({ ok: true, state });
}

export async function handleVisitorAnalysis(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  if (!checkSameOriginRequest(req.headers, env as NodeJS.ProcessEnv).ok) return json({ ok: false, error: "İstek kaynağı doğrulanamadı." }, 403);
  if (!String(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ ok: false, error: "JSON gövde gerekli." }, 415);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > PUBLIC_BODY_MAX) return json({ ok: false, error: "İstek çok büyük." }, 413);
  let text: string | null = "";
  try {
    text = await readLimited(req, PUBLIC_BODY_MAX);
  } catch {
    return json({ ok: false, error: "Gövde okunamadı." }, 400);
  }
  if (text === null) return json({ ok: false, error: "İstek çok büyük." }, 413);
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
  const existing = readVisitorCookie(req.cookies.get(VISITOR_COOKIE)?.value, env as NodeJS.ProcessEnv);
  const browserId = existing ?? newVisitorId();
  const r = await runVisitorAnalysis(
    deps.db ?? getServerDb(),
    {
      techniqueKey: String(body.technique ?? ""),
      idempotencyKey: String(body.requestId ?? ""),
      input,
      ip: campaignClientIp(req.headers),
      browserId,
      browserIsNew: !existing,
      packageToken: typeof body.packageToken === "string" ? body.packageToken : null,
      botToken: typeof body.botToken === "string" ? body.botToken : null,
      utm: typeof body.utm === "string" ? body.utm : null,
    },
    deps,
  );
  const cookie = existing ? null : visitorCookieHeader(browserId, req.nextUrl.protocol === "https:", env as NodeJS.ProcessEnv);
  const extra: Record<string, string> = cookie ? { "Set-Cookie": cookie } : {};
  if (r.ok) return json({ ok: true, result: r.result, packageToken: r.packageToken ?? null }, 200, extra);
  return json({ ok: false, code: r.denial.code, error: r.denial.message, retryable: r.denial.retryable, errors: r.errors ?? null }, r.status, extra);
}

export const LOCATION_RATE = { limit: 120, windowSeconds: 600 } as const;

export async function handleLocationSearch(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  // Yerel arama (dış API yok) yine de CPU tüketir → IP başına pencere sınırı (bilinmeyen IP ortak kovada).
  const rl = deps.rateLimit ?? ((b: string, l: number, w: number) => hitDbRateLimit((deps.db ?? getServerDb()) as SupabaseClient, b, l, w));
  const lim = await rl(rateLimitBucket("km-konum-ip", (() => { const ip = campaignClientIp(req.headers); return ip ? campaignIpKey(ip) : "bilinmeyen"; })()), LOCATION_RATE.limit, LOCATION_RATE.windowSeconds);
  if (!lim.allowed) return json({ ok: false, error: "Çok fazla arama yapıldı. Biraz sonra tekrar deneyin." }, 429);
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

export const EVENT_BODY_MAX = 1024;
export const EVENT_RATE = { limit: 120, windowSeconds: 600 } as const;

/**
 * POST /api/kampanya/olay — istatistik olayı (sayfa / rapor_indir / uyelik_tikla). Aynı köken + JSON + ≤ 1 KB + IP hız sınırı.
 * Yayında kampanya yoksa sessizce kabul edilir ama kaydedilmez (yüzey bilgisi sızdırılmaz). Yanıt gövdesi her zaman aynıdır.
 */
export async function handleVisitorEvent(req: NextRequest, deps: PublicDeps = {}) {
  const env = deps.env ?? process.env;
  if (!publicEnabled(env)) return notFound();
  if (!checkSameOriginRequest(req.headers, env as NodeJS.ProcessEnv).ok) return json({ ok: false }, 403);
  if (!String(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ ok: false }, 415);
  let text: string | null = "";
  try {
    text = await readLimited(req, EVENT_BODY_MAX);
  } catch {
    return json({ ok: false }, 400);
  }
  if (text === null) return json({ ok: false }, 413);
  let body: Record<string, unknown>;
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("x");
    body = v as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  const event = body.event;
  if (typeof event !== "string" || !(PUBLIC_EVENTS as readonly string[]).includes(event)) return json({ ok: false }, 400);
  const tech = typeof body.technique === "string" && getCatalogEntry(body.technique) ? body.technique : null;
  const db = deps.db ?? getServerDb();
  const rl = deps.rateLimit ?? ((b: string, l: number, w: number) => hitDbRateLimit(db as SupabaseClient, b, l, w));
  const ip = campaignClientIp(req.headers);
  const lim = await rl(rateLimitBucket("km-olay-ip", ip ? campaignIpKey(ip) : "bilinmeyen"), EVENT_RATE.limit, EVENT_RATE.windowSeconds);
  if (!lim.allowed) return json({ ok: true });
  const now = deps.now ?? new Date();
  const live = await loadLiveCampaign(db, now, env);
  if (live) {
    await recordCampaignEvent(db, {
      campaignId: live.row.id,
      event: event as PublicEvent,
      techniqueKey: tech,
      utm: typeof body.utm === "string" ? body.utm : "",
      subjectHash: event === "sayfa" ? eventSubjectHash(body.aid, body.consent, now, env as NodeJS.ProcessEnv) : null,
      now,
    });
  }
  return json({ ok: true });
}

/**
 * KM-3 — ziyaretçi analiz hattı (YALNIZ SUNUCU). Sıra (her adım fail-closed):
 *   1) Ortam + yayındaki kampanya + teknik çalıştırıcısı (publicState kapıları).
 *   2) IP başına kısa pencere hız sınırı (rezervasyon RPC'sinin kendisini kötüye kullanıma karşı).
 *   3) Girdi doğrulama (çalıştırıcı; bilinmeyen alan → red). Kişisel veri YALNIZ bellekte işlenir, kaydedilmez/loglanmaz.
 *   4) Ücretli teknik: uzman Klasik Numeroloji defterinden tazelik senkronu (salt okuma) → campaign_reserve (DB: kampanya,
 *      teknik, IP/tarayıcı, genel/teknik kontenjan + kredi, aylık pay, uzman payı, sağlayıcı durumu, idempotency).
 *   5) Çalıştırma: sağlayıcı YALNIZ ReservationCallGuard ile; 6) settle (completed / aborted_no_call / failed_after_call).
 * Kozmik paket: ilk istek rezervasyon + 2 saatlik imzalı belirteç; sonraki istekler belirteçle (belirteç başına hız sınırı).
 * Gece operasyonu (02.11): ücretli teknikte rezervasyondan ÖNCE sunucu tarafı bot doğrulaması (botCheck; tek kullanımlık,
 * yapılandırma yoksa ücretli KAPALI) ve geçerli IP zorunlu (clientIp; bilinmeyen IP → ücretli red, yerel → ortak kova).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { ReservationCallGuard, reserve, settle } from "../quotaService";
import { getCatalogEntry } from "../catalog";
import { denialMessage } from "./messages";
import { loadLiveCampaign } from "./publicState";
import { syncFromClassicLedger } from "./providerUsage";
import { issuePackageToken, verifyPackageToken } from "./identity";
import { visitorRunnerFor } from "./runners";
import { verifyBotToken } from "./botCheck";
import { campaignIpKey } from "./clientIp";
import type { FieldErrors, RunContext } from "./runners/shared";
import type { VisitorDenial, VisitorResult } from "./types";

assertServerOnly("lib/campaign/visitor/pipeline");

type Db = Pick<SupabaseClient, "rpc" | "from">;
export const IDEM_RE = /^[A-Za-z0-9_-]{16,80}$/;
export const VISITOR_RATE = { limit: 30, windowSeconds: 600 } as const;
export const PACKAGE_TOKEN_RATE = { limit: 120, windowSeconds: 7200 } as const;

export type PipelineInput = {
  techniqueKey: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
  /** Normalleştirilmiş IP (clientIp) — bilinmiyorsa null. */
  ip: string | null;
  browserId: string | null;
  packageToken?: string | null;
  botToken?: string | null;
};
export type PipelineDeps = {
  now?: Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: RunContext["fetchImpl"];
  rateLimit?: (bucket: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number; mode?: "db" | "memory" }>;
  botFetch?: (input: string, init: RequestInit) => Promise<Response>;
};
/** Bilinmeyen IP'li ziyaretçiler (yalnız yerel teknik) tek ortak kovada sayılır. */
export const UNKNOWN_IP_KEY = "ip-bilinmiyor";
export type PipelineResult =
  | { ok: true; status: 200; result: VisitorResult; packageToken?: string | null }
  | { ok: false; status: number; denial: VisitorDenial; errors?: FieldErrors };

const deny = (status: number, reason: string, errors?: FieldErrors): PipelineResult => ({ ok: false, status, denial: denialMessage(reason), ...(errors ? { errors } : {}) });

export async function runVisitorAnalysis(db: Db, p: PipelineInput, deps: PipelineDeps = {}): Promise<PipelineResult> {
  const now = deps.now ?? new Date();
  const env = deps.env ?? process.env;
  const rl = deps.rateLimit ?? ((b: string, l: number, w: number) => hitDbRateLimit(db as SupabaseClient, b, l, w));

  if (typeof p.techniqueKey !== "string" || typeof p.idempotencyKey !== "string" || !IDEM_RE.test(p.idempotencyKey)) return deny(400, "gecersiz_istek");
  const runner = visitorRunnerFor(p.techniqueKey);
  if (!runner) return deny(404, "katalogda_yok");
  const live = await loadLiveCampaign(db, now, env);
  if (!live || live.effective !== "aktif") return deny(403, "kampanya_kapali");

  const parsed = runner.parse(p.input ?? {}, now);
  if (!parsed.ok) return { ok: false, status: 400, denial: { code: "girdi", message: "Lütfen işaretli alanları düzeltin.", retryable: true }, errors: parsed.errors };

  const mc = live.row.module_comments ?? {};
  const hdOptions = { word: live.row.hd_options?.word !== false, kb: live.row.hd_options?.kb !== false };

  // ── Kozmik paket: geçerli belirteç → rezervasyonsuz devam (belirteç başına hız sınırı) ──
  if (p.techniqueKey === "kozmik:paket" && p.packageToken) {
    const tok = verifyPackageToken(p.packageToken, now, env as NodeJS.ProcessEnv);
    if (!tok) return deny(403, "gecersiz_istek");
    const { data: res, error } = await db.from("campaign_reservations").select("id, technique_key, campaign_id, state").eq("id", tok.reservationId).maybeSingle();
    const r = res as { technique_key: string; campaign_id: string; state: string } | null;
    if (error || !r || r.technique_key !== "kozmik:paket" || r.campaign_id !== live.row.id || r.state !== "completed") return deny(403, "gecersiz_istek");
    const lim = await rl(rateLimitBucket("km-paket", tok.reservationId), PACKAGE_TOKEN_RATE.limit, PACKAGE_TOKEN_RATE.windowSeconds);
    if (!lim.allowed) return deny(429, "hiz_siniri");
    const entry = getCatalogEntry("kozmik:paket")!;
    const { data: t } = await db.from("campaign_techniques").select("enabled, comments_enabled").eq("campaign_id", live.row.id).eq("technique_key", "kozmik:paket").maybeSingle();
    const tech = t as { enabled: boolean; comments_enabled: boolean } | null;
    if (!tech?.enabled) return deny(403, "teknik_kapali");
    const ctx: RunContext = {
      db, env, now, hdOptions, fetchImpl: deps.fetchImpl,
      guard: new ReservationCallGuard(db, tok.reservationId, 0),
      commentsEnabled: tech.comments_enabled && mc[entry.module] === true && entry.comments.length > 0,
    };
    const out = await runner.run(ctx, parsed.value);
    if (!out.ok) return { ok: false, status: out.code === "girdi" ? 400 : 502, denial: { code: out.code, message: out.message, retryable: out.code !== "girdi" }, errors: out.errors };
    return { ok: true, status: 200, result: out.result, packageToken: p.packageToken };
  }

  const lim = await rl(rateLimitBucket("km-ziyaretci-ip", p.ip ? campaignIpKey(p.ip) : UNKNOWN_IP_KEY), VISITOR_RATE.limit, VISITOR_RATE.windowSeconds);
  if (!lim.allowed) return deny(429, "hiz_siniri");

  // Ücretli teknik: geçerli IP + sunucu tarafı bot doğrulaması rezervasyondan ÖNCE (doğrulanmadan sağlayıcıya gidilmez).
  if (runner.kind === "provider") {
    if (!p.ip) return deny(403, "ip_bilinmiyor");
    const bot = await verifyBotToken(p.botToken, p.ip, env, { rateLimit: rl, fetchImpl: deps.botFetch, now });
    if (!bot.ok) return deny(bot.reason === "bot_dogrulama_basarisiz" ? 403 : 503, bot.reason);
  }

  if (runner.kind === "provider") await syncFromClassicLedger(db, now);
  const r = await reserve(db, { idempotencyKey: p.idempotencyKey, techniqueKey: p.techniqueKey, ip: p.ip ?? UNKNOWN_IP_KEY, browserId: p.browserId }, env as NodeJS.ProcessEnv);
  if (!r.ok) {
    const status = r.reason === "istek_suruyor" ? 409 : r.reason === "gizli_anahtar_yok" || r.reason === "altyapi_hatasi" ? 503 : 429;
    return deny(status, r.reason);
  }
  const guard = new ReservationCallGuard(db, r.reservationId, r.maxCredits);
  const ctx: RunContext = { db, env, now, hdOptions, fetchImpl: deps.fetchImpl, guard, commentsEnabled: r.commentsEnabled };
  let out: Awaited<ReturnType<typeof runner.run>>;
  try {
    out = await runner.run(ctx, parsed.value);
  } catch {
    out = { ok: false, code: "hesap", message: "Hesaplama şu anda yapılamadı." };
  }
  if (!out.ok) {
    await settle(db, { reservationId: r.reservationId, outcome: guard.usedCredits > 0 ? "failed_after_call" : "aborted_no_call", spentCredits: guard.usedCredits });
    return { ok: false, status: out.code === "girdi" ? 400 : out.code === "kota" ? 429 : 502, denial: { code: out.code === "kota" ? "gecici_kullanilamiyor" : out.code, message: out.message, retryable: out.code !== "girdi" }, errors: out.errors };
  }
  await settle(db, { reservationId: r.reservationId, outcome: "completed", spentCredits: guard.usedCredits });
  const token = p.techniqueKey === "kozmik:paket" ? issuePackageToken(r.reservationId, now, env as NodeJS.ProcessEnv) : null;
  return { ok: true, status: 200, result: out.result, packageToken: token };
}

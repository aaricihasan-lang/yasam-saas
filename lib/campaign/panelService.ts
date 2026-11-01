/**
 * KAMPANYA MERKEZİ — Owner paneli veri servisi (YALNIZ SUNUCU; service-role db; çağıran requireCampaignOwner'dan geçmiş olmalı).
 *
 * Okumalar service_role SELECT ile; ham IP/tarayıcı özeti, rezervasyon kimliği gibi alanlar panele GÖNDERİLMEZ.
 * Yazmalar mevcut KM-1 Owner RPC'leri + KM-2 idempotent oluşturma / atomik kopyalama RPC'leriyle.
 * İstatistik: yalnız gerçekten toplanan kampanya sayaçları (campaign_usage_daily) ve denetim kaydındaki durum değişiklikleri.
 * Ziyaret / tekil ziyaretçi / kaynak / dönüşüm verisi HENÜZ TOPLANMIYOR → panel bunu açıkça belirtir (sahte sayı yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { CAMPAIGN_CATALOG, CAMPAIGN_CATALOG_VERSION } from "./catalog";
import { turkeyDay } from "./subject";
import { visitorRunnerFor } from "./visitor/runners";
import { validateCampaignFields, type AdminError, type AdminResult, type CampaignFields } from "./adminService";

assertServerOnly("lib/campaign/panelService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Db = Pick<SupabaseClient, "rpc" | "from">;

const CAMPAIGN_COLS = "id, name, status, undated, starts_at, ends_at, slogan, alt_slogan, description, affirmation, cta_text, cta_target, image_ref, hd_options, module_comments, catalog_version, version, created_at, updated_at";
const TECH_COLS = "campaign_id, technique_key, enabled, ip_daily_limit, daily_analysis_limit, daily_credit_budget, max_credit_per_analysis, comments_enabled";
const SETTINGS_COLS = "kill_switch, global_daily_credit_budget, global_daily_analysis_limit, provider_monthly_quota, expert_reserve_pct, provider_quota_mismatch_pct, provider_minute_limit, provider_state_max_age_seconds, reservation_ttl_seconds, version, updated_at";

export type UsageRow = { day_tr: string; scope: string; reserved_analyses: number; used_analyses: number; reserved_credits: number; spent_credits: number };
export type EventRow = { day_tr: string; campaign_id: string; event: string; technique_key: string; utm_source: string; count: number };
export type UniqueRow = { day_tr: string; campaign_id: string; uniques: number };
/** Olay sayaçları (migration 000400). Tablo yoksa null → panel "Veri henüz toplanmıyor" gösterir (uydurma sayı YOK). */
export type EventStats = { rows: EventRow[]; uniques: UniqueRow[] } | null;

async function loadEventStats(db: Db, from: string, to: string): Promise<EventStats> {
  try {
    const [ev, un] = await Promise.all([
      db.from("campaign_event_daily").select("day_tr, campaign_id, event, technique_key, utm_source, count").gte("day_tr", from).lte("day_tr", to).order("day_tr", { ascending: true }).limit(20000),
      db.rpc("campaign_event_unique_counts", { p_from: from, p_to: to }),
    ]);
    if (ev.error || un.error || !Array.isArray(un.data)) return null;
    return { rows: (ev.data ?? []) as EventRow[], uniques: un.data as UniqueRow[] };
  } catch {
    return null;
  }
}

/** Panelin ilk yüklemesi: ayar, kampanyalar, teknik satırları, bugünkü sayaçlar, şablonlar, sağlayıcı durumu (kişisel veri yok). */
export async function loadOverview(db: Db, now: Date = new Date()) {
  const day = turkeyDay(now);
  try {
    const [settings, campaigns, techniques, usage, templates, provider] = await Promise.all([
      db.from("campaign_settings").select(SETTINGS_COLS).maybeSingle(),
      db.from("campaigns").select(CAMPAIGN_COLS).is("archived_at", null).order("updated_at", { ascending: false }),
      db.from("campaign_techniques").select(TECH_COLS),
      db.from("campaign_usage_daily").select("day_tr, scope, reserved_analyses, used_analyses, reserved_credits, spent_credits").eq("day_tr", day),
      db.from("campaign_text_templates").select("id, slogan, alt_slogan, description, affirmation, cta_text, created_at").is("archived_at", null).order("created_at", { ascending: false }),
      db.from("campaign_provider_state").select("remaining, quota_limit, observed_at, limit_observed_at, cooldown_until").eq("provider", "roxy").maybeSingle(),
    ]);
    for (const r of [settings, campaigns, techniques, usage, templates, provider]) if (r.error) return { ok: false as const, error: "db_error" as AdminError };
    // KM-3 (migration 20271229000300): gerçek kullanım farkı kolonları — migration henüz yoksa sorgu hata verir ve YOK SAYILIR
    // (panel KM-2 davranışıyla çalışmaya devam eder).
    type UsageGap = { remaining_gap: number | null; gap_observed_at: string | null; usage_observed_at: string | null };
    let usageGap: UsageGap | null = null;
    try {
      const g = await db.from("campaign_provider_state").select("remaining_gap, gap_observed_at, usage_observed_at").eq("provider", "roxy").maybeSingle();
      if (!g.error && g.data) usageGap = g.data as unknown as UsageGap;
    } catch {
      usageGap = null;
    }
    const ids = new Set(((campaigns.data ?? []) as { id: string }[]).map((c) => c.id));
    return {
      ok: true as const,
      value: {
        now: now.toISOString(),
        dayTr: day,
        catalogVersion: CAMPAIGN_CATALOG_VERSION,
        settings: settings.data,
        campaigns: campaigns.data ?? [],
        techniques: ((techniques.data ?? []) as { campaign_id: string }[]).filter((t) => ids.has(t.campaign_id)),
        usageToday: usage.data ?? [],
        templates: templates.data ?? [],
        provider: provider.data ? { ...(provider.data as Record<string, unknown>), ...(usageGap ?? {}) } : null,
      },
    };
  } catch {
    return { ok: false as const, error: "db_error" as AdminError };
  }
}

/** İstatistik penceresi (7/30/90 gün): günlük genel + teknik sayaçları ve denetim kaydındaki durum değişiklikleri. */
export async function loadStats(db: Db, days: 7 | 30 | 90, now: Date = new Date()) {
  const to = turkeyDay(now);
  const fromDate = new Date(now.getTime() - (days - 1) * 86_400_000);
  const from = turkeyDay(fromDate);
  try {
    const [usage, audit] = await Promise.all([
      db.from("campaign_usage_daily").select("day_tr, scope, reserved_analyses, used_analyses, reserved_credits, spent_credits").gte("day_tr", from).lte("day_tr", to).order("day_tr", { ascending: true }),
      db.from("campaign_audit_log").select("action, campaign_id, detail, created_at").in("action", ["campaign_status", "campaign_auto_close"]).order("created_at", { ascending: true }),
    ]);
    if (usage.error || audit.error) return { ok: false as const, error: "db_error" as AdminError };
    const statusEvents = ((audit.data ?? []) as { action: string; campaign_id: string | null; detail: Record<string, unknown>; created_at: string }[]).map((a) => ({
      campaignId: a.campaign_id,
      at: a.created_at,
      status: a.action === "campaign_auto_close" ? "kapali" : String((a.detail ?? {}).status ?? ""),
    }));
    // Olay sayaçları AYRI ve toleranslı sorgu: migration 000400 uygulanmadıysa mevcut istatistik bozulmaz.
    const events = await loadEventStats(db, from, to);
    return { ok: true as const, value: { from, to, days, usage: (usage.data ?? []) as UsageRow[], statusEvents, events } };
  } catch {
    return { ok: false as const, error: "db_error" as AdminError };
  }
}

function mapErr(message: string, code?: string): AdminError {
  if (code === "42501" || message.includes("CAMPAIGN_NOT_OWNER")) return "not_owner";
  if (message.includes("CAMPAIGN_NOT_FOUND")) return "not_found";
  if (code === "23514" || code === "22P02" || message.startsWith("CAMPAIGN_")) return "invalid";
  return "db_error";
}

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<AdminResult<T>> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) return { ok: false, error: mapErr(String(error.message ?? ""), (error as { code?: string }).code) };
    if (!data || typeof data !== "object" || Array.isArray(data) || (data as { ok?: unknown }).ok !== true) return { ok: false, error: "db_error" };
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

/** İdempotent oluşturma: aynı requestId ile tekrar → aynı kampanya (replay). */
export async function createCampaign(db: Db, actorId: string, requestId: string, fields: CampaignFields) {
  if (!UUID_RE.test(requestId)) return { ok: false, error: "invalid", detail: "requestId" } as const;
  const bad = validateCampaignFields(fields);
  if (bad) return { ok: false, error: "invalid", detail: bad } as const;
  return rpc<{ id: string; version: number; replay: boolean }>(db, "campaign_admin_create", {
    p_actor: actorId,
    p_request_id: requestId,
    p_fields: { ...fields, catalog_version: CAMPAIGN_CATALOG_VERSION },
  });
}

/** Atomik kopyalama (kampanya + teknik satırları; Kapalı taslak; bitmiş tarihli → tarihsiz). */
export async function duplicateCampaign(db: Db, actorId: string, requestId: string, sourceId: string, name: string | null) {
  if (!UUID_RE.test(requestId) || !UUID_RE.test(sourceId)) return { ok: false, error: "invalid", detail: "id" } as const;
  if (name !== null && (typeof name !== "string" || name.trim().length === 0 || name.length > 80)) return { ok: false, error: "invalid", detail: "name" } as const;
  return rpc<{ id: string; version: number; replay: boolean }>(db, "campaign_admin_duplicate", {
    p_actor: actorId,
    p_request_id: requestId,
    p_source_id: sourceId,
    p_name: name,
  });
}

/** Katalog (panelin teknik listesi) — sunucu tek doğruluk kaynağıdır. */
export function catalogForPanel() {
  // KM-3: visitorReady = gerçek ziyaretçi çalıştırıcısına bağlı ve katalogda "hazır" (önizleme ve panel etiketi için).
  return CAMPAIGN_CATALOG.map((e) => ({ ...e, visitorReady: visitorRunnerFor(e.key) !== null }));
}

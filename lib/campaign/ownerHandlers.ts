/**
 * KAMPANYA MERKEZİ — Owner yönetim API işleyicileri (route: app/api/admin/kampanya-merkezi; testler deps ile çağırır) (YALNIZ Owner; public DEĞİL; ücretsiz analiz / sağlayıcı çağrısı YOK).
 *
 * GET  → panel genel bakışı + sürümlü katalog; ?istatistik=7|30|90 → kullanım sayaçları + durum değişiklikleri.
 * POST → { action, ... }: create | save | setStatus | setTechniques | duplicate | archive | updateSettings | saveTemplate |
 *        archiveTemplate. Owner olmayan her istek aynı 404'ü alır. Yazmalar: aynı köken + JSON + ≤ 64 KB.
 */
import type { NextRequest } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { campaignJson, campaignNotFound, readCampaignBody, requireCampaignOwner, type CampaignOwnerDeps } from "@/lib/campaign/ownerApi";
import {
  archiveCampaign,
  archiveTextTemplate,
  saveCampaign,
  saveTextTemplate,
  setCampaignStatus,
  setCampaignTechniques,
  updateSettings,
  type AdminError,
  type CampaignFields,
  type SettingsFields,
  type TechniqueInput,
} from "@/lib/campaign/adminService";
import { catalogForPanel, createCampaign, duplicateCampaign, loadOverview, loadStats } from "@/lib/campaign/panelService";

assertServerOnly("lib/campaign/ownerHandlers");

const ERR: Record<AdminError, [number, string]> = {
  not_owner: [404, "Bulunamadı."],
  db_error: [500, "İşlem şu anda yapılamadı. Lütfen tekrar deneyin."],
  invalid: [400, "Gönderilen bilgiler geçersiz."],
  not_found: [404, "Kampanya bulunamadı."],
  version_conflict: [409, "Kampanya başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin."],
  unknown_technique: [400, "Katalogda olmayan bir analiz seçildi."],
  technique_not_selectable: [400, "Bu analiz henüz ücretsiz kampanyada açılamaz."],
  confirmation_required: [400, "Bu analiz için ayrı Owner onayı gerekli."],
  comments_unavailable: [400, "Bu analizde yorum kaynağı yok."],
  archive_requires_closed: [409, "Yayındaki kampanya silinemez; önce durdurun."],
  live_conflict: [409, "Aynı anda yalnız bir kampanya yayında olabilir."],
};

// Ayrıntı yalnız alan adı / teknik anahtarı gibi kısa güvenli belirteçse iletilir; DB hata metni yanıta asla sızmaz.
const SAFE_DETAIL_RE = /^[a-z0-9_:.]{1,80}$/;

function fail(error: AdminError, detail?: string) {
  const [status, text] = ERR[error] ?? ERR.db_error;
  const safe = error !== "db_error" && detail && SAFE_DETAIL_RE.test(detail) ? { detail } : {};
  return campaignJson({ ok: false, code: error, error: text, ...safe }, status);
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const SETTINGS_KEYS = new Set(["kill_switch", "global_daily_credit_budget", "global_daily_analysis_limit", "provider_monthly_quota", "expert_reserve_pct", "provider_quota_mismatch_pct", "provider_minute_limit", "provider_state_max_age_seconds", "reservation_ttl_seconds"]);
const CAMPAIGN_KEYS = new Set(["name", "undated", "starts_at", "ends_at", "slogan", "alt_slogan", "description", "affirmation", "cta_text", "cta_target", "image_ref", "hd_options", "module_comments"]);

function pickFields(raw: unknown, allowed: Set<string>): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.has(k)) return null;
    out[k] = v;
  }
  return out;
}

function validSettings(f: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(f)) {
    if (k === "kill_switch") { if (typeof v !== "boolean") return false; continue; }
    if ((k === "global_daily_analysis_limit" || k === "provider_monthly_quota") && v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100_000_000) return false;
  }
  return true;
}

function validItems(raw: unknown): raw is TechniqueInput[] {
  if (!Array.isArray(raw) || raw.length > 200) return false;
  return raw.every((it) => it && typeof it === "object" && typeof (it as TechniqueInput).key === "string" && typeof (it as TechniqueInput).enabled === "boolean");
}

export async function handleCampaignGet(req: NextRequest, deps: CampaignOwnerDeps = {}) {
  const owner = await requireCampaignOwner(req, deps);
  if (!owner) return campaignNotFound();
  const stat = req.nextUrl.searchParams.get("istatistik");
  if (stat !== null) {
    const days = Number(stat);
    if (days !== 7 && days !== 30 && days !== 90) return fail("invalid", "istatistik");
    const r = await loadStats(owner.db, days);
    return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error);
  }
  const r = await loadOverview(owner.db);
  if (!r.ok) return fail(r.error);
  return campaignJson({ ok: true, ...r.value, catalog: catalogForPanel() });
}

export async function handleCampaignPost(req: NextRequest, deps: CampaignOwnerDeps = {}) {
  const owner = await requireCampaignOwner(req, deps);
  if (!owner) return campaignNotFound();
  const parsed = await readCampaignBody(req);
  if (!parsed.ok) return campaignJson({ ok: false, error: parsed.error }, parsed.status);
  const b = parsed.body;
  const { db, actorId } = owner;

  switch (b.action) {
    case "create": {
      const fields = pickFields(b.fields ?? {}, CAMPAIGN_KEYS);
      if (!isUuid(b.requestId) || !fields) return fail("invalid");
      const r = await createCampaign(db, actorId, b.requestId, fields as CampaignFields);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error, r.detail);
    }
    case "save": {
      const fields = pickFields(b.fields, CAMPAIGN_KEYS);
      if (!isUuid(b.id) || !isVersion(b.expectedVersion) || !fields) return fail("invalid");
      const r = await saveCampaign(db, actorId, { id: b.id, expectedVersion: b.expectedVersion, fields: fields as CampaignFields });
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error, "detail" in r ? r.detail : undefined);
    }
    case "setStatus": {
      if (!isUuid(b.id) || !isVersion(b.expectedVersion) || !["kapali", "yakinda", "aktif"].includes(String(b.status))) return fail("invalid");
      const r = await setCampaignStatus(db, actorId, b.id, b.status as "kapali" | "yakinda" | "aktif", b.expectedVersion);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error);
    }
    case "setTechniques": {
      if (!isUuid(b.id) || !isVersion(b.expectedVersion) || !validItems(b.items)) return fail("invalid");
      const r = await setCampaignTechniques(db, actorId, b.id, b.expectedVersion, b.items);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error, "detail" in r ? r.detail : undefined);
    }
    case "duplicate": {
      if (!isUuid(b.requestId) || !isUuid(b.sourceId)) return fail("invalid");
      const r = await duplicateCampaign(db, actorId, b.requestId, b.sourceId, typeof b.name === "string" ? b.name : null);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error, "detail" in r ? r.detail : undefined);
    }
    case "archive": {
      if (!isUuid(b.id) || !isVersion(b.expectedVersion) || typeof b.confirmName !== "string") return fail("invalid");
      // Silme koruması sunucuda: onay metni kampanya adıyla birebir aynı olmalı.
      const cur = await db.from("campaigns").select("name").eq("id", b.id).is("archived_at", null).maybeSingle();
      if (cur.error) return fail("db_error");
      if (!cur.data) return fail("not_found");
      if ((cur.data as { name: string }).name !== b.confirmName) return fail("invalid", "confirmName");
      const r = await archiveCampaign(db, actorId, b.id, b.expectedVersion);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error);
    }
    case "updateSettings": {
      const fields = pickFields(b.fields, SETTINGS_KEYS);
      if (!isVersion(b.expectedVersion) || !fields || !validSettings(fields)) return fail("invalid");
      const r = await updateSettings(db, actorId, b.expectedVersion, fields as SettingsFields);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error);
    }
    case "saveTemplate": {
      const fields = pickFields(b.fields, new Set(["slogan", "alt_slogan", "description", "affirmation", "cta_text"]));
      if (!fields) return fail("invalid");
      const r = await saveTextTemplate(db, actorId, fields as CampaignFields);
      return r.ok ? campaignJson({ ok: true, ...r.value }) : fail(r.error, "detail" in r ? r.detail : undefined);
    }
    case "archiveTemplate": {
      if (!isUuid(b.templateId)) return fail("invalid");
      const r = await archiveTextTemplate(db, actorId, b.templateId);
      return r.ok ? campaignJson({ ok: true }) : fail(r.error);
    }
    default:
      return fail("invalid", "action");
  }
}

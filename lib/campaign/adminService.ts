/**
 * KAMPANYA MERKEZİ — Owner yönetim servisi (YALNIZ SUNUCU; service-role db; API route YOK — KM-2'de bağlanacak).
 *
 * Yetki: çağıran, kimliği doğrulanmış admin oturumundan gelen actorId'yi verir (verifyAdminRequest). Burada katı owner
 * denetimi (is_super_admin + admin + aktif + demo değil; e-posta fallback YOK) yapılır; DB her RPC'de aynı denetimi
 * campaign_actor_is_owner ile YENİDEN yapar (42501).
 *
 * Katalog zorlaması: teknik satırlarında analiz başına azami kredi istemciden ALINMAZ, katalogdan yazılır; katalogda olmayan
 * veya "uygun_degil" teknik açılamaz; 0 kredili teknik/pakette kredi bütçesi 0'a sabitlenir; yorum kaynağı olmayan teknikte
 * yorum açılamaz; Owner onayı gerektiren teknik (Dört Ok / PHS) ancak confirmFullAnalysis=true ile açılır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { CAMPAIGN_CATALOG_VERSION, getCatalogEntry, isSelectable, maxCreditOf } from "./catalog";

assertServerOnly("lib/campaign/adminService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminError =
  | "not_owner"
  | "db_error"
  | "invalid"
  | "not_found"
  | "version_conflict"
  | "unknown_technique"
  | "technique_not_selectable"
  | "confirmation_required"
  | "comments_unavailable"
  | "archive_requires_closed"
  | "live_conflict";
export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: AdminError; detail?: string };

type Db = Pick<SupabaseClient, "rpc" | "from">;

/** Katı owner denetimi (fail-closed). */
export async function isCampaignOwner(db: Db, actorId: string): Promise<boolean> {
  if (!UUID_RE.test(actorId)) return false;
  try {
    const { data, error } = await db.from("users").select("role, active, is_super_admin, is_demo_account").eq("id", actorId).maybeSingle();
    if (error || !data) return false;
    const r = data as { role?: unknown; active?: unknown; is_super_admin?: unknown; is_demo_account?: unknown };
    return r.is_super_admin === true && String(r.role ?? "").trim().toLowerCase() === "admin" && r.active === true && r.is_demo_account !== true;
  } catch {
    return false;
  }
}

function mapError(message: string, code: string | undefined): AdminError {
  if (code === "42501" || message.includes("CAMPAIGN_NOT_OWNER")) return "not_owner";
  if (message.includes("CAMPAIGN_VERSION_CONFLICT")) return "version_conflict";
  if (message.includes("CAMPAIGN_NOT_FOUND") || message.includes("CAMPAIGN_TEMPLATE_NOT_FOUND")) return "not_found";
  if (message.includes("CAMPAIGN_ARCHIVE_REQUIRES_CLOSED")) return "archive_requires_closed";
  if (code === "23505" || message.includes("campaigns_single_live_uq")) return "live_conflict";
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008" || message.startsWith("CAMPAIGN_")) return "invalid";
  return "db_error";
}

async function ownerRpc<T>(db: Db, actorId: string, fn: string, args: Record<string, unknown>): Promise<AdminResult<T>> {
  if (!(await isCampaignOwner(db, actorId))) return { ok: false, error: "not_owner" };
  try {
    const { data, error } = await db.rpc(fn, { p_actor: actorId, ...args });
    if (error) return { ok: false, error: mapError(String(error.message ?? ""), (error as { code?: string }).code), detail: String(error.message ?? "").slice(0, 120) };
    if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) return { ok: false, error: "db_error" };
    return { ok: true, value: data as T };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

const TEXT_LIMITS: Record<string, number> = { name: 80, slogan: 90, alt_slogan: 110, description: 220, affirmation: 120, cta_text: 32 };

export type CampaignFields = Partial<{
  name: string;
  undated: boolean;
  starts_at: string | null;
  ends_at: string | null;
  slogan: string;
  alt_slogan: string;
  description: string;
  affirmation: string;
  cta_text: string;
  cta_target: string;
  image_ref: string | null;
  hd_options: { word: boolean; kb: boolean };
  module_comments: Record<string, boolean>;
}>;

export function validateCampaignFields(f: CampaignFields): string | null {
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    const v = (f as Record<string, unknown>)[k];
    if (v !== undefined && (typeof v !== "string" || v.length > max)) return k;
  }
  if (f.name !== undefined && f.name.trim().length === 0) return "name";
  for (const k of ["starts_at", "ends_at"] as const) {
    const v = f[k];
    if (v !== undefined && v !== null && Number.isNaN(Date.parse(v))) return k;
  }
  if (f.starts_at && f.ends_at && Date.parse(f.ends_at) <= Date.parse(f.starts_at)) return "ends_at";
  if (f.cta_target !== undefined && !/^[a-z0-9_:.-]{1,120}$/.test(f.cta_target)) return "cta_target";
  if (f.image_ref !== undefined && f.image_ref !== null && !/^[A-Za-z0-9_./-]{1,200}$/.test(f.image_ref)) return "image_ref";
  if (f.hd_options !== undefined && (typeof f.hd_options.word !== "boolean" || typeof f.hd_options.kb !== "boolean")) return "hd_options";
  if (f.module_comments !== undefined) {
    for (const [m, v] of Object.entries(f.module_comments)) if (!["hd", "numk", "numb", "atlas", "kozmik"].includes(m) || typeof v !== "boolean") return "module_comments";
  }
  return null;
}

export async function saveCampaign(db: Db, actorId: string, input: { id?: string | null; expectedVersion?: number | null; fields: CampaignFields }) {
  const bad = validateCampaignFields(input.fields);
  if (bad) return { ok: false, error: "invalid", detail: bad } as const;
  return ownerRpc<{ id: string; version: number }>(db, actorId, "campaign_admin_save", {
    p_campaign_id: input.id ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_fields: input.id ? input.fields : { ...input.fields, catalog_version: CAMPAIGN_CATALOG_VERSION },
  });
}

export async function setCampaignStatus(db: Db, actorId: string, id: string, status: "kapali" | "yakinda" | "aktif", expectedVersion: number) {
  return ownerRpc<{ id: string; version: number; status: string; closed: string[] }>(db, actorId, "campaign_admin_set_status", {
    p_campaign_id: id,
    p_status: status,
    p_expected_version: expectedVersion,
  });
}

export async function archiveCampaign(db: Db, actorId: string, id: string, expectedVersion: number) {
  return ownerRpc<{ id: string; version: number }>(db, actorId, "campaign_admin_archive", { p_campaign_id: id, p_expected_version: expectedVersion });
}

export type TechniqueInput = {
  key: string;
  enabled: boolean;
  ipDailyLimit: number;
  dailyAnalysisLimit: number;
  dailyCreditBudget?: number;
  commentsEnabled?: boolean;
  confirmFullAnalysis?: boolean;
};

const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Katalog zorlamalı teknik satırları (DB'ye gidecek biçim) — saf, test edilebilir. */
export function buildTechniqueRows(items: readonly TechniqueInput[]): { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: AdminError; detail: string } {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const entry = getCatalogEntry(it.key);
    if (!entry) return { ok: false, error: "unknown_technique", detail: it.key };
    if (seen.has(it.key)) return { ok: false, error: "invalid", detail: `duplicate:${it.key}` };
    seen.add(it.key);
    if (it.enabled && !isSelectable(entry)) return { ok: false, error: "technique_not_selectable", detail: it.key };
    if (it.enabled && entry.requiresOwnerConfirmation && it.confirmFullAnalysis !== true) return { ok: false, error: "confirmation_required", detail: it.key };
    if (it.commentsEnabled && entry.comments.length === 0) return { ok: false, error: "comments_unavailable", detail: it.key };
    if (!int(it.ipDailyLimit, 0, 10000) || !int(it.dailyAnalysisLimit, 0, 1000000)) return { ok: false, error: "invalid", detail: it.key };
    const maxCredit = maxCreditOf(entry);
    const budget = maxCredit === 0 ? 0 : it.dailyCreditBudget ?? 0;
    if (!int(budget, 0, 1000000)) return { ok: false, error: "invalid", detail: it.key };
    rows.push({
      technique_key: entry.key,
      enabled: it.enabled === true,
      ip_daily_limit: it.ipDailyLimit,
      daily_analysis_limit: it.dailyAnalysisLimit,
      daily_credit_budget: budget,
      max_credit_per_analysis: maxCredit,
      comments_enabled: it.commentsEnabled === true && entry.comments.length > 0,
    });
  }
  return { ok: true, rows };
}

export async function setCampaignTechniques(db: Db, actorId: string, id: string, expectedVersion: number, items: readonly TechniqueInput[]) {
  const built = buildTechniqueRows(items);
  if (!built.ok) return built;
  return ownerRpc<{ id: string; version: number; count: number }>(db, actorId, "campaign_admin_set_techniques", {
    p_campaign_id: id,
    p_expected_version: expectedVersion,
    p_items: built.rows,
  });
}

export type SettingsFields = Partial<{
  kill_switch: boolean;
  global_daily_credit_budget: number;
  global_daily_analysis_limit: number | null;
  provider_monthly_quota: number | null;
  expert_reserve_pct: number;
  provider_minute_limit: number;
  provider_state_max_age_seconds: number;
  reservation_ttl_seconds: number;
}>;

export async function updateSettings(db: Db, actorId: string, expectedVersion: number, fields: SettingsFields) {
  return ownerRpc<{ version: number }>(db, actorId, "campaign_admin_update_settings", { p_expected_version: expectedVersion, p_fields: fields });
}

export async function saveTextTemplate(db: Db, actorId: string, fields: Pick<CampaignFields, "slogan" | "alt_slogan" | "description" | "affirmation" | "cta_text">) {
  const bad = validateCampaignFields(fields);
  if (bad) return { ok: false, error: "invalid", detail: bad } as const;
  return ownerRpc<{ id: string }>(db, actorId, "campaign_admin_save_template", { p_fields: fields });
}

export async function archiveTextTemplate(db: Db, actorId: string, templateId: string) {
  return ownerRpc<{ ok: true }>(db, actorId, "campaign_admin_archive_template", { p_template_id: templateId });
}

/** Owner paneli için salt okunur özet (service-role SELECT; kişisel veri ve ham kimlik özeti döndürmez). */
export async function readOverview(db: Db, actorId: string, dayTr: string) {
  if (!(await isCampaignOwner(db, actorId))) return { ok: false, error: "not_owner" } as const;
  try {
    const [settings, campaigns, techniques, usage] = await Promise.all([
      db.from("campaign_settings").select("*").maybeSingle(),
      db.from("campaigns").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
      db.from("campaign_techniques").select("*"),
      db.from("campaign_usage_daily").select("scope, reserved_analyses, used_analyses, reserved_credits, spent_credits").eq("day_tr", dayTr),
    ]);
    if (settings.error || campaigns.error || techniques.error || usage.error) return { ok: false, error: "db_error" } as const;
    return { ok: true, value: { settings: settings.data, campaigns: campaigns.data ?? [], techniques: techniques.data ?? [], usage: usage.data ?? [] } } as const;
  } catch {
    return { ok: false, error: "db_error" } as const;
  }
}

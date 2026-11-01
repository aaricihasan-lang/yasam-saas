// Kampanya Merkezi (Owner) — istemci veri modeli ve saf yardımcılar. Yetki ve doğrulama SUNUCUDADIR; burası yalnız
// ekran durumunu tutar. Teknik kimliği / kredi / uygunluk / yorum kaynağı yalnız API'nin döndürdüğü katalogdan gelir.
import type { CampaignModule, CatalogEntry } from "@/lib/campaign/catalog";

export type Status = "kapali" | "yakinda" | "aktif";
export const STATUS_LABEL: Record<Status, string> = { kapali: "Kapalı", yakinda: "Yakında", aktif: "Aktif" };
export const MODULES: readonly CampaignModule[] = ["hd", "numk", "numb", "atlas", "kozmik"];

export type CampaignRow = {
  id: string; name: string; status: Status; undated: boolean; starts_at: string | null; ends_at: string | null;
  slogan: string; alt_slogan: string; description: string; affirmation: string; cta_text: string; cta_target: string;
  image_ref: string | null; hd_options: { word: boolean; kb: boolean }; module_comments: Record<string, boolean>;
  catalog_version: number; version: number; created_at: string; updated_at: string;
};
export type TechRow = {
  campaign_id: string; technique_key: string; enabled: boolean; ip_daily_limit: number; daily_analysis_limit: number;
  daily_credit_budget: number; max_credit_per_analysis: number; comments_enabled: boolean;
};
export type Settings = {
  kill_switch: boolean; global_daily_credit_budget: number; global_daily_analysis_limit: number | null;
  provider_monthly_quota: number | null; expert_reserve_pct: number; provider_quota_mismatch_pct: number;
  provider_minute_limit: number; provider_state_max_age_seconds: number; reservation_ttl_seconds: number; version: number; updated_at: string;
};
export type UsageRow = { day_tr: string; scope: string; reserved_analyses: number; used_analyses: number; reserved_credits: number; spent_credits: number };
export type Template = { id: string; slogan: string; alt_slogan: string; description: string; affirmation: string; cta_text: string; created_at: string };
export type ProviderState = {
  remaining: number | null; quota_limit: number | null; observed_at: string | null; limit_observed_at: string | null; cooldown_until: string | null;
  /** KM-3 (migration 000300 sonrası): başlık − gerçek /usage farkı ve gözlem anları. */
  remaining_gap?: number | null; gap_observed_at?: string | null; usage_observed_at?: string | null;
} | null;
export type Overview = {
  now: string; dayTr: string; catalogVersion: number; settings: Settings | null; campaigns: CampaignRow[]; techniques: TechRow[];
  usageToday: UsageRow[]; templates: Template[]; provider: ProviderState; catalog: CatalogEntry[];
};
export type Stats = { from: string; to: string; days: number; usage: UsageRow[]; statusEvents: { campaignId: string | null; at: string; status: string }[] };

/** Düzenlenen kampanya (sunucu satırından türetilir; kaydedilene kadar yalnız tarayıcıda). */
export type Sel = { enabled: boolean; ip: number; daily: number; credit: number; comments: boolean };
export type Draft = {
  name: string; undated: boolean; start: string; end: string;
  slogan: string; alt: string; description: string; affirmation: string; ctaText: string; ctaTarget: string; image: string | null;
  hd: { word: boolean; kb: boolean }; modComments: Record<string, boolean>; sel: Record<string, Sel>; phsConfirmed: boolean;
};

export const maxCr = (e: CatalogEntry) => e.credit[1];
export const crText = (e: CatalogEntry) => (e.credit[0] === e.credit[1] ? `${e.credit[1]}` : `${e.credit[0]}–${e.credit[1]}`);
export const peopleText = (e: CatalogEntry) => (e.people === 0 ? "Doğum verisi yok" : e.people === 2 ? "2 kişi" : e.people === "grup" ? "3–5 kişi" : "1 kişi");
export const selectable = (e: CatalogEntry) => e.readiness !== "uygun_degil";
export const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString("tr-TR");
export const clampInt = (v: string, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
export const norm = (s: string) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

// Türkiye saati (UTC+3, yaz saati uygulaması yok): datetime-local ↔ ISO.
const TR_OFFSET_MS = 3 * 3600_000;
export function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + TR_OFFSET_MS).toISOString().slice(0, 16);
}
export function localToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}
export const fmtDT = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtShort = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }) : "?");

/** Ziyaretçinin gördüğü durum = Owner durumu + tarih penceresi (sunucu saatine göre). */
export function effective(c: Pick<CampaignRow, "status" | "undated" | "starts_at" | "ends_at">, nowMs: number): { st: Status; why: string } {
  if (c.status === "kapali") return { st: "kapali", why: "Owner tarafından kapalı" };
  if (c.undated) return { st: c.status, why: "Tarihsiz — Owner kapatana kadar" };
  const s = c.starts_at ? Date.parse(c.starts_at) : null;
  const e = c.ends_at ? Date.parse(c.ends_at) : null;
  if (e !== null && nowMs > e) return { st: "kapali", why: `Bitiş tarihi geçti (${fmtDT(c.ends_at)})` };
  if (s !== null && nowMs < s) return { st: "yakinda", why: `${fmtDT(c.starts_at)} tarihinde ${c.status === "aktif" ? "otomatik açılır" : "başlar"}` };
  return { st: c.status, why: e !== null ? `${fmtDT(c.ends_at)} tarihine kadar` : "Bitiş tarihi yok" };
}
export const isPast = (c: Pick<CampaignRow, "undated" | "ends_at">, nowMs: number) => !c.undated && !!c.ends_at && nowMs > Date.parse(c.ends_at);

export function defaultSel(e: CatalogEntry): Sel {
  const daily = e.package ? 200 : 30;
  return { enabled: false, ip: 1, daily, credit: maxCr(e) === 0 ? 0 : daily * maxCr(e), comments: false };
}

export function draftFrom(c: CampaignRow, techs: TechRow[]): Draft {
  const sel: Record<string, Sel> = {};
  for (const t of techs) {
    if (t.campaign_id !== c.id) continue;
    sel[t.technique_key] = { enabled: t.enabled, ip: t.ip_daily_limit, daily: t.daily_analysis_limit, credit: t.daily_credit_budget, comments: t.comments_enabled };
  }
  return {
    name: c.name, undated: c.undated, start: isoToLocal(c.starts_at), end: isoToLocal(c.ends_at),
    slogan: c.slogan, alt: c.alt_slogan, description: c.description, affirmation: c.affirmation, ctaText: c.cta_text, ctaTarget: c.cta_target,
    image: c.image_ref, hd: { word: c.hd_options?.word !== false, kb: c.hd_options?.kb !== false },
    modComments: { ...(c.module_comments ?? {}) }, sel, phsConfirmed: sel["hd:variables"]?.enabled === true,
  };
}

/** Kampanya alanları (sunucu doğrulamasıyla aynı adlar). */
export function fieldsOf(d: Draft) {
  return {
    name: d.name.trim(), undated: d.undated,
    starts_at: d.undated ? null : localToIso(d.start), ends_at: d.undated ? null : localToIso(d.end),
    slogan: d.slogan, alt_slogan: d.alt, description: d.description, affirmation: d.affirmation, cta_text: d.ctaText,
    cta_target: d.ctaTarget, image_ref: d.image, hd_options: d.hd, module_comments: d.modComments,
  };
}
export function itemsOf(d: Draft, catalog: CatalogEntry[]) {
  return Object.entries(d.sel)
    .filter(([k]) => catalog.some((e) => e.key === k))
    .map(([key, s]) => {
      const e = catalog.find((x) => x.key === key)!;
      return {
        key, enabled: s.enabled && selectable(e), ipDailyLimit: s.ip, dailyAnalysisLimit: s.daily,
        dailyCreditBudget: maxCr(e) === 0 ? 0 : s.credit, commentsEnabled: s.comments && e.comments.length > 0,
        ...(e.requiresOwnerConfirmation ? { confirmFullAnalysis: d.phsConfirmed } : {}),
      };
    });
}
export const sameDraft = (a: Draft | null, b: Draft | null) => JSON.stringify(a) === JSON.stringify(b);

/** Gerçek yorum izni = modül ana anahtarı VE teknik anahtarı VE katalogda yorum kaynağı (sunucu kuralıyla aynı). */
export const commentOn = (d: Draft, e: CatalogEntry) => e.comments.length > 0 && d.modComments[e.module] === true && d.sel[e.key]?.comments === true;

export function selectedOf(d: Draft, catalog: CatalogEntry[]) {
  return catalog.filter((e) => selectable(e) && d.sel[e.key]?.enabled).map((e) => ({ e, s: d.sel[e.key] }));
}

/** Bugünkü teknik sayacı (scope = tech:<kampanya>:<anahtar>). */
export function techUsage(usage: UsageRow[], campaignId: string, key: string) {
  const r = usage.find((u) => u.scope === `tech:${campaignId}:${key}`);
  return { an: r?.used_analyses ?? 0, anRes: r?.reserved_analyses ?? 0, kr: r?.spent_credits ?? 0, krRes: r?.reserved_credits ?? 0 };
}
export const globalUsage = (usage: UsageRow[]) => usage.find((u) => u.scope === "global") ?? null;

export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (ch) => (Number(ch) ^ (Math.random() * 16) >> (Number(ch) / 4)).toString(16));

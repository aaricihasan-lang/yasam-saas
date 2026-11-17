/**
 * UZMAN PROFİLİ (F1) — veri servisi (YALNIZ SUNUCU; service-role db).
 *
 * Sahiplik: her sorgu tenant_id + user_id ile daraltılır; ikisi de YALNIZ kimlik doğrulamasından (verifyUserRequest) gelir,
 * istemci gövdesinden asla. service-role RLS'yi aştığı için bu daraltma zorunludur.
 * Eşzamanlılık: yazma "version = beklenen" koşuluyla yapılır; tutmazsa { conflict } (API 409). DB tetikleyicisi sürümün tam
 * 1 artmasını ve kimlik kolonlarının değişmemesini ayrıca zorlar.
 * Silme YOK. public.users'a YAZILMAZ (ad soyad / giriş e-postası yalnız yöneticide).
 * Günlük: bu modül hiçbir profil içeriğini loglamaz; hata nedeni yalnız kod + sabit metinle döner (lib/http/apiError).
 *
 * F2 / F3 BAĞLANTI NOKTASI: `getProfile(db, owner)` (satır yoksa EMPTY_PROFILE, version 0) ve saf `reportIdentityOf`
 * (lib/profile/identity.ts). logo_asset_id / logo_source profil formundan (writeProfile) YAZILMAZ; yalnız F2
 * writeLogoSelection (sahiplik doğrulamasından sonra, /api/settings/profile/logo) yazar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { EMPTY_PROFILE, PROFILE_SCHEMA_VERSION, normalizeProfileText, type ProfileFields, type ProfilePatch } from "./schema";

assertServerOnly("lib/profile/service");

export const PROFILES_TABLE = "expert_profiles";

export type Owner = { tenantId: string; userId: string };
export type LogoSource = "none" | "workspace" | "custom";
export type ProfileState = ProfileFields & {
  logoSource: LogoSource;
  logoAssetId: string | null;
  schemaVersion: number;
  version: number;
  updatedAt: string | null;
};

export type WriteResult =
  | { ok: true; state: ProfileState }
  | { ok: false; kind: "conflict"; current: ProfileState }
  | { ok: false; kind: "invalid" }
  | { ok: false; kind: "unavailable" }
  | { ok: false; kind: "db"; cause: DbCause };

/** Loglanabilir hata özeti: YALNIZ kod + sabit metin (DB mesajı / satır içeriği taşınmaz). */
export type DbCause = { code?: string; message: string };

const COLS =
  "title, organization, phone, contact_email, website, bio, report_note, logo_asset_id, logo_source, report_branding_enabled, report_show_title, report_show_organization, report_show_contact, report_show_note, schema_version, version, updated_at";

type Row = {
  title: string | null; organization: string | null; phone: string | null; contact_email: string | null; website: string | null;
  bio: string | null; report_note: string | null; logo_asset_id: string | null; logo_source: string;
  report_branding_enabled: boolean; report_show_title: boolean; report_show_organization: boolean; report_show_contact: boolean; report_show_note: boolean;
  schema_version: number; version: number; updated_at: string;
};

export const EMPTY_PROFILE_STATE: Readonly<ProfileState> = Object.freeze({
  ...EMPTY_PROFILE, logoSource: "none" as LogoSource, logoAssetId: null, schemaVersion: PROFILE_SCHEMA_VERSION, version: 0, updatedAt: null,
});

const codeOf = (e: unknown): string | undefined => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : undefined;
};
const cause = (e: unknown, what: string): DbCause => ({ code: codeOf(e), message: `expert_profiles ${what} failed` });
/** Migration henüz uygulanmamış (tablo yok): PostgREST PGRST205 / Postgres 42P01. */
const isMissingTable = (e: unknown) => ["PGRST205", "42P01"].includes(codeOf(e) ?? "");

/** Kayıtlı metni bugünkü kurallardan geçirir; uymayan değer okunurken gösterilmez (veri SİLİNMEZ). */
const safeText = (field: Parameters<typeof normalizeProfileText>[0], v: unknown): string | null => {
  const r = normalizeProfileText(field, v);
  return r.ok ? r.value : null;
};

export function toProfileState(row: Row | null): ProfileState {
  if (!row) return { ...EMPTY_PROFILE_STATE };
  return {
    title: safeText("title", row.title),
    organization: safeText("organization", row.organization),
    phone: safeText("phone", row.phone),
    contactEmail: safeText("contactEmail", row.contact_email),
    website: safeText("website", row.website),
    bio: safeText("bio", row.bio),
    reportNote: safeText("reportNote", row.report_note),
    reportBrandingEnabled: row.report_branding_enabled === true,
    reportShowTitle: row.report_show_title !== false,
    reportShowOrganization: row.report_show_organization !== false,
    reportShowContact: row.report_show_contact !== false,
    reportShowNote: row.report_show_note !== false,
    logoSource: row.logo_source === "workspace" || row.logo_source === "custom" ? row.logo_source : "none",
    logoAssetId: typeof row.logo_asset_id === "string" ? row.logo_asset_id : null,
    schemaVersion: row.schema_version,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

async function readRow(db: SupabaseClient, o: Owner): Promise<{ row: Row | null; error: unknown }> {
  const { data, error } = await db.from(PROFILES_TABLE).select(COLS).eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  return { row: (data as Row | null) ?? null, error };
}

export type GetResult = { ok: true; state: ProfileState } | { ok: false; kind: "unavailable" } | { ok: false; kind: "db"; cause: DbCause };

/** Uzmanın KENDİ profili. Satır yoksa boş profil (markalama kapalı, version 0). */
export async function getProfile(db: SupabaseClient, o: Owner): Promise<GetResult> {
  const { row, error } = await readRow(db, o);
  if (error) return isMissingTable(error) ? { ok: false, kind: "unavailable" } : { ok: false, kind: "db", cause: cause(error, "read") };
  return { ok: true, state: toProfileState(row) };
}

/** Yamayı mevcut değerlerin üzerine uygular (gönderilmeyen alan aynen kalır) → DB kolonları. */
function columnsOf(cur: ProfileFields, p: ProfilePatch) {
  const m: ProfileFields = { ...cur, ...p };
  return {
    title: m.title, organization: m.organization, phone: m.phone, contact_email: m.contactEmail, website: m.website,
    bio: m.bio, report_note: m.reportNote,
    report_branding_enabled: m.reportBrandingEnabled, report_show_title: m.reportShowTitle, report_show_organization: m.reportShowOrganization,
    report_show_contact: m.reportShowContact, report_show_note: m.reportShowNote,
    schema_version: PROFILE_SCHEMA_VERSION,
  };
}

/**
 * Ham satırdaki metinleri (okunurken gizlenmiş olsalar bile) yamada yoksa AYNEN korur: okunamayan eski değer yazmada
 * sessizce silinmez. Bayraklar ve okunabilen metinler state'ten gelir.
 */
function currentFields(row: Row | null): ProfileFields {
  if (!row) return { ...EMPTY_PROFILE };
  const s = toProfileState(row);
  return {
    ...s,
    title: row.title, organization: row.organization, phone: row.phone, contactEmail: row.contact_email, website: row.website,
    bio: row.bio, reportNote: row.report_note,
  };
}

const isUniqueViolation = (e: unknown) => codeOf(e) === "23505";
const isCheckViolation = (e: unknown) => ["23514", "22001", "P0001"].includes(codeOf(e) ?? "");

export async function writeProfile(db: SupabaseClient, o: Owner, expectedVersion: number, patch: ProfilePatch): Promise<WriteResult> {
  const cur = await readRow(db, o);
  if (cur.error) return isMissingTable(cur.error) ? { ok: false, kind: "unavailable" } : { ok: false, kind: "db", cause: cause(cur.error, "read") };
  if ((cur.row?.version ?? 0) !== expectedVersion) return { ok: false, kind: "conflict", current: toProfileState(cur.row) };
  const fields = columnsOf(currentFields(cur.row), patch);

  if (expectedVersion === 0) {
    const ins = await db.from(PROFILES_TABLE).insert({ tenant_id: o.tenantId, user_id: o.userId, ...fields, version: 1 }).select(COLS).single();
    if (ins.error) {
      if (isUniqueViolation(ins.error)) {
        const again = await readRow(db, o);
        if (again.error) return { ok: false, kind: "db", cause: cause(again.error, "reread") };
        return { ok: false, kind: "conflict", current: toProfileState(again.row) };
      }
      if (isCheckViolation(ins.error)) return { ok: false, kind: "invalid" };
      return { ok: false, kind: "db", cause: cause(ins.error, "insert") };
    }
    return { ok: true, state: toProfileState(ins.data as Row) };
  }

  const upd = await db
    .from(PROFILES_TABLE)
    .update({ ...fields, version: expectedVersion + 1 })
    .eq("tenant_id", o.tenantId)
    .eq("user_id", o.userId)
    .eq("version", expectedVersion)
    .select(COLS);
  if (upd.error) {
    if (isCheckViolation(upd.error)) return { ok: false, kind: "invalid" };
    return { ok: false, kind: "db", cause: cause(upd.error, "update") };
  }
  const rows = (upd.data ?? []) as Row[];
  if (rows.length !== 1) {
    const again = await readRow(db, o);
    if (again.error) return { ok: false, kind: "db", cause: cause(again.error, "reread") };
    return { ok: false, kind: "conflict", current: toProfileState(again.row) };
  }
  return { ok: true, state: toProfileState(rows[0]) };
}

/**
 * F2 — YALNIZ rapor logosu kolonlarını (logo_source, logo_asset_id) yazar; diğer profil alanları AYNEN kalır. Aynı iyimser
 * sürüm (version) kullanılır → profil formu ile logo seçimi birbirinin üzerine sessizce yazamaz (409).
 * Sahiplik doğrulaması (custom → uzmanın kendi, silinmemiş, kind='logo' görseli) ÇAĞIRANDA yapılır (lib/workspace/assets.findOwnAsset).
 * "none" / "workspace" seçiminde logo_asset_id null yazılır (eski özel seçim referansı bırakılmaz → görsel silinebilir).
 */
export async function writeLogoSelection(
  db: SupabaseClient, o: Owner, expectedVersion: number, sel: { source: LogoSource; assetId: string | null },
): Promise<WriteResult> {
  const cur = await readRow(db, o);
  if (cur.error) return isMissingTable(cur.error) ? { ok: false, kind: "unavailable" } : { ok: false, kind: "db", cause: cause(cur.error, "read") };
  if ((cur.row?.version ?? 0) !== expectedVersion) return { ok: false, kind: "conflict", current: toProfileState(cur.row) };
  const cols = { logo_source: sel.source, logo_asset_id: sel.source === "custom" ? sel.assetId : null };

  if (expectedVersion === 0) {
    const ins = await db.from(PROFILES_TABLE).insert({ tenant_id: o.tenantId, user_id: o.userId, ...cols, schema_version: PROFILE_SCHEMA_VERSION, version: 1 }).select(COLS).single();
    if (ins.error) {
      if (isUniqueViolation(ins.error)) {
        const again = await readRow(db, o);
        if (again.error) return { ok: false, kind: "db", cause: cause(again.error, "reread") };
        return { ok: false, kind: "conflict", current: toProfileState(again.row) };
      }
      if (isCheckViolation(ins.error)) return { ok: false, kind: "invalid" };
      return { ok: false, kind: "db", cause: cause(ins.error, "insert") };
    }
    return { ok: true, state: toProfileState(ins.data as Row) };
  }

  const upd = await db
    .from(PROFILES_TABLE)
    .update({ ...cols, version: expectedVersion + 1 })
    .eq("tenant_id", o.tenantId)
    .eq("user_id", o.userId)
    .eq("version", expectedVersion)
    .select(COLS);
  if (upd.error) {
    if (isCheckViolation(upd.error)) return { ok: false, kind: "invalid" };
    return { ok: false, kind: "db", cause: cause(upd.error, "update") };
  }
  const rows = (upd.data ?? []) as Row[];
  if (rows.length !== 1) {
    const again = await readRow(db, o);
    if (again.error) return { ok: false, kind: "db", cause: cause(again.error, "reread") };
    return { ok: false, kind: "conflict", current: toProfileState(again.row) };
  }
  return { ok: true, state: toProfileState(rows[0]) };
}

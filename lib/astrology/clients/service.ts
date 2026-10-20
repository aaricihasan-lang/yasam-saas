// Astroloji — DANIŞAN LİSTESİ · DANIŞAN EŞLEŞTİRME · ÖN İZLEME · ARŞİV · DY DURUM (YALNIZ SUNUCU). Aşama 7B.
//
// Kurallar:
//   • Her okuma/yazma tenant + uzman (ctx.userId) kapsamlıdır; RPC'ler (20271101000400) iki parametreyi de alır.
//     Başka uzmanın / tenant'ın kaydı = yok (404); sayı ve aramalara sızmaz.
//   • Merkezî danışanlar (clients) Danışan Yolculuğu'nun erişim kuralıyla görülür: YALNIZ çağıranın tenant'ı.
//   • Eşleştirme yalnız AÇIK istekle olur (otomatik bağ yok); başka danışana yeniden bağlama ayrıca
//     confirmRelink ister; ekranda görülen mevcut bağ (expectedClientId) DB'de kilitle doğrulanır.
//   • Ön izleme yalnız ayırt edici temel alanları döner (ad soyad, doğum tarihi, maskeli telefon, kayıt tarihi,
//     kısa kayıt kimliği). Sağlık/görüşme alanları (kan, mizac, gorusme…) OKUNMAZ.
//   • DY durumu yalnız sayı/durum döner (harita, yorum, not, rapor YOK). Sağlayıcı çağrılmaz.
//   • Arşiv silme değildir: archived_at; analizler ve sonuçlar aynen kalır.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { findTenantClient, getProfile, isSchemaMissing, isUuid, logAstroDbError } from "../persistence/repo";
import { ASTRO_SEARCH_MAX, astroNorm, maskPhone, parseIsoDate } from "../search/normalize";
import type { EngineCtx, ServiceResponse } from "../engine/service";
import { ASTRO_NOT_READY } from "../engine/service";

assertServerOnly("lib/astrology/clients/service");

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

const dbFail = (ctx: string, err: { code?: string } | null | undefined): ServiceResponse => {
  if (isSchemaMissing(err)) return ASTRO_NOT_READY;
  logAstroDbError(ctx, err);
  return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
};

const CLIENT_NOT_FOUND = () => fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı veya bu hesaba ait değil.");
const PROFILE_NOT_FOUND = () => fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function fullName(ad: string | null | undefined, soyad: string | null | undefined): string | null {
  const n = `${ad ?? ""} ${soyad ?? ""}`.replace(/\s+/g, " ").trim();
  return n || null;
}

/** Danışan "kayıt numarası": şemada numara kolonu yok → kimliğin kısa, değişmez öneki gösterilir. */
export function clientRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function intParam(v: string | null, min: number, max: number, def: number): number {
  if (v === null || v === "") return def;
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
}

// ─── 1) Danışan listesi (doğum profilleri) ─────────────────────────────────────

type PageRow = {
  id: string;
  label: string;
  client_id: string | null;
  client_ad: string | null;
  client_soyad: string | null;
  current_revision: number;
  birth_date: string;
  birth_time: string | null;
  time_known: boolean;
  location_label: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  analysis_count: number | string;
  last_analysis_at: string | null;
  total_count: number | string;
};

export async function listProfilePage(ctx: EngineCtx, sp: URLSearchParams): Promise<ServiceResponse> {
  const q = (sp.get("q") ?? "").slice(0, ASTRO_SEARCH_MAX);
  const bdRaw = sp.get("birthDate");
  const birthDate = bdRaw ? parseIsoDate(bdRaw) : null;
  if (bdRaw && !birthDate) return fail(400, "INVALID_BIRTH_DATE", "Doğum tarihi YYYY-AA-GG biçiminde olmalı.");
  const archived = sp.get("archived") === "1";
  const sort = sp.get("sort") === "name" ? "name" : "recent";
  const limit = intParam(sp.get("limit"), 1, 100, 50);
  const offset = intParam(sp.get("offset"), 0, 1_000_000, 0);
  const { data, error } = await ctx.db.rpc("astro_profile_page", {
    p_tenant_id: ctx.tenantId,
    p_owner_user_id: ctx.userId,
    p_query: astroNorm(q) === "" ? null : q,
    p_birth_date: birthDate,
    p_archived: archived,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return dbFail("profiles.page", error);
  const rows = (data as PageRow[] | null) ?? [];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    status: 200,
    body: {
      ok: true,
      total,
      offset,
      limit,
      hasMore: offset + rows.length < total,
      profiles: rows.map((r) => ({
        id: r.id,
        label: r.label,
        clientId: r.client_id,
        clientName: r.client_id ? fullName(r.client_ad, r.client_soyad) : null,
        currentRevision: r.current_revision,
        current: { birthDate: r.birth_date, birthTime: r.time_known ? r.birth_time : null, timeKnown: r.time_known, locationLabel: r.location_label },
        archivedAt: r.archived_at,
        updatedAt: r.updated_at,
        analysisCount: Number(r.analysis_count),
        lastAnalysisAt: r.last_analysis_at,
      })),
    },
  };
}

// ─── 1b) Analiz Arşivi listesi ─────────────────────────────────────────────────
//
// Analiz Arşivi YALNIZ en az bir kayıtlı analizi olan profilleri listeler (etkin + arşivli birleşik; profilin
// arşiv durumu DEĞİŞMEZ, yalnız rozet olarak gösterilir). Migration YOK: sahiplik / tenant filtresi mevcut
// astro_profile_page RPC'sinde kalır; bu fonksiyon RPC'yi sayfa sayfa okur (profil tavanı 2000), analizi olmayanları
// eler, Türkçe harf sırasıyla / tarihe göre sıralar ve sayfalar. ?scope=ids → tüm arşivin kimlikleri (Tümünü Sil
// kapsamı; arama/filtreden BAĞIMSIZ, sunucuda hesaplanır).

export const ARCHIVE_SORTS = ["name_asc", "name_desc", "last_desc", "last_asc", "birth_desc", "birth_asc"] as const;
type ArchiveSort = (typeof ARCHIVE_SORTS)[number];
const ARCHIVE_READ_CAP = 2000;
const trCollator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

async function readAllArchiveRows(ctx: EngineCtx, q: string | null): Promise<{ ok: true; rows: PageRow[] } | { ok: false; r: ServiceResponse }> {
  const out: PageRow[] = [];
  for (const archived of [false, true]) {
    for (let offset = 0; offset < ARCHIVE_READ_CAP; offset += 100) {
      const { data, error } = await ctx.db.rpc("astro_profile_page", {
        p_tenant_id: ctx.tenantId,
        p_owner_user_id: ctx.userId,
        p_query: q,
        p_birth_date: null,
        p_archived: archived,
        p_sort: "name",
        p_limit: 100,
        p_offset: offset,
      });
      if (error) return { ok: false, r: dbFail("profiles.archivePage", error) };
      const rows = (data as PageRow[] | null) ?? [];
      out.push(...rows);
      if (rows.length < 100) break;
    }
  }
  return { ok: true, rows: out.filter((r) => Number(r.analysis_count) > 0) };
}

function compareArchive(sort: ArchiveSort) {
  const t = (v: string | null | undefined) => (v ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : NaN);
  const byName = (a: PageRow, b: PageRow) => trCollator.compare(a.label, b.label) || a.id.localeCompare(b.id);
  // Tarih yoksa her iki yönde de SONA (boş değer sıralamayı karıştırmaz); eşitlikte ada göre.
  const byDate = (pick: (r: PageRow) => string | null | undefined, dir: 1 | -1) => (a: PageRow, b: PageRow) => {
    const x = t(pick(a));
    const y = t(pick(b));
    if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
    return (Number.isNaN(x) ? 0 : (x - y) * dir) || byName(a, b);
  };
  switch (sort) {
    case "name_desc":
      return (a: PageRow, b: PageRow) => -byName(a, b);
    case "last_desc":
      return byDate((r) => r.last_analysis_at, -1);
    case "last_asc":
      return byDate((r) => r.last_analysis_at, 1);
    case "birth_desc":
      return byDate((r) => r.birth_date, -1);
    case "birth_asc":
      return byDate((r) => r.birth_date, 1);
    default:
      return byName;
  }
}

export async function listArchivePage(ctx: EngineCtx, sp: URLSearchParams): Promise<ServiceResponse> {
  if (sp.get("scope") === "ids") {
    // Tümünü Sil kapsamı: aramadan bağımsız TÜM arşiv (yetkili uzmanın). Kesin silme kümesi ayrıca önizleme + kilitte doğrulanır.
    const all = await readAllArchiveRows(ctx, null);
    if (!all.ok) return all.r;
    return { status: 200, body: { ok: true, total: all.rows.length, ids: all.rows.map((r) => r.id).sort(), analysisTotal: all.rows.reduce((n, r) => n + Number(r.analysis_count), 0) } };
  }
  const q = (sp.get("q") ?? "").slice(0, ASTRO_SEARCH_MAX);
  const sortRaw = sp.get("sort");
  const sort: ArchiveSort = (ARCHIVE_SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as ArchiveSort) : "name_asc";
  const limit = intParam(sp.get("limit"), 1, 100, 30);
  const offset = intParam(sp.get("offset"), 0, 1_000_000, 0);
  const res = await readAllArchiveRows(ctx, astroNorm(q) === "" ? null : q);
  if (!res.ok) return res.r;
  const sorted = [...res.rows].sort(compareArchive(sort));
  const page = sorted.slice(offset, offset + limit);
  return {
    status: 200,
    body: {
      ok: true,
      total: sorted.length,
      offset,
      limit,
      sort,
      hasMore: offset + page.length < sorted.length,
      profiles: page.map((r, i) => ({
        index: offset + i + 1,
        id: r.id,
        label: r.label,
        clientId: r.client_id,
        clientName: r.client_id ? fullName(r.client_ad, r.client_soyad) : null,
        currentRevision: r.current_revision,
        current: { birthDate: r.birth_date, birthTime: r.time_known ? r.birth_time : null, timeKnown: r.time_known, locationLabel: r.location_label },
        archivedAt: r.archived_at,
        analysisCount: Number(r.analysis_count),
        lastAnalysisAt: r.last_analysis_at,
      })),
    },
  };
}

// ─── 2) Arşiv ──────────────────────────────────────────────────────────────────

export async function setProfileArchived(ctx: EngineCtx, profileId: string, raw: unknown): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return PROFILE_NOT_FOUND();
  const b = obj(raw);
  if (!b || typeof b.archived !== "boolean") return fail(400, "INVALID_BODY", "archived (true/false) gerekli.");
  const { data, error } = await ctx.db
    .from("astro_birth_profiles")
    .update({ archived_at: b.archived ? new Date().toISOString() : null })
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("id", profileId)
    .select("id, archived_at");
  if (error) return dbFail("profiles.archive", error);
  const rows = (data as { id: string; archived_at: string | null }[] | null) ?? [];
  if (rows.length !== 1) return PROFILE_NOT_FOUND();
  return { status: 200, body: { ok: true, profile: { id: rows[0].id, archivedAt: rows[0].archived_at } } };
}

// ─── 3) Danışan adayları ────────────────────────────────────────────────────────

type CandidateRow = { id: string; ad: string | null; soyad: string | null; dogum: string | null; created_at: string | null; linked_profile_count: number | string; name_exact: boolean };

export async function searchClientCandidates(ctx: EngineCtx, sp: URLSearchParams): Promise<ServiceResponse> {
  const name = (sp.get("name") ?? "").slice(0, ASTRO_SEARCH_MAX);
  const bdRaw = sp.get("birthDate");
  const birthDate = bdRaw ? parseIsoDate(bdRaw) : null;
  if (bdRaw && !birthDate) return fail(400, "INVALID_BIRTH_DATE", "Doğum tarihi YYYY-AA-GG biçiminde olmalı.");
  if (astroNorm(name).length < 2 && !birthDate) return fail(400, "SEARCH_TOO_SHORT", "En az 2 harflik ad/soyad ya da doğum tarihi girin.");
  const { data, error } = await ctx.db.rpc("astro_client_candidates", {
    p_tenant_id: ctx.tenantId,
    p_owner_user_id: ctx.userId,
    p_name: name,
    p_birth_date: birthDate,
    p_limit: 20,
  });
  if (error) return dbFail("clients.candidates", error);
  const rows = (data as CandidateRow[] | null) ?? [];
  return {
    status: 200,
    body: {
      ok: true,
      candidates: rows.map((r) => ({
        id: r.id,
        ref: clientRef(r.id),
        name: fullName(r.ad, r.soyad),
        birthDate: r.dogum ? String(r.dogum).slice(0, 10) : null,
        createdAt: r.created_at,
        linkedProfileCount: Number(r.linked_profile_count),
        nameExact: r.name_exact === true,
      })),
    },
  };
}

// ─── 4) Danışan Ön İzleme (salt okunur, sınırlı alan) ──────────────────────────

/** Ön izlemede okunabilecek KOLONLAR — sağlık/görüşme alanları bilinçli olarak YOK. */
export const CLIENT_PREVIEW_COLUMNS = "id, ad, soyad, dogum, telefon, created_at";

export async function getClientPreview(ctx: EngineCtx, clientId: string): Promise<ServiceResponse> {
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND();
  const { data, error } = await ctx.db.from("clients").select(CLIENT_PREVIEW_COLUMNS).eq("tenant_id", ctx.tenantId).eq("id", clientId).maybeSingle();
  if (error) return dbFail("clients.preview", error);
  const c = data as { id: string; ad: string | null; soyad: string | null; dogum: string | null; telefon: string | null; created_at: string | null } | null;
  if (!c) return CLIENT_NOT_FOUND();
  const linked = await ctx.db
    .from("astro_birth_profiles")
    .select("id, label, archived_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("client_id", c.id)
    .limit(20);
  if (linked.error) return dbFail("clients.preview.linked", linked.error);
  return {
    status: 200,
    body: {
      ok: true,
      client: {
        id: c.id,
        ref: clientRef(c.id),
        name: fullName(c.ad, c.soyad),
        birthDate: c.dogum ? String(c.dogum).slice(0, 10) : null,
        phoneMasked: maskPhone(c.telefon),
        createdAt: c.created_at,
        linkedProfiles: ((linked.data as { id: string; label: string; archived_at: string | null }[] | null) ?? []).map((p) => ({ id: p.id, label: p.label, archived: !!p.archived_at })),
      },
    },
  };
}

// ─── 5) Eşleştir / yeniden bağla / kaldır ──────────────────────────────────────

function parseExpected(v: unknown): { ok: true; v: string | null } | { ok: false } {
  if (v === null || v === "") return { ok: true, v: null };
  return isUuid(v) ? { ok: true, v } : { ok: false };
}

const CLIENT_LINK_CONFLICT = () => fail(409, "CLIENT_LINK_CONFLICT", "Bu profilin danışan bağı bu arada değişmiş. Sayfayı yenileyip tekrar deneyin.");

async function callSetClient(ctx: EngineCtx, profileId: string, clientId: string | null, expected: string | null): Promise<ServiceResponse> {
  const { data, error } = await ctx.db.rpc("astro_profile_set_client", {
    p_tenant_id: ctx.tenantId,
    p_owner_user_id: ctx.userId,
    p_profile_id: profileId,
    p_client_id: clientId,
    p_expected_client_id: expected,
  });
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (error.code === "40001" || /ASTRO_CLIENT_LINK_CONFLICT/.test(msg)) {
      return CLIENT_LINK_CONFLICT();
    }
    if (/ASTRO_CLIENT_NOT_FOUND/.test(msg)) return CLIENT_NOT_FOUND();
    if (error.code === "P0002" || /ASTRO_PROFILE_NOT_FOUND/.test(msg)) return PROFILE_NOT_FOUND();
    return dbFail("profiles.setClient", error);
  }
  const r = data as { client_id?: string | null; previous_client_id?: string | null } | null;
  return { status: 200, body: { ok: true, clientId: r?.client_id ?? null, previousClientId: r?.previous_client_id ?? null } };
}

/**
 * PUT { clientId, expectedClientId, confirmRelink? } — AÇIK onaylı eşleştirme.
 * Profil başka danışana bağlıysa confirmRelink:true şarttır (409 RELINK_CONFIRM_REQUIRED).
 */
export async function linkProfileClient(ctx: EngineCtx, profileId: string, raw: unknown): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return PROFILE_NOT_FOUND();
  const b = obj(raw);
  if (!b) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  if (!isUuid(b.clientId)) return fail(400, "INVALID_CLIENT", "Geçerli danışan seçilmedi.");
  const exp = parseExpected(b.expectedClientId);
  if (!exp.ok) return fail(400, "INVALID_EXPECTED_CLIENT", "Beklenen mevcut bağ geçersiz.");
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) return dbFail("profiles.link.get", p.error);
  if (!p.row) return PROFILE_NOT_FOUND();
  const c = await findTenantClient(ctx.db, ctx.tenantId, b.clientId);
  if (c.error) return dbFail("profiles.link.client", c.error);
  if (!c.row) return CLIENT_NOT_FOUND();
  // ATL-P2-08: ekranda görülen bağ bayatsa RPC'ye gitmeden anında 409 (DB 40001 → PostgREST yeniden deneme → ~2 dk + 500).
  if ((p.row.client_id ?? null) !== exp.v) return CLIENT_LINK_CONFLICT();
  if (p.row.client_id === c.row.id && exp.v === c.row.id) return { status: 200, body: { ok: true, clientId: c.row.id, previousClientId: c.row.id, unchanged: true } };
  if (p.row.client_id && p.row.client_id !== c.row.id && b.confirmRelink !== true) {
    const cur = await findTenantClient(ctx.db, ctx.tenantId, p.row.client_id);
    return fail(409, "RELINK_CONFIRM_REQUIRED", "Bu profil başka bir danışanla eşleştirilmiş. Değiştirmek için açıkça onaylayın.", {
      currentClient: cur.row ? { id: cur.row.id, ref: clientRef(cur.row.id), name: fullName(cur.row.ad, cur.row.soyad) } : null,
    });
  }
  return callSetClient(ctx, profileId, c.row.id, exp.v);
}

/** DELETE ?expectedClientId= — eşleştirmeyi kaldırır; profil ve analizler AYNEN kalır. */
export async function unlinkProfileClient(ctx: EngineCtx, profileId: string, expectedRaw: string | null): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return PROFILE_NOT_FOUND();
  if (!isUuid(expectedRaw)) return fail(400, "INVALID_EXPECTED_CLIENT", "Kaldırılacak mevcut bağ belirtilmeli.");
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) return dbFail("profiles.unlink.get", p.error);
  if (!p.row) return PROFILE_NOT_FOUND();
  if ((p.row.client_id ?? null) !== expectedRaw) return CLIENT_LINK_CONFLICT();
  return callSetClient(ctx, profileId, null, expectedRaw);
}

// ─── 6) Danışan Yolculuğu durum alanı ──────────────────────────────────────────

export type AstrologyClientStatus = "has_analyses" | "no_analyses" | "not_linked";

export async function getClientAstrologyStatus(ctx: EngineCtx, clientId: string | null): Promise<ServiceResponse> {
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND();
  const { data, error } = await ctx.db.rpc("astro_client_status", { p_tenant_id: ctx.tenantId, p_owner_user_id: ctx.userId, p_client_id: clientId });
  if (error) return dbFail("clients.status", error);
  const row = (Array.isArray(data) ? data[0] : data) as { linked_profile_count: number | string; analysis_count: number | string; last_analysis_at: string | null } | null;
  const linked = Number(row?.linked_profile_count ?? 0);
  const count = Number(row?.analysis_count ?? 0);
  const status: AstrologyClientStatus = linked === 0 ? "not_linked" : count > 0 ? "has_analyses" : "no_analyses";
  return { status: 200, body: { ok: true, status, analysisCount: linked === 0 ? 0 : count, lastAnalysisAt: linked === 0 ? null : (row?.last_analysis_at ?? null) } };
}

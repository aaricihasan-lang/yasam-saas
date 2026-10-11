// Astroloji — KALICI SİLME (YALNIZ SUNUCU). İki kapsam:
//   scope "profile"  (B, varsayılan) → doğum profili + ona bağlı bütün astroloji kayıtları (astro_profile_delete).
//   scope "analyses" (A)             → yalnız seçilen profillerin KENDİ kayıtlı analizleri; profil, revizyonlar,
//                                      Danışan Yolculuğu bağı ve çalışma notları korunur (astro_profile_analyses_delete).
//   Kapsam onay özetine (confirmToken) yazılır; silme isteğindeki kapsam özetle aynı olmalı (değilse 409).
//
// Protokol (istemci arayüzü iki / üç ayrı "Evet" ister; sunucu da aynı kuralı zorlar):
//   1) POST /profiles/delete/preview { mode: "single" | "bulk", profileIds }  → silinecek profiller, kendi analiz
//      sayıları, KORUNACAK ortak analiz sayıları, gereken onay sayısı (tekli 2, toplu 3) ve onay özeti (confirmToken).
//   2) POST /profiles/delete { mode, profileIds, confirmToken, confirmations } → confirmations gereken sayıya eşit
//      değilse HİÇBİR ŞEY silinmez (400). Seçim / mod özetle birebir aynı olmalı (seçim değiştiyse 409 → baştan).
//      Silme RPC'si (astro_profile_delete) özetteki durumu KİLİT ALTINDA yeniden doğrular; tek fark → 409, hiçbir şey
//      silinmez. Ortak analizler (karşı taraf = silinen profil) snapshot'larıyla birebir korunur (DB doğrular).
//   Metin yazdırma / isim doğrulaması YOK (ürün kararı).
//
// Not: confirmToken bir yetki belgesi DEĞİLDİR (yetki owner kapısı + RPC sahiplik denetimidir); amacı onay
// ekranında görülen durumun silme anında değişmediğini kanıtlamaktır.
// Bu işlem kişinin sistemdeki tüm kişisel verilerini silmez; KVKK kapsamlı silme olarak sunulmaz.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { isSchemaMissing, isUuid, logAstroDbError } from "../persistence/repo";
import type { EngineCtx, ServiceResponse } from "../engine/service";
import { ASTRO_NOT_READY } from "../engine/service";

assertServerOnly("lib/astrology/clients/deletion");

export const DELETE_MAX = 100;
export const REQUIRED_CONFIRMATIONS = { single: 2, bulk: 3 } as const;
export type DeleteMode = keyof typeof REQUIRED_CONFIRMATIONS;
export type DeleteScope = "profile" | "analyses";

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

const dbFail = (ctx: string, err: { code?: string } | null | undefined): ServiceResponse => {
  if (isSchemaMissing(err)) return ASTRO_NOT_READY;
  logAstroDbError(ctx, err);
  return fail(500, "DB_ERROR", "İşlem tamamlanamadı. Hiçbir kayıt silinmedi.");
};

type PreviewRow = {
  id: string;
  label: string;
  archived_at: string | null;
  current_revision: number;
  updated_ms: number | string;
  own_analysis_count: number | string;
  shared_preserved_count: number | string;
};

type Expected = { id: string; current_revision: number; updated_ms: number; own: number; shared: number };

function parseSelection(raw: unknown): { ok: true; mode: DeleteMode; scope: DeleteScope; ids: string[] } | { ok: false; r: ServiceResponse } {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!b) return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  const mode = b.mode === "single" || b.mode === "bulk" ? b.mode : null;
  if (!mode) return { ok: false, r: fail(400, "INVALID_MODE", "Silme türü (tekli / toplu) belirtilmeli.") };
  // Kapsam yazılmadıysa B (eski istemciler); bilinmeyen değer → reddedilir (sessizce B'ye düşmez).
  const scope = b.scope === undefined || b.scope === "profile" ? "profile" : b.scope === "analyses" ? "analyses" : null;
  if (!scope) return { ok: false, r: fail(400, "INVALID_SCOPE", "Silme kapsamı geçersiz. Hiçbir kayıt silinmedi.") };
  if (!Array.isArray(b.profileIds) || b.profileIds.length === 0 || !b.profileIds.every(isUuid)) {
    return { ok: false, r: fail(400, "INVALID_SELECTION", "Geçerli profil seçimi gerekli.") };
  }
  // Aynı profil iki kez seçildiyse tek sayılır (sıra önemsiz).
  const ids = [...new Set(b.profileIds as string[])].sort();
  if (ids.length > DELETE_MAX) return { ok: false, r: fail(400, "SELECTION_TOO_LARGE", `Tek seferde en çok ${DELETE_MAX} profil silinebilir.`) };
  if (mode === "single" && ids.length !== 1) return { ok: false, r: fail(400, "INVALID_SELECTION", "Tekli silmede yalnız bir profil seçilir.") };
  return { ok: true, mode, scope, ids };
}

function encodeToken(mode: DeleteMode, scope: DeleteScope, expected: Expected[]): string {
  return Buffer.from(JSON.stringify({ v: 1, mode, scope, expected }), "utf8").toString("base64url");
}

function decodeToken(t: unknown): { mode: DeleteMode; scope: DeleteScope; expected: Expected[] } | null {
  if (typeof t !== "string" || t.length === 0 || t.length > 20000) return null;
  try {
    const o = JSON.parse(Buffer.from(t, "base64url").toString("utf8")) as { v?: unknown; mode?: unknown; scope?: unknown; expected?: unknown };
    if (o.v !== 1 || (o.mode !== "single" && o.mode !== "bulk") || !Array.isArray(o.expected)) return null;
    const scope = o.scope === undefined || o.scope === "profile" ? "profile" : o.scope === "analyses" ? "analyses" : null;
    if (!scope) return null;
    const expected = o.expected.map((e: Record<string, unknown>) => ({
      id: String(e.id),
      current_revision: Number(e.current_revision),
      updated_ms: Number(e.updated_ms),
      own: Number(e.own),
      shared: Number(e.shared),
    }));
    if (!expected.every((e) => isUuid(e.id) && [e.current_revision, e.updated_ms, e.own, e.shared].every(Number.isFinite))) return null;
    return { mode: o.mode, scope, expected };
  } catch {
    return null;
  }
}

async function loadPreview(ctx: EngineCtx, ids: string[]): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; r: ServiceResponse }> {
  const { data, error } = await ctx.db.rpc("astro_profile_delete_preview", { p_tenant_id: ctx.tenantId, p_owner_user_id: ctx.userId, p_profile_ids: ids });
  if (error) return { ok: false, r: dbFail("profiles.deletePreview", error) };
  const rows = (data as PreviewRow[] | null) ?? [];
  // Seçimdeki her profil bu uzmanın olmalı; eksik / yabancı / silinmiş → tek tip "bulunamadı".
  if (rows.length !== ids.length) return { ok: false, r: fail(404, "PROFILE_NOT_FOUND", "Seçili profillerden biri bulunamadı veya zaten silinmiş. Hiçbir kayıt silinmedi.") };
  return { ok: true, rows };
}

export async function previewProfileDeletion(ctx: EngineCtx, raw: unknown): Promise<ServiceResponse> {
  const s = parseSelection(raw);
  if (!s.ok) return s.r;
  const p = await loadPreview(ctx, s.ids);
  if (!p.ok) return p.r;
  const expected: Expected[] = p.rows.map((r) => ({
    id: r.id,
    current_revision: Number(r.current_revision),
    updated_ms: Number(r.updated_ms),
    own: Number(r.own_analysis_count),
    shared: Number(r.shared_preserved_count),
  }));
  return {
    status: 200,
    body: {
      ok: true,
      mode: s.mode,
      scope: s.scope,
      requiredConfirmations: REQUIRED_CONFIRMATIONS[s.mode],
      profileCount: p.rows.length,
      totals: { ownAnalyses: expected.reduce((a, e) => a + e.own, 0), sharedPreserved: expected.reduce((a, e) => a + e.shared, 0) },
      profiles: p.rows.map((r) => ({ id: r.id, label: r.label, archived: !!r.archived_at, ownAnalyses: Number(r.own_analysis_count), sharedPreserved: Number(r.shared_preserved_count) })),
      confirmToken: encodeToken(s.mode, s.scope, expected),
    },
  };
}

export async function deleteProfiles(ctx: EngineCtx, raw: unknown): Promise<ServiceResponse> {
  const s = parseSelection(raw);
  if (!s.ok) return s.r;
  const b = raw as Record<string, unknown>;
  const required = REQUIRED_CONFIRMATIONS[s.mode];
  if (b.confirmations !== required) {
    return fail(400, "CONFIRMATION_REQUIRED", `${s.mode === "single" ? "Tekli" : "Toplu"} kalıcı silme ${required} ayrı onay gerektirir. Hiçbir kayıt silinmedi.`, { requiredConfirmations: required });
  }
  const tok = decodeToken(b.confirmToken);
  if (!tok) return fail(400, "CONFIRMATION_REQUIRED", "Onay özeti eksik veya geçersiz. Silme işlemini baştan başlatın. Hiçbir kayıt silinmedi.");
  const tokIds = [...new Set(tok.expected.map((e) => e.id))].sort();
  if (tok.mode !== s.mode || tok.scope !== s.scope || tokIds.length !== tok.expected.length || tokIds.join(",") !== s.ids.join(",")) {
    return fail(409, "SELECTION_CHANGED", "Seçim onaydan sonra değişti. Silme işlemini baştan başlatın. Hiçbir kayıt silinmedi.");
  }
  const fn = s.scope === "analyses" ? "astro_profile_analyses_delete" : "astro_profile_delete";
  const { data, error } = await ctx.db.rpc(fn, { p_tenant_id: ctx.tenantId, p_owner_user_id: ctx.userId, p_expected: tok.expected });
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (error.code === "P0002" || /ASTRO_DELETE_NOT_FOUND/.test(msg)) return fail(404, "PROFILE_NOT_FOUND", "Seçili profillerden biri bulunamadı veya zaten silinmiş. Hiçbir kayıt silinmedi.");
    if (error.code === "40001" || /ASTRO_DELETE_STALE/.test(msg)) {
      return fail(409, "DELETE_STALE", "Onaydan sonra kayıtlar değişti (yeni analiz, revizyon vb.). Hiçbir kayıt silinmedi; işlemi baştan başlatın.");
    }
    if (error.code === "22023" || /ASTRO_DELETE_INVALID/.test(msg)) return fail(400, "INVALID_SELECTION", "Geçersiz silme isteği. Hiçbir kayıt silinmedi.");
    return dbFail(s.scope === "analyses" ? "profiles.deleteAnalyses" : "profiles.delete", error);
  }
  const r = data as { deleted_profiles?: number; deleted_analyses?: number; preserved_shared_analyses?: number } | null;
  // Denetim izi: yalnız kimlikler ve SAYILAR (ad, doğum bilgisi vb. kişisel veri LOGLANMAZ).
  console.info(
    JSON.stringify({
      event: s.scope === "analyses" ? "astro.profile.analyses_delete" : "astro.profile.delete",
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      mode: s.mode,
      scope: s.scope,
      profileIds: s.ids,
      deletedProfiles: Number(r?.deleted_profiles ?? 0),
      deletedAnalyses: Number(r?.deleted_analyses ?? 0),
      preservedSharedAnalyses: Number(r?.preserved_shared_analyses ?? 0),
      at: new Date().toISOString(),
    }),
  );
  return {
    status: 200,
    body: { ok: true, ...(s.scope === "analyses" ? { scope: s.scope } : {}), deletedProfiles: Number(r?.deleted_profiles ?? 0), deletedAnalyses: Number(r?.deleted_analyses ?? 0), preservedSharedAnalyses: Number(r?.preserved_shared_analyses ?? 0) },
  };
}

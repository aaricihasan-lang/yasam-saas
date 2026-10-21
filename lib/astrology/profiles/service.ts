// Astroloji — DOĞUM PROFİLİ servisi (YALNIZ SUNUCU).
//
//   • Danışan bağı opsiyoneldir; verilirse danışan owner'ın TENANT'ında olmalıdır (404 aksi).
//   • Profil + revizyon 1 tek DB işleminde yazılır (astro_profile_create).
//   • Düzeltme = yeni revizyon (astro_profile_append_revision, iyimser kilit). Eski revizyonlar
//     DEĞİŞMEZ ve silinmez → ileride kaydedilen analizler kendi revizyonuna bağlı kalır.
//   • Tz/koordinat istemciden alınmaz (konum kimliği sunucuda çözülür).

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { parseBirthData, parseChangeNote, parseProfileLabel, type LocationResolver } from "../birth/profileInput";
import {
  appendRevisionRpc,
  createProfileRpc,
  findTenantClient,
  getProfile,
  isSchemaMissing,
  isUuid,
  listRevisions,
  logAstroDbError,
  recordCapOf,
  recordCapResponse,
} from "../persistence/repo";
import { publicRevision } from "../view/natalView";
import { listArchivePage, listProfilePage } from "../clients/service";
import type { EngineCtx, ServiceResponse } from "../engine/service";
import { ASTRO_NOT_READY } from "../engine/service";
import { findBirthDuplicates } from "./duplicates";
import { parseDuplicateAck } from "./duplicateMatch";
import { staleTimezoneOffset, staleTimezoneText } from "../legacyMethod";
import { representativeLmtNotice } from "../birth/representativeLmt";

assertServerOnly("lib/astrology/profiles/service");

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

const dbFail = (ctx: string, err: { code?: string } | null | undefined): ServiceResponse => {
  if (isSchemaMissing(err)) return ASTRO_NOT_READY;
  logAstroDbError(ctx, err);
  return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
};

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/**
 * 2026-10-16 — mükerrer profil hatırlatması. Aynı kişi (kesin eşleşme, yalnız bu uzmanın kayıtları) bulunursa yazma
 * YAPILMAZ ve eşleşmeler döner (409 DUPLICATE_PROFILE). Uzman "Farklı kişi olarak devam et" derse istemci gördüğü eşleşme
 * kimliklerini confirmDifferentPerson ile geri gönderir; yalnız bunların TAMAMI onaylanmışsa yazılır → arada oluşan yeni
 * eşleşme (ör. çift tıklamayla ilk isteğin oluşturduğu profil) yeniden uyarı üretir.
 */
async function duplicateGate(
  ctx: EngineCtx,
  body: Record<string, unknown>,
  input: Parameters<typeof findBirthDuplicates>[1],
): Promise<ServiceResponse | null> {
  const d = await findBirthDuplicates(ctx, input);
  if (d.error) return dbFail("profiles.duplicates", d.error);
  if (d.rows.length === 0) return null;
  const ack = new Set(parseDuplicateAck(body.confirmDifferentPerson));
  if (d.rows.every((r) => ack.has(r.profileId.toLowerCase()))) return null;
  return fail(409, "DUPLICATE_PROFILE", "Bu doğum bilgileriyle kayıtlı bir danışan bulundu.", { duplicates: d.rows });
}

function clientName(c: { ad: string | null; soyad: string | null } | undefined): string | null {
  if (!c) return null;
  const n = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return n || null;
}

/**
 * Danışan listesi (Aşama 7B): sunucu tarafı arama / doğum tarihi / arşiv filtresi / sayfalama + analiz sayısı.
 * Eski 200 kayıt sınırı yok; her sayfa en çok 100. Uzman sahipliği RPC içinde (astro_profile_page).
 */
export async function listAstroProfiles(ctx: EngineCtx, sp: URLSearchParams = new URLSearchParams()): Promise<ServiceResponse> {
  // ?view=archive → Analiz Arşivi (yalnız kayıtlı analizi olan profiller; etkin + arşivli birleşik). Aynı sahiplik kapısı.
  if (sp.get("view") === "archive") return listArchivePage(ctx, sp);
  return listProfilePage(ctx, sp);
}

export async function getAstroProfileDetail(ctx: EngineCtx, profileId: string): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) return dbFail("profiles.get", p.error);
  if (!p.row) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const revs = await listRevisions(ctx.db, ctx.tenantId, ctx.userId, [profileId]);
  if (revs.error) return dbFail("profiles.revisions", revs.error);
  let name: string | null = null;
  // Aşama 7B: bağ var ama danışan artık bulunamıyor (silinmiş / erişim dışı) → ad gösterilmez, işaretlenir.
  let clientMissing = false;
  if (p.row.client_id) {
    const c = await findTenantClient(ctx.db, ctx.tenantId, p.row.client_id);
    if (c.error) return dbFail("profiles.client", c.error);
    name = clientName(c.row ?? undefined);
    clientMissing = !c.row;
  }
  return {
    status: 200,
    body: {
      ok: true,
      profile: {
        id: p.row.id,
        label: p.row.label,
        clientId: p.row.client_id,
        clientName: name,
        clientMissing,
        archivedAt: p.row.archived_at ?? null,
        currentRevision: p.row.current_revision,
        createdAt: p.row.created_at,
        updatedAt: p.row.updated_at,
        // YENİ-P2-03 / ATL-P1-01 artığı (2026-10-20): motor doğum anını revizyonun SAKLI ofsetinden alır → tarihsel saat dilimi
        // tablosu (#471) öncesi açılmış revizyonlarda yeni hesaplar da eski ofseti kullanır. Okuma anında işaretlenir (veri değişmez).
        revisions: revs.rows.sort((a, b) => b.revision - a.revision).map((r) => {
          const pub = publicRevision(r);
          const stale = staleTimezoneOffset(pub);
          const lmt = representativeLmtNotice(pub);
          return { ...pub, ...(stale ? { staleTimezone: { storedOffsetSeconds: stale.stored, currentOffsetSeconds: stale.current, text: staleTimezoneText(stale) } } : {}), ...(lmt ? { lmtNotice: lmt } : {}) };
        }),
      },
    },
  };
}

export async function createAstroProfile(ctx: EngineCtx, rawBody: unknown, resolveLocation: LocationResolver): Promise<ServiceResponse> {
  const body = obj(rawBody);
  if (!body) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  const label = parseProfileLabel(body.label);
  if (!label) return fail(400, "INVALID_LABEL", "Profil adı 1–120 karakter olmalıdır.");

  let clientId: string | null = null;
  let linkedName: string | null = null;
  if (body.clientId !== undefined && body.clientId !== null && body.clientId !== "") {
    if (!isUuid(body.clientId)) return fail(400, "INVALID_CLIENT", "Geçersiz danışan.");
    const c = await findTenantClient(ctx.db, ctx.tenantId, body.clientId);
    if (c.error) return dbFail("profiles.create.client", c.error);
    if (!c.row) return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı veya bu hesaba ait değil.");
    clientId = c.row.id;
    linkedName = clientName(c.row);
  }

  const birth = parseBirthData(body, resolveLocation);
  if (!birth.ok) {
    const { status, code, error, dstOptions } = birth.err;
    return fail(status, code, error, dstOptions ? { dstOptions } : {});
  }
  const dup = await duplicateGate(ctx, body, { names: [label, linkedName], birth: birth.value });
  if (dup) return dup;

  const r = await createProfileRpc(ctx.db, ctx.tenantId, ctx.userId, clientId, label, birth.value);
  if (r.error) {
    const cap = recordCapOf(r.error);
    return cap ? recordCapResponse(cap) : dbFail("profiles.create", r.error);
  }
  if (!r.profileId) return fail(500, "DB_ERROR", "Profil oluşturulamadı.");
  return getAstroProfileDetail(ctx, r.profileId).then((d) => ({ ...d, status: d.status === 200 ? 201 : d.status }));
}

export async function appendAstroRevision(
  ctx: EngineCtx,
  profileId: string,
  rawBody: unknown,
  resolveLocation: LocationResolver,
): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const body = obj(rawBody);
  if (!body) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  const expected = body.expectedRevision;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 1) {
    return fail(400, "INVALID_EXPECTED_REVISION", "Beklenen revizyon numarası gerekli.");
  }
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) return dbFail("profiles.append.get", p.error);
  if (!p.row) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  // ATL-P2-08: bayat ekran anında 409. DB çakışmayı 40001 ile bildirir; PostgREST bunu yeniden denediği için yalnız RPC'ye
  // bırakılırsa ~2 dk sonra 500 dönüyordu. RPC'deki denetim (yarış penceresi) aynen korunur.
  if (p.row.current_revision !== expected) {
    return fail(409, "REVISION_CONFLICT", "Profil bu arada güncellenmiş. Sayfayı yenileyip tekrar deneyin.");
  }

  const birth = parseBirthData(body, resolveLocation);
  if (!birth.ok) {
    const { status, code, error, dstOptions } = birth.err;
    return fail(status, code, error, dstOptions ? { dstOptions } : {});
  }
  const note = parseChangeNote(body.changeNote);
  if (body.changeNote !== undefined && body.changeNote !== null && body.changeNote !== "" && note === null) {
    return fail(400, "INVALID_NOTE", "Değişiklik notu en fazla 500 karakter olabilir.");
  }
  // Düzenleme kendi profilini mükerrer saymaz; başka bir profille tam eşleşme oluşturacaksa uyarır.
  let ownLinked: string | null = null;
  if (p.row.client_id) {
    const c = await findTenantClient(ctx.db, ctx.tenantId, p.row.client_id);
    if (c.error) return dbFail("profiles.append.client", c.error);
    ownLinked = clientName(c.row ?? undefined);
  }
  const dup = await duplicateGate(ctx, body, { names: [p.row.label, ownLinked], birth: birth.value, excludeProfileId: p.row.id });
  if (dup) return dup;

  const r = await appendRevisionRpc(ctx.db, ctx.tenantId, ctx.userId, profileId, expected, birth.value, note);
  if (r.error) {
    const msg = String((r.error as { message?: string }).message ?? "");
    if (r.error.code === "40001" || /ASTRO_REVISION_CONFLICT/.test(msg)) {
      return fail(409, "REVISION_CONFLICT", "Profil bu arada güncellenmiş. Sayfayı yenileyip tekrar deneyin.");
    }
    if (r.error.code === "P0002" || /ASTRO_PROFILE_NOT_FOUND/.test(msg)) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
    return dbFail("profiles.append", r.error);
  }
  return getAstroProfileDetail(ctx, profileId);
}

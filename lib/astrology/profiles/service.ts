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
  listProfiles,
  listRevisions,
  logAstroDbError,
  type RevisionRow,
} from "../persistence/repo";
import { publicRevision } from "../view/natalView";
import type { EngineCtx, ServiceResponse } from "../engine/service";
import { ASTRO_NOT_READY } from "../engine/service";

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

function clientName(c: { ad: string | null; soyad: string | null } | undefined): string | null {
  if (!c) return null;
  const n = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return n || null;
}

export async function listAstroProfiles(ctx: EngineCtx): Promise<ServiceResponse> {
  const p = await listProfiles(ctx.db, ctx.tenantId, ctx.userId);
  if (p.error) return dbFail("profiles.list", p.error);
  const revs = await listRevisions(ctx.db, ctx.tenantId, ctx.userId, p.rows.map((r) => r.id));
  if (revs.error) return dbFail("profiles.listRevisions", revs.error);
  const current = new Map<string, RevisionRow>();
  for (const r of revs.rows) {
    const prof = p.rows.find((x) => x.id === r.profile_id);
    if (prof && prof.current_revision === r.revision) current.set(r.profile_id, r);
  }
  const clientIds = [...new Set(p.rows.map((r) => r.client_id).filter((x): x is string => !!x))];
  const clients = new Map<string, { ad: string | null; soyad: string | null }>();
  if (clientIds.length > 0) {
    const { data, error } = await ctx.db.from("clients").select("id, ad, soyad").eq("tenant_id", ctx.tenantId).in("id", clientIds);
    if (error) return dbFail("profiles.clients", error);
    for (const c of (data as { id: string; ad: string | null; soyad: string | null }[] | null) ?? []) clients.set(c.id, c);
  }
  return {
    status: 200,
    body: {
      ok: true,
      profiles: p.rows.map((r) => {
        const rev = current.get(r.id);
        return {
          id: r.id,
          label: r.label,
          clientId: r.client_id,
          clientName: r.client_id ? clientName(clients.get(r.client_id)) : null,
          currentRevision: r.current_revision,
          current: rev ? publicRevision(rev) : null,
          updatedAt: r.updated_at,
        };
      }),
    },
  };
}

export async function getAstroProfileDetail(ctx: EngineCtx, profileId: string): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const p = await getProfile(ctx.db, ctx.tenantId, ctx.userId, profileId);
  if (p.error) return dbFail("profiles.get", p.error);
  if (!p.row) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const revs = await listRevisions(ctx.db, ctx.tenantId, ctx.userId, [profileId]);
  if (revs.error) return dbFail("profiles.revisions", revs.error);
  let name: string | null = null;
  if (p.row.client_id) {
    const c = await findTenantClient(ctx.db, ctx.tenantId, p.row.client_id);
    if (c.error) return dbFail("profiles.client", c.error);
    name = clientName(c.row ?? undefined);
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
        currentRevision: p.row.current_revision,
        createdAt: p.row.created_at,
        updatedAt: p.row.updated_at,
        revisions: revs.rows.sort((a, b) => b.revision - a.revision).map(publicRevision),
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
  if (body.clientId !== undefined && body.clientId !== null && body.clientId !== "") {
    if (!isUuid(body.clientId)) return fail(400, "INVALID_CLIENT", "Geçersiz danışan.");
    const c = await findTenantClient(ctx.db, ctx.tenantId, body.clientId);
    if (c.error) return dbFail("profiles.create.client", c.error);
    if (!c.row) return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı veya bu hesaba ait değil.");
    clientId = c.row.id;
  }

  const birth = parseBirthData(body, resolveLocation);
  if (!birth.ok) {
    const { status, code, error, dstOptions } = birth.err;
    return fail(status, code, error, dstOptions ? { dstOptions } : {});
  }

  const r = await createProfileRpc(ctx.db, ctx.tenantId, ctx.userId, clientId, label, birth.value);
  if (r.error) return dbFail("profiles.create", r.error);
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

  const birth = parseBirthData(body, resolveLocation);
  if (!birth.ok) {
    const { status, code, error, dstOptions } = birth.err;
    return fail(status, code, error, dstOptions ? { dstOptions } : {});
  }
  const note = parseChangeNote(body.changeNote);
  if (body.changeNote !== undefined && body.changeNote !== null && body.changeNote !== "" && note === null) {
    return fail(400, "INVALID_NOTE", "Değişiklik notu en fazla 500 karakter olabilir.");
  }

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

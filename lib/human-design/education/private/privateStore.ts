// Human Design — Eğitmene Özel Eğitim Haritaları · DEPO (YALNIZ SUNUCU).
// Tüm okuma/yazma SECURITY DEFINER RPC'lerle; tablolara doğrudan erişim YOK (service_role'ün tablo ayrıcalığı da yok).
// Aktör kimliği yalnız erişim kapısının oturum token'ıyla doğruladığı kullanıcıdır; istek gövdesinden alınmaz.
// Ham sağlayıcı yanıtı istemciye GİTMEZ: kişisel harita ekranıyla aynı yapısal render yükü üretilir (yeni Roxy çağrısı YOK).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { buildRoxyRenderPayload } from "@/lib/human-design/providers/roxy/render";
import { rpcValue } from "./privateAccess";
import { buildEduChartView, buildEduSubject, sanitizeRenderPayload } from "./privateChartView";
import {
  PRIV_ERROR_MAP, PRIV_NOT_FOUND_CODES, PRIV_RPC,
  type PrivActorKind, type PrivCategory, type PrivConsentInput, type PrivConsentView, type PrivDisplayMode, type PrivDisplayScope,
  type PrivItemCard, type PrivItemCreateInput, type PrivItemDetail, type PrivItemPatch, type PrivItemState,
} from "./privateContract";

assertServerOnly("lib/human-design/education/private/privateStore");

/** Eşlenmiş hata: notFound → tek tip 404; diğerleri sözleşmedeki kullanıcı mesajı. Bilinmeyen → genel 500 (ayrıntı sızmaz). */
export class PrivStoreError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly userMessage: string, public readonly notFound = false) {
    super(code);
  }
}

function mapError(err: { code?: string } | null | undefined): PrivStoreError {
  const c = String(err?.code ?? "");
  if (PRIV_NOT_FOUND_CODES.has(c)) return new PrivStoreError(404, "NOT_FOUND", "Bulunamadı.", true);
  const m = PRIV_ERROR_MAP[c];
  if (m) return new PrivStoreError(m.status, m.code, m.error);
  return new PrivStoreError(500, "SERVER_ERROR", "İşlem şu anda tamamlanamadı.");
}

async function call(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await db.rpc(fn, args);
  if (r.error) throw mapError(r.error as { code?: string });
  return rpcValue(fn, r.data);
}

type J = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const sn = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);

function toCard(r: J, kind: PrivActorKind): PrivItemCard {
  const tr = obj(r.trainer), k = obj(r.consent);
  const card: PrivItemCard = {
    id: s(r.id), title: s(r.title), aliasLabel: s(r.alias_label), displayMode: s(r.display_mode) as PrivDisplayMode,
    category: s(r.category) as PrivCategory, description: sn(r.description), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
    state: s(r.state) as PrivItemState, typeCode: sn(r.type_code), profileCode: sn(r.profile_code), authorityCode: sn(r.authority_code),
  };
  if (kind === "owner") {
    card.trainer = tr ? { userId: s(tr.user_id), name: s(tr.name) } : null;
    card.consent = k ? { id: s(k.id), displayScope: s(k.display_scope) as PrivDisplayScope, withdrawnAt: sn(k.withdrawn_at), givenOn: s(k.given_on) } : null;
  }
  return card;
}

function toConsent(k: J): PrivConsentView {
  return {
    id: s(k.id), consenterName: s(k.consenter_name), relation: s(k.relation) as PrivConsentView["relation"],
    displayScope: s(k.display_scope) as PrivDisplayScope, includeBirthData: k.include_birth_data === true, textVersion: s(k.text_version),
    givenOn: s(k.given_on), method: s(k.method) as PrivConsentView["method"], recordedAt: s(k.recorded_at), withdrawnAt: sn(k.withdrawn_at),
    withdrawChannel: (sn(k.withdraw_channel) as PrivConsentView["withdrawChannel"]) ?? null,
  };
}

// ── Kayıtlar ──────────────────────────────────────────────────────────────────────────────────────────
export async function listItems(db: SupabaseClient, actorId: string, kind: PrivActorKind, trainerFilter: string | null): Promise<PrivItemCard[]> {
  const v = await call(db, PRIV_RPC.itemList, { p_actor: actorId, p_trainer: kind === "owner" ? trainerFilter : null });
  return Array.isArray(v) ? (v as J[]).map((r) => toCard(r, kind)) : [];
}

export async function getItem(db: SupabaseClient, actorId: string, id: string): Promise<PrivItemDetail | null> {
  const v = obj(await call(db, PRIV_RPC.itemGet, { p_actor: actorId, p_item: id }));
  if (!v) return null;
  const it = obj(v.item) ?? {}, tr = obj(v.trainer) ?? {}, k = obj(v.consent) ?? {}, ch = obj(v.chart);
  const displayName = s(v.display_name);
  let chart: PrivItemDetail["chart"] = null;
  if (ch && s(v.state) === "ok") {
    // ALLOWLIST: ham computed_result / provider_raw istemciye gitmez (privateChartView).
    const view = buildEduChartView(ch.computed_result);
    if (view) {
      const birth = obj(ch.birth);
      const includeBirth = k.include_birth_data === true && !!birth;
      const subj = buildEduSubject(displayName, includeBirth, birth);
      chart = {
        typeCode: sn(ch.type_code), authorityCode: sn(ch.authority_code), profileCode: sn(ch.profile_code), definitionCode: sn(ch.definition_code),
        view,
        render: ch.provider === "roxyapi" ? sanitizeRenderPayload(buildRoxyRenderPayload(ch.provider_raw)) : null,
        subject: { name: subj.name, localDateTime: subj.localDateTime, zoneLabel: subj.zoneLabel, utcDateTime: null, place: subj.place, coordinates: null, age: subj.age },
        birthShown: includeBirth,
      };
    }
  }
  const consent = toConsent(k);
  const { consenterName: _omit, ...consentSummary } = consent;
  void _omit;
  return {
    actor: s(v.actor) as PrivActorKind, state: s(v.state) as PrivItemState, displayName,
    item: {
      id: s(it.id), title: s(it.title), aliasLabel: s(it.alias_label), displayMode: s(it.display_mode) as PrivDisplayMode,
      category: s(it.category) as PrivCategory, description: sn(it.description), teachingNotes: sn(it.teaching_notes),
      createdAt: s(it.created_at), updatedAt: s(it.updated_at),
    },
    trainer: { userId: s(tr.user_id), name: s(tr.name) },
    consent: consentSummary,
    chart,
  };
}

export async function addItem(db: SupabaseClient, actorId: string, x: PrivItemCreateInput): Promise<string> {
  return s(await call(db, PRIV_RPC.itemAdd, {
    p_actor: actorId, p_chart: x.chartId, p_consent: x.consentId, p_title: x.title, p_alias: x.aliasLabel, p_display_mode: x.displayMode,
    p_category: x.category, p_description: x.description, p_notes: x.teachingNotes,
  }));
}

export async function updateItem(db: SupabaseClient, actorId: string, id: string, x: PrivItemPatch): Promise<string> {
  return s(await call(db, PRIV_RPC.itemUpdate, { p_actor: actorId, p_item: id, p_patch: x.patch, p_expected_updated_at: x.expectedUpdatedAt }));
}

export async function rebindItem(db: SupabaseClient, actorId: string, id: string): Promise<string> {
  return s(await call(db, PRIV_RPC.itemRebind, { p_actor: actorId, p_item: id }));
}

export async function deleteItems(db: SupabaseClient, actorId: string, ids: string[], confirmCount: number, confirmPhrase: string | null): Promise<number> {
  return Number(await call(db, PRIV_RPC.itemDelete, { p_actor: actorId, p_items: ids, p_confirm_count: confirmCount, p_confirm_phrase: confirmPhrase }));
}

// ── İzin ──────────────────────────────────────────────────────────────────────────────────────────────
export async function getConsentText(db: SupabaseClient, actorId: string): Promise<{ version: string; title: string; body: string; sha256: string } | null> {
  const v = obj(await call(db, PRIV_RPC.consentText, { p_actor: actorId }));
  return v ? { version: s(v.version), title: s(v.title), body: s(v.body), sha256: s(v.sha256) } : null;
}

export async function recordConsent(db: SupabaseClient, actorId: string, x: PrivConsentInput): Promise<string> {
  return s(await call(db, PRIV_RPC.consentRecord, {
    p_actor: actorId, p_hd_client: x.hdClientId, p_consenter_name: x.consenterName, p_relation: x.relation, p_display_scope: x.displayScope,
    p_include_birth: x.includeBirthData, p_named_confirmed: x.namedConfirmed, p_text_version: x.textVersion, p_text_sha256: x.textSha256,
    p_given_on: x.givenOn, p_method: x.method, p_evidence_b64: x.evidenceBase64, p_evidence_mime: x.evidenceMime,
  }));
}

export type PrivConsentListRow = PrivConsentView & { evidence: { mime: string; byteSize: number; sha256: string } | null; items: number };
export async function listConsents(db: SupabaseClient, actorId: string, hdClientId: string): Promise<PrivConsentListRow[]> {
  const v = await call(db, PRIV_RPC.consentList, { p_actor: actorId, p_hd_client: hdClientId });
  return Array.isArray(v)
    ? (v as J[]).map((k) => {
        const e = obj(k.evidence);
        return { ...toConsent(k), evidence: e ? { mime: s(e.mime), byteSize: Number(e.byte_size), sha256: s(e.sha256) } : null, items: Number(k.items ?? 0) };
      })
    : [];
}

export async function getConsentEvidence(db: SupabaseClient, actorId: string, consentId: string): Promise<{ mime: string; sha256: string; bytes: Buffer }> {
  const v = obj(await call(db, PRIV_RPC.consentEvidence, { p_actor: actorId, p_consent: consentId }));
  if (!v) throw new PrivStoreError(404, "NOT_FOUND", "Bulunamadı.", true);
  return { mime: s(v.mime), sha256: s(v.sha256), bytes: Buffer.from(s(v.b64).replace(/\s+/g, ""), "base64") };
}

export async function withdrawConsent(db: SupabaseClient, actorId: string, consentId: string, channel: string): Promise<number> {
  return Number(await call(db, PRIV_RPC.consentWithdraw, { p_actor: actorId, p_consent: consentId, p_channel: channel }));
}

export async function deleteConsent(db: SupabaseClient, actorId: string, consentId: string): Promise<number> {
  return Number(await call(db, PRIV_RPC.consentDelete, { p_actor: actorId, p_consent: consentId }));
}

// ── Owner ─────────────────────────────────────────────────────────────────────────────────────────────
export type PrivOwnerOverview = {
  archiveOpen: boolean;
  texts: { version: string; title: string; approved: boolean; approvedAt: string | null; sha256: string }[];
  grants: { userId: string; name: string; grantedAt: string; items: number }[];
  trainers: { userId: string; name: string; items: number }[];
};
export async function ownerOverview(db: SupabaseClient, ownerId: string): Promise<PrivOwnerOverview> {
  const v = obj(await call(db, PRIV_RPC.ownerOverview, { p_actor: ownerId })) ?? {};
  const arr = (x: unknown) => (Array.isArray(x) ? (x as J[]) : []);
  return {
    archiveOpen: v.archive_open === true,
    texts: arr(v.texts).map((t) => ({ version: s(t.version), title: s(t.title), approved: t.approved === true, approvedAt: sn(t.approved_at), sha256: s(t.sha256) })),
    grants: arr(v.grants).map((g) => ({ userId: s(g.user_id), name: s(g.name), grantedAt: s(g.granted_at), items: Number(g.items ?? 0) })),
    trainers: arr(v.trainers).map((t) => ({ userId: s(t.user_id), name: s(t.name), items: Number(t.items ?? 0) })),
  };
}
export async function ownerSetOpen(db: SupabaseClient, ownerId: string, open: boolean, reason: string | null): Promise<void> {
  await call(db, PRIV_RPC.ownerSetOpen, { p_actor: ownerId, p_open: open, p_reason: reason });
}
export async function ownerGrant(db: SupabaseClient, ownerId: string, target: string, note: string | null): Promise<void> {
  await call(db, PRIV_RPC.ownerGrant, { p_actor: ownerId, p_target: target, p_note: note });
}
export async function ownerRevoke(db: SupabaseClient, ownerId: string, target: string): Promise<void> {
  await call(db, PRIV_RPC.ownerRevoke, { p_actor: ownerId, p_target: target });
}
export async function ownerApproveText(db: SupabaseClient, ownerId: string, version: string, legalRef: string): Promise<void> {
  await call(db, PRIV_RPC.ownerApproveText, { p_actor: ownerId, p_version: version, p_legal_ref: legalRef });
}

// ── FAZ 7 ─────────────────────────────────────────────────────────────────────────────────────────────
/** D akışı: kaynak harita uygun mu (kendi tenant'ı; mükerrer / hesaplanmamış / danışansız) + o danışanın izinleri. */
export async function chartStatus(db: SupabaseClient, actorId: string, chartId: string): Promise<{
  eligible: boolean; reason: "duplicate" | "not_computed" | "no_client" | null; itemId: string | null; hdClientId: string | null; consents: PrivConsentListRow[];
}> {
  const v = obj(await call(db, PRIV_RPC.chartStatus, { p_actor: actorId, p_chart: chartId })) ?? {};
  const hdClientId = sn(v.hd_client_id);
  return {
    eligible: v.eligible === true,
    reason: (sn(v.reason) as "duplicate" | "not_computed" | "no_client" | null) ?? null,
    itemId: sn(v.item_id),
    hdClientId,
    consents: hdClientId ? await listConsents(db, actorId, hdClientId) : [],
  };
}

/** Owner: iptal günlüğü (yalnız kimlik + zaman; kişisel içerik YOK). */
export async function ownerJournal(db: SupabaseClient, ownerId: string): Promise<Record<string, unknown>> {
  return obj(await call(db, PRIV_RPC.ownerJournal, { p_actor: ownerId })) ?? {};
}
export async function ownerApplyJournal(db: SupabaseClient, ownerId: string, journal: Record<string, unknown>): Promise<Record<string, unknown>> {
  return obj(await call(db, PRIV_RPC.ownerApplyJournal, { p_actor: ownerId, p_journal: journal })) ?? {};
}

export type PrivExpertRow = { id: string; name: string; email: string; eligible: boolean; reason: string | null; granted: boolean };
/**
 * Owner: yetki verilecek uzmanı bulma. 24.08 politikası gereği YALNIZ hesap metadata'sı (ad, e-posta, uygunluk);
 * danışan / içerik / sayı bilgisi YOK. Uygunluk DB RPC'sinde (owner_grant) yeniden doğrulanır.
 */
export async function ownerExpertSearch(db: SupabaseClient, q: string, grantedIds: ReadonlySet<string>): Promise<PrivExpertRow[]> {
  const term = q.trim().slice(0, 60).replace(/[%*,()]/g, " ").trim();
  let query = db.from("users")
    .select("id, full_name, name, email, role, active, approval_status, is_demo_account, is_super_admin, module_permissions, tenant_id")
    .eq("role", "expert").order("full_name", { ascending: true }).limit(50);
  if (term) query = query.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`);
  const u = await query;
  if (u.error) throw new PrivStoreError(500, "SERVER_ERROR", "İşlem şu anda tamamlanamadı.");
  return ((u.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const perms = obj(r.module_permissions);
    const reason = r.active !== true ? "Pasif hesap" : r.is_demo_account === true ? "Demo hesap" : r.is_super_admin === true ? "Owner hesabı"
      : !["approved", ""].includes(String(r.approval_status ?? "").toLowerCase()) ? "Onay bekliyor"
      : !(perms?.human_design === true || perms?.human_design === "true") ? "Human Design izni yok" : !r.tenant_id ? "Tenant yok" : null;
    return { id: s(r.id), name: s(r.full_name) || s(r.name) || "—", email: s(r.email), eligible: reason === null, reason, granted: grantedIds.has(s(r.id)) };
  });
}

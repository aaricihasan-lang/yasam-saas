// Human Design — Hazır Eğitim Haritaları · VERİ ERİŞİM KATMANI (YALNIZ SUNUCU).
// Katalog tabloları tenant'sızdır; burada withTenant/assertTenantId KULLANILMAZ (ve gevşetilmez).
// Çağıran route, educationAccess kapısını (owner / eğitmen) GEÇTİKTEN sonra bu fonksiyonları kullanır.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import {
  EDU_NOTE_MAX, EDU_RPC, EDU_TABLES, EDU_UUID_RE,
  type EduAccessEvent, type EduAccessUserRow, type EduCatalogCard, type EduCategory, type EduInventoryRow,
  type EduInventorySummary, type EduLegalStatus, type EduPublicationStatus, type EduUtcStatus,
} from "./educationContract";

assertServerOnly("lib/human-design/education/educationStore");

export class EduStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type SubjectRow = {
  id: string; natural_key: string; source_ref: string; display_name: string; category: EduCategory; is_living: boolean;
  birth_date: string; birth_place: string; documented_local_time: string; document_quote: string; birth_utc: string | null;
  utc_status: EduUtcStatus; legal_status: EduLegalStatus; legal_note: string | null; blockers: string[] | null; revision: number;
};

/** Owner: 43 kişilik envanter (salt-okunur) + özet. */
export async function listInventory(db: SupabaseClient): Promise<{ rows: EduInventoryRow[]; summary: EduInventorySummary }> {
  const [subj, pubs, srcs, charts] = await Promise.all([
    db.from(EDU_TABLES.subjects).select(
      "id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, birth_utc, utc_status, legal_status, legal_note, blockers, revision",
    ).order("display_name", { ascending: true }),
    db.from(EDU_TABLES.publications).select("subject_id, status"),
    db.from(EDU_TABLES.sources).select("subject_id, subject_revision, role, url, institution, archive_ref, time_explicit"),
    db.from(EDU_TABLES.charts).select("subject_id, subject_revision, calc_status"),
  ]);
  if (subj.error || pubs.error || srcs.error || charts.error) throw new EduStoreError("DB_ERROR");
  const pubBy = new Map(((pubs.data ?? []) as Array<{ subject_id: string; status: EduPublicationStatus }>).map((p) => [p.subject_id, p.status]));
  const srcRows = (srcs.data ?? []) as Array<{ subject_id: string; subject_revision: number; role: string; url: string; institution: string | null; archive_ref: string | null; time_explicit: boolean | null }>;
  const chartRows = (charts.data ?? []) as Array<{ subject_id: string; subject_revision: number; calc_status: string }>;
  const rows: EduInventoryRow[] = ((subj.data ?? []) as SubjectRow[]).map((s) => ({
    id: s.id,
    naturalKey: s.natural_key,
    sourceRef: s.source_ref,
    displayName: s.display_name,
    category: s.category,
    isLiving: s.is_living,
    birthDate: s.birth_date,
    birthPlace: s.birth_place,
    documentedLocalTime: s.documented_local_time,
    documentQuote: s.document_quote,
    birthUtc: s.birth_utc,
    utcStatus: s.utc_status,
    legalStatus: s.legal_status,
    legalNote: s.legal_note,
    blockers: s.blockers ?? [],
    revision: s.revision,
    publicationStatus: pubBy.get(s.id) ?? "draft",
    computed: chartRows.some((c) => c.subject_id === s.id && c.subject_revision === s.revision && c.calc_status === "OK"),
    sources: srcRows
      .filter((r) => r.subject_id === s.id && r.subject_revision === s.revision)
      .map((r) => ({ role: r.role, url: r.url, institution: r.institution, archiveRef: r.archive_ref, timeExplicit: r.time_explicit })),
  }));
  const summary: EduInventorySummary = {
    total: rows.length,
    utcVerified: rows.filter((r) => r.utcStatus === "VERIFIED").length,
    utcPending: rows.filter((r) => r.utcStatus !== "VERIFIED").length,
    legalE: rows.filter((r) => r.legalStatus === "E").length,
    legalUnreviewed: rows.filter((r) => r.legalStatus === "LOW_UNREVIEWED").length,
    published: rows.filter((r) => r.publicationStatus === "published").length,
  };
  return { rows, summary };
}

type UserRow = {
  id: string; full_name: string | null; name: string | null; email: string | null; role: string | null; active: boolean | null;
  approval_status: string | null; is_demo_account: boolean | null; is_super_admin: boolean | null; module_permissions: unknown; tenant_id: string | null;
};

function ineligibleReason(u: UserRow): string | null {
  const role = String(u.role ?? "").toLowerCase();
  if (role !== "expert" || u.is_super_admin === true) return "Yalnız uzman hesaplarına verilir";
  if (u.is_demo_account === true) return "Demo hesaplara verilemez";
  if (u.active !== true) return "Pasif hesaba verilemez";
  const approval = String(u.approval_status ?? "").toLowerCase();
  if (approval !== "approved" && approval !== "") return "Onaylı olmayan hesaba verilemez";
  if (!u.tenant_id) return "Tenant bilgisi yok";
  if (!resolveModuleAccess(u.role, u.module_permissions, "human_design", { isDemo: false })) return "Önce Human Design erişimi gerekir";
  return null;
}

/** Owner: uzman listesi + etkin yetkiler + son geçmiş (arama sunucuda; en çok 200 satır). */
export async function listAccessOverview(db: SupabaseClient, q: string): Promise<{ users: EduAccessUserRow[]; events: EduAccessEvent[]; activeCount: number }> {
  let query = db
    .from("users")
    .select("id, full_name, name, email, role, active, approval_status, is_demo_account, is_super_admin, module_permissions, tenant_id")
    .order("full_name", { ascending: true })
    .limit(200);
  const term = q.trim().slice(0, 60).replace(/[%*,()]/g, " ").trim();
  if (term) query = query.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`);
  const [usersRes, grantsRes, eventsRes] = await Promise.all([
    query,
    db.from(EDU_TABLES.grants).select("user_id, granted_at, granted_by, note").is("revoked_at", null),
    db.from(EDU_TABLES.audit).select("created_at, action, actor_kind, target_user_id").in("action", ["access_granted", "access_revoked", "access_auto_revoked"]).order("created_at", { ascending: false }).limit(50),
  ]);
  if (usersRes.error || grantsRes.error || eventsRes.error) throw new EduStoreError("DB_ERROR");
  const grants = new Map(((grantsRes.data ?? []) as Array<{ user_id: string; granted_at: string; granted_by: string | null; note: string | null }>).map((g) => [g.user_id, g]));
  const userRows = (usersRes.data ?? []) as UserRow[];
  const nameOf = new Map(userRows.map((u) => [u.id, u.full_name || u.name || u.email || u.id]));
  const users: EduAccessUserRow[] = userRows.map((u) => {
    const g = grants.get(u.id);
    const reason = ineligibleReason(u);
    return {
      id: u.id,
      name: u.full_name || u.name || "—",
      email: u.email ?? "",
      role: String(u.role ?? ""),
      active: u.active === true,
      isDemo: u.is_demo_account === true,
      humanDesign: resolveModuleAccess(u.role, u.module_permissions, "human_design", { isDemo: false }) && String(u.role ?? "").toLowerCase() === "expert",
      eligible: reason === null,
      ineligibleReason: reason,
      grant: g ? { grantedAt: g.granted_at, grantedBy: g.granted_by, note: g.note } : null,
    };
  });
  const events: EduAccessEvent[] = ((eventsRes.data ?? []) as Array<{ created_at: string; action: string; actor_kind: string; target_user_id: string | null }>).map((e) => ({
    at: e.created_at,
    action: e.action,
    actorKind: e.actor_kind,
    targetUserId: e.target_user_id,
    targetName: e.target_user_id ? nameOf.get(e.target_user_id) ?? null : null,
  }));
  return { users, events, activeCount: grants.size };
}

/** Owner: yetki ver / kaldır — yalnız DB RPC (aktör DB'de yeniden owner olarak doğrulanır). */
export async function grantAccess(db: SupabaseClient, ownerId: string, targetId: string, note: string | null): Promise<void> {
  if (!EDU_UUID_RE.test(targetId)) throw new EduStoreError("INVALID_TARGET");
  const n = note ? note.trim().slice(0, EDU_NOTE_MAX) : null;
  const { error } = await db.rpc(EDU_RPC.grant, { p_actor: ownerId, p_target: targetId, p_note: n });
  if (error) throw new EduStoreError(rpcCode(error));
}
export async function revokeAccess(db: SupabaseClient, ownerId: string, targetId: string): Promise<void> {
  if (!EDU_UUID_RE.test(targetId)) throw new EduStoreError("INVALID_TARGET");
  const { error } = await db.rpc(EDU_RPC.revoke, { p_actor: ownerId, p_target: targetId, p_reason: "owner_revoked" });
  if (error) throw new EduStoreError(rpcCode(error));
}
function rpcCode(e: { code?: string; message?: string }): string {
  const code = String(e.code ?? "");
  return /^ED\d{3}$/.test(code) ? code : "DB_ERROR";
}

/**
 * Eğitmen: YALNIZ yayımlı ve OKUMA ANINDA hâlâ yayına uygun kayıtlar (B1'de yayın yok → boş liste).
 * Derinlemesine savunma: DB yayın kilidi + kanıt kilidi zaten var; burada yine de UTC doğrulanmış, hukuk E değil,
 * engel yok, yaşamayan kişi ve güncel kanıt revizyonuna ait başarılı snapshot şartları yeniden aranır.
 */
export async function listPublishedCards(db: SupabaseClient): Promise<EduCatalogCard[]> {
  const pubs = await db.from(EDU_TABLES.publications).select("subject_id, chart_id").eq("status", "published");
  if (pubs.error) throw new EduStoreError("DB_ERROR");
  const pubRows = (pubs.data ?? []) as Array<{ subject_id: string; chart_id: string | null }>;
  if (!pubRows.length) return [];
  const chartIds = pubRows.map((p) => p.chart_id).filter((x): x is string => typeof x === "string");
  if (!chartIds.length) return [];
  const [subj, charts] = await Promise.all([
    db.from(EDU_TABLES.subjects)
      .select("id, display_name, category, birth_date, documented_local_time, birth_place, utc_status, legal_status, blockers, is_living, revision")
      .in("id", pubRows.map((p) => p.subject_id)),
    db.from(EDU_TABLES.charts).select("id, subject_id, subject_revision, calc_status").in("id", chartIds),
  ]);
  if (subj.error || charts.error) throw new EduStoreError("DB_ERROR");
  const chartById = new Map(((charts.data ?? []) as Array<{ id: string; subject_id: string; subject_revision: number; calc_status: string }>).map((c) => [c.id, c]));
  const chartOf = new Map(pubRows.map((p) => [p.subject_id, p.chart_id ? chartById.get(p.chart_id) ?? null : null]));
  type PubSubject = {
    id: string; display_name: string; category: EduCategory; birth_date: string; documented_local_time: string; birth_place: string;
    utc_status: string; legal_status: string; blockers: string[] | null; is_living: boolean; revision: number;
  };
  return ((subj.data ?? []) as PubSubject[])
    .filter((s) => {
      const c = chartOf.get(s.id);
      return s.utc_status === "VERIFIED" && s.legal_status !== "E" && (s.blockers ?? []).length === 0 && s.is_living === false
        && !!c && c.subject_id === s.id && c.calc_status === "OK" && c.subject_revision === s.revision;
    })
    .map((s) => ({ id: s.id, displayName: s.display_name, category: s.category, birthDate: s.birth_date, documentedLocalTime: s.documented_local_time, birthPlace: s.birth_place, utcVerified: true as const }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

/** Eğitmen: tek yayımlı kayıt (yayımlı değilse null → çağıran 404). */
export async function getPublishedCard(db: SupabaseClient, id: string): Promise<EduCatalogCard | null> {
  if (!EDU_UUID_RE.test(id)) return null;
  const pub = await db.from(EDU_TABLES.publications).select("subject_id, status").eq("subject_id", id).maybeSingle();
  if (pub.error) throw new EduStoreError("DB_ERROR");
  if (!pub.data || (pub.data as { status: string }).status !== "published") return null;
  const cards = await listPublishedCards(db);
  return cards.find((c) => c.id === id) ?? null;
}

// Human Design — Hazır Eğitim Haritaları · VERİ ERİŞİM KATMANI (YALNIZ SUNUCU).
// Katalog tabloları tenant'sızdır; burada withTenant/assertTenantId KULLANILMAZ (ve gevşetilmez).
// Çağıran route, educationAccess kapısını (owner / eğitmen) GEÇTİKTEN sonra bu fonksiyonları kullanır.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import {
  EDU_NOTE_MAX, EDU_RPC, EDU_TABLES, EDU_UUID_RE, eduStage,
  type EduAccessEvent, type EduAccessUserRow, type EduChecklist, type EduCatalogCard, type EduCatalogDetail, type EduCatalogListCard, type EduCatalogSourceView, type EduCategory, type EduInventoryRow,
  type EduInventorySummary, type EduLegalStatus, type EduPublicationStatus, type EduUtcStatus,
} from "./educationContract";
import { resolveEducationBirthUtc } from "./educationUtc";
import { deriveBirthTimeEvidence, type EduBirthTimeSourceLite } from "./birthEvidence";
import { buildRoxyRenderPayload } from "@/lib/human-design/providers/roxy/render";
import { visibleFamilies, type EduVisibleFamily } from "./educationFamilies";

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
    db.from(EDU_TABLES.publications).select("subject_id, status, chart_id, chart_verified_by, chart_verified_at"),
    db.from(EDU_TABLES.sources).select("subject_id, subject_revision, role, url, institution, archive_ref, time_explicit"),
    db.from(EDU_TABLES.charts).select("id, subject_id, subject_revision, calc_status"),
  ]);
  if (subj.error || pubs.error || srcs.error || charts.error) throw new EduStoreError("DB_ERROR");
  type PubLite = { subject_id: string; status: EduPublicationStatus; chart_id: string | null; chart_verified_by: string | null; chart_verified_at: string | null };
  const pubRowBy = new Map(((pubs.data ?? []) as PubLite[]).map((p) => [p.subject_id, p]));
  const pubBy = new Map([...pubRowBy.values()].map((p) => [p.subject_id, p.status]));
  const srcRows = (srcs.data ?? []) as Array<{ subject_id: string; subject_revision: number; role: string; url: string; institution: string | null; archive_ref: string | null; time_explicit: boolean | null }>;
  const chartRows = (charts.data ?? []) as Array<{ id: string; subject_id: string; subject_revision: number; calc_status: string }>;
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
    stage: eduStage(pubBy.get(s.id) ?? "draft", inventoryChecklist(s, pubRowBy.get(s.id), chartRows, srcRows)),
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

function inventoryChecklist(
  s: SubjectRow,
  p: { status: EduPublicationStatus; chart_id: string | null; chart_verified_by: string | null; chart_verified_at: string | null } | undefined,
  charts: Array<{ id: string; subject_id: string; subject_revision: number; calc_status: string }>,
  srcs: Array<{ subject_id: string; subject_revision: number; role: string }>,
): EduChecklist {
  const verified = p?.chart_id ? charts.find((c) => c.id === p.chart_id) : undefined;
  return {
    utcVerified: s.utc_status === "VERIFIED",
    sourcePresent: srcs.some((r) => r.subject_id === s.id && r.subject_revision === s.revision && r.role === "birth_time"),
    snapshotOk: charts.some((c) => c.subject_id === s.id && c.subject_revision === s.revision && c.calc_status === "OK"),
    snapshotVerified: !!verified && verified.subject_revision === s.revision && verified.calc_status === "OK" && !!p?.chart_verified_by && !!p?.chart_verified_at,
    legalReviewed: s.legal_status === "LOW_REVIEWED",
    noBlockers: (s.blockers ?? []).length === 0,
    notLiving: s.is_living === false,
    ownerApproved: p?.status === "approved" || p?.status === "published",
  };
}

export type UserRow = {
  id: string; full_name: string | null; name: string | null; email: string | null; role: string | null; active: boolean | null;
  approval_status: string | null; is_demo_account: boolean | null; is_super_admin: boolean | null; module_permissions: unknown; tenant_id: string | null;
};

export function ineligibleReason(u: UserRow): string | null {
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
 * Eğitmen: YALNIZ yayımlı ve OKUMA ANINDA hâlâ yayına uygun kayıtlar (yayın yoksa boş liste — hata değil).
 * Derinlemesine savunma: DB yayın kilidi + kanıt kilidi zaten var; burada yine de UTC doğrulanmış, hukuk incelemesi
 * kayıtlı (LOW_REVIEWED), engel yok, yaşamayan kişi, owner'ın DOĞRULADIĞI snapshot ve bu snapshot'ın güncel kanıt
 * revizyonuna ait başarılı hesap olması şartları yeniden aranır. Şartı bozulan kayıt sessizce listeden düşer.
 */
type PubLiteRow = { subject_id: string; chart_id: string | null; chart_verified_by: string | null; chart_verified_at: string | null; approved_at: string | null };
type PubSubject = {
  id: string; natural_key: string; display_name: string; category: EduCategory; birth_date: string; documented_local_time: string; birth_place: string;
  utc_status: string; legal_status: string; blockers: string[] | null; is_living: boolean; revision: number;
  time_standard: string | null; utc_offset_seconds: number | null; birth_utc: string | null; iana_zone: string | null; latitude: unknown; longitude: unknown;
};
type PubChartLite = { id: string; subject_id: string; subject_revision: number; calc_status: string };
const PUB_SUBJECT_COLS =
  "id, natural_key, display_name, category, birth_date, documented_local_time, birth_place, utc_status, legal_status, blockers, is_living, revision, time_standard, utc_offset_seconds, birth_utc, iana_zone, latitude, longitude";
const numv = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** Kanıt (UTC) okuma anında eğitim UTC katmanıyla yeniden denetlenir; tutarsız kayıt ne katalogda ne ayrıntıda görünür. */
const subjectUtc = (s: PubSubject) => resolveEducationBirthUtc({
  birthDate: s.birth_date, documentedLocalTime: s.documented_local_time, timeStandard: s.time_standard, utcOffsetSeconds: s.utc_offset_seconds,
  birthUtc: s.birth_utc, utcStatus: s.utc_status, ianaZone: s.iana_zone, latitude: numv(s.latitude), longitude: numv(s.longitude),
});

function stillPublishable(s: PubSubject, p: PubLiteRow | undefined, c: PubChartLite | null | undefined): boolean {
  return !!p && !!p.chart_id && !!p.chart_verified_by && !!p.chart_verified_at
    && s.utc_status === "VERIFIED" && s.legal_status === "LOW_REVIEWED" && (s.blockers ?? []).length === 0 && s.is_living === false
    && !!c && c.id === p.chart_id && c.subject_id === s.id && c.calc_status === "OK" && c.subject_revision === s.revision
    && subjectUtc(s).ok;
}
const toCard = (s: PubSubject, evidence: EduBirthTimeSourceLite[]): EduCatalogCard => ({
  id: s.id, displayName: s.display_name, category: s.category, birthDate: s.birth_date, documentedLocalTime: s.documented_local_time,
  birthPlace: s.birth_place, utcVerified: true as const, birthTimeEvidence: deriveBirthTimeEvidence(evidence),
});
const evidenceOf = (r: { role: string; primary_secondary?: unknown; seen_how?: unknown; time_explicit?: unknown }): EduBirthTimeSourceLite => ({
  role: String(r.role), primarySecondary: typeof r.primary_secondary === "string" ? r.primary_secondary : null,
  seenHow: typeof r.seen_how === "string" ? r.seen_how : null, timeExplicit: typeof r.time_explicit === "boolean" ? r.time_explicit : null,
});

async function loadPublished(db: SupabaseClient, onlyId?: string) {
  let pq = db.from(EDU_TABLES.publications).select("subject_id, chart_id, chart_verified_by, chart_verified_at, approved_at").eq("status", "published");
  if (onlyId) pq = pq.eq("subject_id", onlyId);
  const pubs = await pq;
  if (pubs.error) throw new EduStoreError("DB_ERROR");
  const pubRows = (pubs.data ?? []) as PubLiteRow[];
  const chartIds = pubRows.map((p) => p.chart_id).filter((x): x is string => typeof x === "string");
  if (!pubRows.length || !chartIds.length) return { pubRows, subjects: [] as PubSubject[], chartById: new Map<string, PubChartLite>() };
  const [subj, charts] = await Promise.all([
    db.from(EDU_TABLES.subjects).select(PUB_SUBJECT_COLS).in("id", pubRows.map((p) => p.subject_id)),
    db.from(EDU_TABLES.charts).select("id, subject_id, subject_revision, calc_status").in("id", chartIds),
  ]);
  if (subj.error || charts.error) throw new EduStoreError("DB_ERROR");
  const chartById = new Map(((charts.data ?? []) as PubChartLite[]).map((c) => [c.id, c]));
  return { pubRows, subjects: (subj.data ?? []) as PubSubject[], chartById };
}

async function publishedSubjects(db: SupabaseClient): Promise<PubSubject[]> {
  const { pubRows, subjects, chartById } = await loadPublished(db);
  const pubBy = new Map(pubRows.map((p) => [p.subject_id, p]));
  return subjects.filter((s) => { const p = pubBy.get(s.id); return stillPublishable(s, p, p?.chart_id ? chartById.get(p.chart_id) : null); });
}
// Owner kararı 29.10.2026: liste kartı owner yönetim alanlarını (kanıt düzeyi / UTC durumu) taşımaz; doğum saati
// kaynak düzeyi yalnız kişi ayrıntısında (getPublishedDetail) döner. natural_key de istemciye gitmez.
const toListCards = (shown: PubSubject[]): EduCatalogListCard[] => shown
  .map((s) => { const { utcVerified: _u, birthTimeEvidence: _e, ...card } = toCard(s, []); void _u; void _e; return card; })
  .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));

export async function listPublishedCards(db: SupabaseClient): Promise<EduCatalogListCard[]> {
  return toListCards(await publishedSubjects(db));
}

/**
 * Eğitmen kataloğu + aile kartları (owner kararı 30.10.2026). Aile YALNIZ tüm üyeleri okuma anında yayımlı ve uygunsa döner
 * (visibleFamilies) — yayımlanmamış üyenin kimliği / varlığı / aile mevcudu yanıtta yer almaz.
 */
export async function listPublishedCatalog(db: SupabaseClient): Promise<{ cards: EduCatalogListCard[]; families: EduVisibleFamily[] }> {
  const shown = await publishedSubjects(db);
  return { cards: toListCards(shown), families: visibleFamilies(shown.map((s) => ({ id: s.id, naturalKey: s.natural_key, displayName: s.display_name }))) };
}

/** FAZ 10: kişi OKUMA ANINDA hâlâ yayımlı ve yayına uygun mu (biyografi uçlarının ön koşulu; snapshot gövdesi okunmaz). */
export async function isPublishedSubject(db: SupabaseClient, id: string): Promise<boolean> {
  if (!EDU_UUID_RE.test(id)) return false;
  const { pubRows, subjects, chartById } = await loadPublished(db, id);
  const s = subjects.find((x) => x.id === id);
  const p = pubRows[0];
  return !!s && !!p?.chart_id && stillPublishable(s, p, chartById.get(p.chart_id));
}

/**
 * Eğitmen: yayımlı kişinin ayrıntısı + KAYITLI doğrulanmış snapshot (FAZ 2-B3). Sağlayıcı çağrısı YOK, yeniden hesap YOK,
 * danışan / Danışan Yolculuğu / kişisel HD kaydı YAZILMAZ (yalnız SELECT). Ham sağlayıcı yanıtı istemciye gitmez: yalnız
 * mevcut yapısal render yükü (buildRoxyRenderPayload — kişisel harita ekranıyla aynı) üretilir.
 * Kanıt (UTC) okuma anında eğitim UTC katmanıyla yeniden denetlenir; tutarsızsa kayıt gösterilmez.
 */
export async function getPublishedDetail(db: SupabaseClient, id: string): Promise<EduCatalogDetail | null> {
  if (!EDU_UUID_RE.test(id)) return null;
  const { pubRows, subjects, chartById } = await loadPublished(db, id);
  const base = subjects.find((x) => x.id === id);
  const p = pubRows[0];
  if (!base || !p?.chart_id || !stillPublishable(base, p, chartById.get(p.chart_id))) return null;
  const [subj, chart, src] = await Promise.all([
    db.from(EDU_TABLES.subjects)
      .select("calendar_note, document_quote")
      .eq("id", id).maybeSingle(),
    db.from(EDU_TABLES.charts)
      .select("id, subject_id, subject_revision, version, calc_status, computed_at, computed_result, provider, provider_raw")
      .eq("id", p.chart_id).maybeSingle(),
    db.from(EDU_TABLES.sources)
      .select("role, url, institution, document_title, archive_ref, document_date, time_explicit, primary_secondary, seen_how, license, subject_revision")
      .eq("subject_id", id).eq("subject_revision", base.revision),
  ]);
  if (subj.error || chart.error || src.error) throw new EduStoreError("DB_ERROR");
  const x = subj.data as { calendar_note: string | null; document_quote: string } | null;
  const c = chart.data as {
    id: string; subject_id: string; subject_revision: number; version: number; calc_status: string; computed_at: string;
    computed_result: unknown; provider: string; provider_raw: unknown;
  } | null;
  if (!x || !c || c.subject_id !== id || c.subject_revision !== base.revision || c.calc_status !== "OK") return null;
  if (!c.computed_result || typeof c.computed_result !== "object") return null;
  const utc = subjectUtc(base);
  if (!utc.ok) return null;
  const sources: EduCatalogSourceView[] = ((src.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    role: String(r.role), url: String(r.url), institution: (r.institution as string) ?? null, documentTitle: (r.document_title as string) ?? null,
    archiveRef: (r.archive_ref as string) ?? null, documentDate: (r.document_date as string) ?? null, timeExplicit: (r.time_explicit as boolean) ?? null,
    primarySecondary: (r.primary_secondary as string) ?? null, license: (r.license as string) ?? null, seenHow: (r.seen_how as string) ?? null,
  }));
  return {
    ...toCard(base, ((src.data ?? []) as Array<{ role: string }>).map(evidenceOf)),
    calendarNote: x.calendar_note, documentQuote: x.document_quote, timeStandard: base.time_standard, utcOffsetSeconds: base.utc_offset_seconds,
    birthUtc: utc.utcIso, utcMethodology: utc.methodology, latitude: numv(base.latitude), longitude: numv(base.longitude), sources,
    chart: {
      version: c.version, computedAt: c.computed_at, result: c.computed_result as Record<string, unknown>,
      render: c.provider === "roxyapi" ? (buildRoxyRenderPayload(c.provider_raw) as Record<string, unknown> | null) : null,
    },
  };
}

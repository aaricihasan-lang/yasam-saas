// Human Design — Eğitim Merkezi · OWNER AÇILIŞ / YAYIN YÖNETİMİ (owner kararı 31.10.2026) · YALNIZ SUNUCU.
//
// Owner, hukuki süreç sonrasında SQL / Vercel / yeniden deploy olmadan yalnız yönetim ekranından:
//   • global uzman kataloğunu açar / kapatır (hd_education_set_catalog_open),
//   • kişiyi aktif envanterden kapsam dışı bırakır / geri alır — fiziksel silme YOK (hd_education_set_subject_scope),
//   • açılış durumunu (aktif kişi, hukuk, teknik doğrulama, yayın, biyografi, yetkili uzman) tek bakışta görür.
// Çağıran route owner kapısını (requireEducationOwner) GEÇMİŞ olmalıdır; RPC'ler aktörü DB'de yeniden owner doğrular.
// Migration 20271220000000 uygulanmadıysa: okumalar "kurulu değil" döner, yazmalar 503 — katalog AÇILAMAZ (fail-closed).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { EDU_RPC, EDU_TABLES, EDU_UUID_RE } from "./educationContract";
import { catalogEnvOverride, readCatalogControl } from "./educationAccess";
import { isMissingRelation, listInventory, listPublishedCards } from "./educationStore";
import { privateEnvKillSwitch } from "./private/privateAccess";
import { ownerOverview } from "./private/privateStore";

assertServerOnly("lib/human-design/education/educationControl");

/** Teknik (hukuk dışı) doğrulama engelleri — owner "Kanıtı doğrula" ile kalkar. */
const TECHNICAL_BLOCKERS = ["UTC-TEYİT", "TAKVİM"];

export type EduControlOverview = {
  /** Yönetim katmanı (migration 20271220000000) veritabanında kurulu mu? */
  ready: boolean;
  catalogOpen: boolean;
  /** Ortam değişkeni geçersiz kılması: "open" (yerel test) / "closed" (acil kapatma) / null (owner anahtarı geçerli). */
  envOverride: "open" | "closed" | null;
  catalogChangedAt: string | null;
  privateArchiveOpen: boolean;
  counts: {
    active: number; archived: number; legalReviewed: number; technicalOk: number; readyToApprove: number;
    approved: number; published: number; visibleToExperts: number; publishedBios: number; visibleBios: number; grants: number;
  };
  /** Katalog açıksa yetkili uzmanların göreceği kişiler (+ yayımlı Hayat Hikâyesi). */
  openToExperts: Array<{ id: string; name: string; bio: boolean }>;
  /** Açılışla ilgili açıklamalar (engel veya bilgi). */
  notes: Array<{ level: "block" | "info"; text: string }>;
  archivedSubjects: Array<{ id: string; name: string; archivedAt: string | null; reason: string | null }>;
  events: Array<{ at: string; action: string; subjectName: string | null; reason: string | null }>;
};

export class EduControlError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export async function getControlOverview(db: SupabaseClient, ownerId: string): Promise<EduControlOverview> {
  const [inv, control, cards] = await Promise.all([listInventory(db), readCatalogControl(db), listPublishedCards(db)]);
  const active = inv.rows.filter((r) => !r.archived);
  const nameOf = new Map(inv.rows.map((r) => [r.id, r.displayName]));
  const activeIds = new Set(active.map((r) => r.id));

  const [bioRes, grantRes, scopeRes, evRes] = await Promise.all([
    db.from("hd_education_biographies").select("subject_id, publish_status").eq("publish_status", "published"),
    db.from(EDU_TABLES.grants).select("id", { count: "exact", head: true }).is("revoked_at", null),
    db.from(EDU_TABLES.subjectScope).select("subject_id, archived_at, reason"),
    db.from(EDU_TABLES.controlEvents).select("created_at, action, subject_id, reason").order("created_at", { ascending: false }).limit(30),
  ]);
  const publishedBioSubjects = new Set((bioRes.error ? [] : (bioRes.data ?? []) as Array<{ subject_id: string | null }>).map((b) => b.subject_id).filter((x): x is string => !!x));
  const visible = cards.map((c) => ({ id: c.id, name: c.displayName, bio: publishedBioSubjects.has(c.id) }));
  const ready = control.ready && !scopeRes.error && !evRes.error;
  const env = catalogEnvOverride();
  const catalogOpen = env !== null ? env : control.open;

  let privateArchiveOpen = false;
  if (!privateEnvKillSwitch()) {
    try { privateArchiveOpen = (await ownerOverview(db, ownerId)).archiveOpen; } catch { privateArchiveOpen = false; }
  }

  const grants = grantRes.error ? 0 : grantRes.count ?? 0;
  const notes: EduControlOverview["notes"] = [];
  if (!ready) notes.push({ level: "block", text: "Yönetim katmanı veritabanında kurulu değil (migration 20271220000000 uygulanmadı). Katalog bu ekrandan açılamaz; kapsam dışı işlemleri yapılamaz." });
  if (env === false) notes.push({ level: "block", text: "Ortamda acil kapatma etkin (HD_EDUCATION_CATALOG_ENABLED=\"false\"): owner anahtarı ne olursa olsun katalog kapalı." });
  if (env === true) notes.push({ level: "info", text: "Ortam değişkeni kataloğu açık tutuyor (yerel test ayarı); owner anahtarı devre dışı." });
  if (visible.length === 0) notes.push({ level: "info", text: "Yayımlanmış ve uzmanlara açık kişi yok — katalog açılırsa yetkili uzmanlar boş katalog görür." });
  if (grants === 0) notes.push({ level: "info", text: "Yetkili uzman yok — katalog açık olsa bile hiçbir uzman içerik göremez (yetki: Kullanıcılar → uzman → Modül İzinleri)." });
  if (visible.length > 0 && visible.some((v) => !v.bio)) notes.push({ level: "info", text: "Bazı yayımlı kişilerin Hayat Hikâyesi henüz yayımlanmadı (Hayat Hikâyeleri sekmesi)." });

  return {
    ready, catalogOpen, envOverride: env === null ? null : env ? "open" : "closed", catalogChangedAt: control.changedAt, privateArchiveOpen,
    counts: {
      active: active.length,
      archived: inv.rows.length - active.length,
      legalReviewed: active.filter((r) => r.legalStatus === "LOW_REVIEWED").length,
      technicalOk: active.filter((r) => r.checklist.utcVerified && r.checklist.sourcePresent && r.checklist.snapshotOk && r.checklist.snapshotVerified
        && !r.blockers.some((b) => TECHNICAL_BLOCKERS.includes(b))).length,
      readyToApprove: active.filter((r) => (r.publicationStatus === "draft" || r.publicationStatus === "pilot_candidate" || r.publicationStatus === "withdrawn")
        && Object.entries(r.checklist).every(([k, v]) => k === "ownerApproved" || v)).length,
      approved: active.filter((r) => r.publicationStatus === "approved").length,
      published: active.filter((r) => r.publicationStatus === "published").length,
      visibleToExperts: visible.length,
      publishedBios: [...publishedBioSubjects].filter((id) => activeIds.has(id)).length,
      visibleBios: visible.filter((v) => v.bio).length,
      grants,
    },
    openToExperts: visible,
    notes,
    archivedSubjects: scopeRes.error ? [] : ((scopeRes.data ?? []) as Array<{ subject_id: string; archived_at: string | null; reason: string | null }>)
      .map((s) => ({ id: s.subject_id, name: nameOf.get(s.subject_id) ?? "—", archivedAt: s.archived_at, reason: s.reason }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr")),
    events: evRes.error ? [] : ((evRes.data ?? []) as Array<{ created_at: string; action: string; subject_id: string | null; reason: string | null }>)
      .map((e) => ({ at: e.created_at, action: e.action, subjectName: e.subject_id ? nameOf.get(e.subject_id) ?? null : null, reason: e.reason })),
  };
}

function rpcFail(e: { code?: string; message?: string }): never {
  const code = String(e.code ?? "");
  if (code === "ED010") throw new EduControlError(400, code, "Gerekçe zorunlu (en az 5 karakter).");
  if (code === "ED004") throw new EduControlError(404, code, "Kişi bulunamadı.");
  if (code === "ED011") throw new EduControlError(409, code, "Onaylı veya yayımlı kişi önce yayından kaldırılmalı.");
  if (code === "ED012") throw new EduControlError(409, code, "Kişi zaten kapsam dışı.");
  if (code === "ED013") throw new EduControlError(409, code, "Kişi zaten aktif envanterde.");
  if (code === "PGRST202" || code === "42883" || isMissingRelation(e)) throw new EduControlError(503, "NOT_READY", "Yönetim katmanı veritabanında kurulu değil (migration bekliyor).");
  throw new EduControlError(500, "DB_ERROR", "İşlem tamamlanamadı.");
}

export async function setCatalogOpen(db: SupabaseClient, ownerId: string, open: boolean, reason: string): Promise<void> {
  if (catalogEnvOverride() === false && open) throw new EduControlError(409, "ENV_CLOSED", "Ortamda acil kapatma etkin; katalog açılamaz.");
  const { error } = await db.rpc(EDU_RPC.setCatalogOpen, { p_actor: ownerId, p_open: open, p_reason: reason });
  if (error) rpcFail(error);
}

export async function setSubjectScope(db: SupabaseClient, ownerId: string, subjectId: string, archived: boolean, reason: string): Promise<void> {
  if (!EDU_UUID_RE.test(subjectId)) throw new EduControlError(404, "ED004", "Kişi bulunamadı.");
  const { error } = await db.rpc(EDU_RPC.setSubjectScope, { p_actor: ownerId, p_subject: subjectId, p_archived: archived, p_reason: reason });
  if (error) rpcFail(error);
}

// Human Design — Hazır Eğitim Haritaları · OWNER YÖNETİM SERVİSİ (FAZ 2-B2) · YALNIZ SUNUCU.
// Çağıran route owner kapısını (requireEducationOwner) GEÇMİŞ olmalıdır. Her eylem ayrıca DB tetikleyicileriyle
// (20271110000000 + 20271112000000) kilitlidir: owner kimliği, hukuk inceleme kaydı, doğrulanmış snapshot, iki adımlı
// onay, yayından kaldırma gerekçesi DB'de yeniden aranır. Servis kontrolleri yalnız anlaşılır hata mesajı içindir.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import {
  EDU_LEGAL_REVIEW_CLEARS, EDU_OWNER_CLEARABLE_BLOCKERS, EDU_OWNER_VERIFIABLE_BLOCKERS, EDU_TABLES, EDU_UUID_RE, eduStage,
  type EduAuditView, type EduCategory, type EduChartSummary, type EduChecklist, type EduLegalStatus, type EduOwnerAction,
  type EduOwnerSubjectDetail, type EduPublicationStatus, type EduSourceView, type EduUtcStatus,
} from "./educationContract";
import { resolveEducationBirthUtc } from "./educationUtc";
import { isEducationProviderEnabled } from "./educationCompute";
import { readArchivedSubjectIds } from "./educationStore";

assertServerOnly("lib/human-design/education/educationManage");

export class EduManageError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

type SubjectRow = {
  id: string; display_name: string; category: EduCategory; is_living: boolean; birth_date: string; calendar_note: string | null;
  birth_place: string; latitude: unknown; longitude: unknown; documented_local_time: string; document_quote: string;
  time_standard: string | null; utc_offset_seconds: number | null; birth_utc: string | null; utc_status: EduUtcStatus; iana_zone: string | null;
  legal_status: EduLegalStatus; legal_note: string | null; legal_review_ref: string | null; legal_reviewed_at: string | null;
  blockers: string[] | null; revision: number;
};
type PubRow = {
  status: EduPublicationStatus; chart_id: string | null; chart_verified_by: string | null; chart_verified_at: string | null;
  approved_at: string | null; legal_clearance_ref: string | null; withdrawn_at: string | null; withdraw_reason: string | null;
};
type ChartRow = { id: string; version: number; subject_revision: number; calc_status: EduChartSummary["calcStatus"]; computed_at: string; adapter_version: string; time_check: unknown; boundary_flags: unknown };

const SUBJECT_COLS =
  "id, display_name, category, is_living, birth_date, calendar_note, birth_place, latitude, longitude, documented_local_time, document_quote, time_standard, utc_offset_seconds, birth_utc, utc_status, iana_zone, legal_status, legal_note, legal_review_ref, legal_reviewed_at, blockers, revision";

export async function getOwnerSubjectDetail(db: SupabaseClient, id: string, env: Record<string, string | undefined> = process.env): Promise<EduOwnerSubjectDetail | null> {
  if (!EDU_UUID_RE.test(id)) return null;
  const sres = await db.from(EDU_TABLES.subjects).select(SUBJECT_COLS).eq("id", id).maybeSingle();
  if (sres.error) throw new EduManageError(500, "DB_ERROR", "Kayıt okunamadı.");
  if (!sres.data) return null;
  const s = sres.data as SubjectRow;
  const [src, charts, pub, hist] = await Promise.all([
    db.from(EDU_TABLES.sources).select("role, url, institution, document_title, archive_ref, document_date, accessed_on, time_explicit, primary_secondary, seen_how, usage_restriction, license, subject_revision").eq("subject_id", id),
    db.from(EDU_TABLES.charts).select("id, version, subject_revision, calc_status, computed_at, adapter_version, time_check, boundary_flags").eq("subject_id", id).order("version", { ascending: false }),
    db.from(EDU_TABLES.publications).select("status, chart_id, chart_verified_by, chart_verified_at, approved_at, legal_clearance_ref, withdrawn_at, withdraw_reason").eq("subject_id", id).maybeSingle(),
    db.from(EDU_TABLES.audit).select("created_at, action, actor_kind, detail").eq("subject_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  if (src.error || charts.error || pub.error || hist.error) throw new EduManageError(500, "DB_ERROR", "Kayıt ayrıntısı okunamadı.");

  const sources: EduSourceView[] = ((src.data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r.subject_revision === s.revision)
    .map((r) => ({
      role: String(r.role), url: String(r.url), institution: (r.institution as string) ?? null, documentTitle: (r.document_title as string) ?? null,
      archiveRef: (r.archive_ref as string) ?? null, documentDate: (r.document_date as string) ?? null, accessedOn: (r.accessed_on as string) ?? null,
      timeExplicit: (r.time_explicit as boolean) ?? null, primarySecondary: (r.primary_secondary as string) ?? null,
      usageRestriction: (r.usage_restriction as string) ?? null, license: (r.license as string) ?? null, seenHow: (r.seen_how as string) ?? null,
    }));
  const chartRows = (charts.data ?? []) as ChartRow[];
  const chartList: EduChartSummary[] = chartRows.map((c) => {
    const tc = (c.time_check && typeof c.time_check === "object" ? c.time_check : null) as { durum?: string; farkDakika?: number | null } | null;
    const bf = (c.boundary_flags && typeof c.boundary_flags === "object" ? c.boundary_flags : {}) as { saniyeGonderildi?: boolean };
    return {
      id: c.id, version: c.version, revision: c.subject_revision, calcStatus: c.calc_status, computedAt: c.computed_at, adapterVersion: c.adapter_version,
      current: c.subject_revision === s.revision, timeCheck: tc ? { durum: tc.durum, farkDakika: tc.farkDakika ?? null } : null, secondsSent: bf.saniyeGonderildi === true,
    };
  });
  const p = (pub.data ?? { status: "draft", chart_id: null, chart_verified_by: null, chart_verified_at: null, approved_at: null, legal_clearance_ref: null, withdrawn_at: null, withdraw_reason: null }) as PubRow;
  const verifiedChart = p.chart_id ? chartList.find((c) => c.id === p.chart_id) ?? null : null;
  const blockers = s.blockers ?? [];
  const checklist: EduChecklist = {
    utcVerified: s.utc_status === "VERIFIED",
    sourcePresent: sources.some((x) => x.role === "birth_time"),
    snapshotOk: chartList.some((c) => c.current && c.calcStatus === "OK"),
    snapshotVerified: !!verifiedChart && verifiedChart.current && verifiedChart.calcStatus === "OK" && !!p.chart_verified_by && !!p.chart_verified_at,
    legalReviewed: s.legal_status === "LOW_REVIEWED",
    noBlockers: blockers.length === 0,
    notLiving: s.is_living === false,
    ownerApproved: p.status === "approved" || p.status === "published",
  };
  const utc = resolveEducationBirthUtc({
    birthDate: s.birth_date, documentedLocalTime: s.documented_local_time, timeStandard: s.time_standard, utcOffsetSeconds: s.utc_offset_seconds,
    birthUtc: s.birth_utc, utcStatus: s.utc_status, ianaZone: s.iana_zone, latitude: num(s.latitude), longitude: num(s.longitude),
  });

  // Önizleme: doğrulanmış snapshot, yoksa güncel revizyondaki en yeni OK snapshot (yalnız computed_result).
  const previewTarget = (checklist.snapshotVerified ? verifiedChart : null) ?? chartList.find((c) => c.current && c.calcStatus === "OK") ?? null;
  let preview: EduOwnerSubjectDetail["preview"] = null;
  if (previewTarget) {
    const pr = await db.from(EDU_TABLES.charts).select("id, version, computed_result").eq("id", previewTarget.id).maybeSingle();
    if (!pr.error && pr.data) {
      const row = pr.data as { id: string; version: number; computed_result: Record<string, unknown> };
      preview = { chartId: row.id, version: row.version, result: row.computed_result };
    }
  }
  const history: EduAuditView[] = ((hist.data ?? []) as Array<{ created_at: string; action: string; actor_kind: string; detail: Record<string, unknown> | null }>).map((h) => ({
    at: h.created_at, action: h.action, actorKind: h.actor_kind,
    // Önceki kanıt kopyası (subject_revised.onceki) owner ekranına özet olarak gelir; tam satır gönderilmez.
    detail: h.action === "subject_revised" ? { onceki_revizyon: (h.detail ?? {}).onceki_revizyon } : (h.detail ?? {}),
  }));
  const archived = (await readArchivedSubjectIds(db)).has(s.id);
  return {
    archived,
    id: s.id, displayName: s.display_name, category: s.category, isLiving: s.is_living, birthDate: s.birth_date, calendarNote: s.calendar_note,
    birthPlace: s.birth_place, latitude: num(s.latitude), longitude: num(s.longitude), documentedLocalTime: s.documented_local_time,
    documentQuote: s.document_quote, timeStandard: s.time_standard, utcOffsetSeconds: s.utc_offset_seconds, birthUtc: s.birth_utc,
    utcStatus: s.utc_status, utcMethodology: utc.ok ? utc.methodology : utc.reason, utcComputable: utc.ok,
    legalStatus: s.legal_status, legalNote: s.legal_note, legalReviewRef: s.legal_review_ref, legalReviewedAt: s.legal_reviewed_at,
    blockers, revision: s.revision, sources, charts: chartList,
    publication: {
      status: p.status, chartId: p.chart_id, chartVerifiedAt: p.chart_verified_at, approvedAt: p.approved_at,
      legalClearanceRef: p.legal_clearance_ref, withdrawnAt: p.withdrawn_at, withdrawReason: p.withdraw_reason,
    },
    checklist, stage: eduStage(p.status, checklist), preview, history, providerCallsEnabled: isEducationProviderEnabled(env),
  };
}

const text = (v: unknown, min: number, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length >= min && t.length <= max ? t : null;
};

/** İstek gövdesi → doğrulanmış eylem (bilinmeyen alanlar yok sayılır; aktör gövdeden ALINMAZ). */
export function parseOwnerAction(body: unknown): EduOwnerAction | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  switch (b.action) {
    case "pilot": case "unpilot": case "publish": return { action: b.action };
    case "verify_chart": return typeof b.chartId === "string" && EDU_UUID_RE.test(b.chartId) ? { action: "verify_chart", chartId: b.chartId } : null;
    case "legal_review": { const r = text(b.reference, 3, 500); return r ? { action: "legal_review", reference: r } : null; }
    case "clear_blocker": {
      const blocker = typeof b.blocker === "string" ? b.blocker : "";
      const reason = text(b.reason, 5, 500);
      return (EDU_OWNER_CLEARABLE_BLOCKERS as readonly string[]).includes(blocker) && reason ? { action: "clear_blocker", blocker, reason } : null;
    }
    case "verify_blocker": {
      const blocker = typeof b.blocker === "string" ? b.blocker : "";
      const confirm = text(b.confirm, 8, 40);
      const evidence = text(b.evidence, 10, 1000);
      return (EDU_OWNER_VERIFIABLE_BLOCKERS as readonly string[]).includes(blocker) && confirm && evidence ? { action: "verify_blocker", blocker, confirm, evidence } : null;
    }
    case "approve": { const r = text(b.legalClearanceRef, 3, 500); const note = text(b.note, 0, 2000) ?? undefined; return r ? { action: "approve", legalClearanceRef: r, note } : null; }
    case "withdraw": { const r = text(b.reason, 5, 2000); return r ? { action: "withdraw", reason: r } : null; }
    default: return null;
  }
}

function dbFail(e: { code?: string; message?: string }, conflictMsg: string): never {
  if (e.code === "23514") throw new EduManageError(409, "DB_RULE", conflictMsg);
  throw new EduManageError(500, "DB_ERROR", "İşlem kaydedilemedi.");
}

export async function applyOwnerAction(db: SupabaseClient, ownerId: string, id: string, a: EduOwnerAction): Promise<void> {
  if (!EDU_UUID_RE.test(id)) throw new EduManageError(404, "NOT_FOUND", "Kayıt bulunamadı.");
  const cur = await db.from(EDU_TABLES.publications).select("status").eq("subject_id", id).maybeSingle();
  if (cur.error) throw new EduManageError(500, "DB_ERROR", "Kayıt okunamadı.");
  if (!cur.data) throw new EduManageError(404, "NOT_FOUND", "Kayıt bulunamadı.");
  const status = (cur.data as { status: EduPublicationStatus }).status;
  const now = new Date().toISOString();
  const pubUpdate = async (patch: Record<string, unknown>, onlyFrom: EduPublicationStatus[], msg: string) => {
    if (!onlyFrom.includes(status)) throw new EduManageError(409, "STATE", msg);
    const r = await db.from(EDU_TABLES.publications).update({ ...patch, updated_by: ownerId }).eq("subject_id", id).eq("status", status).select("subject_id");
    if (r.error) dbFail(r.error, "Yayın koşulları sağlanmadı — kontrol listesini inceleyin.");
    if (!(r.data ?? []).length) throw new EduManageError(409, "STATE", "Kayıt bu arada değişti; ekranı yenileyin.");
  };

  switch (a.action) {
    case "pilot":
      return pubUpdate({ status: "pilot_candidate" }, ["draft"], "Yalnız taslak kayıt pilot adayı yapılabilir.");
    case "unpilot":
      return pubUpdate({ status: "draft" }, ["pilot_candidate"], "Kayıt pilot adayı değil.");
    case "verify_chart":
      return pubUpdate({ chart_id: a.chartId, chart_verified_by: ownerId, chart_verified_at: now }, ["draft", "pilot_candidate", "withdrawn"],
        "Onaylı veya yayımlı kayıtta snapshot değiştirilemez; önce yayından kaldırın.");
    case "approve":
      return pubUpdate({ status: "approved", approved_by: ownerId, approved_at: now, legal_clearance_ref: a.legalClearanceRef, decision_note: a.note ?? null },
        ["draft", "pilot_candidate", "withdrawn"], "Bu durumdaki kayıt onaylanamaz.");
    case "publish":
      return pubUpdate({ status: "published" }, ["approved"], "Yayın yalnız owner onayından sonra yapılabilir.");
    case "withdraw":
      return pubUpdate({ status: "withdrawn", withdrawn_at: now, withdraw_reason: a.reason }, ["approved", "published"], "Yalnız onaylı veya yayımlı kayıt kaldırılabilir.");
    case "legal_review":
    case "clear_blocker": {
      if (status === "approved" || status === "published") throw new EduManageError(409, "STATE", "Onaylı/yayımlı kişinin hukuk kaydı değiştirilemez; önce yayından kaldırın.");
      const sr = await db.from(EDU_TABLES.subjects).select("blockers, legal_note").eq("id", id).maybeSingle();
      if (sr.error || !sr.data) throw new EduManageError(500, "DB_ERROR", "Kayıt okunamadı.");
      const row = sr.data as { blockers: string[] | null; legal_note: string | null };
      const blockers = row.blockers ?? [];
      const stamp = now.slice(0, 10);
      let patch: Record<string, unknown>;
      if (a.action === "legal_review") {
        // YAZILIM KENDİLİĞİNDEN İŞARETLEMEZ: yalnız owner'ın açık eylemi + inceleme referansı. Diğer engeller kalır.
        patch = {
          legal_status: "LOW_REVIEWED", legal_reviewed_by: ownerId, legal_reviewed_at: now, legal_review_ref: a.reference,
          blockers: blockers.filter((b) => !(EDU_LEGAL_REVIEW_CLEARS as readonly string[]).includes(b)),
          legal_note: `${row.legal_note ? `${row.legal_note}\n` : ""}[${stamp} owner hukuk inceleme kaydı: ${a.reference}]`.slice(0, 8000),
        };
      } else {
        if (!blockers.includes(a.blocker)) throw new EduManageError(409, "STATE", "Bu engel kayıtta yok.");
        patch = {
          blockers: blockers.filter((b) => b !== a.blocker),
          legal_note: `${row.legal_note ? `${row.legal_note}\n` : ""}[${stamp} owner engeli kaldırdı: ${a.blocker} — ${a.reason}]`.slice(0, 8000),
        };
      }
      const r = await db.from(EDU_TABLES.subjects).update(patch).eq("id", id).select("id");
      if (r.error) dbFail(r.error, "Hukuk kaydı kurala uymuyor.");
      return;
    }
    case "verify_blocker":
      return verifyTechnicalBlocker(db, id, status, a);
  }
}

/** UTC anı ("YYYY-MM-DD[T ]HH:MM[:SS]" + Z / +00 / ±HH:MM) → "YYYY-MM-DD HH:MM" UTC (dakika düzeyinde karşılaştırma); geçersizse null. */
function utcMinute(v: string | null): string | null {
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]00(?::?00)?)?$/i);
  if (m) return `${m[1]} ${m[2]}`;
  // Başka bir ofsetle yazılmış an (ör. "+03:00") → UTC'ye çevrilir; ayrıştırılamazsa null (fail-closed).
  const ms = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?[+-]\d{2}:\d{2}$/.test(t) ? Date.parse(t.replace(" ", "T")) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : null;
}
/** "GG.AA.YYYY" → "YYYY-MM-DD"; geçersizse null. */
function gregorianIso(v: string): string | null {
  const m = v.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Teknik engel doğrulaması (owner kararı 30.10.2026). Doğum kanıtı, UTC, snapshot ve revizyon DEĞİŞMEZ; yalnız engel listesi ve
 * hukuk notuna owner doğrulama kaydı yazılır (DB tetikleyicisi bunu "legal_updated" olarak denetime işler). Ön koşullar sunucuda:
 *   UTC-TEYİT → UTC VERIFIED + kayıtlı kanıttan aynı UTC yeniden üretilir + owner kayıtlı UTC anını (dakika) aynen yazar.
 *   TAKVİM    → takvim notu kayıtlı + owner Gregoryen doğum tarihini (GG.AA.YYYY) aynen yazar.
 * Kanıt referansı zorunlu. YAŞAYAN KİŞİ ve hukuk engelleri bu yoldan kalkmaz (parseOwnerAction yalnız iki engeli kabul eder).
 */
async function verifyTechnicalBlocker(db: SupabaseClient, id: string, status: EduPublicationStatus, a: Extract<EduOwnerAction, { action: "verify_blocker" }>): Promise<void> {
  if (status === "approved" || status === "published") throw new EduManageError(409, "STATE", "Onaylı/yayımlı kişinin engel kaydı değiştirilemez; önce yayından kaldırın.");
  const sr = await db.from(EDU_TABLES.subjects)
    .select("birth_date, calendar_note, documented_local_time, time_standard, utc_offset_seconds, birth_utc, utc_status, iana_zone, latitude, longitude, blockers, legal_note")
    .eq("id", id).maybeSingle();
  if (sr.error || !sr.data) throw new EduManageError(500, "DB_ERROR", "Kayıt okunamadı.");
  const s = sr.data as {
    birth_date: string; calendar_note: string | null; documented_local_time: string; time_standard: string | null; utc_offset_seconds: number | null;
    birth_utc: string | null; utc_status: EduUtcStatus; iana_zone: string | null; latitude: unknown; longitude: unknown; blockers: string[] | null; legal_note: string | null;
  };
  const blockers = s.blockers ?? [];
  if (!blockers.includes(a.blocker)) throw new EduManageError(409, "STATE", "Bu engel kayıtta yok.");
  let proof: string;
  if (a.blocker === "UTC-TEYİT") {
    if (s.utc_status !== "VERIFIED") throw new EduManageError(409, "PRECONDITION", "UTC doğrulanmadan bu engel kaldırılamaz.");
    const utc = resolveEducationBirthUtc({
      birthDate: s.birth_date, documentedLocalTime: s.documented_local_time, timeStandard: s.time_standard, utcOffsetSeconds: s.utc_offset_seconds,
      birthUtc: s.birth_utc, utcStatus: s.utc_status, ianaZone: s.iana_zone, latitude: num(s.latitude), longitude: num(s.longitude),
    });
    const stored = utcMinute(s.birth_utc);
    if (!utc.ok || !stored || utcMinute(utc.utcIso) !== stored) throw new EduManageError(409, "PRECONDITION", "Kayıtlı kanıttan aynı UTC anı yeniden üretilemedi; engel kaldırılamaz.");
    if (utcMinute(a.confirm) !== stored) throw new EduManageError(400, "CONFIRM", "Yazılan UTC anı kayıtlı UTC anıyla aynı değil.");
    proof = `UTC ${stored}`;
  } else {
    if (!s.calendar_note || !s.calendar_note.trim()) throw new EduManageError(409, "PRECONDITION", "Takvim notu kayıtlı değil; engel kaldırılamaz.");
    if (gregorianIso(a.confirm) !== String(s.birth_date).slice(0, 10)) throw new EduManageError(400, "CONFIRM", "Yazılan Gregoryen tarih kayıtlı doğum tarihiyle aynı değil.");
    proof = `Gregoryen ${a.confirm.trim()}`;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const patch = {
    blockers: blockers.filter((b) => b !== a.blocker),
    legal_note: `${s.legal_note ? `${s.legal_note}\n` : ""}[${stamp} owner teknik doğrulama: ${a.blocker} — ${proof} — ${a.evidence}]`.slice(0, 8000),
  };
  const r = await db.from(EDU_TABLES.subjects).update(patch).eq("id", id).select("id");
  if (r.error) dbFail(r.error, "Engel kaydı kurala uymuyor.");
}

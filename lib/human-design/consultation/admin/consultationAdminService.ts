/**
 * HD Danışmanlık F2 · Admin server service (server-only).
 * ================================================================================
 * - Okuma: 9 consultation tablosu service_role SELECT ile projeksiyonlanır; evidence
 *   rights F0B rightsResolver ile hesaplanır (ikinci rights engine YAZILMAZ).
 * - Yazma: YALNIZ rpc_hd_consultation_{create,update,publish,archive}. Doğrudan
 *   tablo INSERT/UPDATE/DELETE YASAK. actor_admin_id ayrı güvenilir parametre
 *   (payload'dan DEĞİL). Ham DB hata metni istemciye SIZDIRILMAZ (yalnız server log).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateConsultationCreateInput,
  type HdConsultationCreateInput,
} from "@/lib/human-design/consultation/createInput";
import {
  validateConsultationEditDraftInput,
  type HdConsultationEditDraftInput,
} from "@/lib/human-design/consultation/editInput";
import {
  resolveEffectiveRights,
  evaluateProductRights,
} from "@/lib/human-design/consultation/rightsResolver";
import type {
  HdSourceRights,
  HdPassageRightsOverride,
  HdRightsStatus,
} from "@/lib/human-design/consultation/types";
import type { HdCanonicalEntityKind } from "@/lib/human-design/knowledge-system/canonicalKeys";
import type {
  ConsultationDetail,
  ConsultationErrorCode,
  ConsultationListEntry,
  ConsultationListSummary,
  ConsultationSectionDetail,
  ConsultationServiceResult,
  ConsultationUpdateInput,
  ConsultationEvidenceDetail,
  CanonicalEvidencePool,
  CanonicalEvidenceCandidate,
} from "@/lib/human-design/consultation/admin/consultationAdminTypes";

// ── coercion helpers (supabase satırları untyped) ────────────────────────────
type Row = Record<string, unknown>;
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asStrOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNum = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const asNumOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const asBool = (v: unknown): boolean => v === true;
const asBoolOrNull = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);
const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function logServer(scope: string, err: { message?: string } | null | unknown): void {
  const m = (err as { message?: string } | null)?.message ?? String(err);
  // Ham message yalnız server log'a; istemciye gitmez.
  console.error(`[hd-consultation-admin] ${scope}:`, m);
}

/** RPC RAISE metnini stabil koda indirger (ham metin sızdırılmaz). */
function classifyRpcError(err: { message?: string } | null): ConsultationErrorCode {
  const m = (err?.message ?? "").toLowerCase();
  if (m.includes("hd_consultation_has_expert_notes") || m.includes("uzman notu")) return "HAS_EXPERT_NOTES";
  if (m.includes("archived")) return "ARCHIVED";
  if (m.includes("hd_consultation_not_draft") || m.includes("yalnız taslak")) return "NOT_DRAFT";
  if (m.includes("hd_consultation_canonical_stale") || (m.includes("canonical") && m.includes("stale"))) return "CANONICAL_STALE";
  if (m.includes("stale version") || m.includes("beklenen")) return "STALE_VERSION";
  if (m.includes("canonical pin patch")) return "PIN_PATCH_BLOCKED";
  if (m.includes("rights") || m.includes("default-deny") || m.includes("izinli değil")) return "RIGHTS_DENIED";
  if (m.includes("evidence gerekir") || (m.includes("evidence") && m.includes("gerek"))) return "EVIDENCE_MISSING";
  if (m.includes("yayınlı") || m.includes("insan-onaylı") || m.includes("onayl")) return "CANONICAL_NOT_APPROVED";
  if (m.includes("en az bir aktif section")) return "NO_ACTIVE_SECTION";
  if (m.includes("archived")) return "ARCHIVED";
  if (m.includes("bulunamadı") || m.includes("eşleşmiyor")) return "NOT_FOUND";
  if (m.includes("zorunlu") || m.includes("geçersiz") || m.includes("registry") || m.includes("client_ref") || m.includes("duplicate")) return "VALIDATION";
  return "SERVER_ERROR";
}

// ── LIST ─────────────────────────────────────────────────────────────────────
export async function listConsultation(
  db: SupabaseClient,
  filters: { kind?: HdCanonicalEntityKind; status?: string; q?: string },
): Promise<ConsultationServiceResult<ConsultationListEntry[]>> {
  let entQ = db.from("hd_canonical_entities").select("id, entity_kind, canonical_key, name_tr").order("canonical_key", { ascending: true });
  if (filters.kind) entQ = entQ.eq("entity_kind", filters.kind);
  const { data: ents, error: entErr } = await entQ;
  if (entErr) { logServer("listConsultation entities", entErr); return { ok: false, code: "SERVER_ERROR", message: "Liste okunamadı." }; }

  const { data: contents, error: cErr } = await db
    .from("hd_consultation_contents")
    .select("id, entity_id, status, version, is_ai_generated, human_approved_at, canonical_content_id, canonical_content_version, canonical_content_hash, updated_at")
    .neq("status", "archived");
  if (cErr) { logServer("listConsultation contents", cErr); return { ok: false, code: "SERVER_ERROR", message: "Liste okunamadı." }; }

  const activeIds = (contents ?? []).map((r) => asStr((r as Row).id)).filter(Boolean);
  const sectionCountByContent = new Map<string, number>();
  if (activeIds.length) {
    const { data: secs, error: sErr } = await db
      .from("hd_consultation_sections").select("content_id").neq("status", "archived").in("content_id", activeIds);
    if (sErr) { logServer("listConsultation sections", sErr); return { ok: false, code: "SERVER_ERROR", message: "Liste okunamadı." }; }
    for (const s of secs ?? []) {
      const cid = asStr((s as Row).content_id);
      sectionCountByContent.set(cid, (sectionCountByContent.get(cid) ?? 0) + 1);
    }
  }

  const summaryByEntity = new Map<string, ConsultationListSummary>();
  for (const r0 of contents ?? []) {
    const r = r0 as Row;
    summaryByEntity.set(asStr(r.entity_id), {
      id: asStr(r.id),
      status: asStr(r.status) as ConsultationListSummary["status"],
      version: asNum(r.version),
      isAiGenerated: asBool(r.is_ai_generated),
      humanApprovedAt: asStrOrNull(r.human_approved_at),
      canonicalContentId: asStrOrNull(r.canonical_content_id),
      canonicalContentVersion: asNumOrNull(r.canonical_content_version),
      canonicalContentHash: asStrOrNull(r.canonical_content_hash),
      sectionCount: sectionCountByContent.get(asStr(r.id)) ?? 0,
      updatedAt: asStr(r.updated_at),
    });
  }

  const qLower = (filters.q ?? "").trim().toLocaleLowerCase("tr");
  const entries: ConsultationListEntry[] = [];
  for (const e0 of ents ?? []) {
    const e = e0 as Row;
    const summary = summaryByEntity.get(asStr(e.id)) ?? null;
    if (filters.status && (summary?.status ?? "") !== filters.status) continue;
    if (qLower) {
      const hay = `${asStr(e.name_tr)} ${asStr(e.canonical_key)}`.toLocaleLowerCase("tr");
      if (!hay.includes(qLower)) continue;
    }
    entries.push({
      entityId: asStr(e.id),
      entityKind: asStr(e.entity_kind) as HdCanonicalEntityKind,
      canonicalKey: asStr(e.canonical_key),
      nameTr: asStr(e.name_tr),
      consultation: summary,
    });
  }
  return { ok: true, data: entries };
}

// ── DETAIL ───────────────────────────────────────────────────────────────────
function sourceRightsFromRow(s: Row): HdSourceRights {
  return {
    internal_use_allowed: asBool(s.internal_use_allowed),
    expert_delivery_allowed: asBool(s.expert_delivery_allowed),
    private_report_use_allowed: asBool(s.private_report_use_allowed),
    translation_allowed: asBool(s.translation_allowed),
    quotation_allowed: asBool(s.quotation_allowed),
    quotation_word_limit: asNumOrNull(s.quotation_word_limit),
    rights_status: (asStr(s.rights_status) || "unknown") as HdRightsStatus,
  };
}
function passageOverrideFromRow(p: Row): { override: HdPassageRightsOverride; hasOverride: boolean } {
  const override: HdPassageRightsOverride = {
    internal_use_allowed: asBoolOrNull(p.internal_use_allowed_override),
    expert_delivery_allowed: asBoolOrNull(p.expert_delivery_allowed_override),
    private_report_use_allowed: asBoolOrNull(p.private_report_use_allowed_override),
    translation_allowed: asBoolOrNull(p.translation_allowed_override),
    quotation_allowed: asBoolOrNull(p.quotation_allowed_override),
    quotation_word_limit: asNumOrNull(p.quotation_word_limit_override),
    rights_status: (asStrOrNull(p.rights_status_override) as HdRightsStatus | null),
  };
  const hasOverride = Object.values(override).some((v) => v !== null);
  return { override, hasOverride };
}

export async function getConsultationDetail(
  db: SupabaseClient,
  id: string,
): Promise<ConsultationServiceResult<ConsultationDetail>> {
  const { data: c0, error: cErr } = await db.from("hd_consultation_contents").select("*").eq("id", id).maybeSingle();
  if (cErr) { logServer("getConsultationDetail content", cErr); return { ok: false, code: "SERVER_ERROR", message: "İçerik okunamadı." }; }
  if (!c0) return { ok: false, code: "NOT_FOUND", message: "Danışmanlık içeriği bulunamadı." };
  const c = c0 as Row;

  const [{ data: ent }, secRes, qRes, condRes, evRes] = await Promise.all([
    db.from("hd_canonical_entities").select("name_tr").eq("id", asStr(c.entity_id)).maybeSingle(),
    db.from("hd_consultation_sections").select("*").eq("content_id", id).order("sort_order", { ascending: true }),
    db.from("hd_consultation_questions").select("*").eq("content_id", id).order("sort_order", { ascending: true }),
    db.from("hd_consultation_conditions").select("*").eq("content_id", id).order("sort_order", { ascending: true }),
    db.from("hd_consultation_evidence").select("*").eq("content_id", id).order("sort_order", { ascending: true }),
  ]);
  for (const r of [secRes, qRes, condRes, evRes]) {
    if (r.error) { logServer("getConsultationDetail children", r.error); return { ok: false, code: "SERVER_ERROR", message: "İçerik okunamadı." }; }
  }

  // canonical live (pin karşılaştırması için read-only)
  let canonicalLive: ConsultationDetail["canonicalLive"] = null;
  if (asStrOrNull(c.canonical_content_id)) {
    const { data: cc } = await db.from("hd_canonical_content").select("status, version, human_approved_at").eq("id", asStr(c.canonical_content_id)).maybeSingle();
    if (cc) canonicalLive = { status: asStr((cc as Row).status), version: asNum((cc as Row).version), humanApprovedAt: asStrOrNull((cc as Row).human_approved_at) };
  }

  // evidence → passage/source rights projeksiyonu
  const evRows = (evRes.data ?? []) as Row[];
  const passageIds = [...new Set(evRows.map((e) => asStr(e.passage_id)).filter(Boolean))];
  const passageById = new Map<string, Row>();
  const sourceById = new Map<string, Row>();
  if (passageIds.length) {
    const { data: passages } = await db.from("hd_source_passages").select("*").in("id", passageIds);
    for (const p of (passages ?? []) as Row[]) passageById.set(asStr(p.id), p);
    const sourceIds = [...new Set([...passageById.values()].map((p) => asStr(p.source_id)).filter(Boolean))];
    if (sourceIds.length) {
      const { data: sources } = await db.from("hd_sources").select("*").in("id", sourceIds);
      for (const s of (sources ?? []) as Row[]) sourceById.set(asStr(s.id), s);
    }
  }

  const evidenceDetail = (e: Row): ConsultationEvidenceDetail => {
    const p = passageById.get(asStr(e.passage_id));
    const s = p ? sourceById.get(asStr(p.source_id)) : undefined;
    let passage: ConsultationEvidenceDetail["passage"] = null;
    if (p && s) {
      const src = sourceRightsFromRow(s);
      const { override, hasOverride } = passageOverrideFromRow(p);
      const eff = resolveEffectiveRights(src, override);
      passage = {
        id: asStr(p.id),
        locatorLabel: asStr(p.locator_label),
        locatorValue: asStr(p.locator_value),
        sourceId: asStr(s.id),
        sourceTitle: asStr(s.title),
        sourceAuthors: asStrArr(s.authors),
        sourceOrganization: asStrOrNull(s.organization),
        rightsStatus: eff.rights_status,
        effective: {
          internalUseAllowed: eff.internal_use_allowed,
          expertDeliveryAllowed: eff.expert_delivery_allowed,
          privateReportUseAllowed: eff.private_report_use_allowed,
          translationAllowed: eff.translation_allowed,
          quotationAllowed: eff.quotation_allowed,
          quotationWordLimit: eff.quotation_word_limit,
        },
        hasOverride,
        expertGuide: evaluateProductRights(eff, "expert_guide"),
        clientReport: evaluateProductRights(eff, "client_report"),
      };
    }
    return {
      id: asStr(e.id),
      passageId: asStr(e.passage_id),
      relationType: asStr(e.relation_type) as ConsultationEvidenceDetail["relationType"],
      isPrimary: asBool(e.is_primary),
      isSingleSource: asBool(e.is_single_source),
      editorialNote: asStrOrNull(e.editorial_note),
      sortOrder: asNum(e.sort_order),
      passage,
    };
  };

  const bySection = <T,>(rows: Row[], build: (r: Row) => T) => {
    const map = new Map<string, T[]>();
    const contentLevel: T[] = [];
    for (const r of rows) {
      const sid = asStrOrNull(r.section_id);
      const item = build(r);
      if (sid) { const arr = map.get(sid) ?? []; arr.push(item); map.set(sid, arr); }
      else contentLevel.push(item);
    }
    return { map, contentLevel };
  };
  const q = bySection((qRes.data ?? []) as Row[], (r) => ({ id: asStr(r.id), questionText: asStr(r.question_text), topicScope: asStrOrNull(r.topic_scope), sortOrder: asNum(r.sort_order) }));
  const cond = bySection((condRes.data ?? []) as Row[], (r) => ({ id: asStr(r.id), conditionKind: asStr(r.condition_kind) as ConsultationSectionDetail["conditions"][number]["conditionKind"], conditionValue: asStr(r.condition_value), sortOrder: asNum(r.sort_order) }));
  const evBySection = new Map<string, ConsultationEvidenceDetail[]>();
  for (const e of evRows) { const sid = asStr(e.section_id); const arr = evBySection.get(sid) ?? []; arr.push(evidenceDetail(e)); evBySection.set(sid, arr); }

  const sections: ConsultationSectionDetail[] = ((secRes.data ?? []) as Row[]).map((s) => ({
    id: asStr(s.id),
    sectionKind: asStr(s.section_kind) as ConsultationSectionDetail["sectionKind"],
    bodyText: asStr(s.body_text),
    topicScope: asStrOrNull(s.topic_scope),
    usageScope: asStr(s.usage_scope) as ConsultationSectionDetail["usageScope"],
    status: asStr(s.status) as ConsultationSectionDetail["status"],
    version: asNum(s.version),
    sortOrder: asNum(s.sort_order),
    questions: q.map.get(asStr(s.id)) ?? [],
    conditions: cond.map.get(asStr(s.id)) ?? [],
    evidence: evBySection.get(asStr(s.id)) ?? [],
  }));

  return {
    ok: true,
    data: {
      id: asStr(c.id),
      entityId: asStr(c.entity_id),
      entityKind: asStr(c.entity_kind) as HdCanonicalEntityKind,
      canonicalKey: asStr(c.canonical_key),
      nameTr: asStr((ent as Row | null)?.name_tr),
      status: asStr(c.status) as ConsultationDetail["status"],
      version: asNum(c.version),
      isAiGenerated: asBool(c.is_ai_generated),
      humanApprovedAt: asStrOrNull(c.human_approved_at),
      archivedAt: asStrOrNull(c.archived_at),
      canonicalContentId: asStrOrNull(c.canonical_content_id),
      canonicalContentVersion: asNumOrNull(c.canonical_content_version),
      canonicalContentHash: asStrOrNull(c.canonical_content_hash),
      canonicalLive,
      createdAt: asStr(c.created_at),
      updatedAt: asStr(c.updated_at),
      sections,
      contentQuestions: q.contentLevel,
      contentConditions: cond.contentLevel,
    },
  };
}

// ── CREATE (yalnız nested create RPC) ────────────────────────────────────────
export async function createConsultation(
  db: SupabaseClient,
  actorAdminId: string,
  input: HdConsultationCreateInput,
): Promise<ConsultationServiceResult<{ contentId: string; version: number }>> {
  const problems = validateConsultationCreateInput(input);
  if (problems.length) return { ok: false, code: "VALIDATION", message: problems.join("; ") };

  const p_sections = input.sections.map((s) => ({
    client_ref: s.clientRef,
    section_kind: s.sectionKind,
    body_text: s.bodyText,
    usage_scope: s.usageScope,
    topic_scope: s.topicScope ?? null,
    sort_order: s.sortOrder ?? 0,
    status: s.status ?? "draft",
    questions: (s.questions ?? []).map((qi) => ({ question_text: qi.questionText, topic_scope: qi.topicScope ?? null, sort_order: qi.sortOrder ?? 0 })),
    conditions: (s.conditions ?? []).map((ci) => ({ condition_kind: ci.conditionKind, condition_value: ci.conditionValue, sort_order: ci.sortOrder ?? 0 })),
    evidence: (s.evidence ?? []).map((ei) => ({ passage_id: ei.passageId, relation_type: ei.relationType, is_primary: ei.isPrimary ?? false, is_single_source: ei.isSingleSource ?? false, editorial_note: ei.editorialNote ?? null, sort_order: ei.sortOrder ?? 0 })),
  }));
  const p_content_questions = (input.contentQuestions ?? []).map((qi) => ({ question_text: qi.questionText, topic_scope: qi.topicScope ?? null, sort_order: qi.sortOrder ?? 0 }));
  const p_content_conditions = (input.contentConditions ?? []).map((ci) => ({ condition_kind: ci.conditionKind, condition_value: ci.conditionValue, sort_order: ci.sortOrder ?? 0 }));

  const { data, error } = await db.rpc("rpc_hd_consultation_create", {
    p_actor_admin_id: actorAdminId,
    p_entity_id: input.entityId,
    p_canonical_content_id: input.canonicalContentId ?? null,
    p_is_ai_generated: input.isAiGenerated ?? false,
    p_sections,
    p_content_questions,
    p_content_conditions,
  });
  if (error) { logServer("createConsultation rpc", error); return { ok: false, code: classifyRpcError(error), message: "Danışmanlık içeriği oluşturulamadı." }; }
  const r = (data ?? {}) as Row;
  const contentId = asStr(r.content_id);
  if (!contentId) return { ok: false, code: "SERVER_ERROR", message: "Beklenmeyen oluşturma sonucu." };
  return { ok: true, data: { contentId, version: asNum(r.version) || 1 } };
}

// ── UPDATE (yalnız is_ai_generated patch + explicit repin) ────────────────────
export async function updateConsultation(
  db: SupabaseClient,
  actorAdminId: string,
  contentId: string,
  input: ConsultationUpdateInput,
): Promise<ConsultationServiceResult<{ version: number }>> {
  const patch: Record<string, unknown> = {};
  if (typeof input.isAiGenerated === "boolean") patch.is_ai_generated = input.isAiGenerated;
  const { data, error } = await db.rpc("rpc_hd_consultation_update", {
    p_actor_admin_id: actorAdminId,
    p_content_id: contentId,
    p_expected_version: input.expectedVersion,
    p_patch: patch,
    p_repin: input.repin ?? false,
  });
  if (error) { logServer("updateConsultation rpc", error); return { ok: false, code: classifyRpcError(error), message: "Güncelleme başarısız." }; }
  return { ok: true, data: { version: asNum(data) } };
}

// ── PUBLISH ──────────────────────────────────────────────────────────────────
export async function publishConsultation(
  db: SupabaseClient,
  actorAdminId: string,
  contentId: string,
): Promise<ConsultationServiceResult<{ id: string }>> {
  const { data, error } = await db.rpc("rpc_hd_consultation_publish", { p_actor_admin_id: actorAdminId, p_content_id: contentId });
  if (error) { logServer("publishConsultation rpc", error); return { ok: false, code: classifyRpcError(error), message: "Yayınlama başarısız." }; }
  return { ok: true, data: { id: asStr(data) || contentId } };
}

// ── ARCHIVE ──────────────────────────────────────────────────────────────────
export async function archiveConsultation(
  db: SupabaseClient,
  actorAdminId: string,
  contentId: string,
): Promise<ConsultationServiceResult<{ id: string }>> {
  const { data, error } = await db.rpc("rpc_hd_consultation_archive", { p_actor_admin_id: actorAdminId, p_content_id: contentId });
  if (error) { logServer("archiveConsultation rpc", error); return { ok: false, code: classifyRpcError(error), message: "Arşivleme başarısız." }; }
  return { ok: true, data: { id: asStr(data) || contentId } };
}

// ── EDIT DRAFT (F2.1 · yalnız rpc_hd_consultation_edit_draft) ─────────────────
// Draft gövdesini (sections + nested q/c/e + content-düzeyi q/c) atomik yeniden
// kurar. Yazma YALNIZ RPC üzerinden; doğrudan tablo mutation YOK. actor guard'dan.
export async function editDraftConsultation(
  db: SupabaseClient,
  actorAdminId: string,
  contentId: string,
  input: HdConsultationEditDraftInput,
): Promise<ConsultationServiceResult<{ version: number }>> {
  const problems = validateConsultationEditDraftInput(input);
  if (problems.length) return { ok: false, code: "VALIDATION", message: problems.join("; ") };

  const p_sections = input.sections.map((s) => ({
    client_ref: s.clientRef,
    section_kind: s.sectionKind,
    body_text: s.bodyText,
    usage_scope: s.usageScope,
    topic_scope: s.topicScope ?? null,
    sort_order: s.sortOrder ?? 0,
    status: s.status ?? "draft",
    questions: (s.questions ?? []).map((qi) => ({ question_text: qi.questionText, topic_scope: qi.topicScope ?? null, sort_order: qi.sortOrder ?? 0 })),
    conditions: (s.conditions ?? []).map((ci) => ({ condition_kind: ci.conditionKind, condition_value: ci.conditionValue, sort_order: ci.sortOrder ?? 0 })),
    evidence: (s.evidence ?? []).map((ei) => ({ passage_id: ei.passageId, relation_type: ei.relationType, is_primary: ei.isPrimary ?? false, is_single_source: ei.isSingleSource ?? false, editorial_note: ei.editorialNote ?? null, sort_order: ei.sortOrder ?? 0 })),
  }));
  const p_content_questions = (input.contentQuestions ?? []).map((qi) => ({ question_text: qi.questionText, topic_scope: qi.topicScope ?? null, sort_order: qi.sortOrder ?? 0 }));
  const p_content_conditions = (input.contentConditions ?? []).map((ci) => ({ condition_kind: ci.conditionKind, condition_value: ci.conditionValue, sort_order: ci.sortOrder ?? 0 }));

  const { data, error } = await db.rpc("rpc_hd_consultation_edit_draft", {
    p_actor_admin_id: actorAdminId,
    p_content_id: contentId,
    p_expected_version: input.expectedVersion,
    p_sections,
    p_content_questions,
    p_content_conditions,
  });
  if (error) { logServer("editDraftConsultation rpc", error); return { ok: false, code: classifyRpcError(error), message: "Taslak düzenlenemedi." }; }
  const r = (data ?? {}) as Row;
  const version = asNum(r.version);
  if (!version) return { ok: false, code: "SERVER_ERROR", message: "Beklenmeyen düzenleme sonucu." };
  return { ok: true, data: { version } };
}

// ── CANONICAL EVIDENCE POOL (F2.1 · read-only projeksiyon) ───────────────────
// Seçili entity → hd_canonical_content → hd_content_evidence → hd_source_passages
// → hd_sources. Effective rights F0B rightsResolver ile (ikinci motor YAZILMAZ).
// Tam original/source metni TAŞINMAZ; unknown → deny (resolver default-deny).
export async function getCanonicalEvidencePool(
  db: SupabaseClient,
  entityId: string,
): Promise<ConsultationServiceResult<CanonicalEvidencePool>> {
  if (!entityId) return { ok: false, code: "VALIDATION", message: "entityId gerekli." };

  // entity → canonical content (entity başına tek merkezî içerik)
  const { data: cc, error: ccErr } = await db
    .from("hd_canonical_content").select("id").eq("entity_id", entityId).maybeSingle();
  if (ccErr) { logServer("getCanonicalEvidencePool content", ccErr); return { ok: false, code: "SERVER_ERROR", message: "Kanıt havuzu okunamadı." }; }
  const canonicalContentId = asStrOrNull((cc as Row | null)?.id);
  if (!canonicalContentId) return { ok: true, data: { entityId, canonicalContentId: null, candidates: [] } };

  // canonical evidence bağları (yalnız bu entity'nin canonical içeriği — cross-entity sızıntı yok)
  const { data: evRows0, error: evErr } = await db
    .from("hd_content_evidence").select("*").eq("content_id", canonicalContentId).order("sort_order", { ascending: true });
  if (evErr) { logServer("getCanonicalEvidencePool evidence", evErr); return { ok: false, code: "SERVER_ERROR", message: "Kanıt havuzu okunamadı." }; }
  const evRows = (evRows0 ?? []) as Row[];

  const passageIds = [...new Set(evRows.map((e) => asStr(e.passage_id)).filter(Boolean))];
  const passageById = new Map<string, Row>();
  const sourceById = new Map<string, Row>();
  if (passageIds.length) {
    const { data: passages } = await db.from("hd_source_passages").select("*").in("id", passageIds);
    for (const p of (passages ?? []) as Row[]) passageById.set(asStr(p.id), p);
    const sourceIds = [...new Set([...passageById.values()].map((p) => asStr(p.source_id)).filter(Boolean))];
    if (sourceIds.length) {
      const { data: sources } = await db.from("hd_sources").select("*").in("id", sourceIds);
      for (const s of (sources ?? []) as Row[]) sourceById.set(asStr(s.id), s);
    }
  }

  const candidates: CanonicalEvidenceCandidate[] = [];
  for (const e of evRows) {
    const p = passageById.get(asStr(e.passage_id));
    const s = p ? sourceById.get(asStr(p.source_id)) : undefined;
    if (!p || !s) continue; // passage/source çözülemezse aday listelenmez (deny-by-omission)
    const src = sourceRightsFromRow(s);
    const { override, hasOverride } = passageOverrideFromRow(p);
    const eff = resolveEffectiveRights(src, override);
    candidates.push({
      canonicalEvidenceId: asStr(e.id),
      passageId: asStr(e.passage_id),
      canonicalRelationType: (asStr(e.relation_type) || "supports") as CanonicalEvidenceCandidate["canonicalRelationType"],
      isPrimary: asBool(e.is_primary),
      isSingleSource: asBool(e.is_single_source),
      editorialNote: asStrOrNull(e.editorial_note),
      passage: {
        id: asStr(p.id),
        locatorLabel: asStr(p.locator_label),
        locatorValue: asStr(p.locator_value),
        sourceSpecificNote: asStrOrNull(p.source_specific_note),
        sourceId: asStr(s.id),
        sourceTitle: asStr(s.title),
        sourceAuthors: asStrArr(s.authors),
        sourceOrganization: asStrOrNull(s.organization),
        rightsStatus: eff.rights_status,
        effective: {
          internalUseAllowed: eff.internal_use_allowed,
          expertDeliveryAllowed: eff.expert_delivery_allowed,
          privateReportUseAllowed: eff.private_report_use_allowed,
          translationAllowed: eff.translation_allowed,
          quotationAllowed: eff.quotation_allowed,
          quotationWordLimit: eff.quotation_word_limit,
        },
        hasOverride,
        expertGuide: evaluateProductRights(eff, "expert_guide"),
        clientReport: evaluateProductRights(eff, "client_report"),
      },
    });
  }

  return { ok: true, data: { entityId, canonicalContentId, candidates } };
}

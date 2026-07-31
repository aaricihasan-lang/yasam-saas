/**
 * HD FAZ-2 — Merkezî İçerik Admin hattı · Validation
 * ==================================================
 *
 * Saf, deterministik doğrulayıcılar (yan etkisiz). Canonical API tenant_id/user_id/
 * role kabul etmez; draft gevşek, published tür-bazlı zorunlu alanları sağlar.
 * report_text = Kaynaklandırılmış Ana Metin. Migration CHECK'leriyle uyumlu.
 */

import type {
  HdAuditAction,
  HdAuditResourceKind,
  HdCanonicalContentWritable,
  HdContentStatus,
  HdEntityKind,
  HdRelationType,
  HdTranslationStatus,
} from "./centralContentTypes";

export const HD_ENTITY_KINDS: readonly HdEntityKind[] = ["tip", "otorite", "kapi", "kanal"];
export const HD_CONTENT_STATUSES: readonly HdContentStatus[] = ["draft", "published"];
export const HD_TRANSLATION_STATUSES: readonly HdTranslationStatus[] = ["draft", "verified", "archived"];
export const HD_RELATION_TYPES: readonly HdRelationType[] = ["supports", "contradicts", "school_specific", "background"];
export const HD_AUDIT_ACTIONS: readonly HdAuditAction[] = ["created", "updated", "deleted", "published"];
export const HD_AUDIT_RESOURCE_KINDS: readonly HdAuditResourceKind[] = [
  "canonical_content",
  "source",
  "source_passage",
  "original_text",
  "faithful_translation",
  "content_evidence",
];

/** Client body'de kesinlikle kabul edilmeyen alanlar (tenant/rol/kimlik). */
export const FORBIDDEN_REQUEST_KEYS: readonly string[] = [
  "tenant_id",
  "user_id",
  "role",
  "actor_admin_id",
  "admin_id",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
export function isHdEntityKind(v: unknown): v is HdEntityKind {
  return typeof v === "string" && (HD_ENTITY_KINDS as readonly string[]).includes(v);
}
export function isHdRelationType(v: unknown): v is HdRelationType {
  return typeof v === "string" && (HD_RELATION_TYPES as readonly string[]).includes(v);
}
export function isHdContentStatus(v: unknown): v is HdContentStatus {
  return typeof v === "string" && (HD_CONTENT_STATUSES as readonly string[]).includes(v);
}
export function isHdTranslationStatus(v: unknown): v is HdTranslationStatus {
  return typeof v === "string" && (HD_TRANSLATION_STATUSES as readonly string[]).includes(v);
}
export function isHdAuditAction(v: unknown): v is HdAuditAction {
  return typeof v === "string" && (HD_AUDIT_ACTIONS as readonly string[]).includes(v);
}
export function isHdAuditResourceKind(v: unknown): v is HdAuditResourceKind {
  return typeof v === "string" && (HD_AUDIT_RESOURCE_KINDS as readonly string[]).includes(v);
}

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/** Body içinde yasak kimlik/tenant/rol anahtarı var mı? Varsa sorun listesi döner. */
export function rejectForbiddenKeys(body: Record<string, unknown>): string[] {
  return FORBIDDEN_REQUEST_KEYS
    .filter((k) => k in body)
    .map((k) => `Yasak alan gövdede kabul edilmez: ${k}`);
}

/** İçerik yazımı doğrulama. `dbEntityKind`/`dbCanonicalKey` DB kaydından gelir (client'a güvenilmez). */
export function validateContentWrite(
  body: Record<string, unknown>,
  ctx: {
    dbEntityKind: HdEntityKind;
    dbCanonicalKey: string;
    targetStatus: HdContentStatus;
  },
): string[] {
  const problems = rejectForbiddenKeys(body);

  const c = body as Partial<HdCanonicalContentWritable> & Record<string, unknown>;

  if (c.status !== undefined && !isHdContentStatus(c.status)) {
    problems.push(`status geçersiz: ${JSON.stringify(c.status)}`);
  }

  // Tür-dışı alanların dolması yasak (migration type_fields_exclusive ile hizalı).
  const typeFields: Record<HdEntityKind, string[]> = {
    tip: ["strategy_text", "signature_text", "not_self_text"],
    otorite: ["decision_mechanism", "application_text", "caution_notes"],
    kapi: ["general_theme"],
    kanal: ["full_channel_text", "hanging_gate_context"],
  };
  const allowed = new Set(typeFields[ctx.dbEntityKind]);
  for (const kind of HD_ENTITY_KINDS) {
    if (kind === ctx.dbEntityKind) continue;
    for (const f of typeFields[kind]) {
      if (!allowed.has(f) && c[f] != null && String(c[f]).trim() !== "") {
        problems.push(`${ctx.dbEntityKind} kaydında tür-dışı alan dolduruldu: ${f}`);
      }
    }
  }

  // Published tür-bazlı zorunlu alanlar (draft gevşek).
  if (ctx.targetStatus === "published") {
    if (!nonEmpty(c.general_description as unknown)) problems.push("published: Genel Açıklama boş olamaz");
    if (!nonEmpty(c.report_text as unknown)) problems.push("published: Kaynaklandırılmış Ana Metin boş olamaz");
    const req: Record<HdEntityKind, string> = {
      tip: "strategy_text",
      otorite: "decision_mechanism",
      kapi: "general_theme",
      kanal: "full_channel_text",
    };
    const rf = req[ctx.dbEntityKind];
    if (!nonEmpty(c[rf] as unknown)) problems.push(`published ${ctx.dbEntityKind}: ${rf} boş olamaz`);
  }
  return problems;
}

/** Sadık çeviri doğrulama. verified için translation_text boş olamaz; özgün-metin pin alanları zorunlu. */
export function validateTranslationWrite(body: Record<string, unknown>): string[] {
  const problems = rejectForbiddenKeys(body);
  const t = body as Record<string, unknown>;

  if (!isUuid(t.original_text_id)) problems.push("original_text_id uuid olmalı (özgün-metin sürüm pini)");
  if (t.status !== undefined && !isHdTranslationStatus(t.status)) {
    problems.push(`çeviri status geçersiz: ${JSON.stringify(t.status)}`);
  }
  const targetStatus = (t.status as HdTranslationStatus | undefined) ?? "draft";
  if (targetStatus === "verified" && !nonEmpty(t.translation_text)) {
    problems.push("verified çeviri: translation_text boş olamaz");
  }
  if (t.target_language_tag !== undefined &&
      !(typeof t.target_language_tag === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.target_language_tag))) {
    problems.push("target_language_tag geçersiz BCP-47-lite");
  }
  return problems;
}

/** Evidence doğrulama. relation_type allowlist; content/passage uuid. */
export function validateEvidenceWrite(body: Record<string, unknown>): string[] {
  const problems = rejectForbiddenKeys(body);
  const e = body as Record<string, unknown>;
  if (!isUuid(e.content_id)) problems.push("content_id uuid olmalı");
  if (!isUuid(e.passage_id)) problems.push("passage_id uuid olmalı");
  if (!isHdRelationType(e.relation_type)) {
    problems.push(`relation_type allowlist dışı: ${JSON.stringify(e.relation_type)}`);
  }
  if (e.sort_order !== undefined &&
      !(typeof e.sort_order === "number" && Number.isInteger(e.sort_order) && e.sort_order >= 0)) {
    problems.push("sort_order nonnegative integer olmalı");
  }
  return problems;
}

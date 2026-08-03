/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Saf Doğrulayıcılar
 * =========================================================
 *
 * SAF, deterministik, DB'siz. RPC/persistence ileride bu kuralları uygulayacak.
 * Sessiz fallback YOK; geçersiz girdi typed problem listesine yazılır.
 */

import {
  HD_CONSULTATION_STATUSES,
  HD_SECTION_KINDS,
  HD_USAGE_SCOPES,
  isHdConditionKind,
  isHdEntitlementScopeKind,
  isHdSectionKind,
  isHdUsageScope,
  isHdConsultationStatus,
  type HdConsultationSnapshot,
} from "./types";

export const TOPIC_SCOPE_MAX = 160;
export const BODY_TEXT_MAX = 20000;
export const QUESTION_TEXT_MAX = 2000;

// ── Küçük yardımcılar ───────────────────────────────────────────────────────
const HEX64 = /^[0-9a-f]{64}$/;
function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

// ── Enum doğrulayıcılar (problem string döner) ──────────────────────────────

export function validateSectionKind(v: unknown): string[] {
  return isHdSectionKind(v)
    ? []
    : [`Geçersiz section_kind (whitelist: ${HD_SECTION_KINDS.join(", ")}).`];
}
export function validateUsageScope(v: unknown): string[] {
  return isHdUsageScope(v) ? [] : [`Geçersiz usage_scope (whitelist: ${HD_USAGE_SCOPES.join(", ")}).`];
}
export function validateStatus(v: unknown): string[] {
  return isHdConsultationStatus(v)
    ? []
    : [`Geçersiz status (whitelist: ${HD_CONSULTATION_STATUSES.join(", ")}).`];
}
export function validateConditionKind(v: unknown): string[] {
  return isHdConditionKind(v) ? [] : ["Geçersiz condition_kind (type_is/authority_is/has_channel/has_gate)."];
}

/** topic_scope nullable; doluysa trim sonrası boş olmamalı ve MAX'ı aşmamalı. */
export function validateTopicScope(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v !== "string") return ["topic_scope metin veya null olmalı."];
  const t = v.trim();
  if (t === "") return ["topic_scope doluysa yalnız boşluk olamaz (null gönderin)."];
  if (t.length > TOPIC_SCOPE_MAX) return [`topic_scope çok uzun (max ${TOPIC_SCOPE_MAX}).`];
  return [];
}

// ── Section girdisi ─────────────────────────────────────────────────────────

export type SectionInputLike = {
  section_kind?: unknown;
  body_text?: unknown;
  usage_scope?: unknown;
  status?: unknown;
  topic_scope?: unknown;
};

export function validateSectionInput(s: SectionInputLike): string[] {
  const problems: string[] = [];
  problems.push(...validateSectionKind(s.section_kind));
  problems.push(...validateUsageScope(s.usage_scope));
  problems.push(...validateStatus(s.status));
  problems.push(...validateTopicScope(s.topic_scope));
  if (!isNonBlank(s.body_text)) problems.push("body_text boş olamaz.");
  else if ((s.body_text as string).length > BODY_TEXT_MAX) problems.push(`body_text çok uzun (max ${BODY_TEXT_MAX}).`);
  return problems;
}

export function validateQuestionText(v: unknown): string[] {
  if (!isNonBlank(v)) return ["question_text boş olamaz."];
  if ((v as string).length > QUESTION_TEXT_MAX) return [`question_text çok uzun (max ${QUESTION_TEXT_MAX}).`];
  return [];
}

// ── Aynı aktif content içinde section_kind tekilliği ────────────────────────

export type SectionKindRow = { section_kind: unknown; status?: unknown };

/** Aktif (archived olmayan) bölümler arasında tekrar eden section_kind'leri döner. */
export function findDuplicateSectionKinds(sections: readonly SectionKindRow[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sections) {
    if (s.status === "archived") continue;
    if (typeof s.section_kind !== "string") continue;
    counts.set(s.section_kind, (counts.get(s.section_kind) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export function validateNoDuplicateSectionKinds(sections: readonly SectionKindRow[]): string[] {
  const dups = findDuplicateSectionKinds(sections);
  return dups.length ? [`Aynı aktif content içinde tekrar eden section_kind: ${dups.join(", ")}.`] : [];
}

// ── Canonical kaynak izi (id + version + hash birlikte) ─────────────────────

export type CanonicalRefLike = {
  canonical_content_id?: unknown;
  canonical_content_version?: unknown;
  canonical_content_hash?: unknown;
};

/**
 * canonical_content bağı ya tümüyle NULL (henüz bağsız) ya da ÜÇÜ birlikte
 * geçerli olmalı: id (uuid-benzeri non-blank), version (pozitif int), hash (64-hex).
 * Yalnız id yeterli sayılmaz.
 */
export function validateCanonicalRef(ref: CanonicalRefLike): string[] {
  const idSet = ref.canonical_content_id !== null && ref.canonical_content_id !== undefined;
  const verSet = ref.canonical_content_version !== null && ref.canonical_content_version !== undefined;
  const hashSet = ref.canonical_content_hash !== null && ref.canonical_content_hash !== undefined;

  if (!idSet && !verSet && !hashSet) return []; // tümü null: bağsız (geçerli)
  const problems: string[] = [];
  if (!isNonBlank(ref.canonical_content_id)) problems.push("canonical_content_id gerekli (id+version+hash birlikte).");
  if (!isPositiveInt(ref.canonical_content_version)) problems.push("canonical_content_version pozitif tam sayı olmalı.");
  if (typeof ref.canonical_content_hash !== "string" || !HEX64.test(ref.canonical_content_hash)) {
    problems.push("canonical_content_hash 64-hane lowercase SHA-256 olmalı.");
  }
  return problems;
}

// ── Entitlement invariant'ları ──────────────────────────────────────────────

export type EntitlementLike = {
  scope_kind?: unknown;
  entity_id?: unknown;
  revoked_at?: unknown;
  active?: unknown; // varsa çelişki reddedilir
};

export function validateEntitlement(ent: EntitlementLike): string[] {
  const problems: string[] = [];
  if (!isHdEntitlementScopeKind(ent.scope_kind)) {
    problems.push("Geçersiz scope_kind (all_hd/entity).");
    return problems;
  }
  if (ent.scope_kind === "all_hd" && ent.entity_id !== null && ent.entity_id !== undefined) {
    problems.push("all_hd entitlement'ında entity_id NULL olmalı.");
  }
  if (ent.scope_kind === "entity" && !isNonBlank(ent.entity_id)) {
    problems.push("entity entitlement'ında entity_id zorunlu.");
  }
  // Çelişkili active boolean tasarlanmaz; aktiflik = revoked_at === null.
  if (Object.prototype.hasOwnProperty.call(ent, "active")) {
    problems.push("active boolean tasarlanmaz; aktiflik revoked_at === null ile türetilir.");
  }
  return problems;
}

/** Aktiflik gerçekliği: yalnız revoked_at === null. */
export function isEntitlementActive(ent: { revoked_at: string | null }): boolean {
  return ent.revoked_at === null;
}

// ── Archive: assembly dışı bırakma ──────────────────────────────────────────

export function isArchived(row: { status?: unknown; archived_at?: unknown }): boolean {
  return row.status === "archived" || (row.archived_at !== null && row.archived_at !== undefined);
}

/** Assembly'ye yalnız published + archived-olmayan içerik girer. */
export function isAssemblyEligible(row: { status?: unknown; archived_at?: unknown }): boolean {
  return row.status === "published" && !isArchived(row);
}

export function excludeArchivedForAssembly<T extends { status?: unknown; archived_at?: unknown }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => isAssemblyEligible(r));
}

// ── Session ↔ client report uyumluluğu (session_id nullable) ────────────────

export type SessionLike = { tenant_id: string; client_id: string; chart_id: string };
export type ClientReportLike = {
  tenant_id: string;
  client_id: string;
  chart_id: string;
  session_id: string | null;
};

/**
 * session_id NULL ise kısıt yok. Doluysa aynı tenant + aynı client + uyumlu chart
 * zorunlu (uyum problemi listeye yazılır).
 */
export function checkSessionReportCompatibility(
  report: ClientReportLike,
  session: SessionLike | null,
): string[] {
  if (report.session_id === null) return [];
  if (session === null) return ["session_id verildi ama oturum bulunamadı."];
  const problems: string[] = [];
  if (report.tenant_id !== session.tenant_id) problems.push("Oturum ve rapor tenant'ı uyuşmuyor.");
  if (report.client_id !== session.client_id) problems.push("Oturum ve rapor client'ı uyuşmuyor.");
  if (report.chart_id !== session.chart_id) problems.push("Oturum ve rapor chart'ı uyuşmuyor.");
  return problems;
}

// ── Snapshot immutability ───────────────────────────────────────────────────

/** Deterministik derin eşitlik (snapshot doğrulaması için; anahtar sırasından bağımsız). */
export function deepEqualSnapshot(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqualSnapshot(x, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).sort();
    const bk = Object.keys(bo).sort();
    if (ak.length !== bk.length || !ak.every((k, i) => k === bk[i])) return false;
    return ak.every((k) => deepEqualSnapshot(ao[k], bo[k]));
  }
  return false;
}

/** Snapshot'ı derinlemesine dondurur (sonradan mutasyonu imkânsız kılar). */
export function freezeSnapshot(snapshot: HdConsultationSnapshot): Readonly<HdConsultationSnapshot> {
  const deepFreeze = (o: unknown): void => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    }
  };
  deepFreeze(snapshot);
  return snapshot;
}

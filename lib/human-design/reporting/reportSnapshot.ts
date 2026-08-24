/**
 * HD FAZ 2 — Profesyonel Word/DOCX · DONMUŞ (immutable) RAPOR SNAPSHOT KONTRATI
 * ============================================================================
 *
 * SAF çekirdek (DB/ağ/AI yok): FAZ 1 deterministik yapısı (PkStructure) +
 * YAYINLANMIŞ canonical içerik + provenance haritasından, rapor oluşturulduğu
 * anda DONDURULAN bir HdReportSnapshot üretir. DOCX bu snapshot'tan üretilir;
 * LIVE canonical lookup YAPILMAZ (canonical bilgi sonradan değişse bile eski
 * rapor DEĞİŞMEZ).
 *
 * KİLİTLİ KARARLAR:
 *   • Snapshot yalnız render metni değil, canonical alanların DONMUŞ GERÇEK
 *     DEĞERLERİNİ + provenance (key/contentId/version/hash) tutar (§3, §13).
 *   • Canonical hash, mevcut DB kontratıyla (hd_consultation_canonical_hash) BİREBİR
 *     AYNI serialization+SHA-256'dır (§14) — TS tarafında batch-safe yeniden üretim.
 *   • Fail-loud: chart'ta değeri OLAN ama yayınlanmış canonical içeriği OLMAYAN
 *     Tip/Otorite/Kanal/Kapı → hata (canonical metin UYDURULMAZ) (§17).
 *   • "Chart'ta otorite yok" (empty-state) ≠ "canonical otorite içeriği eksik" (§17/§24).
 *   • Kaynak tam metni / çeviri / restricted alıntı snapshot'a GİRMEZ (§13/§38).
 */

import { createHash } from "node:crypto";
import { hdAuthorityLabelFromCode, hdChannelLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import type { HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";
import type { HdKnowledgeContent } from "@/lib/human-design/knowledge/expertReadTypes";
import type { PkStructure, PkUnresolved } from "@/lib/human-design/knowledge/personalKnowledge";

export const HD_REPORT_SCHEMA_VERSION = "hd-report-1" as const;
export const HD_REPORT_VERSION = 1 as const;

// ── Donmuş canonical içerik (11 alan, HdKnowledgeContent ile BİREBİR) ──────────
export type FrozenCanonicalContent = {
  general_description: string;
  report_text: string;
  strategy_text: string | null;
  signature_text: string | null;
  not_self_text: string | null;
  decision_mechanism: string | null;
  application_text: string | null;
  caution_notes: string | null;
  general_theme: string | null;
  full_channel_text: string | null;
  hanging_gate_context: string | null;
};

/** Hash + serialization için gereken canonical satır provenance'ı (11 alan HARİÇ). */
export type CanonicalRowMeta = {
  contentId: string;
  entityId: string;
  entityKind: HdEntityKind;
  canonicalKey: string;
  version: number;
};

/** Bir canonical anahtar için DONMUŞ içerik + provenance (batch read çıktısı). */
export type FrozenCanonicalRecord = {
  meta: CanonicalRowMeta;
  content: FrozenCanonicalContent;
};

export type CanonicalProvenanceEntry = {
  contentId: string;
  entityId: string;
  entityKind: HdEntityKind;
  version: number;
  hash: string;
};

// ── Frozen bölümler ───────────────────────────────────────────────────────────
export type FrozenIdentitySection = {
  key: string;
  displayName: string;
  kind: "tip" | "otorite";
  content: FrozenCanonicalContent;
};

export type FrozenChannelSection = {
  key: string;
  code: string;
  displayName: string;
  gates: [number, number];
  content: FrozenCanonicalContent;
};

export type FrozenGateSection = {
  key: string;
  gate: number;
  displayName: string;
  content: FrozenCanonicalContent;
};

export type FrozenHangingPotential = {
  code: string;
  displayName: string;
  partnerGate: number;
  hangingContext: string; // yalnız NON-EMPTY bağlam saklanır (uydurulmaz)
};

export type FrozenHangingGateSection = {
  gate: number;
  displayName: string;
  potentials: FrozenHangingPotential[];
};

export type HdReportSnapshot = {
  schemaVersion: typeof HD_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  client: {
    name: string;
    birthDate?: string | null;
    birthTime?: string | null;
    birthPlace?: string | null;
  };
  chart: {
    chartId: string;
    source: "manual" | "computed";
  };
  identity: {
    /** null → chart'ta tip değeri yok (empty-state). */
    type: FrozenIdentitySection | null;
    /** null → chart'ta otorite değeri yok (empty-state; "bilgi bulunmuyor"). */
    authority: FrozenIdentitySection | null;
    /** chart'ta otorite değeri var mıydı (empty-state ↔ eksik-içerik ayrımı için). */
    authorityInChart: boolean;
  };
  channels: FrozenChannelSection[];
  gates: FrozenGateSection[];
  hangingContexts: FrozenHangingGateSection[];
  /** FAZ 1 unresolved (şeffaflık; canonical metin DEĞİL — yalnız sayı/uyarı). */
  unresolved: PkUnresolved[];
  provenance: {
    readAt: string;
    /** canonical_key → provenance (version/hash/id). */
    canonical: Record<string, CanonicalProvenanceEntry>;
  };
  chartImage?: {
    storagePath?: string;
    /** Oluşturma anında getirilen görselin byte SHA-256'sı (reproducibility notu). */
    hash?: string;
    includedAtGeneration: boolean;
  } | null;
};

// ── Canonical hash — DB kontratıyla BİREBİR (chr(30) ayırıcı, UTF-8, SHA-256 hex) ──
const RS = String.fromCharCode(30); // chr(30) / U+001E — hd_consultation_canonical_hash ile ayni ayirici
const co = (v: string | null | undefined): string => v ?? ""; // coalesce → '' (DB coalesce(...,''))

/**
 * hd_consultation_canonical_hash(uuid) ile BİREBİR aynı hash'i TS'te üretir:
 *   sha256_hex( utf8( concat_ws(chr(30),
 *     entity_id, entity_kind, canonical_key, version,
 *     general_description, report_text, strategy_text, signature_text, not_self_text,
 *     decision_mechanism, application_text, caution_notes, general_theme,
 *     full_channel_text, hanging_gate_context ) ) )
 * Alan sırası SABİT; volatil alanlar (status/zaman/audit) HARİÇ. Sonuç 64-hex lowercase.
 */
export function canonicalContentHash(meta: CanonicalRowMeta, content: FrozenCanonicalContent): string {
  const input = [
    co(meta.entityId),
    co(meta.entityKind),
    co(meta.canonicalKey),
    String(meta.version),
    co(content.general_description),
    co(content.report_text),
    co(content.strategy_text),
    co(content.signature_text),
    co(content.not_self_text),
    co(content.decision_mechanism),
    co(content.application_text),
    co(content.caution_notes),
    co(content.general_theme),
    co(content.full_channel_text),
    co(content.hanging_gate_context),
  ].join(RS);
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** HdKnowledgeContent → FrozenCanonicalContent (11 alan; ham değerler, kayıpsız). */
export function freezeContent(c: HdKnowledgeContent): FrozenCanonicalContent {
  return {
    general_description: c.general_description ?? "",
    report_text: c.report_text ?? "",
    strategy_text: c.strategy_text ?? null,
    signature_text: c.signature_text ?? null,
    not_self_text: c.not_self_text ?? null,
    decision_mechanism: c.decision_mechanism ?? null,
    application_text: c.application_text ?? null,
    caution_notes: c.caution_notes ?? null,
    general_theme: c.general_theme ?? null,
    full_channel_text: c.full_channel_text ?? null,
    hanging_gate_context: c.hanging_gate_context ?? null,
  };
}

// ── Fail-loud hata tipi ─────────────────────────────────────────────────────────
export class ReportSnapshotError extends Error {
  code: "missing_canonical" | "invalid_input";
  detail: string;
  constructor(code: "missing_canonical" | "invalid_input", detail: string) {
    super(detail);
    this.name = "ReportSnapshotError";
    this.code = code;
    this.detail = detail;
  }
}

export type BuildSnapshotInput = {
  generatedAt: string;
  readAt: string;
  client: HdReportSnapshot["client"];
  chart: HdReportSnapshot["chart"];
  structure: PkStructure;
  /** canonical_key → DONMUŞ içerik+provenance | null (yayınlanmamış/eksik). */
  recordByKey: ReadonlyMap<string, FrozenCanonicalRecord | null>;
  chartImage?: HdReportSnapshot["chartImage"];
};

function require_(
  record: FrozenCanonicalRecord | null,
  what: string,
  key: string,
): FrozenCanonicalRecord {
  if (!record) {
    throw new ReportSnapshotError(
      "missing_canonical",
      `Yayınlanmış canonical içerik eksik: ${what} (${key}). Rapor oluşturulamadı.`,
    );
  }
  return record;
}

/**
 * SAF: FAZ 1 yapısı + donmuş canonical kayıtları → HdReportSnapshot. Fail-loud.
 * DB/ağ YOK. `provenance.canonical` her donmuş kayıt için version+hash tutar.
 */
export function buildReportSnapshot(input: BuildSnapshotInput): HdReportSnapshot {
  const { structure, recordByKey } = input;
  const canonical: Record<string, CanonicalProvenanceEntry> = {};

  const registerProvenance = (rec: FrozenCanonicalRecord): string => {
    const hash = canonicalContentHash(rec.meta, rec.content);
    canonical[rec.meta.canonicalKey] = {
      contentId: rec.meta.contentId,
      entityId: rec.meta.entityId,
      entityKind: rec.meta.entityKind,
      version: rec.meta.version,
      hash,
    };
    return hash;
  };

  // ── Tip (chart'ta değer varsa → içerik ZORUNLU) ──
  let type: FrozenIdentitySection | null = null;
  if (!structure.typeChartMissing && structure.typeKey) {
    const rec = require_(recordByKey.get(structure.typeKey) ?? null, "Tip", structure.typeKey);
    registerProvenance(rec);
    type = {
      key: structure.typeKey,
      displayName: hdTypeLabelFromCode(structure.typeKey.replace(/^tip_/, "")),
      kind: "tip",
      content: rec.content,
    };
  }

  // ── Otorite (chart'ta değer varsa → içerik ZORUNLU; yoksa empty-state) ──
  let authority: FrozenIdentitySection | null = null;
  const authorityInChart = !structure.authorityChartMissing && !!structure.authorityKey;
  if (authorityInChart && structure.authorityKey) {
    const rec = require_(recordByKey.get(structure.authorityKey) ?? null, "Otorite", structure.authorityKey);
    registerProvenance(rec);
    authority = {
      key: structure.authorityKey,
      displayName: hdAuthorityLabelFromCode(structure.authorityKey.replace(/^otorite_/, "")),
      kind: "otorite",
      content: rec.content,
    };
  }

  // ── Tanımlı kanallar (her biri ZORUNLU) ──
  const channels: FrozenChannelSection[] = structure.completedChannels.map((c) => {
    const rec = require_(recordByKey.get(c.key) ?? null, `Kanal ${c.code}`, c.key);
    registerProvenance(rec);
    return {
      key: c.key,
      code: c.code,
      displayName: hdChannelLabelFromCode(c.code),
      gates: c.gates,
      content: rec.content,
    };
  });

  // ── Bağımsız kapılar (her biri ZORUNLU; tamamlanmış kanal kapıları HARİÇ) ──
  const gates: FrozenGateSection[] = structure.independentGates.map((g) => {
    const rec = require_(recordByKey.get(g.key) ?? null, `Kapı ${g.gate}`, g.key);
    registerProvenance(rec);
    return {
      key: g.key,
      gate: g.gate,
      displayName: `Kapı ${g.gate}`,
      content: rec.content,
    };
  });

  // ── Asılı kapı bağlamları (KANAL içeriğinden; NON-EMPTY olanlar; uydurulmaz) ──
  // Bağlam yoksa OMIT edilir (empty-state; fabricate YOK). Kanal canonical'i yayınlıysa
  // provenance kaydedilir; hanging_gate_context boşsa o potansiyel eklenmez.
  const hangingContexts: FrozenHangingGateSection[] = [];
  for (const hg of structure.hangingGates) {
    const potentials: FrozenHangingPotential[] = [];
    for (const p of hg.potentialChannels) {
      const rec = recordByKey.get(p.key) ?? null;
      if (!rec) continue; // kanal canonical yayınlanmamış → bağlam yok (omit)
      registerProvenance(rec);
      const ctx = (rec.content.hanging_gate_context ?? "").trim();
      if (!ctx) continue; // bağlam alanı boş → omit (fabricate yok)
      potentials.push({
        code: p.code,
        displayName: hdChannelLabelFromCode(p.code),
        partnerGate: p.partnerGate,
        hangingContext: ctx,
      });
    }
    if (potentials.length > 0) {
      hangingContexts.push({ gate: hg.gate, displayName: `Kapı ${hg.gate}`, potentials });
    }
  }

  return {
    schemaVersion: HD_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    client: input.client,
    chart: input.chart,
    identity: { type, authority, authorityInChart },
    channels,
    gates,
    hangingContexts,
    unresolved: structure.unresolved,
    provenance: { readAt: input.readAt, canonical },
    chartImage: input.chartImage ?? null,
  };
}

// ── Şema doğrulama (download öncesi; donmuş snapshot'ı güvenle DOCX'e verir) ──────
export function isHdReportSnapshot(v: unknown): v is HdReportSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.schemaVersion !== HD_REPORT_SCHEMA_VERSION) return false;
  if (typeof s.generatedAt !== "string") return false;
  if (!s.client || typeof s.client !== "object") return false;
  if (typeof (s.client as Record<string, unknown>).name !== "string") return false;
  if (!s.chart || typeof s.chart !== "object") return false;
  if (typeof (s.chart as Record<string, unknown>).chartId !== "string") return false;
  if (!s.identity || typeof s.identity !== "object") return false;
  if (!Array.isArray(s.channels)) return false;
  if (!Array.isArray(s.gates)) return false;
  if (!Array.isArray(s.hangingContexts)) return false;
  if (!s.provenance || typeof s.provenance !== "object") return false;
  return true;
}

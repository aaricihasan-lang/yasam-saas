import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import { OIL_COPY_FIELDS } from "@/lib/aromaterapi/oilFields";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/tenancy/syntheticTenants";
import { remapJunctionRows } from "@/lib/admin/transferJunction";
import {
  CUPPING_POINT_COPY_FIELDS,
  CUPPING_PLACEMENT_COPY_FIELDS,
  CUPPING_TOPIC_COPY_FIELDS,
  CUPPING_TECHNIQUE_COPY_FIELDS,
  CUPPING_KNOWLEDGE_COPY_FIELDS,
  CUPPING_SOURCE_COPY_FIELDS,
  CUPPING_SAFETY_COPY_FIELDS,
  CUPPING_POINT_TOPIC_COPY_FIELDS,
} from "@/lib/cupping/transferFields";

export const runtime = "nodejs";

/**
 * POST /api/admin/veri-paylasimi/transfer
 *
 * ADMIN → UZMAN VERİ AKTARIM MERKEZİ — BAĞIMSIZ SNAPSHOT (hediye) kopyası.
 *
 * KÖK NEDEN DÜZELTMESİ (çoklu/"tümünü seç" çalışmıyordu):
 *   Eski akış TÜM seçili grupları tek try bloğunda işliyor; HERHANGİ bir grup
 *   patlarsa `rollbackBatch` tüm grupların satırlarını siliyor ve genel 500
 *   dönüyordu (all-or-nothing). Tek bölüm (ör. Biyoenerji/Çakralar) çalışıyordu
 *   çünkü provenance-hazır + basit. "Tümünü seç" ise provenance migration'ı
 *   HENÜZ PRODUCTION'A UYGULANMAMIŞ tablolar (aromatherapy_oils, healing_guides…)
 *   içeriyor → o grubun INSERT'i "column ... does not exist" ile patlıyor →
 *   TÜM batch geri alınıp sessizce başarısız oluyordu.
 *
 * YENİ MODEL — BÖLÜM-BAZINDA ATOMİK + KISMİ BAŞARI:
 *   - Her grup KENDİ try/catch'inde işlenir; biri patlarsa YALNIZ o grubun bu
 *     batch'e ait satırları geri alınır (grup-scoped rollback) ve diğerlerine
 *     devam edilir. Bir grubun hatası artık tüm aktarımı düşürmez.
 *   - Sonuç bölüm-bazında outcome üretir: {group, status, requested, inserted}.
 *   - Relational grup (healing_guides + healing_guide_sections) GRUP-ATOMİKtir:
 *     tamamı başarılı olur ya da tamamı geri alınır (parent-child yarım kalmaz).
 *     Child FK yeni parent id'ye REMAP edilir; kaynak parent id'sine bağlanmaz.
 *
 * BAĞLAYICI DAVRANIŞ (korunur):
 *   - Yalnız INSERT; UPSERT/REPLACE/onConflict YOK. Aynı isimli kayıtlar yan yana.
 *   - Kaynak kayıt DEĞİŞMEZ/SİLİNMEZ; hedefin mevcut kayıtları DEĞİŞMEZ/SİLİNMEZ.
 *   - Kopya: yeni UUID (DB default) + hedef tenant + iş alanları + provenance.
 *     id/created_at/updated_at/kaynak tenant/soft-delete alanları TAŞINMAZ.
 *   - Tablo adı YALNIZ sabit REGISTRY'den; istemci string'i asla .from(...) içine geçmez.
 *   - İdempotency: batch_id PK'li ledger satırı atomik "claim"; aynı batch_id ile
 *     ikinci istek KOPYA ÜRETMEZ, önceki sonucu replay eder.
 *   - Hata sözleşmesi: ham `permission denied`/DB mesajı DÖNMEZ; güvenli kod/mesaj.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INSERT_BATCH = 100;
const MAX_IDS_PER_GROUP = 5000;

/** Taş Bilgi Kütüphanesi kopya alanları — yalnız bilinen iş alanları. */
const KNOWLEDGE_COPY_FIELDS = [
  "title",
  "content",
  "category",
  "sub_category",
  "tags",
  "related_stones",
  "related_minerals",
  "source",
  "source_section",
  "keyword",
  "notes",
] as const;

/** Doğaltaş kopya alanları — yalnız bilinen iş alanları (kanıtlı eski davranış). */
const STONE_COPY_FIELDS = [
  "short_description",
  "general_info",
  "source_note",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "warning_tags",
  "feng_shui",
  "meditation",
  "care",
  "application",
  "chakras",
  "assignments",
  "images",
  "image_upload_failed",
] as const;

/** Biyoenerji Seansları (teknik/uygulama kütüphanesi) kopya alanları. */
const SESSION_COPY_FIELDS = ["title", "content", "category", "source", "note"] as const;

/** Aromaterapi Blend/Formül kopya alanları (JSONB snapshot — child tablo yok). */
const BLEND_COPY_FIELDS = [
  "name",
  "notes",
  "carrier_oil_id",
  "carrier_oil_name",
  "bottle_ml",
  "dilution_percent",
  "drops_per_ml",
  "total_drops",
  "items",
  "is_active",
] as const;

/** Human Design bilgi kaydı (parent) kopya alanları — expert_notes/user_id TAŞINMAZ. */
const HD_RECORD_COPY_FIELDS = [
  "category",
  "title",
  "code",
  "content",
  "keywords",
  "related_gates",
  "related_channels",
  "related_centers",
  "tags",
  "sort_order",
  "is_active",
] as const;

/** Human Design kaynak (child) kopya alanları — künye + haklar (default-deny korunur). */
const HD_SOURCE_COPY_FIELDS = [
  "source_name",
  "source_type",
  "author_or_organization",
  "title",
  "page_or_section",
  "source_url",
  "accessed_on",
  "original_language_tag",
  "original_text",
  "faithful_translation_tr",
  "source_specific_note",
  "rights_status",
  "permission_reference",
  "private_use_allowed",
  "client_report_allowed",
  "expert_distribution_allowed",
  "commercial_use_allowed",
  "sort_order",
] as const;

/** Şifa Rehberi alt bölüm (child) kopya alanları. */
const HEALING_SECTION_COPY_FIELDS = [
  "section_type",
  "mode",
  "title",
  "note",
  "source",
  "images",
] as const;

type SourceMode = "admin_tenant" | "canonical_null" | "admin_library";

type GroupConfig = {
  /** Gerçek public tablo adı (yalnız buradan gelir). */
  table: string;
  /**
   * "flat": düz tablo. "relational": parent + child (tek FK remap). "junction": M:N ara
   * tablo (İKİ FK de aynı batch'te oluşturulan hedef kayıtlara remap). Varsayılan flat.
   */
  kind?: "flat" | "relational" | "junction";
  /** Verilirse yalnız bu alanlar kopyalanır; yoksa SELECT * strip mantığı. */
  copyFields?: readonly string[];
  /** Kopyalanacak satırda dolu olması gereken iş alanı (boşsa satır atlanır). */
  requireField?: string;
  /**
   * Kaynak okuma modu:
   *  - "admin_tenant" (varsayılan): kaynak adminin kendi tenant'ında.
   *  - "canonical_null": kaynak kanonik/global havuzda (tenant_id IS NULL).
   *  - "admin_library": kaynak sabit ADMIN_LIBRARY_TENANT_ID sentetik tenant'ında.
   */
  sourceMode?: SourceMode;
  /** Kaynak okumada ek SABİT eşitlik filtresi (ör. oil_type). Dinamik değer YOK. */
  matchColumn?: string;
  matchValue?: string;
  /** true ise kaynak yalnız is_active=true satırları okur. */
  activeOnly?: boolean;
  /** relational: child tablo (ör. healing_guide_sections). */
  childTable?: string;
  /** relational: child'ın parent'a bakan FK kolonu (ör. guide_id) — REMAP edilir. */
  childParentFk?: string;
  /** relational: verilirse child yalnız bu alanlarla kopyalanır (yoksa SELECT * strip). */
  childCopyFields?: readonly string[];
  /** relational: child tablonun tenant_id kolonu var mı? true ise hedef tenant yazılır. */
  childHasTenant?: boolean;
  /** junction: birinci FK kolonu (remap edilir). */
  junctionFkA?: string;
  /** junction: birinci FK'nin remap için okunacağı hedef tablo (bu batch'te oluşturulanlar). */
  junctionViaTableA?: string;
  /** junction: ikinci FK kolonu (remap edilir). */
  junctionFkB?: string;
  /** junction: ikinci FK'nin remap için okunacağı hedef tablo. */
  junctionViaTableB?: string;
};

/** UI grup anahtarı → tablo + kopya davranışı. transferRegistry ile eş küme. */
const REGISTRY = {
  stones: { table: "stones", copyFields: STONE_COPY_FIELDS, requireField: "stone_name" },
  minerals: { table: "minerals" },
  combinations: { table: "combinations" },
  bioenergy_symbols: { table: "bioenergy_symbols" },
  bioenergy_imaginations: { table: "bioenergy_imaginations" },
  bioenergy_chakras: { table: "bioenergy_chakras" },
  bioenergy_energy_bodies: { table: "bioenergy_energy_bodies" },
  bioenergy_subconscious_causes: { table: "bioenergy_subconscious_causes" },
  // Biyoenerji Seansları — profesyonel teknik/uygulama kütüphanesi (danışan seansı DEĞİL).
  // Yalnız iş alanları (title/content/category/source/note) kopyalanır; kaynak
  // tenant/id/user/created metadata TAŞINMAZ. NOT: repo veri envanterinde bu tablo
  // "sınırda-PII" (serbest metin danışana atıf içerebilir) olarak işaretlidir; admin
  // yalnız küratörlü teknik kütüphanesini gönderdiği varsayımıyla dahil edilmiştir.
  bioenergy_sessions: {
    table: "bioenergy_sessions", copyFields: SESSION_COPY_FIELDS,
  },
  reflexology_protocols: { table: "reflexology_protocols" },
  numerology_knowledge_records: { table: "numerology_knowledge_records" },
  numerology_stone_assignments: { table: "numerology_stone_assignments" },
  // Aromaterapi yağları — tek tablo (aromatherapy_oils), oil_type ile 3 grup.
  // Kaynak KANONİK (tenant_id IS NULL). Kopya hedef uzman tenant'ına yazılır.
  aromatherapy_oils_essential: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "essential",
    activeOnly: true,
  },
  aromatherapy_oils_carrier: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "carrier",
    activeOnly: true,
  },
  aromatherapy_oils_maceration: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "maceration",
    activeOnly: true,
  },
  // Aromaterapi Blend/Formül — tenant-scoped, JSONB snapshot (child tablo YOK).
  // Kaynak adminin kendi tenant'ı; tek satır kopya (yeni UUID + hedef tenant).
  // items[].oil_id / carrier_oil_id snapshot mantıklı-ref'tir (FK YOK) — bilinçli korunur.
  aromatherapy_blends: {
    table: "aromatherapy_blends", copyFields: BLEND_COPY_FIELDS, requireField: "name",
    sourceMode: "admin_tenant",
  },
  // Taş Bilgi Kütüphanesi — kaynak sabit ADMIN_LIBRARY_TENANT_ID sentetik tenant.
  stone_knowledge_articles: {
    table: "stone_knowledge_articles", copyFields: KNOWLEDGE_COPY_FIELDS,
    requireField: "title", sourceMode: "admin_library", activeOnly: true,
  },
  // Şifa Rehberi — RELATIONAL: healing_guides (parent) + healing_guide_sections (child).
  // Kaynak adminin kendi tenant'ı. Kopya: her rehber yeni UUID alır, alt bölümlerin
  // guide_id'si YENİ parent id'ye remap edilir (kaynak parent id'sine bağlanmaz).
  healing_guides: {
    table: "healing_guides", kind: "relational", requireField: "name",
    sourceMode: "admin_tenant",
    childTable: "healing_guide_sections", childParentFk: "guide_id",
    childCopyFields: HEALING_SECTION_COPY_FIELDS, childHasTenant: false,
  },
  // Human Design bilgi bankası — RELATIONAL: human_design_knowledge_records (parent) +
  // human_design_knowledge_sources (child, record_id FK, ON DELETE CASCADE). Kaynak
  // adminin kendi tenant'ı; her kayıt yeni UUID + hedef tenant; child'ın record_id'si
  // YENİ parent id'ye REMAP edilir. Child tablonun tenant_id'si VARDIR → hedef yazılır.
  // expert_notes/user_id TAŞINMAZ (allowlist dışı). code per-tenant eşsizdir → çakışma
  // olan kayıt (unit) atlanır, diğerleri aktarılır (per-unit atomik).
  hd_knowledge: {
    table: "human_design_knowledge_records", kind: "relational",
    copyFields: HD_RECORD_COPY_FIELDS, requireField: "title", sourceMode: "admin_tenant",
    childTable: "human_design_knowledge_sources", childParentFk: "record_id",
    childCopyFields: HD_SOURCE_COPY_FIELDS, childHasTenant: true,
  },
  // Kupa & Hacamat — RELATIONAL: cupping_points (parent) + cupping_point_placements
  // (child, point_id FK, ON DELETE CASCADE). Kaynak adminin kendi tenant'ı; her nokta
  // yeni UUID + hedef tenant; child'ın point_id'si YENİ parent id'ye REMAP edilir; child
  // tenant_id VARDIR → hedef yazılır. code per-tenant eşsizdir → çakışan nokta (unit)
  // atlanır, diğerleri aktarılır (per-unit atomik). NOT: cupping_point_topics (çift-FK
  // join) generic tek-parent-remap motoruyla taşınamaz → V1 aktarımına DAHİL DEĞİL
  // (follow-up). Aktarım öncesi admin uzmana noktalar + yerleşimleri gönderir; uzman
  // konu ilişkilerini kendi tarafında kurar.
  cupping_points: {
    table: "cupping_points", kind: "relational",
    copyFields: CUPPING_POINT_COPY_FIELDS, requireField: "name", sourceMode: "admin_tenant",
    childTable: "cupping_point_placements", childParentFk: "point_id",
    childCopyFields: CUPPING_PLACEMENT_COPY_FIELDS, childHasTenant: true,
  },
  cupping_topics: {
    table: "cupping_topics", copyFields: CUPPING_TOPIC_COPY_FIELDS,
    requireField: "title", sourceMode: "admin_tenant",
  },
  cupping_techniques: {
    table: "cupping_techniques", copyFields: CUPPING_TECHNIQUE_COPY_FIELDS,
    requireField: "name", sourceMode: "admin_tenant",
  },
  cupping_knowledge: {
    table: "cupping_knowledge_records", copyFields: CUPPING_KNOWLEDGE_COPY_FIELDS,
    requireField: "title", sourceMode: "admin_tenant",
  },
  cupping_sources: {
    table: "cupping_sources", copyFields: CUPPING_SOURCE_COPY_FIELDS,
    requireField: "source_name", sourceMode: "admin_tenant",
  },
  cupping_safety: {
    table: "cupping_safety_notes", copyFields: CUPPING_SAFETY_COPY_FIELDS,
    requireField: "title", sourceMode: "admin_tenant",
  },
  // Kupa & Hacamat — JUNCTION (M:N): konu ↔ nokta ilişkisi. İki FK de (point_id/topic_id)
  // AYNI batch'te oluşturulan uzman noktalarının/konularının id'lerine REMAP edilir; kaynak
  // UUID hedefte kalmaz. Remap haritaları, cupping_points/cupping_topics kayıtlarının bu
  // batch'teki hedef readback'inden (origin_transfer_batch_id + origin_source_id) kurulur.
  // İki parent'tan biri batch'te yoksa ilişki ATLANIR (dangling/cross-tenant üretilmez).
  // Junction daima nokta/konu gruplarından SONRA işlenir (groupKeys sort).
  cupping_point_topics: {
    table: "cupping_point_topics", kind: "junction",
    copyFields: CUPPING_POINT_TOPIC_COPY_FIELDS, sourceMode: "admin_tenant",
    junctionFkA: "point_id", junctionViaTableA: "cupping_points",
    junctionFkB: "topic_id", junctionViaTableB: "cupping_topics",
  },
} as const satisfies Record<string, GroupConfig>;

type GroupKey = keyof typeof REGISTRY;

function isGroupKey(v: unknown): v is GroupKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, v);
}

/** Kopyada TAŞINMAYAN alanlar (SELECT * yolu). Provenance/soft-delete/teknik. */
const STRIP = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "tenant_id",
  "origin_type",
  "origin_label",
  "origin_source_id",
  "origin_transfer_batch_id",
  "transferred_at",
  "deleted_at",
  "is_deleted",
  "deleted",
  "archived_at",
  "archived",
  "is_archived",
]);

class TransferError extends Error {
  readonly stage: "read" | "insert";
  readonly group: GroupKey;
  constructor(stage: "read" | "insert", group: GroupKey) {
    super(`transfer_${stage}_failed:${group}`);
    this.name = "TransferError";
    this.stage = stage;
    this.group = group;
  }
}

type SectionStatus = "success" | "empty" | "failed";
type SectionOutcome = {
  group: GroupKey;
  status: SectionStatus;
  requested: number;
  inserted: number;
  /** Yalnız güvenli kod (ham DB mesajı DEĞİL). */
  errorCode?: string;
};

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

/** Kaynak okuma sorgusunu grup moduna göre kurar (SELECT * + filtreler). */
function buildReadQuery(
  db: SupabaseClient,
  cfg: GroupConfig,
  sourceTenantId: string,
  filterIds: string[] | undefined,
) {
  let q;
  if (cfg.sourceMode === "canonical_null") {
    q = db.from(cfg.table).select("*").is("tenant_id", null);
  } else if (cfg.sourceMode === "admin_library") {
    q = db.from(cfg.table).select("*").eq("tenant_id", ADMIN_LIBRARY_TENANT_ID);
  } else {
    q = db.from(cfg.table).select("*").eq("tenant_id", sourceTenantId);
  }
  if (cfg.matchColumn && cfg.matchValue != null) q = q.eq(cfg.matchColumn, cfg.matchValue);
  if (cfg.activeOnly) q = q.eq("is_active", true);
  if (filterIds && filterIds.length > 0) q = q.in("id", filterIds);
  return q;
}

/** Kaynak satırdan hedef kopya payload'u üretir (strip/copyFields + provenance). */
function buildCopyPayload(
  cfg: GroupConfig,
  group: GroupKey,
  row: Record<string, unknown>,
  targetTenantId: string | null,
  batchId: string,
  nowIso: string,
): Record<string, unknown> | null {
  const copy: Record<string, unknown> = {};

  if (cfg.copyFields) {
    for (const key of cfg.copyFields) {
      if (Object.prototype.hasOwnProperty.call(row, key)) copy[key] = row[key];
    }
  } else {
    for (const [key, value] of Object.entries(row)) {
      if (!STRIP.has(key)) copy[key] = value;
    }
  }

  if (cfg.requireField) {
    const val = String(row[cfg.requireField] ?? row.name ?? "").trim();
    if (!val) return null; // iş alanı boş → atla (skip)
    copy[cfg.requireField] = val;
  }

  // Doğaltaş: null koleksiyon alanlarını güvenli default'a çek (kanıtlı davranış).
  if (group === "stones") {
    if (copy.images == null) copy.images = [];
    if (copy.assignments == null) copy.assignments = {};
    if (copy.warning_tags == null) copy.warning_tags = [];
  }

  // Ownership — hedef tenant'a bağımsız kopya.
  // (healing_guide_sections'ın tenant_id kolonu YOKTUR → targetTenantId null geçilir.)
  if (targetTenantId != null) copy.tenant_id = targetTenantId;

  // İÇ (internal) audit/rollback metadata — KULLANICIYA GÖSTERİLMEZ.
  //   BAĞLAYICI ÜRÜN KURALI: aktarılmış kayıt uzman tarafında "Admin'den geldi"
  //   benzeri hiçbir görünür köken etiketi taşımaz. Bu yüzden GÖRÜNÜR olan
  //   origin_type='admin_transfer' / origin_label='Admin Kütüphanesi' ARTIK
  //   YAZILMAZ (kayıt uzmanın kendi kaydı gibi görünür). Yalnız iç izleme alanları:
  //     - origin_transfer_batch_id: rollback + idempotency için ZORUNLU.
  //     - origin_source_id / transferred_at: teknik audit (UI'da render edilmez).
  copy.origin_source_id = typeof row.id === "string" ? row.id : null;
  copy.origin_transfer_batch_id = batchId;
  copy.transferred_at = nowIso;

  return copy;
}

/** Düz (flat) grubu kopyalar: SELECT kaynak → payload → batch INSERT. */
async function cloneFlatGroup(
  db: SupabaseClient,
  group: GroupKey,
  cfg: GroupConfig,
  sourceTenantId: string,
  targetTenantId: string,
  batchId: string,
  nowIso: string,
  filterIds: string[] | undefined,
): Promise<{ requested: number; inserted: number }> {
  const { data, error } = await buildReadQuery(db, cfg, sourceTenantId, filterIds);
  if (error) throw new TransferError("read", group);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { requested: 0, inserted: 0 };

  const payloads: Record<string, unknown>[] = [];
  for (const row of rows) {
    const copy = buildCopyPayload(cfg, group, row, targetTenantId, batchId, nowIso);
    if (copy) payloads.push(copy);
  }

  let inserted = 0;
  for (let off = 0; off < payloads.length; off += INSERT_BATCH) {
    const batch = payloads.slice(off, off + INSERT_BATCH);
    const { error: insErr } = await db.from(cfg.table).insert(batch);
    if (insErr) throw new TransferError("insert", group);
    inserted += batch.length;
  }

  return { requested: rows.length, inserted };
}

/** Relational child kopya payload'u (childCopyFields allowlist veya SELECT * strip). */
function buildChildPayload(
  cfg: GroupConfig,
  kid: Record<string, unknown>,
  childFk: string,
  newParentId: string,
  targetTenantId: string,
  batchId: string,
  nowIso: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  if (cfg.childCopyFields) {
    for (const key of cfg.childCopyFields) {
      if (Object.prototype.hasOwnProperty.call(kid, key)) copy[key] = kid[key];
    }
  } else {
    // SELECT * strip: teknik alanlar + parent FK + user_id çıkarılır.
    const childStrip = new Set<string>([...STRIP, childFk, "user_id"]);
    for (const [k, v] of Object.entries(kid)) {
      if (!childStrip.has(k)) copy[k] = v;
    }
  }
  // FK REMAP: child YENİ parent id'ye bağlanır (kaynak parent id'sine DEĞİL).
  copy[childFk] = newParentId;
  // Child tablonun tenant_id kolonu varsa hedef tenant yazılır (ör. HD sources).
  if (cfg.childHasTenant) copy.tenant_id = targetTenantId;
  // İç audit/rollback metadata (görünür origin_type/label YAZILMAZ — ürün kuralı).
  copy.origin_source_id = typeof kid.id === "string" ? kid.id : null;
  copy.origin_transfer_batch_id = batchId;
  copy.transferred_at = nowIso;
  return copy;
}

/**
 * Relational grubu kopyalar: parent + child (healing_guides/sections, hd records/sources).
 *
 * PER-UNIT ATOMİK: her (parent + kendi child'ları) BAĞIMSIZ bir birimdir. Bir birim
 * patlarsa (ör. HD `code` per-tenant eşsizlik çakışması) YALNIZ o birim geri alınır
 * (yeni parent silinir → child'lar ON DELETE CASCADE ile gider) ve diğer birimlere
 * devam edilir. Bir parent'ın yarısı insert olup yarısı kalmaz (birim bütünlüğü).
 * Child FK KAYNAK parent id'sine DEĞİL, YENİ target parent id'sine remap edilir.
 *
 * Sonuç: tüm birimler patlarsa (ve kaynak boş değilse) grup "failed" sayılsın diye
 * TransferError fırlatır; en az bir birim başarılıysa {requested, inserted} döner.
 */
async function cloneRelationalGroup(
  db: SupabaseClient,
  group: GroupKey,
  cfg: GroupConfig,
  sourceTenantId: string,
  targetTenantId: string,
  batchId: string,
  nowIso: string,
  filterIds: string[] | undefined,
): Promise<{ requested: number; inserted: number }> {
  const childTable = cfg.childTable!;
  const childFk = cfg.childParentFk!;

  // 1) Kaynak parent'ları oku.
  const { data: pData, error: pErr } = await buildReadQuery(db, cfg, sourceTenantId, filterIds);
  if (pErr) throw new TransferError("read", group);
  const parents = (pData ?? []) as Record<string, unknown>[];
  if (parents.length === 0) return { requested: 0, inserted: 0 };

  const sourceParentIds = parents
    .map((p) => (typeof p.id === "string" ? p.id : null))
    .filter((x): x is string => !!x);

  // 2) Bu parent'lara ait TÜM child'ları tek okumada al, parent'a göre grupla.
  const childrenByParent = new Map<string, Record<string, unknown>[]>();
  if (sourceParentIds.length > 0) {
    const { data: cData, error: cErr } = await db
      .from(childTable)
      .select("*")
      .in(childFk, sourceParentIds);
    if (cErr) throw new TransferError("read", group);
    for (const c of (cData ?? []) as Record<string, unknown>[]) {
      const pid = String(c[childFk] ?? "");
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(c);
      childrenByParent.set(pid, arr);
    }
  }

  let requested = 0;
  let inserted = 0;
  let unitsFailed = 0;
  let unitsOk = 0;

  // 3) Her birimi (parent + child'ları) BAĞIMSIZ ele al.
  for (const parent of parents) {
    const sourceId = typeof parent.id === "string" ? parent.id : null;
    const parentCopy = buildCopyPayload(cfg, group, parent, targetTenantId, batchId, nowIso);
    if (!parentCopy) continue; // requireField boş → atla (skip, hata değil)

    const kids = sourceId ? childrenByParent.get(sourceId) ?? [] : [];
    requested += 1 + kids.length;

    let newParentId: string | null = null;
    try {
      const { data: insParent, error: insErr } = await db
        .from(cfg.table)
        .insert(parentCopy)
        .select("id")
        .single();
      if (insErr || !insParent) throw new TransferError("insert", group);
      newParentId = String((insParent as { id: unknown }).id);

      const childPayloads = kids.map((kid) =>
        buildChildPayload(cfg, kid, childFk, newParentId!, targetTenantId, batchId, nowIso),
      );
      for (let off = 0; off < childPayloads.length; off += INSERT_BATCH) {
        const batch = childPayloads.slice(off, off + INSERT_BATCH);
        const { error: cInsErr } = await db.from(childTable).insert(batch);
        if (cInsErr) throw new TransferError("insert", group);
      }

      inserted += 1 + kids.length;
      unitsOk += 1;
    } catch {
      // PER-UNIT ROLLBACK: yeni parent'ı sil → child'lar ON DELETE CASCADE ile gider.
      if (newParentId) {
        try {
          await db.from(cfg.table).delete().eq("id", newParentId);
        } catch {
          /* best-effort birim geri alma */
        }
      }
      unitsFailed += 1;
    }
  }

  // Hiç birim başarılı olmadı ama kaynakta işlenecek birim vardı → grup başarısız.
  if (unitsOk === 0 && unitsFailed > 0) throw new TransferError("insert", group);

  return { requested, inserted };
}

/**
 * Bu batch'te BELİRLİ bir hedef tabloya yazılmış kayıtların kaynak→hedef id haritası.
 * Provenance kolonlarını (origin_source_id + origin_transfer_batch_id) kullanır — ekstra
 * mapping altyapısı YOK; junction FK remap bu readback'ten beslenir.
 */
async function buildBatchIdMap(
  db: SupabaseClient,
  viaTable: string,
  targetTenantId: string,
  batchId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await db
    .from(viaTable)
    .select("id, origin_source_id")
    .eq("tenant_id", targetTenantId)
    .eq("origin_transfer_batch_id", batchId);
  if (error) return map; // harita boş → ilişkiler güvenle atlanır (dangling üretilmez)
  for (const row of (data ?? []) as { id: unknown; origin_source_id: unknown }[]) {
    if (typeof row.id === "string" && typeof row.origin_source_id === "string") {
      map.set(row.origin_source_id, row.id);
    }
  }
  return map;
}

/**
 * JUNCTION (M:N) grubu kopyalar: cupping_point_topics gibi çift-FK ara tablo.
 *
 * Her iki FK de bu batch'te oluşturulan hedef parent'lara REMAP edilir (kaynak UUID hedefte
 * kalmaz). Remap haritaları buildBatchIdMap ile parent hedef tablolarından okunur. İki
 * parent'tan biri batch'te yoksa ilişki ATLANIR (dangling/cross-tenant/source-UUID YOK) —
 * mevcut relational-child fk-remap ilkesinin M:N uzantısı. INSERT-only; duplicate hedef
 * unique (tenant_id, point_id, topic_id) ile önlenir; rollback batch-scoped (rollbackGroup).
 */
async function cloneJunctionGroup(
  db: SupabaseClient,
  group: GroupKey,
  cfg: GroupConfig,
  sourceTenantId: string,
  targetTenantId: string,
  batchId: string,
  nowIso: string,
  filterIds: string[] | undefined,
): Promise<{ requested: number; inserted: number }> {
  const { data, error } = await buildReadQuery(db, cfg, sourceTenantId, filterIds);
  if (error) throw new TransferError("read", group);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { requested: 0, inserted: 0 };

  // İki parent grubun bu batch'teki kaynak→hedef id haritaları (provenance readback).
  const [mapA, mapB] = await Promise.all([
    buildBatchIdMap(db, cfg.junctionViaTableA!, targetTenantId, batchId),
    buildBatchIdMap(db, cfg.junctionViaTableB!, targetTenantId, batchId),
  ]);

  const { payloads } = remapJunctionRows({
    rows,
    copyFields: cfg.copyFields ?? [],
    fkA: cfg.junctionFkA!,
    fkB: cfg.junctionFkB!,
    mapA,
    mapB,
    targetTenantId,
    batchId,
    nowIso,
  });

  let inserted = 0;
  for (let off = 0; off < payloads.length; off += INSERT_BATCH) {
    const batch = payloads.slice(off, off + INSERT_BATCH);
    const { error: insErr } = await db.from(cfg.table).insert(batch);
    if (insErr) throw new TransferError("insert", group);
    inserted += batch.length;
  }

  // requested = tüm kaynak ilişki; inserted = remap edilebilen (atlananlar skippedCount'a yansır).
  return { requested: rows.length, inserted };
}

/**
 * TEK grubun bu batch'e ait satırlarını geri alır (grup-scoped).
 * Paylaşılan tabloda (aromatherapy_oils) yalnız bu grubun matchValue satırlarını
 * siler → aynı batch'teki BAŞKA grubun (ör. essential) satırlarını YOK ETMEZ.
 * Relational grupta child, parent silinince ON DELETE CASCADE ile gider; yine de
 * child'ı da batch_id ile açıkça sileriz (belt-and-suspenders).
 */
async function rollbackGroup(
  db: SupabaseClient,
  cfg: GroupConfig,
  batchId: string,
): Promise<void> {
  try {
    if (cfg.kind === "relational" && cfg.childTable) {
      await db.from(cfg.childTable).delete().eq("origin_transfer_batch_id", batchId);
    }
    let del = db.from(cfg.table).delete().eq("origin_transfer_batch_id", batchId);
    if (cfg.matchColumn && cfg.matchValue != null) {
      del = del.eq(cfg.matchColumn, cfg.matchValue);
    }
    await del;
  } catch {
    /* best-effort — grup-scoped telafi-silme; kısmi başarısızlık loglanmaz */
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  // Gövde
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return jsonError(400, "Geçersiz istek türü.");
  }
  let body: {
    batchId?: unknown;
    targetUserId?: unknown;
    targetTenantId?: unknown;
    groups?: unknown;
    filterMap?: unknown;
    reason?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError(400, "Geçersiz istek gövdesi.");
  }

  const batchId = String(body.batchId ?? "").trim();
  const targetUserId = String(body.targetUserId ?? "").trim();
  const targetTenantId = String(body.targetTenantId ?? "").trim();

  if (!UUID_RE.test(batchId)) return jsonError(400, "Geçersiz aktarım kimliği.");
  if (!UUID_RE.test(targetUserId)) return jsonError(400, "Geçersiz hedef kullanıcı.");
  if (!UUID_RE.test(targetTenantId)) return jsonError(400, "Geçersiz hedef tenant.");

  // Gruplar → allowlist (dinamik tablo adı YOK)
  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return jsonError(422, "Aktarılacak en az bir veri grubu seçin.");
  }
  const groups = [...new Set(body.groups.map((g) => String(g)))];
  for (const g of groups) {
    if (!isGroupKey(g)) return jsonError(400, "Geçersiz veri grubu.");
  }
  const groupKeys = groups as GroupKey[];

  // Junction (M:N) grupları, FK remap için parent gruplarının (nokta/konu) hedef kayıtlarına
  // ihtiyaç duyar → daima EN SONA sıralanır (aynı batch'te önce parent'lar insert edilir).
  groupKeys.sort((a, b) => {
    const ra = (REGISTRY[a] as GroupConfig).kind === "junction" ? 1 : 0;
    const rb = (REGISTRY[b] as GroupConfig).kind === "junction" ? 1 : 0;
    return ra - rb;
  });

  // filterMap: yalnız string uuid dizileri, sınırlı
  const filterMap: Partial<Record<GroupKey, string[]>> = {};
  if (body.filterMap != null) {
    if (typeof body.filterMap !== "object") return jsonError(400, "Geçersiz seçim.");
    const fm = body.filterMap as Record<string, unknown>;
    for (const key of groupKeys) {
      const ids = fm[key];
      if (ids == null) continue;
      if (!Array.isArray(ids)) return jsonError(400, "Geçersiz seçim.");
      const clean = ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
      if (clean.length > MAX_IDS_PER_GROUP) return jsonError(413, "Çok fazla kayıt seçildi.");
      filterMap[key] = [...new Set(clean)];
    }
  }

  // Kaynak tenant SUNUCUDA çözülür (istemci gövdesine güvenilmez) — adminin kendi tenant'ı.
  const { data: adminRow } = await db
    .from("users")
    .select("id, role, tenant_id")
    .eq("id", adminId)
    .maybeSingle();
  const sourceTenantId = String((adminRow as { tenant_id?: unknown } | null)?.tenant_id ?? "").trim();
  if (!UUID_RE.test(sourceTenantId)) {
    return jsonError(400, "Admin kaynak tenant bulunamadı.");
  }

  // Hedef doğrulama
  const { data: targetRow } = await db
    .from("users")
    .select("id, role, active, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();
  const target = targetRow as
    | { id: string; role?: unknown; active?: unknown; tenant_id?: unknown }
    | null;
  if (!target) return jsonError(404, "Hedef kullanıcı bulunamadı.");
  if (String(target.role ?? "") !== "expert") {
    return jsonError(403, "Aktarım hedefi yalnız uzman olabilir.");
  }
  if (target.active !== true) return jsonError(422, "Hedef hesap aktif değil.");
  if (String(target.tenant_id ?? "").trim() !== targetTenantId) {
    return jsonError(400, "Hedef tenant kullanıcıyla eşleşmiyor.");
  }
  if (targetTenantId === sourceTenantId) {
    return jsonError(400, "Kaynak ve hedef tenant aynı olamaz.");
  }
  if (targetTenantId === ADMIN_LIBRARY_TENANT_ID) {
    return jsonError(400, "Hedef, admin kütüphane tenant'ı olamaz.");
  }

  // ── İdempotency claim: batch_id PK insert atomiktir ────────────────────────
  const { error: claimErr } = await db
    .from("admin_library_transfer_batches")
    .insert({
      batch_id: batchId,
      actor_admin_id: adminId,
      target_user_id: targetUserId,
      source_tenant_id: sourceTenantId,
      target_tenant_id: targetTenantId,
      status: "processing",
    });

  if (claimErr) {
    // Duplicate → bu batch daha önce işlendi/işleniyor: replay (kopya üretme).
    const { data: prior } = await db
      .from("admin_library_transfer_batches")
      .select("counts, requested_count, inserted_count, status")
      .eq("batch_id", batchId)
      .maybeSingle();

    if (prior) {
      try {
        await writeAdminAudit(db, {
          actorAdminId: adminId,
          action: "library_transfer_retried",
          targetUserId,
          result: { batch_id: batchId, status: String((prior as { status?: unknown }).status ?? "") },
          context: { source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId },
        });
      } catch (e) {
        if (!(e instanceof AdminAuditError)) throw e;
      }
      const p = prior as { counts?: unknown; requested_count?: unknown; inserted_count?: unknown };
      const priorCounts = (p.counts ?? {}) as Record<string, number>;
      // Replay: bölüm outcome'larını sayımlardan en iyi çabayla yeniden kur.
      const sections: SectionOutcome[] = groupKeys.map((g) => {
        const ins = Number(priorCounts[g] ?? 0);
        return { group: g, status: ins > 0 ? "success" : "empty", requested: ins, inserted: ins };
      });
      return NextResponse.json({
        ok: true,
        replayed: true,
        batchId,
        counts: priorCounts,
        sections,
        selectedSectionCount: groupKeys.length,
        successfulSectionCount: sections.filter((s) => s.status !== "failed").length,
        failedSectionCount: 0,
        requestedCount: Number(p.requested_count ?? 0),
        insertedCount: Number(p.inserted_count ?? 0),
      });
    }
    // Claim başka bir nedenle patladıysa güvenli genel hata.
    return jsonError(409, "Aktarım kimliği çakışması.");
  }

  // ── İşle — HER GRUP BAĞIMSIZ (bölüm-bazında atomik + kısmi başarı) ─────────
  const counts: Record<string, number> = {};
  const sections: SectionOutcome[] = [];
  let requestedTotal = 0;
  let insertedTotal = 0;
  const nowIso = new Date().toISOString();

  for (const group of groupKeys) {
    const cfg: GroupConfig = REGISTRY[group];
    try {
      const result =
        cfg.kind === "relational"
          ? await cloneRelationalGroup(db, group, cfg, sourceTenantId, targetTenantId, batchId, nowIso, filterMap[group])
          : cfg.kind === "junction"
            ? await cloneJunctionGroup(db, group, cfg, sourceTenantId, targetTenantId, batchId, nowIso, filterMap[group])
            : await cloneFlatGroup(db, group, cfg, sourceTenantId, targetTenantId, batchId, nowIso, filterMap[group]);

      counts[group] = result.inserted;
      requestedTotal += result.requested;
      insertedTotal += result.inserted;
      sections.push({
        group,
        status: result.inserted > 0 ? "success" : "empty",
        requested: result.requested,
        inserted: result.inserted,
      });
    } catch (err) {
      // YALNIZ bu grubun batch satırlarını geri al; diğer grupları etkileme.
      await rollbackGroup(db, cfg, batchId);
      counts[group] = 0;
      sections.push({
        group,
        status: "failed",
        requested: 0,
        inserted: 0,
        errorCode: err instanceof TransferError ? `${err.stage}_failed` : "unknown_error",
      });
    }
  }

  const failedSectionCount = sections.filter((s) => s.status === "failed").length;
  const successfulSectionCount = sections.filter((s) => s.status !== "failed").length;

  // Ledger özetini tamamla (status: hiç kayıt yoksa failed, aksi halde completed).
  const ledgerStatus = insertedTotal > 0 ? "completed" : "failed";
  try {
    await db
      .from("admin_library_transfer_batches")
      .update({
        status: ledgerStatus,
        requested_count: requestedTotal,
        inserted_count: insertedTotal,
        counts,
      })
      .eq("batch_id", batchId);
  } catch {
    /* veri kalıcı; ledger özet güncellemesi best-effort */
  }

  // Audit — kısmi başarı da "completed" (≥1 kayıt) sayılır; hiç yoksa "failed".
  try {
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: insertedTotal > 0 ? "library_transfer_completed" : "library_transfer_failed",
      targetUserId,
      result: {
        batch_id: batchId,
        requested_count: requestedTotal,
        inserted_count: insertedTotal,
        counts,
        failed_sections: sections.filter((s) => s.status === "failed").map((s) => s.group),
      },
      context: { source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId },
    });
  } catch (e) {
    if (!(e instanceof AdminAuditError)) throw e;
  }

  return NextResponse.json({
    ok: true,
    batchId,
    counts,
    sections,
    selectedSectionCount: groupKeys.length,
    successfulSectionCount,
    failedSectionCount,
    requestedCount: requestedTotal,
    insertedCount: insertedTotal,
    skippedCount: Math.max(0, requestedTotal - insertedTotal),
  });
}

/**
 * lib/backup/registry.ts — Yedek / geri yükleme / dışa aktarım TABLO REGISTRY'si (TEK KAYNAK).
 *
 * SAF (IO/env/node import YOK) → hem sunucu route'ları hem Ayarlar sayfası import eder.
 *
 * KURAL: prod `public` şemadaki HER tablo burada sınıflandırılmıştır (`.hardening/prod-tables.md`,
 * migration'lardaki CREATE TABLE ve koddaki `.from()` çağrıları). Sınıflandırılmamış tablo
 * `scripts/final-hardening/backup.harness.ts` tarafından FAIL edilir.
 *
 * Kolon izin listesi (restore) BURADA DEĞİL: `lib/backup/columns.ts` (sunucu) migration şemasından
 * (`schema.generated.ts`) türetir; şeması repo dışında olan legacy tablolar için çalışma anında
 * canlı kolon doğrulaması yapılır. Generated / trigger-yönetimli kolonlar HER İKİ yolda da hariçtir.
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccessCore";
import type { BackupClass, FkParent, RegistryEntry, StorageRef, TenantScope } from "./types";
import { SYSTEM_NUTRITION_TENANT_ID } from "@/lib/beslenme/systemTenant";

type Opts = Partial<Omit<RegistryEntry, "table" | "module" | "class" | "label">> & { label?: string };

function entry(table: string, module: ModuleGateKey | null, cls: BackupClass, label: string, o: Opts = {}): RegistryEntry {
  const pk = o.pk ?? ["id"];
  const tenantScope: TenantScope = o.tenantScope ?? "direct";
  return {
    table,
    module,
    class: cls,
    reason: o.reason,
    tenantScope,
    pk,
    conflictTarget: o.conflictTarget ?? pk,
    orderBy: o.orderBy ?? pk.filter((c) => c !== "tenant_id").concat(pk.every((c) => c === "tenant_id") ? ["tenant_id"] : []),
    fkParents: o.fkParents ?? [],
    storageRefs: o.storageRefs ?? [],
    singleton: o.singleton,
    exportOnly: o.exportOnly,
    naturalKey: o.naturalKey,
    selfRef: o.selfRef,
    userColumns: o.userColumns ?? ["user_id"],
    generatedColumns: o.generatedColumns ?? [],
    pageSize: o.pageSize,
    label,
  };
}

const fk = (column: string, table: string, optional = false): FkParent => (optional ? { column, table, optional } : { column, table });
const clientFk = fk("client_id", "clients");
const st = (column: string, ...prefixes: StorageRef["prefixes"][number][]): StorageRef => ({ column, prefixes });

/** Yedek dışı tablo kısayolu. */
function off(table: string, cls: Exclude<BackupClass, "backup" | "child_of">, reason: string, tenantScope: TenantScope = "direct"): RegistryEntry {
  return entry(table, null, cls, table, { reason, tenantScope });
}

const SEARCH_NORM = ["search_norm"] as const;

export const BACKUP_REGISTRY: readonly RegistryEntry[] = [
  // ── Danışan Yolculuğu (clients) ───────────────────────────────────────────
  // create_request_id: yalnız çift-gönderim idempotency anahtarı (migration 20270129000300) — geri
  // yüklemede taşınmaz (deny listesi generatedColumns üzerinden uygulanır).
  entry("clients", "clients", "backup", "Danışanlar", { generatedColumns: ["create_request_id"] }),
  entry("client_notes", "clients", "backup", "Danışan Notları", { fkParents: [clientFk], naturalKey: "client_id" }),
  entry("client_sessions", "clients", "backup", "Seanslar", { fkParents: [clientFk] }),
  entry("client_homeworks", "clients", "backup", "Ödevler", { fkParents: [clientFk] }),
  entry("client_analyses", "clients", "backup", "Analizler", { fkParents: [clientFk] }),
  entry("client_stones", "clients", "backup", "Taş Eşleşmeleri", { fkParents: [clientFk] }),
  entry("client_stone_photos", "clients", "backup", "Taş Fotoğrafları (kayıt)", {
    fkParents: [clientFk, fk("stone_id", "client_stones")],
    storageRefs: [st("file_path", "tenant"), st("image_url", "tenant")],
  }),
  entry("client_charges", "clients", "backup", "Ücretlendirme", { fkParents: [clientFk] }),
  entry("client_combinations", "clients", "backup", "Danışan Kombinasyonları", { fkParents: [clientFk] }),
  entry("client_chakra_records", "clients", "backup", "Çakra Kayıtları", { fkParents: [clientFk] }),
  entry("client_planet_records", "clients", "backup", "Gezegen Kayıtları", { fkParents: [clientFk] }),
  entry("appointments", "appointments", "backup", "Randevular", { fkParents: [clientFk] }),
  entry("client_consents", "clients", "backup", "KVKK Onam Kayıtları", {
    fkParents: [clientFk],
    userColumns: ["recorded_by_user_id"],
  }),
  // Anamnez V1 (migration 20270202000000). Tamamlanmış satırlar DB'de kilitli; restore
  // ON CONFLICT DO NOTHING ile yalnız INSERT eder (kilit tetiklenmez). PDF dosyaları yedeğe
  // girmez (files_included:false) — yalnız metadata; yol tenant önekiyle doğrulanır.
  entry("client_anamneses", "clients", "backup", "Anamnez Kayıtları", {
    fkParents: [clientFk],
    selfRef: "based_on_anamnesis_id",
    userColumns: ["created_by_user_id", "updated_by_user_id", "completed_by_user_id"],
    generatedColumns: ["create_request_id"],
  }),
  entry("client_anamnesis_attachments", "clients", "backup", "Anamnez Belgeleri (kayıt)", {
    fkParents: [clientFk, fk("anamnesis_id", "client_anamneses")],
    storageRefs: [st("storage_path", "tenant")],
    userColumns: ["uploaded_by_user_id"],
  }),

  // ── Numeroloji ────────────────────────────────────────────────────────────
  entry("numerology_records", "numerology", "backup", "Analiz Kayıtları"),
  entry("numerology_knowledge_records", "numerology", "backup", "Bilgi Bankası"),
  entry("numerology_stone_assignments", "numerology", "backup", "Taş Atamaları"),
  entry("numerology_sources", "numerology", "backup", "Kaynaklar"),
  entry("numerology_record_sources", "numerology", "backup", "Kayıt–Kaynak Bağları", {
    fkParents: [fk("knowledge_record_id", "numerology_knowledge_records"), fk("source_id", "numerology_sources")],
  }),
  entry("numerology_knowledge_source_entries", "numerology", "backup", "Kaynak Metinleri", {
    fkParents: [fk("knowledge_record_id", "numerology_knowledge_records"), fk("source_id", "numerology_sources")],
  }),

  // ── Human Design ──────────────────────────────────────────────────────────
  entry("human_design_clients", "human_design", "backup", "HD Danışanları", {
    storageRefs: [st("chart_image_url", "tenant")],
  }),
  entry("human_design_charts", "human_design", "backup", "Haritalar", {
    fkParents: [fk("client_id", "human_design_clients", true)],
    storageRefs: [st("chart_image_url", "tenant")],
  }),
  entry("human_design_reports", "human_design", "backup", "Raporlar", {
    fkParents: [fk("client_id", "human_design_clients", true), fk("chart_id", "human_design_charts", true)],
    storageRefs: [st("report_file_url", "tenant")],
  }),
  entry("human_design_knowledge_records", "human_design", "backup", "Bilgi Bankası"),
  entry("human_design_knowledge_sources", "human_design", "backup", "Bilgi Bankası Kaynakları", {
    fkParents: [fk("record_id", "human_design_knowledge_records")],
  }),
  entry("human_design_knowledge", "human_design", "backup", "HD Bilgi Kayıtları (masaüstü aktarımı)"),
  entry("hd_consultation_sessions", "human_design", "backup", "Danışmanlık Oturumları"),
  entry("hd_client_reports", "human_design", "backup", "Danışana Teslim Edilen Raporlar", {
    fkParents: [fk("session_id", "hd_consultation_sessions", true)],
  }),
  entry("hd_consultation_expert_notes", "human_design", "backup", "Danışmanlık Uzman Notları"),

  // ── Doğaltaş (stones) ─────────────────────────────────────────────────────
  entry("stones", "stones", "backup", "Taşlar", { storageRefs: [st("images", "catalog_tenant")] }),
  entry("minerals", "stones", "backup", "Mineraller"),
  entry("combinations", "stones", "backup", "Kombinasyonlar"),
  entry("combination_stones", "stones", "backup", "Kombinasyon Taşları", {
    fkParents: [fk("combination_id", "combinations"), fk("stone_id", "stones", true)],
  }),
  entry("stone_knowledge_articles", "stones", "backup", "Taş Bilgi Kütüphanesi"),
  entry("stone_exclusions", "stones", "backup", "Gizlenen Taşlar", {
    pk: ["tenant_id", "stone_id"],
  }),
  entry("dogaltas_inventory", "stones", "backup", "Doğaltaş Stok"),

  // ── Ürün & Stok ───────────────────────────────────────────────────────────
  entry("oil_inventory", "stok", "backup", "Yağ Stoku", { storageRefs: [st("photos", "tenant")], pageSize: 50 }),
  entry("soap_cream_inventory", "stok", "backup", "Sabun / Krem Stoku", { storageRefs: [st("photos", "tenant")], pageSize: 50 }),
  entry("accessory_inventory", "stok", "backup", "Aksesuar Stoku", { storageRefs: [st("photos", "tenant")], pageSize: 50 }),
  entry("other_inventory", "stok", "backup", "Diğer Ürün Stoku", { storageRefs: [st("photos", "tenant")], pageSize: 50 }),
  entry("inventory_sales", "stok", "backup", "Satışlar", { userColumns: ["created_by", "cancelled_by"] }),
  entry("inventory_sale_items", "stok", "backup", "Satış Kalemleri", { fkParents: [fk("sale_id", "inventory_sales")] }),

  // ── Kişisel Arşiv ─────────────────────────────────────────────────────────
  entry("personal_archives", "personal_archive", "backup", "Arşivler"),
  entry("personal_archive_files", "personal_archive", "backup", "Arşiv Dosya Kayıtları", {
    fkParents: [fk("archive_id", "personal_archives")],
    storageRefs: [st("file_path", "tenant"), st("file_url", "tenant")],
  }),

  // ── Biyoenerji (energy_body) ──────────────────────────────────────────────
  entry("bioenergy_sessions", "energy_body", "backup", "Seans Kütüphanesi"),
  entry("bioenergy_symbols", "energy_body", "backup", "Sembol Dili"),
  entry("bioenergy_imaginations", "energy_body", "backup", "İmajinasyonlar"),
  entry("bioenergy_chakras", "energy_body", "backup", "Çakralar"),
  entry("bioenergy_chakra_blocks", "energy_body", "backup", "Çakra İçerik Blokları", {
    fkParents: [fk("chakra_id", "bioenergy_chakras")],
  }),
  entry("bioenergy_energy_bodies", "energy_body", "backup", "Enerji Bedenleri"),
  entry("bioenergy_subconscious_causes", "energy_body", "backup", "Bilinçaltı Nedenleri"),

  // ── Refleksoloji ──────────────────────────────────────────────────────────
  entry("reflexology_protocols", "reflexology", "backup", "Protokoller"),
  entry("reflexology_notes", "reflexology", "backup", "Klinik Notlar"),
  entry("reflexology_atlas", "reflexology", "backup", "Atlas", { pk: ["tenant_id"], singleton: true }),

  // ── Aromaterapi ───────────────────────────────────────────────────────────
  entry("aromatherapy_oils", "aromatherapy", "backup", "Yağ Kayıtları", {
    generatedColumns: ["search_norm", "identity_norm"],
    storageRefs: [st("images", "tenant")],
  }),
  entry("aromatherapy_blends", "aromatherapy", "backup", "Karışımlar / Formüller"),
  entry("aromatherapy_knowledge_articles", "aromatherapy", "backup", "Bilgi Bankası"),
  entry("aromatherapy_reference_sheets", "aromatherapy", "backup", "Referans Sayfaları"),
  entry("aromatherapy_reference_rows", "aromatherapy", "child_of", "Referans Satırları", {
    tenantScope: { parent: "aromatherapy_reference_sheets", fk: "sheet_id" },
    fkParents: [fk("sheet_id", "aromatherapy_reference_sheets")],
    userColumns: [],
  }),
  entry("aromatherapy_sources", "aromatherapy", "backup", "Kaynaklar", { generatedColumns: SEARCH_NORM }),
  entry("aromatherapy_plant_taxa", "aromatherapy", "backup", "Bitki Taksonları", {
    generatedColumns: ["canonical_name", "search_norm"],
  }),
  entry("aromatherapy_preparations", "aromatherapy", "backup", "Preparatlar", {
    generatedColumns: SEARCH_NORM,
    fkParents: [fk("taxon_id", "aromatherapy_plant_taxa")],
  }),
  entry("aromatherapy_source_passages", "aromatherapy", "backup", "Kaynak Pasajları", {
    generatedColumns: SEARCH_NORM,
    fkParents: [fk("source_id", "aromatherapy_sources")],
    selfRef: "supersedes_passage_id",
  }),
  entry("aromatherapy_passage_translations", "aromatherapy", "backup", "Pasaj Çevirileri", {
    fkParents: [fk("passage_id", "aromatherapy_source_passages")],
  }),
  entry("aromatherapy_passage_editorial_note_series", "aromatherapy", "backup", "Editoryal Not Serileri", {
    fkParents: [fk("passage_id", "aromatherapy_source_passages"), fk("translation_id", "aromatherapy_passage_translations")],
  }),
  entry("aromatherapy_passage_editorial_notes", "aromatherapy", "backup", "Editoryal Notlar", {
    fkParents: [fk("note_series_id", "aromatherapy_passage_editorial_note_series")],
  }),
  entry("aromatherapy_claims", "aromatherapy", "backup", "İddialar", {
    generatedColumns: SEARCH_NORM,
    fkParents: [fk("preparation_id", "aromatherapy_preparations")],
  }),
  entry("aromatherapy_claim_sources", "aromatherapy", "backup", "İddia Kaynakları", {
    fkParents: [fk("claim_id", "aromatherapy_claims"), fk("source_id", "aromatherapy_sources")],
  }),
  entry("aromatherapy_claim_relations", "aromatherapy", "backup", "İddia İlişkileri", {
    fkParents: [fk("a_claim_id", "aromatherapy_claims"), fk("b_claim_id", "aromatherapy_claims")],
  }),
  entry("aromatherapy_claim_routes", "aromatherapy", "backup", "İddia Uygulama Yolları", {
    fkParents: [fk("claim_id", "aromatherapy_claims")],
  }),
  entry("aromatherapy_claim_populations", "aromatherapy", "backup", "İddia Popülasyonları", {
    fkParents: [fk("claim_id", "aromatherapy_claims")],
  }),
  entry("aromatherapy_claim_passages", "aromatherapy", "backup", "İddia Pasajları", {
    fkParents: [fk("claim_id", "aromatherapy_claims"), fk("passage_id", "aromatherapy_source_passages")],
  }),
  entry("aromatherapy_glossary_terms", "aromatherapy", "backup", "Sözlük Terimleri", { generatedColumns: SEARCH_NORM }),
  entry("aromatherapy_glossary_categories", "aromatherapy", "backup", "Sözlük Kategorileri", {
    selfRef: "parent_category_id",
  }),
  entry("aromatherapy_glossary_tags", "aromatherapy", "backup", "Sözlük Etiketleri"),
  entry("aromatherapy_glossary_term_categories", "aromatherapy", "backup", "Terim–Kategori Bağları", {
    fkParents: [fk("glossary_term_id", "aromatherapy_glossary_terms"), fk("category_id", "aromatherapy_glossary_categories")],
  }),
  entry("aromatherapy_glossary_term_tags", "aromatherapy", "backup", "Terim–Etiket Bağları", {
    fkParents: [fk("glossary_term_id", "aromatherapy_glossary_terms"), fk("tag_id", "aromatherapy_glossary_tags")],
  }),
  entry("aromatherapy_glossary_term_labels", "aromatherapy", "backup", "Terim Etiket Adları", {
    fkParents: [fk("glossary_term_id", "aromatherapy_glossary_terms")],
  }),
  entry("aromatherapy_glossary_term_passages", "aromatherapy", "backup", "Terim Pasajları", {
    fkParents: [fk("glossary_term_id", "aromatherapy_glossary_terms"), fk("passage_id", "aromatherapy_source_passages")],
  }),
  entry("aromatherapy_preparation_method_series", "aromatherapy", "backup", "Hazırlama Yöntemi Serileri", {
    fkParents: [
      fk("preparation_id", "aromatherapy_preparations"),
      fk("source_id", "aromatherapy_sources"),
      fk("passage_id", "aromatherapy_source_passages"),
    ],
  }),
  entry("aromatherapy_preparation_method_revisions", "aromatherapy", "backup", "Hazırlama Yöntemi Revizyonları", {
    fkParents: [fk("series_id", "aromatherapy_preparation_method_series")],
  }),

  // ── Şifa Rehberi ──────────────────────────────────────────────────────────
  entry("healing_guides", "sifa_rehberi", "backup", "Rehber Kayıtları", { storageRefs: [st("images", "healing_tenant")] }),
  entry("healing_guide_sections", "sifa_rehberi", "child_of", "Rehber Bölümleri", {
    tenantScope: { parent: "healing_guides", fk: "guide_id" },
    fkParents: [fk("guide_id", "healing_guides")],
    storageRefs: [st("images", "healing_tenant")],
    userColumns: [],
  }),

  // ── Kupa & Hacamat (cupping) ──────────────────────────────────────────────
  entry("cupping_points", "cupping", "backup", "Noktalar"),
  entry("cupping_point_placements", "cupping", "backup", "Nokta Yerleşimleri", { fkParents: [fk("point_id", "cupping_points")] }),
  entry("cupping_topics", "cupping", "backup", "Konular"),
  entry("cupping_point_topics", "cupping", "backup", "Nokta–Konu Bağları", {
    fkParents: [fk("point_id", "cupping_points"), fk("topic_id", "cupping_topics")],
  }),
  entry("cupping_techniques", "cupping", "backup", "Teknikler"),
  entry("cupping_knowledge_records", "cupping", "backup", "Bilgi Kayıtları"),
  entry("cupping_sources", "cupping", "backup", "Kaynaklar"),
  entry("cupping_safety_notes", "cupping", "backup", "Güvenlik Notları"),
  entry("cupping_topic_notes", "cupping", "backup", "Konu Notları", { fkParents: [fk("topic_id", "cupping_topics")] }),
  entry("cupping_topic_note_points", "cupping", "backup", "Konu Notu Noktaları", {
    fkParents: [fk("topic_note_id", "cupping_topic_notes"), fk("point_id", "cupping_points")],
  }),
  entry("cupping_point_sources", "cupping", "backup", "Nokta Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("point_id", "cupping_points")],
  }),
  entry("cupping_topic_sources", "cupping", "backup", "Konu Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("topic_id", "cupping_topics")],
  }),
  entry("cupping_point_topic_sources", "cupping", "backup", "Nokta–Konu Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("point_topic_id", "cupping_point_topics")],
  }),
  entry("cupping_technique_sources", "cupping", "backup", "Teknik Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("technique_id", "cupping_techniques")],
  }),
  entry("cupping_knowledge_sources", "cupping", "backup", "Bilgi Kaydı Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("knowledge_id", "cupping_knowledge_records")],
  }),
  entry("cupping_safety_sources", "cupping", "backup", "Güvenlik Notu Kaynakları", {
    fkParents: [fk("source_id", "cupping_sources"), fk("safety_id", "cupping_safety_notes")],
  }),
  entry("cupping_technique_safety", "cupping", "backup", "Teknik–Güvenlik Bağları", {
    fkParents: [fk("technique_id", "cupping_techniques"), fk("safety_id", "cupping_safety_notes")],
  }),
  entry("cupping_protocols", "cupping", "backup", "Protokoller"),
  entry("cupping_protocol_points", "cupping", "backup", "Protokol Noktaları", {
    fkParents: [fk("protocol_id", "cupping_protocols"), fk("point_id", "cupping_points")],
  }),
  entry("cupping_protocol_techniques", "cupping", "backup", "Protokol Teknikleri", {
    fkParents: [fk("protocol_id", "cupping_protocols"), fk("technique_id", "cupping_techniques")],
  }),
  entry("cupping_protocol_safety", "cupping", "backup", "Protokol Güvenlik Notları", {
    fkParents: [fk("protocol_id", "cupping_protocols"), fk("safety_id", "cupping_safety_notes")],
  }),
  entry("cupping_protocol_steps", "cupping", "backup", "Protokol Adımları", {
    fkParents: [fk("protocol_id", "cupping_protocols")],
  }),
  entry("cupping_protocol_entries", "cupping", "backup", "Protokol Girdileri", {
    fkParents: [fk("protocol_id", "cupping_protocols"), fk("source_id", "cupping_sources")],
  }),
  entry("cupping_protocol_entry_points", "cupping", "backup", "Protokol Girdi Noktaları", {
    fkParents: [fk("protocol_entry_id", "cupping_protocol_entries"), fk("point_id", "cupping_points")],
  }),
  entry("cupping_protocol_sources", "cupping", "backup", "Protokol Kaynakları", {
    fkParents: [fk("protocol_id", "cupping_protocols"), fk("source_id", "cupping_sources")],
  }),
  entry("cupping_advice_templates", "cupping", "backup", "Öneri Şablonları"),
  entry("cupping_calendar_plans", "cupping", "backup", "Yıllık Takvim Planları", {
    fkParents: [fk("advice_template_id", "cupping_advice_templates", true)],
  }),
  entry("cupping_calendar_plan_days", "cupping", "backup", "Takvim Plan Günleri", {
    fkParents: [fk("plan_id", "cupping_calendar_plans")],
  }),
  entry("cupping_client_advice", "cupping", "backup", "Danışan Önerileri", {
    fkParents: [clientFk, fk("source_template_id", "cupping_advice_templates", true)],
  }),

  // ── Kozmik Ajanda — Hacamat kuralları (tenant'a özel kopya) ───────────────
  entry("hacamat_rules", "cosmic_calendar", "backup", "Hacamat Kuralları"),

  // ── Beslenme ──────────────────────────────────────────────────────────────
  entry("nutrition_sources", "beslenme", "backup", "Kaynaklar", { generatedColumns: ["search_tsv"] }),
  // origin_food_id: uzmanın KİŞİSEL KOPYASI → global SİSTEM besini (yedeğe girmeyen, sabit tenant).
  // Restore'da SİSTEM tenant'ında aranır; sistem besini artık yoksa bağ NULL (DB: ON DELETE SET NULL).
  entry("nutrition_foods", "beslenme", "backup", "Besinler (uzmana ait)", {
    generatedColumns: ["search_tsv"],
    fkParents: [{ column: "origin_food_id", table: "nutrition_foods", optional: true, parentTenantId: SYSTEM_NUTRITION_TENANT_ID }],
  }),
  // Uzmanın çalışma alanından kaldırdığı SİSTEM besinleri (tenant bazlı gizleme; global satır korunur).
  entry("nutrition_food_tenant_hidden", "beslenme", "backup", "Kaldırılan Sistem Besinleri", {
    pk: ["tenant_id", "food_id"],
    fkParents: [{ column: "food_id", table: "nutrition_foods", parentTenantId: SYSTEM_NUTRITION_TENANT_ID }],
  }),
  entry("nutrition_food_sources", "beslenme", "backup", "Besin Kaynakları", {
    fkParents: [fk("food_id", "nutrition_foods"), fk("source_id", "nutrition_sources")],
  }),
  entry("nutrition_food_nutrients", "beslenme", "backup", "Besin Değerleri", {
    fkParents: [fk("food_id", "nutrition_foods"), fk("source_id", "nutrition_sources")],
  }),
  entry("nutrition_food_portions", "beslenme", "backup", "Porsiyonlar", {
    fkParents: [fk("food_id", "nutrition_foods"), fk("source_id", "nutrition_sources")],
  }),
  entry("nutrition_food_external_refs", "beslenme", "backup", "Dış Kaynak Referansları", {
    fkParents: [fk("food_id", "nutrition_foods")],
  }),
  entry("nutrition_food_traditional", "beslenme", "backup", "Geleneksel Nitelikler", {
    fkParents: [fk("food_id", "nutrition_foods"), fk("source_id", "nutrition_sources")],
  }),
  entry("nutrition_topics", "beslenme", "backup", "Konular", { generatedColumns: ["search_tsv"] }),
  entry("nutrition_topic_sections", "beslenme", "backup", "Konu Bölümleri", { fkParents: [fk("topic_id", "nutrition_topics")] }),
  entry("nutrition_topic_foods", "beslenme", "backup", "Konu Besinleri", {
    fkParents: [fk("topic_id", "nutrition_topics"), fk("food_id", "nutrition_foods")],
  }),
  entry("nutrition_topic_sources", "beslenme", "backup", "Konu Kaynakları", {
    fkParents: [fk("topic_id", "nutrition_topics"), fk("source_id", "nutrition_sources")],
  }),
  entry("nutrition_plans", "beslenme", "backup", "Planlar"),
  entry("nutrition_plan_days", "beslenme", "backup", "Plan Günleri", { fkParents: [fk("plan_id", "nutrition_plans")] }),
  entry("nutrition_plan_meals", "beslenme", "backup", "Plan Öğünleri", {
    fkParents: [fk("plan_id", "nutrition_plans"), fk("plan_day_id", "nutrition_plan_days")],
  }),
  entry("nutrition_plan_items", "beslenme", "backup", "Plan Kalemleri", {
    fkParents: [fk("plan_id", "nutrition_plans"), fk("meal_id", "nutrition_plan_meals")],
  }),
  entry("nutrition_plan_item_nutrients", "beslenme", "backup", "Plan Kalemi Besin Değerleri", {
    fkParents: [fk("item_id", "nutrition_plan_items")],
  }),
  entry("nutrition_plan_clients", "beslenme", "backup", "Plan–Danışan Atamaları", {
    pk: ["tenant_id", "plan_family_id"],
    fkParents: [clientFk],
    userColumns: ["assigned_by"],
  }),
  entry("nutrition_templates", "beslenme", "backup", "Şablonlar"),
  entry("nutrition_template_meals", "beslenme", "backup", "Şablon Öğünleri", { fkParents: [fk("template_id", "nutrition_templates")] }),
  entry("nutrition_template_items", "beslenme", "backup", "Şablon Kalemleri", {
    fkParents: [fk("template_id", "nutrition_templates"), fk("template_meal_id", "nutrition_template_meals")],
  }),
  entry("nutrition_template_item_nutrients", "beslenme", "backup", "Şablon Kalemi Besin Değerleri", {
    fkParents: [fk("item_id", "nutrition_template_items")],
  }),
  entry("nutrition_client_profiles", "beslenme", "backup", "Danışan Beslenme Profilleri", { fkParents: [clientFk] }),
  entry("nutrition_client_measurements", "beslenme", "backup", "Danışan Ölçümleri", { fkParents: [clientFk] }),
  entry("nutrition_client_allergens", "beslenme", "backup", "Danışan Alerjenleri", { fkParents: [clientFk] }),
  entry("nutrition_client_food_preferences", "beslenme", "backup", "Danışan Besin Tercihleri", { fkParents: [clientFk] }),

  // ── Video eğitim kayıtları (kullanıcının kaydettiği transkriptler) ─────────
  entry("video_training_records", "video_ceviri", "backup", "Video Eğitim Kayıtları", {
    fkParents: [fk("job_id", "video_transcription_jobs", true)],
    storageRefs: [st("word_path", "tenant"), st("pdf_path", "tenant")],
  }),

  // ── Genel (modülden bağımsız) ─────────────────────────────────────────────
  entry("support_messages", null, "backup", "Destek Mesajları", {
    exportOnly: true,
    reason: "Admin ile yazışma kaydı — yalnız dışa aktarılır, geri yüklenmez.",
  }),
  entry("user_location_prefs", null, "backup", "Varsayılan Konum Tercihi", { naturalKey: "user_id" }),

  // ── Yedek DIŞI: türetilmiş ────────────────────────────────────────────────
  off("yasam_hafizasi_index", "derived", "Yaşam Hafızası arama indeksi — kaynak kayıtlardan yeniden üretilir."),
  off("yasam_hafizasi_outbox", "derived", "Yaşam Hafızası olay kuyruğu."),
  off("yasam_hafizasi_client_index", "derived", "Danışan Hafızası indeksi — kaynak kayıtlardan yeniden üretilir."),
  off("yasam_hafizasi_client_outbox", "derived", "Danışan Hafızası olay kuyruğu."),
  off("yasam_hafizasi_report_snapshots", "derived", "Rapor anlık görüntüsü — kaynak kayıtlardan yeniden seçilir."),
  off("expert_storage_daily", "derived", "Depolama kullanım ölçümü."),

  // ── Yedek DIŞI: sistem ────────────────────────────────────────────────────
  off("users", "system", "Kullanıcı hesabı / yetki (parola özeti dahil) — yedeğe girmez.", "none"),
  off("tenants", "system", "Tenant kaydı.", "none"),
  off("user_sessions", "system", "Oturum kayıtları.", "none"),
  off("auth_login_throttle", "system", "Giriş deneme sınırlaması (güvenlik).", "none"),
  off("session_limit_exceptions", "system", "Geçici test hesabı oturum-limiti istisnası (TEMPORARY — satış sonrası kaldırılacak).", "none"),
  off("auth_rate_limit_events", "system", "Global DB tabanlı istek hız sınırı olayları (güvenlik).", "none"),
  off("security_events", "system", "Güvenlik olay günlüğü.", "none"),
  off("appointment_notification_states", "system", "Randevu bildirimi görünürlük tercihi (Tamamlandı/Tekrar gösterme) — kullanıcı arayüz durumu.", "none"),
  off("user_payment_history", "system", "Ödeme geçmişi (yönetici kaydı).", "none"),
  off("admin_audit_log", "system", "Yönetici denetim günlüğü.", "none"),
  off("admin_library_transfer_batches", "system", "Yönetici kütüphane aktarım kayıtları.", "none"),
  off("provisioning_events", "system", "Hesap açma olayları.", "none"),
  off("expert_usage_events", "system", "Kullanım istatistiği olayları."),
  off("usage_visits", "system", "Usage360 kullanım ziyaretleri (telemetri; 180 gün retention)."),
  off("usage_daily", "derived", "Usage360 günlük toplam rollup (telemetri)."),
  off("usage_daily_modules", "derived", "Usage360 günlük modül rollup (telemetri)."),
  off("yasam_hafizasi_flags", "system", "Yaşam Hafızası özellik bayrakları (yönetici)."),
  off("yh_source_activation", "system", "Yaşam Hafızası kaynak aktivasyonu (yönetici).", "none"),
  off("yh_archive_classifications", "system", "Yaşam Hafızası arşiv sınıflandırma meta verisi."),
  off("yh_document_sources", "system", "Yaşam Hafızası belge korpusu (aktivasyon kapalı)."),
  off("yh_document_passages", "system", "Yaşam Hafızası belge pasajları (aktivasyon kapalı)."),
  off("yh_topic_dictionary", "system", "Yaşam Hafızası konu sözlüğü (yönetici)."),
  off("hd_consultation_entitlements", "system", "Yönetici tarafından verilen HD danışmanlık yetkileri — yedekten geri yüklenemez."),
  off("hacamat_rules_init", "system", "Hacamat kuralı başlangıç işareti (sistem)."),
  off("aromatherapy_claim_audit_events", "system", "Aromaterapi iddia denetim günlüğü."),
  off("aromatherapy_content_audit_events", "system", "Aromaterapi içerik denetim günlüğü."),
  off("aromatherapy_content_delete_tombstones", "system", "Aromaterapi silme kayıtları."),
  off("hd_content_audit_events", "system", "HD içerik denetim günlüğü.", "none"),
  off("yebs_audit_events", "system", "YEBS denetim günlüğü.", "none"),

  // ── Yedek DIŞI: geçici ────────────────────────────────────────────────────
  off("belge_ceviri_jobs", "transient", "Belge çeviri iş kayıtları (geçici)."),
  off("nutrition_destructive_challenges", "transient", "Beslenme geri alınamaz işlem doğrulama kodu (5 dk, tek kullanımlık güvenlik kaydı)."),
  off("video_transcription_jobs", "transient", "Video çeviri iş kayıtları (geçici)."),
  off("healing_guide_create_idempotency", "transient", "Şifa Rehberi oluşturma idempotency anahtarları."),
  off("demo_numerology_ip_usage", "transient", "Demo kullanım sayacı.", "none"),

  // ── Yedek DIŞI: global / paylaşımlı referans ──────────────────────────────
  ...[
    "aromatherapy_chemical_families",
    "stone_knowledge_categories",
    "store_categories",
    "store_products",
    "store_product_images",
    "store_settings",
    "nutrition_allergens",
    "nutrition_food_groups",
    "nutrition_formulas",
    "nutrition_nutrients",
    "nutrition_traditional_frameworks",
    "nutrition_units",
    "hd_canonical_entities",
    "hd_canonical_types",
    "hd_canonical_authorities",
    "hd_canonical_gates",
    "hd_canonical_channels",
    "hd_canonical_content",
    "hd_consultation_contents",
    "hd_consultation_sections",
    "hd_consultation_questions",
    "hd_consultation_conditions",
    "hd_consultation_evidence",
    "hd_content_evidence",
    "hd_faithful_translations",
    "hd_original_texts",
    "hd_source_passages",
    "hd_sources",
    "yebs_traditions",
    "yebs_schools",
    "yebs_concepts",
    "yebs_concept_labels",
    "yebs_sources",
    "yebs_claims",
    "yebs_claim_sources",
    "yebs_concept_relations",
    "yebs_concept_relation_sources",
  ].map((t) => off(t, "global", "Tenant'sız paylaşımlı referans / katalog (yönetici yönetir).", "none")),

  // ── Yedek DIŞI: eski ve boş tablolar (prod 0 satır, 2026-09-27) ───────────
  ...[
    "bio_imaginations",
    "chakra_notes",
    "client_gifts",
    "client_photos",
    "client_tasks",
    "energy_bodies",
    "module_records",
    "stone_combinations",
    "subconscious_causes",
    "symbols_view",
    "numerology_analyses",
  ].map((t) => off(t, "legacy_empty", "Eski tablo — prod'da kayıt yok (2026-09-27); kod kullanmıyor.")),

  // ── ASLA yedeğe girmez ────────────────────────────────────────────────────
  off("_bak_hacamat_rules_20260926", "excluded", "Geçici operasyon yedeği — asla yedeğe alınmaz.", "none"),
  off("_bak_users_modperm_20260926", "excluded", "Geçici operasyon yedeği — asla yedeğe alınmaz.", "none"),
  off("_bak_users_modperm_cosmic_preapply_20260926", "excluded", "Geçici operasyon yedeği — asla yedeğe alınmaz.", "none"),
];

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const BY_TABLE: ReadonlyMap<string, RegistryEntry> = new Map(BACKUP_REGISTRY.map((e) => [e.table, e]));

export function getRegistryEntry(table: string): RegistryEntry | undefined {
  return BY_TABLE.get(table);
}

/** `_bak_*` deseni (gelecekte eklenecek operasyon yedekleri dahil) her zaman excluded. */
export function isOperationalBackupTable(table: string): boolean {
  return /^_bak_/.test(table);
}

export function isExportable(e: RegistryEntry): boolean {
  return e.class === "backup" || e.class === "child_of";
}

export function isRestorable(e: RegistryEntry): boolean {
  return isExportable(e) && !e.exportOnly;
}

/**
 * Topolojik sıra (ebeveyn önce). Yalnız dışa aktarılabilir tablolar; aynı seviye içinde registry
 * sırası korunur (deterministik). Döngü varsa hata fırlatır (harness bunu yakalar).
 */
export function topologicalOrder(entries: readonly RegistryEntry[] = BACKUP_REGISTRY): RegistryEntry[] {
  const pool = entries.filter(isExportable);
  const names = new Set(pool.map((e) => e.table));
  const done = new Set<string>();
  const out: RegistryEntry[] = [];
  let guard = 0;
  while (out.length < pool.length) {
    guard++;
    if (guard > pool.length + 5) {
      const rest = pool.filter((e) => !done.has(e.table)).map((e) => e.table);
      throw new Error(`Backup registry FK döngüsü: ${rest.join(", ")}`);
    }
    for (const e of pool) {
      if (done.has(e.table)) continue;
      const deps = e.fkParents
        .map((p) => p.table)
        .filter((t) => t !== e.table && names.has(t));
      if (deps.every((d) => done.has(d))) {
        done.add(e.table);
        out.push(e);
      }
    }
  }
  return out;
}

/** Yedek dosyasındaki `excluded` listesi (dışa aktarılmayan tablolar + gerekçe). */
export function excludedList(): { table: string; class: BackupClass; reason: string }[] {
  return BACKUP_REGISTRY.filter((e) => !isExportable(e)).map((e) => ({
    table: e.table,
    class: e.class,
    reason: e.reason ?? "",
  }));
}

/** Modül etiketleri (UI + Word). null → "Genel". */
export const MODULE_LABELS: Readonly<Record<string, string>> = {
  clients: "Danışan Yolculuğu",
  appointments: "Ajanda / Randevular",
  numerology: "Numeroloji",
  human_design: "Human Design",
  stones: "Doğaltaş",
  stok: "Ürün & Stok",
  personal_archive: "Kişisel Arşiv",
  energy_body: "Biyoenerji",
  reflexology: "Refleksoloji",
  aromatherapy: "Aromaterapi",
  sifa_rehberi: "Şifa Rehberi",
  cupping: "Kupa & Hacamat",
  cosmic_calendar: "Kozmik Ajanda — Hacamat Kuralları",
  beslenme: "Beslenme",
  video_ceviri: "Video Eğitim Kayıtları",
  general: "Genel (destek mesajları, konum tercihi)",
};

export function moduleKeyOf(e: RegistryEntry): string {
  return e.module ?? "general";
}

/** Dışa aktarım modül sırası (UI + Word "Tümü"). */
export const EXPORT_MODULE_ORDER: readonly string[] = [
  "clients",
  "appointments",
  "numerology",
  "human_design",
  "stones",
  "stok",
  "personal_archive",
  "energy_body",
  "reflexology",
  "aromatherapy",
  "sifa_rehberi",
  "cupping",
  "cosmic_calendar",
  "beslenme",
  "video_ceviri",
  "general",
];

/** Eski Word dışa aktarım modül anahtarları → registry modül anahtarı (geriye uyum). */
export const LEGACY_EXPORT_MODULE_ALIASES: Readonly<Record<string, string>> = {
  dogaltas: "stones",
  dijital_icerik: "personal_archive",
  bioenerji: "energy_body",
  refleksoloji: "reflexology",
  aromaterapi: "aromatherapy",
};

/** Bir modülün dışa aktarılabilir tabloları (topolojik sırada). */
export function tablesForModule(moduleKey: string): RegistryEntry[] {
  return topologicalOrder().filter((e) => moduleKeyOf(e) === moduleKey);
}

// ─── Registry parmak izi ─────────────────────────────────────────────────────

/** FNV-1a 32-bit (iki tur, farklı tohum) → 16 hex. Saf ve deterministik (client+server). */
function fnv1a(input: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function computeRegistryHash(entries: readonly RegistryEntry[] = BACKUP_REGISTRY): string {
  const canon = JSON.stringify(
    entries.map((e) => [e.table, e.module, e.class, e.pk, e.tenantScope, e.fkParents, e.exportOnly ?? false]),
  );
  return `${fnv1a(canon, 0x811c9dc5)}${fnv1a(canon, 0x01000193)}`;
}

export const REGISTRY_HASH = computeRegistryHash();

/**
 * YAŞAM HAFIZASI™ — BF-14 ERTELENMİŞ KAYNAKLAR MİMARİ KAPANIŞI (MACHINE-READABLE KARAR MATRİSİ).
 *
 * Dört ertelenmiş alanın (YEBS global-canonical, Numeroloji client_id, Belge/Video provenanslı
 * ingestion, Kişisel Arşiv sınıflandırma) kilitli ürün kararı + nihai sonucu + foundation
 * referansları. moduleSourceMatrix'i (kaynak katmanı) TAMAMLAR; onunla çelişmez.
 *
 * BAĞLAYICI: uydurma tablo/kolon YOK. `foundationTables` alanları bu paketin additive
 * migration'ında (20260925000000) GERÇEKTEN tanımlıdır; harness migration dosyasıyla çapraz
 * doğrular. DEFERRED_HARD_BLOCKER yalnız exact tablo/kolon/ownership kanıtıyla.
 */

/** Alan başına nihai sonuç (§3). */
export type ClosureResult =
  | "WIRED_DORMANT"
  | "FOUNDATION_READY"
  | "EXISTING_FAIL_CLOSED"
  | "DEFERRED_HARD_BLOCKER"
  | "NOT_APPLICABLE";

export interface ClosureDomain {
  readonly domain: string;
  readonly label: string;
  readonly result: ClosureResult;
  /** Kilitli ürün kararı (kısa). */
  readonly productDecision: string;
  /** Bu pakette eklenen additive migration tabloları (varsa; migration ile çapraz doğrulanır). */
  readonly foundationTables: readonly string[];
  /** Bu pakette eklenen server API foundation'ları (varsa). */
  readonly foundationApis: readonly string[];
  /**
   * Bu alan için YH_INDEX_SOURCES'a bağlanan DORMANT (enabled:false) source key'ler. WIRED_DORMANT
   * için ≥1 gerçek key; diğer sonuçlar için []. Harness registry ile çapraz doğrular.
   */
  readonly registrySourceKeys: readonly string[];
  /** Güvenli/izinli alan özeti. */
  readonly allow: readonly string[];
  /** Kesin yasak alan/işlem özeti. */
  readonly deny: readonly string[];
  /** DEFERRED_HARD_BLOCKER için exact kanıt (aksi halde boş). */
  readonly hardBlockerEvidence: readonly string[];
  /** Exact gerekçe/uygulama notu. */
  readonly rationale: string;
  /** Gerçek aktivasyon önkoşulu (bu paket dışında). */
  readonly activationPrerequisite: string;
}

export const YH_DEFERRED_SOURCE_CLOSURE = [
  {
    domain: "yebs_global_canonical",
    label: "YEBS Global/Canonical Görünürlük",
    result: "WIRED_DORMANT",
    productDecision:
      "YEBS professional GLOBAL_CANONICAL bilgi sistemidir; client memory değil; tenant-owned " +
      "gösterilmez; tenant başına çoğaltılmaz; synthetic tenant yok. Yalnız published görünür.",
    foundationTables: [],
    foundationApis: [],
    registrySourceKeys: [
      "yebs:traditions", "yebs:schools", "yebs:concepts", "yebs:sources", "yebs:claims", "yebs:concept-relations",
    ],
    allow: ["published tradition/school/concept/source/claim/concept_relation", "global-canonical provenans etiketi"],
    deny: ["draft/verified/approved/review/pending/rejected/archived", "karşıt claim birleştirme", "katman karıştırma", "AI publish/verify", "client memory", "tenant başına kopya", "synthetic tenant"],
    hardBlockerEvidence: [],
    rationale:
      "WIRED (DORMANT): 6 yebs:* professional source YH_INDEX_SOURCES'a enabled:false eklendi. " +
      "Indexer'a additive 'global-canonical' tenant modu (resolveTenant → tenant_id NULL/shared; " +
      "synthetic tenant yok) + row-eligibility (statusColumn='status', eligibleStatuses=['published']; " +
      "draft/verified/approved/... fail-closed) eklendi. Görünürlük/eligibility sözleşmesi " +
      "yebsVisibility.ts'te; claim/source/relation katmanı searchText kolonlarında KORUNUR (karşıt " +
      "claim birleştirme yok). yebs_* tenant_id TAŞIMAZ → tenant başına kopya yok. enabled:false + " +
      "source-guard 'disabled' → event/reconcile no-op (production index write yok).",
    activationPrerequisite:
      "BF-11E: enabled:true + reader global-canonical status filtresi + kontrollü index/reconcile " +
      "(ayrı onay). YEBS publish/transition sözleşmesi değişmez.",
  },
  {
    domain: "numeroloji_client_id",
    label: "Numeroloji Client_ID İlişkisi",
    result: "DEFERRED_HARD_BLOCKER",
    productDecision:
      "Numeroloji professional kaynakları CANLI-dormant. Client ilişkisi YALNIZ doğrulanmış " +
      "client context + PII'siz türetilmiş sonuç kodlarıyla kurulabilir; heuristik YASAK.",
    foundationTables: [],
    foundationApis: [],
    registrySourceKeys: [],
    allow: ["(gelecekte, güvenli entity kurulursa) hayat yolu/ifade/element/çakra kodları, tarih, durum"],
    deny: ["ad", "soyad", "doğum tarihi", "doğum yeri", "telefon", "e-posta", "açık PIN", "ham hesaplama girdisi", "serbest not", "Word raporu", "isim/doğum ile client eşleştirme"],
    hardBlockerEvidence: [
      "Hiçbir numeroloji tablosunda client_id kolonu YOK (tüm numerology_* migration grep = 0).",
      "Ana analiz tabloları numerology_records / numerology_analyses tracked migration'da TANIMLI DEĞİL (CREATE TABLE yok) → şema doğrulanamaz; repo fail-closed standardı harici/doğrulanamayan tabloyu ALTER etmez.",
      "app/api/numeroloji/analyses/route.ts YALNIZ tenant-scoped (numerology_records; .eq tenant_id); client/danışan bağı YOK, danışan seçimi YOK.",
      "Güvenli client ownership taşıyan doğrulanmış entity bulunmadığından nullable client_id eklenemez; sahte tablo üretilmez.",
    ],
    rationale: "Güvenli, doğrulanabilir client-owned entity yok; heuristik eşleştirme yasak → hard blocker.",
    activationPrerequisite:
      "Numeroloji ana analiz tablosunun tracked, doğrulanmış şeması + doğrulanmış danışan seçim " +
      "akışı + additive nullable client_id (composite FK) — hiçbiri backfill/heuristik olmadan.",
  },
  {
    domain: "belge_video_ingestion",
    label: "Belge/Video Provenanslı Ingestion",
    // ÜRÜN KARARI SONRASI: PRODUCT_DECISION_NON_SOURCE. Belge/Video işleme alanı Yaşam Hafızası
    // source DOMAIN'İ DEĞİLDİR → ertelenmiş-source değil, KAPSAM DIŞI (NOT_APPLICABLE).
    result: "NOT_APPLICABLE",
    productDecision:
      "PRODUCT_DECISION_NON_SOURCE: Dijital İçerik Merkezi'nin belge/video/ders-notu işleme alanı " +
      "TRANSIENT PROCESSING / EXPORT WORKSPACE'tir (belge dönüştür, transkript/çeviri/Word/PDF/ders " +
      "notu üret). Yaşam Hafızası bilgiyi bu geçici işleme merkezinden DEĞİL, uzmanın aktardığı nihai " +
      "kalıcı profesyonel modülden öğrenir (çift ingestion engeli).",
    foundationTables: ["yh_document_sources", "yh_document_passages"],
    foundationApis: ["POST /api/yasam-hafizasi/documents/promote"],
    // Source değil → registry key YOK (belge_video:passages source registry'den çıkarıldı).
    registrySourceKeys: [],
    allow: [],
    deny: ["Yaşam Hafızası source taraması", "activation/CDC/backfill/reconcile source path", "query/search/filter source domain", "geçici işleme çıktısını hafızaya alma"],
    hardBlockerEvidence: [],
    rationale:
      "NOT_APPLICABLE (retirement): belge_video:passages source registry/activationMatrix/module " +
      "matrix'ten ÇIKARILDI; moduleSourceMatrix'te NOT_MEMORY_SOURCE. Foundation tabloları " +
      "(yh_document_sources/passages) ve promotion API mevcut kalır (Dijital İçerik feature'ı) ama " +
      "Yaşam Hafızası SOURCE değildir → cleanup-candidate (DROP ayrı sistem-genel risk kapısı). " +
      "PR#129 (20260929000000) trigger foundation ayrı retirement migration ile DROP edilir → nihai " +
      "Belge/Video CDC trigger desired-state = 0. Historical migration/documentation korunur.",
    activationPrerequisite: "Yok (source değil). Nihai bilgi ilgili profesyonel modülden öğrenilir.",
  },
  {
    domain: "kisisel_arsiv_classification",
    label: "Kişisel Arşiv Sınıflandırma",
    result: "EXISTING_FAIL_CLOSED",
    productDecision:
      "Kişisel Arşiv'i otomatik safe YAPMA. Kayıt-bazlı explicit classification; varsayılan " +
      "unclassified; stale-content (hash) guard; yalnız yetkili review ile safe-non-pii.",
    foundationTables: ["yh_archive_classifications"],
    foundationApis: ["POST /api/yasam-hafizasi/archive-classification"],
    // Mevcut kaynak; YENİ entry eklenmedi (duplicate yok) → EXISTING_FAIL_CLOSED.
    registrySourceKeys: ["kisisel_arsiv:archives"],
    allow: ["yetkili review ile safe-non-pii işaretleme (reason + reviewedContentHash zorunlu)"],
    deny: ["mevcut kayıtları otomatik safe sayma", "backfill", "pii/unclassified index", "stale hash index", "cross-tenant classification", "AI auto-classification", "classification bypass"],
    hardBlockerEvidence: [],
    rationale:
      "Mevcut kisisel_arsiv:archives kaynağı classification=unclassified → source-guard FAIL-CLOSED " +
      "(index unit üretmez; harness doğruladı). Additive yh_archive_classifications (standalone; " +
      "personal_archives tracked olmadığı için app-layer (tenant_id, archive_id); default " +
      "unclassified; reviewedContentHash stale guard) + classification API. Row-level index " +
      "eligibility isArchiveRowIndexable ile SAF: yalnız safe-non-pii + hash eşleşmesi. Mevcut " +
      "kayıtlar update/backfill EDİLMEDİ; live source davranışı fail-closed KORUNDU.",
    activationPrerequisite:
      "row-level classification gate'inin indexer'a bağlanması (safe-non-pii + current hash) — " +
      "mevcut kisisel_arsiv:archives fail-closed davranışı korunarak.",
  },
] as const satisfies readonly ClosureDomain[];

export type ClosureDomainKey = (typeof YH_DEFERRED_SOURCE_CLOSURE)[number]["domain"];

const VALID_RESULTS: readonly ClosureResult[] = [
  "WIRED_DORMANT", "FOUNDATION_READY", "EXISTING_FAIL_CLOSED", "DEFERRED_HARD_BLOCKER", "NOT_APPLICABLE",
];

/**
 * Bütünlük doğrulaması (import-zamanı + harness): tekil domain, geçerli sonuç, DEFERRED için
 * exact kanıt zorunlu, foundation tabloları belirsiz sonuç taşımaz. Fırlatırsa deploy öncesi yakalanır.
 */
export function validateDeferredClosure(): void {
  const seen = new Set<string>();
  for (const d of YH_DEFERRED_SOURCE_CLOSURE as readonly ClosureDomain[]) {
    if (seen.has(d.domain)) throw new Error(`Closure domain tekrarı: ${d.domain}`);
    seen.add(d.domain);
    if (!VALID_RESULTS.includes(d.result)) throw new Error(`Geçersiz closure sonucu: ${d.domain} → ${d.result}`);
    const evidenceCount = d.hardBlockerEvidence.length;
    if (d.result === "DEFERRED_HARD_BLOCKER" && evidenceCount === 0) {
      throw new Error(`DEFERRED_HARD_BLOCKER exact kanıt gerektirir: ${d.domain}`);
    }
    if (d.result !== "DEFERRED_HARD_BLOCKER" && evidenceCount > 0) {
      throw new Error(`Yalnız DEFERRED_HARD_BLOCKER kanıt taşır: ${d.domain}`);
    }
    if (d.rationale.trim().length < 20) throw new Error(`Yetersiz rationale: ${d.domain}`);
    // WIRED_DORMANT → ≥1 gerçek registry key; DEFERRED_HARD_BLOCKER → hiç key olmamalı.
    if (d.result === "WIRED_DORMANT" && d.registrySourceKeys.length === 0) {
      throw new Error(`WIRED_DORMANT gerçek registry key gerektirir: ${d.domain}`);
    }
    if (d.result === "DEFERRED_HARD_BLOCKER" && d.registrySourceKeys.length > 0) {
      throw new Error(`DEFERRED_HARD_BLOCKER registry key taşıyamaz: ${d.domain}`);
    }
  }
}

/** Bu paketin additive migration'ında bulunması beklenen tüm foundation tabloları. */
export function expectedFoundationTables(): string[] {
  return [...new Set(YH_DEFERRED_SOURCE_CLOSURE.flatMap((d) => d.foundationTables))];
}

/** WIRED_DORMANT alanların YH_INDEX_SOURCES'a bağlı olması beklenen dormant source key'leri. */
export function wiredDormantRegistryKeys(): string[] {
  return [
    ...new Set(
      (YH_DEFERRED_SOURCE_CLOSURE as readonly ClosureDomain[])
        .filter((d) => d.result === "WIRED_DORMANT")
        .flatMap((d) => d.registrySourceKeys),
    ),
  ];
}

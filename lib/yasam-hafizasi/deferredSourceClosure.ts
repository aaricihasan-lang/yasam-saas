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
    result: "FOUNDATION_READY",
    productDecision:
      "YEBS professional GLOBAL_CANONICAL bilgi sistemidir; client memory değil; tenant-owned " +
      "gösterilmez; tenant başına çoğaltılmaz; synthetic tenant yok. Yalnız published görünür.",
    foundationTables: [],
    foundationApis: [],
    allow: ["published tradition/school/concept/source/claim/concept_relation", "global-canonical provenans etiketi"],
    deny: ["draft/verified/approved/review/pending/rejected/archived", "karşıt claim birleştirme", "katman karıştırma", "AI publish/verify", "client memory", "tenant başına kopya", "synthetic tenant"],
    hardBlockerEvidence: [],
    rationale:
      "Görünürlük + eligibility sözleşmesi KODDA ifade edildi (lib/yasam-hafizasi/yebs/" +
      "yebsVisibility.ts: YEBS_VISIBILITY=GLOBAL_CANONICAL, isYebsPublishedEligible, " +
      "yebsGlobalTenantId=null). yebs_* tabloları tenant_id kolonu TAŞIMAZ → index tenant_id " +
      "NULL/shared. Gerçek source-registry aktivasyonu, professional indexer'a additive " +
      "'global-canonical' tenant çözümleme modu + status-eligibility filtresi gerektirir; bu " +
      "core BF-11 indexer genişletmesi ayrı foundation kapısıdır (mevcut 17 canlı kaynağı riske " +
      "atmamak için tek turda aktive edilmedi). Uydurma wiring YOK.",
    activationPrerequisite:
      "professional indexer'da additive global-canonical tenant modu + status='published' " +
      "eligibility filtresi + enabled:false yebs:* registry entries + harness (sonraki kapı).",
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
    result: "FOUNDATION_READY",
    productDecision:
      "Transient job tabloları doğrudan source DEĞİLDİR. Kalıcı, tenant-owned, provenanslı " +
      "source + ordered passage + explicit promotion; başlangıç classification 'unclassified'.",
    foundationTables: ["yh_document_sources", "yh_document_passages"],
    foundationApis: ["POST /api/yasam-hafizasi/documents/promote"],
    allow: ["promoted durable source", "ordered passages (deterministic ordinal + locator + hash)", "provenans meta", "server-derived job metni"],
    deny: ["arbitrary client text trusted source", "transient job'ı doğrudan indexleme", "başka tenant job promote", "unclassified/pii index", "original filename index", "Storage secret/URL index", "raw dosya binary"],
    hardBlockerEvidence: [],
    rationale:
      "Additive migration ile yh_document_sources + yh_document_passages (RLS + service_role; " +
      "composite FK; default classification 'unclassified'; content/text hash). Promotion API job " +
      "ownership doğrular ve server-derived metni chunk'lar (video_training_records.transcript_tr). " +
      "Belge (dosya) chunk'lama Storage ayrıştırma gerektirdiğinden foundation dışında " +
      "(YH_DOC_KIND_NOT_SUPPORTED_YET). Source-registry index wiring, row-level classification " +
      "gate'i (safe-non-pii + hash) gerektirir → aktivasyon kapısı.",
    activationPrerequisite:
      "row-level classification gate (safe-non-pii only) + document source registry entry " +
      "enabled:false + belge dosya-ayrıştırma path'i (ayrı).",
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
  }
}

/** Bu paketin additive migration'ında bulunması beklenen tüm foundation tabloları. */
export function expectedFoundationTables(): string[] {
  return [...new Set(YH_DEFERRED_SOURCE_CLOSURE.flatMap((d) => d.foundationTables))];
}

/**
 * YAŞAM HAFIZASI™ — BF-14 Birleşik Modül Kaynak Matrisi (TEK MACHINE-READABLE SOURCE OF TRUTH).
 *
 * Bu dosya, Yaşam Hafızası'nın hangi modül kaynaklarını hangi katmanda (professional/client)
 * ve hangi güvenlik sınıfında kullandığının TEK bildirim noktasıdır. Sınıflandırma yalnız
 * raporda değil; registry + harness tarafından okunabilen kod olarak yaşar.
 *
 * BAĞLAYICI:
 *   - Mevcut professional index (yasam_hafizasi_index / YH_INDEX_SOURCES) ve client index
 *     (yasam_hafizasi_client_index / YH_CLIENT_INDEX_SOURCES) mimarileri BİRLEŞTİRİLMEZ.
 *   - Bu matris YENİ tablo/kolon UYDURMAZ; yalnız repository'de KESİN doğrulanmış kaynakları
 *     referanslar. `professionalSourceKeys` ∈ YH_INDEX_SOURCES, `clientSourceKeys` ∈
 *     YH_CLIENT_INDEX_SOURCES (compile-time + harness ile doğrulanır).
 *   - Client kaynaklarının tamamı DORMANT (enabled:false); aktivasyon AYRI kapı = BF-11E.
 *   - Heuristik (isim/e-posta/telefon/doğum) client eşleştirmesi YASAK → böyle modül
 *     DEFERRED_FOR_SAFETY sınıfına girer; sahte eşleştirme yapılmaz.
 *   - Professional module ailesi kümesi (config.YH_SOURCE_MODULES) ADDİTİF genişletilebilir;
 *     bu pakette 'numeroloji' ailesi eklendi (mevcut 6 aile ve davranışları DEĞİŞMEDİ). YEBS
 *     tenant_id kolonu OLMADIĞI için (merkezî/global) DEFERRED_FOR_SAFETY; HD canonical ayrı
 *     hassas alan. Uydurma tablo/kolon wiring YOK.
 */
import { YH_INDEX_SOURCES } from "./indexer/sources";
import { YH_CLIENT_INDEX_SOURCES } from "./client/clientSources";

/** Kaynak katmanı sınıflandırması (§7). */
export type MemoryClassification =
  | "DORMANT_READY" // güvenli source contract + registry wiring hazır; enabled:false
  | "FOUNDATION_READY" // additive temel/tablolar mevcut; gerçek aktivasyon sonraki kapıda
  | "PROFESSIONAL_ONLY" // professional için güvenli; gerçek client ownership yok/uygun değil
  | "CLIENT_ONLY" // danışana bağlı güvenli kaynak; professional havuza girmez
  | "DEFERRED_FOR_SAFETY" // güvenli tenant/client/provenans ilişkisi kurulamıyor
  | "NOT_MEMORY_SOURCE"; // hesap/geçici state/gizli veri → bilinçli kapsam dışı

/** Professional registry (YH_INDEX_SOURCES) sourceKey birleşimi. */
export type ProfessionalSourceKey = (typeof YH_INDEX_SOURCES)[number]["sourceKey"];
/** Client registry (YH_CLIENT_INDEX_SOURCES) sourceKey birleşimi. */
export type ClientSourceKey = (typeof YH_CLIENT_INDEX_SOURCES)[number]["sourceKey"];

export interface ModuleMatrixEntry {
  /** Modül anahtarı (kebab/underscore; tek doğruluk). */
  readonly moduleKey: string;
  /** Kullanıcıya gösterilecek Türkçe etiket. */
  readonly label: string;
  /** Nihai sınıflandırma. */
  readonly classification: MemoryClassification;
  /** Bağlı professional kaynaklar (compile-time YH_INDEX_SOURCES üyeleri). */
  readonly professionalSourceKeys: readonly ProfessionalSourceKey[];
  /** Bağlı client kaynaklar (compile-time YH_CLIENT_INDEX_SOURCES üyeleri). */
  readonly clientSourceKeys: readonly ClientSourceKey[];
  /** Güvenli indexlenebilir alan türleri (özet). */
  readonly allow: readonly string[];
  /** Kesin yasak PII/serbest-metin alanları (özet). */
  readonly deny: readonly string[];
  /** Exact sınıflandırma gerekçesi. */
  readonly rationale: string;
  /** Gerçek aktivasyon önkoşulu (bu paket dışında). */
  readonly activationPrerequisite: string;
}

export const YH_MODULE_SOURCE_MATRIX = [
  {
    moduleKey: "biyoenerji",
    label: "Biyoenerji",
    classification: "PROFESSIONAL_ONLY",
    professionalSourceKeys: [
      "biyoenerji:subconscious-causes",
      "biyoenerji:symbols",
      "biyoenerji:chakras",
      "biyoenerji:imaginations",
    ],
    clientSourceKeys: [],
    allow: ["başlık", "sembol/anlam", "kategori", "yapılandırılmış içerik", "kaynak"],
    deny: ["serbest seans notu", "sağlık iddiası", "ad", "telefon", "e-posta", "kişisel açıklama"],
    rationale:
      "Sembol/çakra/imgeleme/bilinçaltı sebep katalogları tenant-owned danışan-bağımsız bilgi; " +
      "professional index'te CANLI. Doğrudan tenant_id+client_id ile bağlı yapılandırılmış client " +
      "tablosu YOK → client katmanı açılmaz (serbest seans notu PII).",
    activationPrerequisite: "Client katmanı için gerçek tenant+client bağlı yapılandırılmış tablo gerekir.",
  },
  {
    moduleKey: "refleksoloji",
    label: "Refleksoloji",
    classification: "PROFESSIONAL_ONLY",
    professionalSourceKeys: ["refleksoloji:protocols"],
    clientSourceKeys: [],
    allow: ["protokol başlığı", "hedef/sorun", "organ etiketleri", "uygulama notu (mesleki)"],
    deny: ["reflexology_notes serbest seans metni (pii)", "danışan kimliği"],
    rationale:
      "reflexology_protocols tenant-scoped REUSABLE mesleki içerik (client_id yok); professional " +
      "kaynak. reflexology_notes classification=pii → ana index'e GİRMEZ. Reusable protokol " +
      "client-specific hâle getirilmez; danışan teslimi BF-14 P2 snapshot katmanıyla yapılır " +
      "(snapshot yeniden source değildir).",
    activationPrerequisite: "Client memory için isimden değil, doğrulanmış client_id'li ayrı uygulama tablosu gerekir.",
  },
  {
    moduleKey: "numeroloji",
    label: "Numeroloji",
    classification: "DORMANT_READY",
    professionalSourceKeys: ["numeroloji:sources", "numeroloji:knowledge-entries"],
    clientSourceKeys: [],
    allow: ["bibliyografik kaynak (display_label/title/authors/kurum/notes)", "uzman bilgi-kaydı notu (body)"],
    deny: ["ad", "soyad", "doğum tarihi", "açık doğum verisi", "serbest kişisel/danışan metni", "isimden client eşleştirme", "danışan analiz sonucu"],
    rationale:
      "Professional numeroloji WIRED (DORMANT): numerology_sources (bibliyografik kaynak) + " +
      "numerology_knowledge_source_entries (uzman bilgi notu) tenant-scoped, client_id/PII YOK, " +
      "repo migration'ında TAM CREATE TABLE ile doğrulandı → YH_INDEX_SOURCES'a enabled:false " +
      "eklendi (config.YH_SOURCE_MODULES additif 'numeroloji' ailesi). numerology_knowledge_records " +
      "CREATE TABLE repo'da YOK (migration şemayı VARSAYMIYOR) → bilinçli olarak bağlanmadı. " +
      "Client-scoped numeroloji için doğrulanmış client_id tablo YOK + ad/doğum PII riski → client " +
      "katmanı DEFERRED (isimden eşleştirme YASAK; danışan analiz sonucu professional'a girmez).",
    activationPrerequisite:
      "Professional: BF-11E (trigger + enabled:true + kontrollü backfill). " +
      "Client: additive nullable client_id + kanıtlanmış semantik ilişki (heuristik değil).",
  },
  {
    moduleKey: "aromaterapi",
    label: "Aromaterapi",
    classification: "PROFESSIONAL_ONLY",
    professionalSourceKeys: [
      "aromaterapi:oils",
      "aromaterapi:reference-sheets",
      "aromaterapi:reference-rows",
      "aromaterapi:blends",
    ],
    clientSourceKeys: [],
    allow: ["yağ/katalog başlığı", "referans satır hücreleri", "blend reçetesi (mesleki)", "katman etiketi + provenans"],
    deny: ["kaynakta olmayan editoryal uyarıyı faithful translation/source text'e ekleme", "danışan PII"],
    rationale:
      "Yağ kataloğu, referans sheet/row ve uzman blend'leri professional index'te CANLI. Kilitli " +
      "kaynak katmanları (source passage / original text / faithful translation / editorial " +
      "explanation / editorial interpretation / expert overlay) tek düz metne EZİLMEZ; katman " +
      "etiketi + provenans korunur. Gerçek client kullanım/öneri tablosu (client_id) YOK → client " +
      "katmanı açılmaz.",
    activationPrerequisite: "Client katmanı için client_id'li gerçek danışan kullanım/öneri tablosu gerekir.",
  },
  {
    moduleKey: "human_design",
    label: "Human Design",
    classification: "DEFERRED_FOR_SAFETY",
    professionalSourceKeys: [],
    clientSourceKeys: [],
    allow: [],
    deny: ["ad-soyad", "doğum tarihi", "doğum saati", "doğum yeri", "koordinat", "ham hesaplama request'i", "chart sahibi serbest metni"],
    rationale:
      "Private Memory Politika Kilidi md.13: human_design_charts client kaynağı DEFER edildi → ilk " +
      "cohort DIŞINDA (kaynak kaydı kaldırıldı). Frozen HD hesaplama/bodygraph motoruna DOKUNULMAZ; " +
      "doğum verisi her hâlükârda denylist. Professional canonical katman (hd_canonical_types/" +
      "authorities/gates/channels/entities + hd_source_passages/original_texts/faithful_translations) " +
      "tablo olarak mevcut ancak professional aile kümesinde değil → FOUNDATION (uydurma wiring yok).",
    activationPrerequisite:
      "Client: ayrı DEFER turu (BF-11E aktivasyonundan önce PII/kod ayrımı + kaynak kaydı geri ekleme). " +
      "Professional canonical: YH_SOURCE_MODULES aile genişletmesi + entitlement/overlay görünürlük contract.",
  },
  {
    moduleKey: "dogaltas",
    label: "Doğaltaş",
    classification: "DORMANT_READY",
    professionalSourceKeys: ["dogaltas:stones", "dogaltas:minerals", "dogaltas:knowledge", "dogaltas:combinations"],
    clientSourceKeys: ["danisan:stones", "danisan:combinations"],
    allow: ["(pro) taş/mineral/bilgi/kombinasyon katalog içeriği + provenans", "(client) taş adı, kullanım alanı, kombinasyon ve klinik not (tenant+client authz-korumalı, aranabilir)"],
    deny: ["danışan ana kaydı kimlik kolonları (ad-soyad/telefon/adres)"],
    rationale:
      "Professional taş/mineral/knowledge/combination kaynakları CANLI; admin/shared ve uzman-owned " +
      "kopyalar AYRI source olarak kalır (otomatik birleştirme YOK; 'adminden gelen bilgi' provenans " +
      "etiketi korunur). Client tarafı (client_stones / client_combinations) BF-14 P1'de DORMANT.",
    activationPrerequisite: "Client: BF-11E aktivasyonu.",
  },
  {
    moduleKey: "mineral_bankasi",
    label: "Mineral Bankası",
    classification: "PROFESSIONAL_ONLY",
    professionalSourceKeys: ["dogaltas:minerals"],
    clientSourceKeys: [],
    allow: ["mineral katalog içeriği (açıklama/fizyoloji/kategori/çakra)"],
    deny: ["danışan PII"],
    rationale:
      "Mineral bankası, Doğaltaş ailesi içinde professional mineral kataloğudur (minerals tablosu); " +
      "danışan-bağımsız. Doğrudan client-owned mineral tablosu YOK → PROFESSIONAL_ONLY.",
    activationPrerequisite: "Yok (professional zaten CANLI).",
  },
  {
    moduleKey: "danisan_yolculugu",
    label: "Danışan Yolculuğu",
    classification: "DORMANT_READY",
    professionalSourceKeys: [],
    clientSourceKeys: ["danisan:sessions", "danisan:homeworks", "danisan:appointments", "danisan:notes"],
    allow: ["klinik serbest metin (tenant+client authz-korumalı, aranabilir)", "kayıt türü", "yapılandırılmış durum", "tarih", "kategori"],
    deny: ["ad-soyad", "telefon", "e-posta", "adres", "doğum bilgisi", "danışan ana kaydı kimlik kolonları"],
    rationale:
      "client_sessions / client_homeworks / appointments / client_notes doğrudan tenant_id+client_id " +
      "taşır; BF-14 P1'de DORMANT. Private Memory Politika Kilidi md.1/md.2: klinik SERBEST METİN " +
      "(seans notu, sağlık notu, öneri, ödev açıklaması, randevu notu) searchText'e dahildir ve " +
      "aranabilir; index PRIVATE/SENSITIVE kabul edilir. Güvenlik authorization'a dayanır (tenant+client " +
      "fail-closed). YALNIZCA doğrudan kimlik/iletişim kolonları (ad-soyad/telefon/e-posta/adres/doğum) " +
      "denylist (md.3); danışan adı index'e kopyalanmaz (query-time resolve).",
    activationPrerequisite: "BF-11E aktivasyonu (client index CDC/worker kapsamı + kill-switch).",
  },
  {
    moduleKey: "sifa_rehberi",
    label: "Şifa Rehberi",
    classification: "PROFESSIONAL_ONLY",
    professionalSourceKeys: ["sifa_rehberi:guides", "sifa_rehberi:guide-sections"],
    clientSourceKeys: [],
    allow: ["rehber/section başlığı", "içerik katmanı", "provenans", "kategori"],
    deny: ["BF-14 P2 report snapshot metinleri (recursive source YASAK)", "danışana özel teslim eki içeriği"],
    rationale:
      "healing_guides / healing_guide_sections tenant/shared/canonical professional bilgi; CANLI. " +
      "BF-14 P2 danışan teslim snapshotları YENİDEN Yaşam Hafızası source'u YAPILMAZ (recursive loop " +
      "yasağı). Client-specific içerik guide tablolarına yazılmaz.",
    activationPrerequisite: "Yok (professional zaten CANLI).",
  },
  {
    moduleKey: "yebs",
    label: "YEBS",
    classification: "DORMANT_READY",
    professionalSourceKeys: ["yebs:traditions", "yebs:schools", "yebs:concepts", "yebs:sources", "yebs:claims", "yebs:concept-relations"],
    clientSourceKeys: [],
    allow: ["published tradition/school/concept/source/claim/concept-relation (global-canonical)", "claim/source/relation katmanı korunur"],
    deny: ["draft/verified/approved/pending/rejected/archived", "karşıt/çelişkili claim birleştirme", "katman karıştırma", "AI doğrulayıcı/yayınlayıcı", "client memory", "tenant başına kopya/synthetic tenant"],
    rationale:
      "WIRED (DORMANT): 6 yebs:* professional source enabled:false. Indexer'a additive " +
      "'global-canonical' tenant modu (resolveTenant → tenant_id NULL/shared) + row-eligibility " +
      "(statusColumn='status', eligibleStatuses=['published']; draft/verified/approved fail-closed). " +
      "yebs_* tablolarında tenant_id YOK → merkezî/global; tenant başına kopya/synthetic tenant yok. " +
      "Claim/source/relation katmanı searchText kolonlarında korunur; karşıt claim birleştirme yok. " +
      "enabled:false → source-guard 'disabled' → event/reconcile no-op.",
    activationPrerequisite:
      "BF-11E: enabled:true + reader global-canonical status filtresi + kontrollü index (ayrı onay).",
  },
  {
    moduleKey: "kozmik_ajanda",
    label: "Kozmik Ajanda",
    classification: "NOT_MEMORY_SOURCE",
    professionalSourceKeys: [],
    clientSourceKeys: [],
    allow: [],
    deny: ["anlık gökyüzü hesabı", "zamanla değişen cache", "geçici takvim sonucu"],
    rationale:
      "Kozmik ajanda çıktıları anlık/deterministik astronomik hesap ve geçici ekran state'idir; " +
      "hacamat_rules yapılandırma kuralı tablosudur (bilgi kaydı değil). Kalıcı uzman notu/kayıt " +
      "tablosu YOK → geçici hesaplar geçmiş bilgi kaydı gibi indexlenmez.",
    activationPrerequisite: "Kalıcı, tenant-owned, uzman-yazılı kozmik not/kayıt tablosu gerekir.",
  },
  {
    moduleKey: "belge_video",
    label: "Belge / Video İçerikleri",
    classification: "DORMANT_READY",
    professionalSourceKeys: ["belge_video:passages"],
    clientSourceKeys: [],
    allow: ["promoted durable passage (yalnız safe-non-pii)", "ordered ordinal + locator + hash + provenans"],
    deny: ["transient job doğrudan index", "arbitrary/serbest client text", "unclassified/pii passage", "original filename", "Storage secret/URL", "başka tenant job"],
    rationale:
      "WIRED (DORMANT): belge_video:passages source enabled:false (kaynak = promoted durable " +
      "yh_document_passages; transient job DEĞİL). tenant join → yh_document_sources; row-eligibility " +
      "rowClassificationColumn='classification' → yalnız safe-non-pii passage (unclassified/pii/" +
      "restricted fail-closed). Additive migration (yh_document_sources + yh_document_passages) + " +
      "promotion API (job ownership + server-derived deterministic chunk). enabled:false → " +
      "source-guard 'disabled' → event/reconcile no-op.",
    activationPrerequisite: "BF-11E: enabled:true + safe-non-pii passage sınıflandırması + kontrollü index (ayrı onay).",
  },
  {
    moduleKey: "kisisel_arsiv",
    label: "Kişisel Arşiv",
    classification: "DEFERRED_FOR_SAFETY",
    professionalSourceKeys: [],
    clientSourceKeys: [],
    allow: [],
    deny: ["serbest-form kişisel arşiv metni", "PII"],
    rationale:
      "personal_archives professional registry'de classification='unclassified' (fail-closed; ana " +
      "index'e girmez). Serbest-form kişisel içerik F5/PII sınıflandırmasına ertelenmiştir → " +
      "DEFERRED_FOR_SAFETY.",
    activationPrerequisite: "Ayrı PII sınıflandırması + redaction contract.",
  },
] as const satisfies readonly ModuleMatrixEntry[];

export type ModuleKey = (typeof YH_MODULE_SOURCE_MATRIX)[number]["moduleKey"];

/** Matriste referanslanan tüm professional sourceKey'ler (tekilleştirilmiş). */
export function referencedProfessionalKeys(): string[] {
  return [...new Set(YH_MODULE_SOURCE_MATRIX.flatMap((m) => m.professionalSourceKeys))];
}
/** Matriste referanslanan tüm client sourceKey'ler (tekilleştirilmiş). */
export function referencedClientKeys(): string[] {
  return [...new Set(YH_MODULE_SOURCE_MATRIX.flatMap((m) => m.clientSourceKeys))];
}

const VALID_CLASSES: readonly MemoryClassification[] = [
  "DORMANT_READY", "FOUNDATION_READY", "PROFESSIONAL_ONLY", "CLIENT_ONLY", "DEFERRED_FOR_SAFETY", "NOT_MEMORY_SOURCE",
];

/**
 * Bütünlük doğrulaması (import-zamanı güvenlik + harness): referanslanan her sourceKey
 * gerçek registry'de bulunmalı; modül tekrarı olmamalı; sınıflandırma geçerli olmalı.
 * Fırlatırsa deploy'dan ÖNCE (harness/compile) yakalanır.
 */
export function validateModuleSourceMatrix(): void {
  const proSet = new Set<string>(YH_INDEX_SOURCES.map((s) => s.sourceKey));
  const cliSet = new Set<string>(YH_CLIENT_INDEX_SOURCES.map((s) => s.sourceKey));
  const seenModules = new Set<string>();

  for (const m of YH_MODULE_SOURCE_MATRIX) {
    if (seenModules.has(m.moduleKey)) throw new Error(`Modül tekrarı: ${m.moduleKey}`);
    seenModules.add(m.moduleKey);
    if (!VALID_CLASSES.includes(m.classification)) throw new Error(`Geçersiz sınıf: ${m.moduleKey} → ${m.classification}`);
    for (const k of m.professionalSourceKeys) {
      if (!proSet.has(k)) throw new Error(`Bilinmeyen professional sourceKey: ${m.moduleKey} → ${k}`);
    }
    for (const k of m.clientSourceKeys) {
      if (!cliSet.has(k)) throw new Error(`Bilinmeyen client sourceKey: ${m.moduleKey} → ${k}`);
    }
    // Kaynak referansı olan modül için sınıf tutarlılığı (fail-closed kategoriler kaynak taşımaz).
    const hasSources = m.professionalSourceKeys.length + m.clientSourceKeys.length > 0;
    if (m.classification === "NOT_MEMORY_SOURCE" && hasSources) {
      throw new Error(`NOT_MEMORY_SOURCE kaynak taşıyamaz: ${m.moduleKey}`);
    }
    if (m.classification === "DEFERRED_FOR_SAFETY" && hasSources) {
      throw new Error(`DEFERRED_FOR_SAFETY kaynak taşıyamaz: ${m.moduleKey}`);
    }
  }
}

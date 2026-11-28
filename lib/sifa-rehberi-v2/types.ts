/**
 * Şifa Rehberi V2 — PROTOTİP veri modeli (yalnız sentetik veri; canlı DB'ye bağlı DEĞİL).
 *
 * Tek kavram: KONU (TopicNode). Ana konu = parentId null olan konu; alt başlık = parentId dolu
 * konu. Derinlik sabit değildir (yalnız teknik emniyet tavanı MAX_DEPTH).
 * Her konunun kendi bağımsız İÇERİK KUTULARI (Block) vardır; kutular alt başlık açmadan
 * çoğaltılabilir. Konular arası BAĞLANTI (TopicLink) içerik kopyalamaz, aynı kaydı işaret eder.
 *
 * Planlanan DB karşılığı: docs/sifa-rehberi-v2/schema-taslak.sql (UYGULANMADI).
 */
import type { JSONContent } from "@tiptap/core";

/** Teknik emniyet tavanı — ürün sınırı değil; döngü/aşırı derinlik hatalarına karşı. */
export const MAX_DEPTH = 20;
/** Yanlışlıkla silinen kaydın Çöp Kutusu'nda tutulacağı gün (tasarım değeri). */
export const TRASH_RETENTION_DAYS = 30;

export type OwnerProfile = {
  id: string;
  tenantId: string;
  name: string;
  kind: "basit" | "profesyonel";
};

/** "kurum" = tenant ortak kayıt (salt-okunur) · "kisisel" = uzmanın kendi kaydı. */
export type RecordScope = "kurum" | "kisisel";
export const isShared = (x: { scope?: RecordScope } | null | undefined): boolean => x?.scope === "kurum";

export type TopicNode = {
  id: string;
  ownerId: string;
  parentId: string | null;
  title: string;
  sortKey: string;
  /**
   * Hazır Şifa Rehberi başlığı ise anahtarı ("grup:<id>" | "konu:<id>"), kullanıcı başlığıysa null.
   * Hazır başlığın adı ve yeri korunur; altına sınırsız başlık/kutu eklenebilir.
   */
  templateKey?: string | null;
  /** F3: kullanıcının "grup" olarak açtığı başlık (not yazılmaz). Hazır gruplar templateKey "grup:" ile tanınır. */
  nodeKind?: "grup" | null;
  /** Kalıcı kayıtta iyimser kilit sürümü (DB `version`); yerel prototipte yok. */
  version?: number;
  /** Kayıt kapsamı: "kurum" = tenant ortak (V1'den, salt-okunur) · "kisisel" (varsayılan) = uzmanın kendi. */
  scope?: RecordScope;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteBatchId: string | null;
};

/** İsteğe bağlı içerik sınıfı — zorunlu DEĞİL; tıbbi tanı/tedavi önerisi anlamı taşımaz. */
export const BLOCK_CLASSES = [
  { id: "bilimsel", label: "Bilimsel Araştırma" },
  { id: "geleneksel", label: "Geleneksel Yaklaşım" },
  { id: "dini", label: "Dinî Kaynak" },
  { id: "uzman_notu", label: "Uzman Notu" },
  { id: "diger", label: "Diğer" },
] as const;
export type BlockClass = (typeof BLOCK_CLASSES)[number]["id"];

export type SourceRef = {
  id: string;
  kind: "makale" | "kitap" | "web" | "geleneksel" | "diger" | "baglanti";
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  url?: string;
};

/** F3: nota/kutuya bağlı (galeri) görsel — nesne özel Storage'da; burada yalnız kimlik + açıklama. */
export type BlockAsset = { id: string; caption: string | null; mimeType: string | null; createdAt: string };

export type Block = {
  id: string;
  ownerId: string;
  nodeId: string;
  /** F3: not = null; içerik kutusu = üst notun kimliği. */
  parentBlockId?: string | null;
  title: string;
  contentJson: JSONContent | null;
  /** Arama için düz metin (editörden türetilir). */
  contentText: string;
  classification: BlockClass | null;
  sources: SourceRef[];
  sortKey: string;
  /** Kalıcı kayıtta iyimser kilit sürümü (DB `version`); yerel prototipte yok. */
  version?: number;
  scope?: RecordScope;
  createdAt: string;
  updatedAt: string;
  /** F3: yalnız gerçek içerik değişiminde (sunucu yazar); eski kayıtlarda boş → updatedAt gösterilir. */
  contentUpdatedAt?: string | null;
  /** F3: bağlı galeri görselleri. */
  assets?: BlockAsset[];
  deletedAt: string | null;
  deleteBatchId: string | null;
};

export type TopicLink = {
  id: string;
  ownerId: string;
  fromNodeId: string;
  toNodeId: string;
  createdAt: string;
};

/** Bir uzmanın TÜM çalışma alanı — sahiplik ownerId ile; başka uzmanın kaydı burada olamaz. */
export type Workspace = {
  ownerId: string;
  nodes: TopicNode[];
  blocks: Block[];
  links: TopicLink[];
};

export type OpResult<T = Workspace> = { ok: true; value: T } | { ok: false; error: string };

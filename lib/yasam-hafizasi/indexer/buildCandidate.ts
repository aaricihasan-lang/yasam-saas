/**
 * Yaşam Hafızası™ — İndeks-Birimi Builder (Sprint 2 / S2.07).
 *
 * SAF (pure) BUILDER. Bir kaynak satırından (row) DB'ye yazılabilecek YAZMA-YANI
 * indeks birimini deterministik + fail-safe üretir:
 *   (config, row, tenant, extracted) → BuiltIndexUnit | null
 *
 * S2.05 (`extractFields`) evidence/tag/relation'ı çıkardı; S2.04 (`resolveTenant`)
 * tenant sahipliğini çözdü. S2.07 bunları TAŞIR ve kalan yazma-yanı alanları
 * (group_key, title/snippet seçimi, content_hash) kompoze eder.
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB sorgusu / join / fetch / process.env / IO / API / UI / network /
 *   normalize (Türkçe küçük harf / diyakritik) / scoring / Kanıt Kapısı eşleşmesi /
 *   parent lookup / satır dolaşımı / DB yazımı / search_text / search_tsv /
 *   embedding / PII sınıflandırması.
 *
 * KANONİK KURALLAR (S2.07):
 *   - Yalnız `node:crypto` import edilir (SHA-256); harici paket YOK, package.json değişmez.
 *   - Birim genişletmesi (bir satır → çok section/row) ve orkestrasyon S2.08 Runner'a aittir;
 *     bir çağrı EN FAZLA bir birim üretir. `sectionRef` S2.07'de daima `null`.
 *   - S2.05 çıktısı (evidenceFields/topicTags/expertRelations) yeniden ayrıştırılmadan,
 *     normalize edilmeden ve sıralanmadan taşınır; girdi dizileri MUTATE EDİLMEZ
 *     (çıktıda dizi kimliği ayrışsın diye shallow copy; eleman içeriği değişmez).
 *   - Hiçbir bilinmeyen değer String()/JSON.stringify() ile "geçerli hale" getirilmez.
 *   - Fonksiyon row/config/extracted üzerinde MUTATION yapmaz ve exception FIRLATMAZ.
 *   - Fail-safe `null`: tenant çözülemedi · geçerli sourceId yok · güvenilir group kimliği
 *     yok · sıfır-kanıt (INV-1: üç kanıt dizisi de boşsa Kanıt Kapısı'ndan geçemez).
 */

import { createHash } from "node:crypto";

import type { YhSourceModule } from "../config";
import type { EvidenceField, ExpertRelation } from "../search/types";
import type { ExtractedFields } from "./extractFields";
import type { IndexUnit, SourceConfig } from "./sources";
import type { TenantResolveResult } from "./tenantResolve";

/**
 * S2.07 çıktısı — yazma-yanı indeks birimi. Arama-yanı `search/types.ts`'teki
 * `Candidate` ile KARIŞTIRILMAZ (o retrieval çıktısıdır; `tsRank`/`id` DB üretir).
 * DB türev/sorgu-zamanı alanları (id, is_shared, search_tsv, indexed_at, embed_model,
 * lang, is_client_pii, reviewed_at, version) bu aşamada BULUNMAZ; S2.08/F3/F5'e aittir.
 */
export interface BuiltIndexUnit {
  readonly tenantId: string | null;
  readonly sourceModule: YhSourceModule;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly unitType: IndexUnit;
  readonly sectionRef: string | null;
  readonly groupKey: string;
  readonly title: string | null;
  readonly titleSource: string | null;
  readonly snippet: string | null;
  readonly snippetOrigin: string | null;
  readonly topicTags: string[];
  readonly expertRelations: ExpertRelation[];
  readonly evidenceFields: EvidenceField[];
  readonly sourceUpdatedAt: string | null;
  readonly contentHash: string;
}

// ─── Tip guard'ı (coercion YOK) ──────────────────────────────────────────────

/** Yalnız gerçek string + trim sonrası boş olmayan. Değer HAM döner (trim uygulanmaz). */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ─── Kolon seçimi (title / snippet) ──────────────────────────────────────────

/** Sıralı kolon listesinde ilk geçerli boş-olmayan string; ham değer + kolon adı. */
function pickFirst(
  columns: readonly string[],
  row: Readonly<Record<string, unknown>>,
): { value: string; origin: string } | null {
  for (const col of columns) {
    const v = row[col];
    if (isNonEmptyString(v)) return { value: v, origin: col }; // ham değer; dönüştürme yok
  }
  return null;
}

// ─── group_key kimliği ───────────────────────────────────────────────────────
// KANONİK: record → primary key; section/row → YALNIZ yapılandırılmış parent FK
// (join mode). Parent kimliği yoksa primary key'e SESSİZ FALLBACK YAPILMAZ → `null`
// (yanlış grup üretmemek için). "record degrade" yalnız unit'in gerçekten record
// olduğu durumda geçerlidir.
function resolveGroupId(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
): string | null {
  if (config.unit === "record") {
    const id = row[config.primaryKey];
    return isNonEmptyString(id) ? id : null;
  }
  // section | row → yapılandırılmış parent kimliği zorunlu.
  const tenant = config.tenant;
  if (tenant.mode === "join") {
    const fk = row[tenant.fkColumn];
    return isNonEmptyString(fk) ? fk : null;
  }
  return null; // parent kimliği kaynağı yok → fail-safe null (pk degrade yok)
}

// ─── sourceUpdatedAt ─────────────────────────────────────────────────────────

/** updatedAtColumn tanımlı ve satır değeri geçerli string ise ham taşınır; aksi null. */
function pickSourceUpdatedAt(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
): string | null {
  if (config.updatedAtColumn === null) return null;
  const v = row[config.updatedAtColumn];
  return isNonEmptyString(v) ? v : null; // tarih parse YOK
}

// ─── content_hash canonical serialization (lokal, minimal, deterministik) ─────
// İLKE: yalnız İNDEKSLENEBİLİR İÇERİK hash'e girer. tenantId/sourceId/groupKey/
// unitType/sectionRef/provenance/updatedAt HARİÇ. Nesne key sırasına bağımlılık
// yok; sabit alan sırası + uzunluk-önekli değer kodlama + null için açık sabit.

/** Uzunluk-önekli kodlama: null → "∅"; aksi → "<len>:<value>" (enjeksiyon-güvenli). */
function enc(v: string | null): string {
  return v === null ? "∅" : `${v.length}:${v}`;
}

/** Sayısal sayaç kodlaması (dizi sınırlarını belirginleştirir). */
function encCount(n: number): string {
  return `#${n}`;
}

/**
 * İçerik alanlarını sabit sırayla, uzunluk-önekli parçalara böler ve "|" ile birleştirir.
 * Her parça kendini sınırladığından ("<len>:") birleştirme çakışması injektif değildir.
 */
function canonicalContent(
  title: string | null,
  snippet: string | null,
  evidenceFields: readonly EvidenceField[],
  topicTags: readonly string[],
  expertRelations: readonly ExpertRelation[],
): string {
  const parts: string[] = [];
  parts.push("T", enc(title));
  parts.push("S", enc(snippet));
  parts.push("E", encCount(evidenceFields.length));
  for (const f of evidenceFields) {
    parts.push(enc(f.origin), enc(f.kind), enc(f.text), enc(f.sectionRef ?? null));
  }
  parts.push("G", encCount(topicTags.length));
  for (const t of topicTags) parts.push(enc(t));
  parts.push("R", encCount(expertRelations.length));
  for (const r of expertRelations) parts.push(enc(r.kind), enc(r.targetLabel));
  return parts.join("|");
}

/** SHA-256 hex (64 karakter, lowercase) — node:crypto, harici paket yok. */
function computeContentHash(
  title: string | null,
  snippet: string | null,
  evidenceFields: readonly EvidenceField[],
  topicTags: readonly string[],
  expertRelations: readonly ExpertRelation[],
): string {
  const canonical = canonicalContent(title, snippet, evidenceFields, topicTags, expertRelations);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ─── Ana builder ──────────────────────────────────────────────────────────────

/**
 * Bir kaynak satırından yazma-yanı indeks birimini kompoze eder.
 *
 * @param config   Kaynağın declarative konfigürasyonu (S2.03).
 * @param row      Ham kaynak satırı (değerler unknown; coercion/mutation yapılmaz).
 * @param tenant   S2.04 `resolveTenant` sonucu (ok:false → null).
 * @param extracted S2.05 `extractFields` çıktısı (aynen taşınır).
 * @returns BuiltIndexUnit veya fail-safe `null` (bkz. başlık: null koşulları).
 */
export function buildIndexUnit(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
  tenant: TenantResolveResult,
  extracted: ExtractedFields,
): BuiltIndexUnit | null {
  // 1) Tenant fail-closed: çözülemeyen sahiplik → indekslenmez.
  if (!tenant.ok) return null;

  // 2) sourceId: yalnız geçerli boş-olmayan string (coercion yok).
  const sourceId = row[config.primaryKey];
  if (!isNonEmptyString(sourceId)) return null;

  // 3) group_key: güvenilir kimlik yoksa üretme.
  const groupId = resolveGroupId(config, row);
  if (groupId === null) return null;
  const groupKey = `${config.sourceKey}:${groupId}`;

  // 4) Sıfır-kanıt politikası (INV-1): üç kanıt dizisi de boşsa aday üretilmez.
  const { evidenceFields, topicTags, expertRelations } = extracted;
  if (evidenceFields.length === 0 && topicTags.length === 0 && expertRelations.length === 0) {
    return null;
  }

  // 5) title / snippet: ilk geçerli kolon; yoksa null (fallback/uydurma yok).
  const titlePick = pickFirst(config.titleColumns, row);
  const snippetPick = pickFirst(config.snippetColumns, row);

  // 6) S2.05 dizileri: mutasyon izolasyonu için shallow copy (eleman içeriği değişmez).
  const evidenceOut = evidenceFields.slice();
  const topicTagsOut = topicTags.slice();
  const expertRelationsOut = expertRelations.slice();

  // 7) content_hash: yalnız içerik (title/snippet/evidence/tag/relation).
  const contentHash = computeContentHash(
    titlePick?.value ?? null,
    snippetPick?.value ?? null,
    evidenceOut,
    topicTagsOut,
    expertRelationsOut,
  );

  return {
    tenantId: tenant.tenantId,
    sourceModule: config.sourceFamily,
    sourceTable: config.tableName,
    sourceId,
    unitType: config.unit,
    sectionRef: null, // S2.07: alt-bölme yok; genişletme S2.08 Runner'a ait
    groupKey,
    title: titlePick?.value ?? null,
    titleSource: titlePick?.origin ?? null,
    snippet: snippetPick?.value ?? null,
    snippetOrigin: snippetPick?.origin ?? null,
    topicTags: topicTagsOut,
    expertRelations: expertRelationsOut,
    evidenceFields: evidenceOut,
    sourceUpdatedAt: pickSourceUpdatedAt(config, row),
    contentHash,
  };
}

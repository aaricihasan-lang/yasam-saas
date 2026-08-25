/**
 * Yaşam Hafızası™ — JSONB / Çok-Değerli Alan Çıkarımı (Sprint 2 / S2.05).
 *
 * SAF (pure) BUILDER. Bir kaynak satırından (row) indekslenebilir kanıt alanlarını
 * deterministik + fail-safe üretir:
 *   row → { evidenceFields: EvidenceField[], topicTags: string[], expertRelations: ExpertRelation[] }
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB sorgusu / join / fetch / process.env / IO / API / UI /
 *   normalize (Türkçe küçük harf / diyakritik) / scoring / Kanıt Kapısı eşleşmesi /
 *   Candidate / snippet / title türetimi / content_hash / group_key / tenant çözümü.
 *
 * KANONİK KURALLAR (S2.05):
 *   - K1→A: JSONB/şekil kuralları TAMAMEN bu dosyada; `sources.ts` değişmez; AD-004 korunur.
 *   - K3: Yalnız 3 dizi üretilir. Candidate/snippet/title/content_hash/group_key S2.07'ye aittir.
 *   - EvidenceField.text KANONİK METNİ BİREBİR taşır: `text: value` (trim/normalize/coercion YOK).
 *     Boşluk kontrolü için yalnız `value.trim().length > 0` bakılır; yazılan değer ham `value`'dur.
 *   - topicTags ve ExpertRelation.targetLabel için trim uygulanır (dedupe: exact, ilk sıra korunur).
 *   - Hiçbir bilinmeyen değer String()/JSON.stringify() ile "[object Object]"'e çevrilmez.
 *   - reference-rows.cells satır İÇİNDE header taşımadığından sectionRef=undefined; headers eşlemesi
 *     bu katmanda YAPILMAZ (ileride runner/Candidate aşamasına bırakılır). S2.05 dış bağlam kullanmaz.
 *   - Fonksiyon row/config üzerinde MUTATION yapmaz ve exception fırlatmaz (fail-safe).
 *
 * Şekil bilgisi kaynağı: repo içi tip/DDL/persistence kodundan doğrulanmıştır (ADIM 0).
 */

import type { EvidenceField, ExpertRelation } from "../search/types";
import type { SourceConfig } from "./sources";

/** S2.05 çıktısı. YALNIZ bu dosyada tanımlıdır (search/types.ts değişmez). */
export interface ExtractedFields {
  readonly evidenceFields: EvidenceField[];
  readonly topicTags: string[];
  readonly expertRelations: ExpertRelation[];
}

// ─── Tip guard'ları (coercion YOK) ───────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmpty(v: string): boolean {
  return v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ─── searchText → evidence kind ("note" vs "paragraph") ──────────────────────
// KANONİK: "note" niteliği KOLON ADININ değil, KAYNAĞIN özelliğidir. Aynı kolon
// adı (content/note/notes) farklı kaynaklarda makale/rehber/tarif gövdesi olabilir.
// Bu nedenle karar config.sourceKey üzerinden verilir:
//   - Gerçek uzman/danışan notu niteliğindeki kaynak → "note"
//   - Makale/rehber/açıklama/protokol/tarif/kütüphane içeriği → "paragraph"
// Skor etkisi: whole-word-note=55 < whole-word-paragraph=60 (çoklu-kavram bonusu
// eşiği 60 + "Neden?" şablonu). Bilinmeyen kaynak → "paragraph".
const NOTE_SOURCES: ReadonlySet<string> = new Set([
  "refleksoloji:notes", // uzman notu tablosu (PII-sınırda)
  "kisisel_arsiv:archives", // kullanıcının kendi kişisel arşiv notu
]);

// ─── Kaynak-özel yapısal JSONB dalları (K1→A: kurallar builder içinde) ───────
// Bu üç kaynak, generic string/string[] kalıbına UYMAYAN yapısal JSONB taşır.
// Şekiller ADIM 0'da repo kodundan doğrulandı.
const STRUCTURED_RELATION_SOURCE = {
  /** dogaltas:stones → assignments: Record<string, string[][]> (row[0]=etiket). */
  stonesAssignments: "dogaltas:stones",
  /** aromaterapi:blends → items: BlendItem[] (oil_name=etiket). */
  blendsItems: "aromaterapi:blends",
} as const;

/** aromaterapi:reference-rows → cells: Record<string,string> (key=kolon indeksi). */
const REFERENCE_ROWS_SOURCE = "aromaterapi:reference-rows";

// ─── topicTags toplayıcı (trim + exact dedupe + ilk sıra) ────────────────────

class TagCollector {
  private readonly seen = new Set<string>();
  readonly tags: string[] = [];

  add(raw: unknown): void {
    if (!isString(raw)) return; // coercion yok
    const t = raw.trim();
    if (t.length === 0) return;
    if (this.seen.has(t)) return;
    this.seen.add(t);
    this.tags.push(t);
  }
}

// ─── expertRelations toplayıcı ((kind,targetLabel) exact dedupe + ilk sıra) ──

class RelationCollector {
  // kind → görülen targetLabel'lar. Ayıraç-birleştirmesi (string key) YOK →
  // boşluklu kind'larda ("Etkili Organlar") çakışma imkânsız; dedupe exact.
  private readonly seen = new Map<string, Set<string>>();
  readonly relations: ExpertRelation[] = [];

  add(kind: string, rawLabel: unknown): void {
    if (!isString(rawLabel)) return; // obje/sayı/bilinmeyen → atla (fail-safe)
    const label = rawLabel.trim();
    if (label.length === 0) return;
    let labels = this.seen.get(kind);
    if (labels === undefined) {
      labels = new Set<string>();
      this.seen.set(kind, labels);
    }
    if (labels.has(label)) return;
    labels.add(label);
    this.relations.push({ kind, targetLabel: label });
  }
}

// ─── Değer → çok-değerli parça normalizasyonu (yalnız TAG/RELATION için) ─────
// NOT: Bu split yalnız tag/relation üyelerini AYIRMAK içindir; evidence text'e
// asla uygulanmaz. Dönen parçalar ham string'dir (trim collector'da yapılır).

/** Virgül/pipe ile ayrılmış düz metni parçalara böler (yalnız string girdi). */
function splitDelimited(value: unknown): string[] {
  if (!isString(value)) return [];
  return value.split(/[|,]+/);
}

/** Gerçek dizi ise yalnız string elemanları döndürür; değilse []. */
function stringElements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

/**
 * Bir tag/relation kolonunun üyelerini güvenle çıkarır:
 *   - string[]  → string elemanlar
 *   - string    → virgül/pipe split
 *   - diğer     → [] (fail-safe)
 */
function multiValueMembers(value: unknown): string[] {
  if (Array.isArray(value)) return stringElements(value);
  if (isString(value)) return splitDelimited(value);
  return [];
}

// ─── Ana çıkarıcı ─────────────────────────────────────────────────────────────

/**
 * Bir kaynak satırından kanıt alanlarını çıkarır.
 *
 * @param config Kaynağın declarative konfigürasyonu (rol kolonları buradan okunur).
 * @param row    Ham kaynak satırı (değerler unknown; coercion/mutation yapılmaz).
 */
export function extractFields(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
): ExtractedFields {
  const evidenceFields: EvidenceField[] = [];
  const tags = new TagCollector();
  const relations = new RelationCollector();

  // ── 1) EvidenceField: title (kind=title) ─────────────────────────────────
  for (const col of config.titleColumns) {
    const value = row[col];
    if (isString(value) && isNonEmpty(value)) {
      // KANONİK: text birebir ham değer; trim/normalize YOK.
      evidenceFields.push({ origin: col, kind: "title", text: value });
    }
  }

  // ── 2) EvidenceField: searchText (kind=paragraph|note) ───────────────────
  // reference-rows.cells özel dalda ele alınır (searchTextColumns=["cells"]).
  const isReferenceRows = config.sourceKey === REFERENCE_ROWS_SOURCE;
  if (!isReferenceRows) {
    const searchKind = NOTE_SOURCES.has(config.sourceKey) ? "note" : "paragraph";
    for (const col of config.searchTextColumns) {
      const value = row[col];
      if (isString(value) && isNonEmpty(value)) {
        evidenceFields.push({ origin: col, kind: searchKind, text: value });
      }
    }
  } else {
    extractCellsEvidence(row["cells"], evidenceFields);
  }

  // ── 3) topicTags (trim + dedupe) ─────────────────────────────────────────
  for (const col of config.topicTagsColumns) {
    for (const member of multiValueMembers(row[col])) {
      tags.add(member);
    }
  }

  // ── 4) expertRelations ───────────────────────────────────────────────────
  for (const col of config.relationColumns) {
    if (config.sourceKey === STRUCTURED_RELATION_SOURCE.stonesAssignments && col === "assignments") {
      extractAssignments(row[col], relations);
    } else if (config.sourceKey === STRUCTURED_RELATION_SOURCE.blendsItems && col === "items") {
      extractBlendItems(row[col], relations);
    } else if (config.sourceFamily === "sifa_rehberi" && (col === "related_stones" || col === "related_reflexology")) {
      // S5: şekil repo içinden doğrulanamadı → YALNIZ string / string[] kabul; obje atla.
      extractGuardedStringRelation(col, row[col], relations);
    } else if (config.sourceKey === "dogaltas:minerals" && col === "organ_etkileri") {
      // organ_etkileri kanonik string[]; legacy newline-string / obje[] / JSON-string şekilleri de
      // güvenli çözülür → insan-okur organ adı/etki metni search_text'e girer (ham JSON/id/UUID GİRMEZ).
      extractLabeledRelation(col, row[col], relations);
    } else {
      // Generic: string[] veya virgül/pipe düz metin.
      for (const member of multiValueMembers(row[col])) {
        relations.add(col, member);
      }
    }
  }

  return { evidenceFields, topicTags: tags.tags, expertRelations: relations.relations };
}

// ─── Kaynak-özel çıkarıcılar (fail-safe) ──────────────────────────────────────

/**
 * dogaltas:stones → assignments: Record<string, string[][]>.
 * Her key (ör. "Mineraller") altında her satır string[]; satırın İLK elemanı
 * etikettir (row[1..] oran/ayrıntı → targetLabel'a girmez). Beklenmeyen → atla.
 */
function extractAssignments(value: unknown, relations: RelationCollector): void {
  if (!isPlainObject(value)) return;
  for (const [key, rows] of Object.entries(value)) {
    if (!Array.isArray(rows)) continue;
    for (const rowEntry of rows) {
      if (!Array.isArray(rowEntry) || rowEntry.length === 0) continue;
      relations.add(key, rowEntry[0]); // rowEntry[0] string değilse collector atar
    }
  }
}

/**
 * aromaterapi:blends → items: BlendItem[]. Her item.oil_name etikettir.
 * item obje değilse veya oil_name string değilse → atla.
 */
function extractBlendItems(value: unknown, relations: RelationCollector): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    relations.add("items", item["oil_name"]);
  }
}

/**
 * S5 — sifa_rehberi related_stones / related_reflexology: DB jsonb, şekil
 * repo içinden DOĞRULANAMADI. Güvenli: yalnız string veya string-elemanlı array
 * kabul; obje elemanları atlanır (asla coercion).
 */
function extractGuardedStringRelation(
  col: string,
  value: unknown,
  relations: RelationCollector,
): void {
  if (isString(value)) {
    relations.add(col, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const el of value) {
      relations.add(col, el); // string değilse collector atar (obje elemanları düşer)
    }
  }
  // diğer her şey → atla
}

/**
 * dogaltas:minerals → organ_etkileri (ve şekli belirsiz benzeri relation kolonları).
 * Kanonik şekil string[] (organ adları); ancak legacy veri şu şekilleri de taşıyabilir:
 *   - string[]                → her string eleman
 *   - newline/virgül/pipe ile ayrılmış string → parçalara böl
 *   - JSON-string ('[...]' / '{...}') → parse edip recurse (parse fail → düz-metin fallback)
 *   - obje[] veya JSONB obje → yalnız İNSAN-OKUR string değerler (id/uuid/*_id/*_at/sort/tenant
 *     metadata anahtarları ATLANIR; UUID / saf-sayı değerler ATLANIR) → hiçbir ham JSON/id sızmaz
 * Fail-safe: bilinmeyen/bozuk değer → sessiz atla (exception YOK). Yalnız bu kaynağa özeldir
 * (generic multiValueMembers DEĞİŞMEZ → diğer relationColumn kaynakları regresyonsuz).
 */
const RELATION_META_KEY_RE = /(^id$|_id$|^uuid$|_at$|^created|^updated|^sort_order$|^order$|^tenant)/i;
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractLabeledRelation(col: string, value: unknown, relations: RelationCollector): void {
  visitLabeledRelation(col, value, relations, 0);
}
function visitLabeledRelation(col: string, value: unknown, relations: RelationCollector, depth: number): void {
  if (depth > 3) return; // derinlik guard (patolojik iç içe yapı)
  if (isString(value)) {
    const s = value.trim();
    if (s.length === 0) return;
    if (s[0] === "[" || s[0] === "{") {
      try {
        visitLabeledRelation(col, JSON.parse(s), relations, depth + 1);
        return;
      } catch {
        // geçerli JSON değil → düz-metin ayırıcı fallback (aşağı düşer)
      }
    }
    for (const part of s.split(/[\n|,]+/)) relations.add(col, part); // collector trim+dedupe
    return;
  }
  if (Array.isArray(value)) {
    for (const el of value) visitLabeledRelation(col, el, relations, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (RELATION_META_KEY_RE.test(k)) continue; // id/uuid/*_id/*_at/sort/tenant → atla
      if (!isString(v)) continue; // yalnız string değer (nested obje/sayı → atla; coercion YOK)
      const t = v.trim();
      if (t.length === 0 || UUID_LIKE_RE.test(t) || /^\d+$/.test(t)) continue; // uuid/saf-sayı → atla
      relations.add(col, t);
    }
    return;
  }
  // number/boolean/null/bilinmeyen → atla (coercion YOK)
}

/**
 * aromaterapi:reference-rows → cells: Record<string,string> (key=kolon indeksi).
 * KANONİK DÜZELTME: header eşlemesi YAPILMAZ; sectionRef=undefined.
 *   origin: `cells[<key>]`, kind: "paragraph", text: hücrenin ham string değeri.
 */
function extractCellsEvidence(value: unknown, evidenceFields: EvidenceField[]): void {
  if (!isPlainObject(value)) return;
  for (const [key, cell] of Object.entries(value)) {
    if (isString(cell) && isNonEmpty(cell)) {
      evidenceFields.push({ origin: `cells[${key}]`, kind: "paragraph", text: cell });
    }
  }
}

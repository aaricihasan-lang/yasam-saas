/**
 * BİYOENERJİ FAZ 3.2C — Çakra workspace merge (UI-only, saf çekirdek).
 *
 * FAZ 3.1 legacy section modeli (`buildChakraSections`) ile FAZ 3.2 rich child
 * bloklarını (`bioenergy_chakra_blocks`) + parent quick fact'leri DETERMİNİSTİK
 * birleştirir. Veri yazma/dönüşüm YOK; yalnız sunum birleştirmesi.
 *
 * Kilitli sözleşme (FAZ 3.2B):
 *  - authority: legacy/parent = atomik fact; rich = elaborasyon (duplicate YOK)
 *  - görünürlük: section görünür ⟺ legacy içerik VEYA ≥1 non-empty rich block
 *    VEYA (yalnız Genel Bakış) quick fact — placeholder YOK
 *  - future section'lar (enerji-anatomisi, uygulamalar) yalnız blok gelince görünür
 *  - rich sıralama: sort_order ASC → created_at ASC → id ASC (deterministik)
 *  - içerik katmanları AYRI korunur (kaynak ≠ çeviri ≠ açıklama ≠ yorum ≠ not)
 */
import {
  buildChakraSections,
  CHAKRA_SECTION_DICTIONARY,
  type ChakraSection,
  type ChakraSectionBlock,
  type ChakraSectionId,
  type ChakraSectionInput,
} from "./chakraSections";

/** Genel Bakış dahil tüm kanonik section anahtarları (future 2 dahil). */
export type ChakraWorkspaceSectionKey =
  | ChakraSectionId
  | "enerji-anatomisi"
  | "uygulamalar";

/** DB satırı → rich content block (read API'nin döndürdüğü güvenli alanlar). */
export type ChakraContentBlock = {
  id: string;
  section_key: string;
  block_type: string | null;
  block_title: string | null;
  sort_order: number;
  source_excerpt: string | null;
  source_translation: string | null;
  editorial_explanation: string | null;
  editorial_interpretation: string | null;
  expert_note: string | null;
  source_title: string | null;
  source_author: string | null;
  source_ref: string | null;
  source_url: string | null;
  tradition_frame: string | null;
  created_at: string | null;
};

/** Parent additive quick facts (yalnız Genel Bakış). */
export type ChakraQuickFacts = {
  sanskritName: string | null;
  element: string | null;
  location: string | null;
  bijaMantra: string | null;
};

export type ChakraQuickFactRow = { key: string; label: string; value: string };

export type ChakraWorkspaceSection = {
  id: ChakraWorkspaceSectionKey;
  hash: string;
  title: string;
  kind: "content" | "stones";
  /** legacy-preserved bloklar (buildChakraSections'tan; DEĞİŞMEZ) */
  legacyBlocks: ChakraSectionBlock[];
  /** yalnız Genel Bakış — gerçek değer taşıyan parent quick facts */
  quickFacts: ChakraQuickFactRow[];
  /** rich child blocks — yalnız non-empty, deterministik sıralı */
  richBlocks: ChakraContentBlock[];
};

/** Kanonik section sırası (CHAKRA_SECTION_DICTIONARY ile birebir). */
export const CHAKRA_WORKSPACE_ORDER: ChakraWorkspaceSectionKey[] = [
  "genel-bakis",
  "enerji-anatomisi",
  "nedenler-blokajlar",
  "beden-sistem",
  "duygusal-zihinsel",
  "uygulamalar",
  "taslar-destekleyiciler",
  "notlar-kaynaklar",
];

const CONTENT_LAYER_KEYS = [
  "source_excerpt",
  "source_translation",
  "editorial_explanation",
  "editorial_interpretation",
  "expert_note",
] as const;

/** Bir block en az bir non-empty içerik katmanı taşıyor mu? (boş block gizli) */
export function chakraBlockHasContent(b: ChakraContentBlock): boolean {
  return CONTENT_LAYER_KEYS.some((k) => (b[k] ?? "").trim().length > 0);
}

const QUICK_FACT_LABELS: { key: keyof ChakraQuickFacts; label: string }[] = [
  { key: "sanskritName", label: "Sanskritçe Ad" },
  { key: "element", label: "Element" },
  { key: "location", label: "Konum" },
  { key: "bijaMantra", label: "Bija Mantra" },
];

/** Yalnız gerçek (non-empty) quick fact'leri satıra çevirir; uydurma YOK. */
export function chakraQuickFactRows(
  qf: ChakraQuickFacts | null | undefined,
): ChakraQuickFactRow[] {
  if (!qf) return [];
  const rows: ChakraQuickFactRow[] = [];
  for (const { key, label } of QUICK_FACT_LABELS) {
    const v = (qf[key] ?? "").trim();
    if (v) rows.push({ key: String(key), label, value: v });
  }
  return rows;
}

/** Deterministik sıralama: sort_order → created_at → id. */
function sortRichBlocks(blocks: ChakraContentBlock[]): ChakraContentBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Legacy + rich + quick fact birleşimini kanonik sırada üretir.
 * `blocks` boş verilirse çıktı FAZ 3.1 davranışının bire bir üst kümesidir
 * (legacy section'lar aynı; future section YOK, quick fact YOK).
 */
export function buildChakraWorkspace(
  record: ChakraSectionInput,
  blocks: ChakraContentBlock[],
  opts: { stonesVisible: boolean; quickFacts?: ChakraQuickFacts | null },
): ChakraWorkspaceSection[] {
  // 1) legacy section modeli — mevcut davranış DEĞİŞMEZ
  const legacy = buildChakraSections(record, { stonesVisible: opts.stonesVisible });
  const legacyById = new Map<string, ChakraSection>(legacy.map((s) => [s.id, s]));

  // 2) rich blokları section_key altında grupla (yalnız non-empty), sırala
  const richBySection = new Map<string, ChakraContentBlock[]>();
  for (const b of blocks) {
    if (!chakraBlockHasContent(b)) continue;
    const arr = richBySection.get(b.section_key) ?? [];
    arr.push(b);
    richBySection.set(b.section_key, arr);
  }
  for (const [k, arr] of richBySection) richBySection.set(k, sortRichBlocks(arr));

  // 3) quick facts — yalnız Genel Bakış
  const quickRows = chakraQuickFactRows(opts.quickFacts);

  // 4) kanonik sırada birleştir; görünürlük kuralı
  const out: ChakraWorkspaceSection[] = [];
  for (const id of CHAKRA_WORKSPACE_ORDER) {
    const legacySec = legacyById.get(id);
    const rich = richBySection.get(id) ?? [];
    const isGenel = id === "genel-bakis";
    const visible =
      Boolean(legacySec) || rich.length > 0 || (isGenel && quickRows.length > 0);
    if (!visible) continue;
    const dict = CHAKRA_SECTION_DICTIONARY.find((d) => d.id === id);
    out.push({
      id,
      hash: id,
      title: legacySec?.title ?? dict?.title ?? id,
      kind: legacySec?.kind ?? "content",
      legacyBlocks: legacySec?.blocks ?? [],
      quickFacts: isGenel ? quickRows : [],
      richBlocks: rich,
    });
  }
  return out;
}

/**
 * Doğaltaş — BİLGİ KAYDI BAZLI KAYNAK modeli. SAF yardımcılar (sunucu + istemci + testler).
 *
 * Model (supabase/migrations/20271016000000_dogaltas_stone_entries.sql):
 *   TAŞ → BİLGİ ALANI → BİLGİ KAYDI → o kaydın KENDİ kaynağı.
 *   - Yeni kayıtlar: public.stone_entries (id, alan, metin, kaynak, sıra).
 *   - Eski metinler (stones.<alan>, stone_sources.<alan>) YERİNDE kalır ve "eski bilgi kaydı" olarak
 *     gösterilir — metin BÖLÜNMEZ; kaynağı primary_source_name / stone_sources.source_name.
 *   - Eski kayıt düzenlenince sunucu onu aynı sıra ile stone_entries'e dönüştürür (RPC, atomik).
 */
import { normalizeTr } from "@/lib/text/turkishSearch";
import {
  SOURCE_FIELD_LABELS,
  SOURCE_FIELD_MAX,
  SOURCE_NAME_MAX,
  SOURCE_TEXT_FIELDS,
  normalizeSourceName,
  type SourceTextField,
  type StoneSourceView,
} from "@/lib/dogaltas/stoneSources";

/** Bilgi kaydı tutulan GERÇEK serbest metin alanları (stones kolonlarıyla aynı). */
export const ENTRY_FIELDS = SOURCE_TEXT_FIELDS;
export type EntryField = SourceTextField;

export function isEntryField(v: unknown): v is EntryField {
  return typeof v === "string" && (ENTRY_FIELDS as readonly string[]).includes(v);
}

/** Eski metin kaydının sanal sırası: yeni kayıtların (≥0) ÖNÜNDE; dönüştürülünce aynı sıra korunur. */
export const LEGACY_PRIMARY_ORDER = -1000;
export const legacySortOrder = (extraIndex: number | null) => (extraIndex == null ? LEGACY_PRIMARY_ORDER : LEGACY_PRIMARY_ORDER + 1 + extraIndex);

export type StoneEntryView = {
  /** stone_entries.id ya da "legacy:<primary|sourceId>:<alan>" */
  id: string;
  field: EntryField;
  content: string;
  /** null → "Kaynak belirtilmemiş" */
  sourceName: string | null;
  sortOrder: number;
  /** Eski (henüz dönüştürülmemiş) metin mi? */
  legacy: boolean;
  /** legacy ise kökeni: "primary" | stone_sources.id */
  legacyOrigin: string | null;
  updatedAt: string | null;
};

export const legacyEntryId = (origin: string, field: EntryField) => `legacy:${origin}:${field}`;

/** "legacy:<origin>:<alan>" çözümü; geçersizse null. */
export function parseLegacyEntryId(id: string): { origin: string; field: EntryField } | null {
  const m = /^legacy:([^:]+):([a-z_]+)$/.exec(id);
  if (!m || !isEntryField(m[2])) return null;
  if (m[1] !== "primary" && !/^[0-9a-f-]{36}$/i.test(m[1]!)) return null;
  return { origin: m[1]!, field: m[2] };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Taşın bir alanındaki TÜM bilgi kayıtları (eski + yeni), gösterim sırasıyla. Metinler AYNEN
 * (kırpma/birleştirme yok). `sources` = buildStoneSourcesView çıktısı (birincil ilk).
 */
export function buildFieldEntries(
  sources: readonly StoneSourceView[],
  entryRows: readonly Record<string, unknown>[],
  field: EntryField,
): StoneEntryView[] {
  // createdAt yalnız aynı sıra numarasında eşitlik bozucu (gösterilmez).
  const items: { view: StoneEntryView; createdAt: string; i: number }[] = [];
  let extraIdx = 0;
  for (const s of sources) {
    const idx = s.isPrimary ? null : extraIdx++;
    const text = s.fields[field];
    if (!text?.trim()) continue;
    const origin = s.isPrimary ? "primary" : s.id;
    items.push({
      view: { id: legacyEntryId(origin, field), field, content: text, sourceName: s.name, sortOrder: legacySortOrder(idx), legacy: true, legacyOrigin: origin, updatedAt: s.updatedAt },
      createdAt: "", i: items.length,
    });
  }
  for (const r of entryRows) {
    if (r.field_key !== field) continue;
    const content = typeof r.content === "string" ? r.content : "";
    if (!content.trim()) continue;
    items.push({
      view: {
        id: String(r.id), field, content, sourceName: str(r.source_name)?.trim() ?? null,
        sortOrder: Number(r.sort_order ?? 0) || 0, legacy: false, legacyOrigin: null,
        updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
      },
      createdAt: String(r.created_at ?? ""), i: items.length,
    });
  }
  return items
    .sort((a, b) => a.view.sortOrder - b.view.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.i - b.i)
    .map((x) => x.view);
}

export type StoneEntriesByField = Record<EntryField, StoneEntryView[]>;

export function buildAllFieldEntries(
  sources: readonly StoneSourceView[],
  entryRows: readonly Record<string, unknown>[],
): StoneEntriesByField {
  const out = {} as StoneEntriesByField;
  for (const f of ENTRY_FIELDS) out[f] = buildFieldEntries(sources, entryRows, f);
  return out;
}

/** Yeni kaydın sırası: alandaki en büyük sıra + 1 (en az 0) → eklenme sırası korunur. */
export function nextEntrySortOrder(existing: readonly { sortOrder: number }[]): number {
  return Math.max(-1, ...existing.map((e) => e.sortOrder)) + 1;
}

/** Bir alanın arama metni (tüm kayıtlar). */
export function fieldEntriesText(entries: readonly StoneEntryView[]): string {
  return entries.map((e) => e.content).join("\n");
}

/** Bu taşta kullanılan kaynaklar (dolu kaydı olan), ilk görülme sırasıyla + kayıt sayısı. */
export function entrySourceSummary(byField: StoneEntriesByField): { name: string | null; count: number }[] {
  const map = new Map<string, { name: string | null; count: number }>();
  for (const f of ENTRY_FIELDS) {
    for (const e of byField[f]) {
      const k = e.sourceName ? normalizeTr(e.sourceName) : "\u0000";
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { name: e.sourceName, count: 1 });
    }
  }
  return [...map.values()];
}

export type EntryPayloadResult =
  | { ok: true; content?: string; sourceName?: string | null; field?: EntryField }
  | { ok: false; error: string };

/**
 * İstemci gövdesi doğrulaması. Metin AYNEN saklanır (kırpma yok; yalnız boşluktan ibaret → hata).
 * `requireAll`: yeni kayıtta alan + metin + kaynak zorunlu.
 */
export function validateEntryPayload(body: Record<string, unknown>, opts: { requireAll: boolean }): EntryPayloadResult {
  const out: { content?: string; sourceName?: string | null; field?: EntryField } = {};
  if (opts.requireAll || "field_key" in body) {
    if (!isEntryField(body.field_key)) return { ok: false, error: "Geçersiz bilgi alanı." };
    out.field = body.field_key;
  }
  if (opts.requireAll || "content" in body) {
    const c = body.content;
    if (typeof c !== "string" || !c.trim()) return { ok: false, error: "Bilgi metni boş olamaz." };
    if (c.length > SOURCE_FIELD_MAX) return { ok: false, error: "Bilgi metni çok uzun." };
    out.content = c;
  }
  if (opts.requireAll || "source_name" in body) {
    const n = normalizeSourceName(body.source_name);
    if (!n) return { ok: false, error: "Kaynak zorunludur." };
    if (n.length > SOURCE_NAME_MAX) return { ok: false, error: `Kaynak en fazla ${SOURCE_NAME_MAX} karakter olabilir.` };
    out.sourceName = n;
  }
  return { ok: true, ...out };
}

export const ENTRY_FIELD_LABELS: Record<EntryField, string> = Object.fromEntries(
  ENTRY_FIELDS.map((f) => [f, SOURCE_FIELD_LABELS[f]]),
) as Record<EntryField, string>;

"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { fetchCombinationsViaApi } from "@/lib/dogaltas/combinationsApi";
import { updateCombination } from "@/lib/dogaltas/dogaltasApi";
import { fetchInventoryRows } from "@/lib/urun-stok/dogaltasInventoryApi";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import {
  mergeMatchCardClass,
  normalizeTrSearch,
  renderHighlightedText,
  SEARCH_MATCH_BADGE_COMPACT_CLASS as SEARCH_MATCH_BADGE_CLASS,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";


type CombinationRecord = {
  id: string;
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
  created_at: string;
};

type StockEntry = {
  adet: number;
  unitCostTry: number;
  displayName: string;
};

function fmtTL(x: number): string {
  return `₺${x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildContentKey(row: CombinationRecord): string {
  return [
    row.source?.trim() ?? "",
    row.stones_text?.trim() ?? "",
    row.notes_text?.trim() ?? "",
    row.notes_text_2?.trim() ?? "",
    row.notes_text_3?.trim() ?? "",
  ].join("\x00");
}

function deduplicateRows(rows: CombinationRecord[]): CombinationRecord[] {
  const seen = new Set<string>();
  const result: CombinationRecord[] = [];
  for (const row of rows) {
    const key = buildContentKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  }
  return result;
}


function normalizeForMatch(value: string): string {
  return normalizeTrSearch(value)
    .replace(/\s+/g, " ")
    .trim();
}

// Kelime sınırı eşleşmesi için noktalama → boşluk
function normalizeForWordMatch(value: string): string {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Levenshtein + fuzzy eşleşme ────────────────────────────────────────────

// OSA (Optimal String Alignment) — transposition'ı 1 işlem sayar
// "labrodroit" gibi yer-değişimli yazım hatalarını da yakalar
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + cost);
      }
    }
  }
  return dp[m]![n]!;
}

// candidate ve stockKey ikisi de zaten normalizeForWordMatch'li string
function fuzzyMatchesKey(candidate: string, stockKey: string): boolean {
  const a = normalizeForWordMatch(candidate);
  const b = normalizeForWordMatch(stockKey);
  if (a.length < 5 || b.length < 5) return false;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const sim = 1 - dist / maxLen;
  if (sim >= 0.82) return true;
  if (dist <= 2 && b.length >= 7) return true;
  return false;
}

// Önce exact eşleşme, yoksa fuzzy fallback. stockMap key veya null döner.
function resolveStockKey(
  name: string,
  stockMap: Map<string, StockEntry>,
): string | null {
  const exactKey = normalizeForMatch(name);
  if (stockMap.has(exactKey)) return exactKey;

  const norm = normalizeForWordMatch(name);
  if (norm.length < 5) return null;

  let bestKey: string | null = null;
  let bestSim = 0;

  for (const [stockKey] of stockMap) {
    if (!fuzzyMatchesKey(norm, stockKey)) continue;
    const stockNorm = normalizeForWordMatch(stockKey);
    const maxLen = Math.max(norm.length, stockNorm.length);
    const sim = 1 - levenshtein(norm, stockNorm) / maxLen;
    if (sim > bestSim) {
      bestSim = sim;
      bestKey = stockKey;
    }
  }

  if (bestKey && process.env.NODE_ENV === "development") {
    const canon = stockMap.get(bestKey)?.displayName ?? bestKey;
    console.log(`[Fuzzy eşleşme] "${name}" → "${canon}" (sim: ${bestSim.toFixed(3)})`);
  }

  return bestKey;
}

// ─────────────────────────────────────────────────────────────────────────────

// Metinde geçen stok taş adlarının normalize anahtarlarını döndürür
// Kelime sınırı kontrolü: " taşadı " şeklinde aranır → "topal" içinde "opal" eşleşmez
function findStockedStonesInText(
  text: string,
  stockMap: Map<string, StockEntry>,
): string[] {
  if (!text.trim() || stockMap.size === 0) return [];
  const normText = normalizeForWordMatch(text);
  const haystack = " " + normText + " ";
  const tokens = normText.split(/\s+/).filter(Boolean);
  const found: string[] = [];

  for (const [normalizedKey] of stockMap) {
    const needle = normalizeForWordMatch(normalizedKey);
    if (needle.length < 3) continue;

    // 1. Exact word-boundary match
    if (haystack.includes(" " + needle + " ")) {
      found.push(normalizedKey);
      continue;
    }

    // 2. Fuzzy fallback — sadece yeterli uzunluktaki adlar için
    if (needle.length < 5) continue;

    const needleWords = needle.split(/\s+/).filter(Boolean);
    const wc = needleWords.length;
    let fuzzyHit = false;

    // Metindeki token gruplarını (n-gram) stok adıyla karşılaştır
    for (let i = 0; i <= tokens.length - wc && !fuzzyHit; i++) {
      const phrase = tokens.slice(i, i + wc).join(" ");
      if (fuzzyMatchesKey(phrase, needle)) {
        fuzzyHit = true;
        if (process.env.NODE_ENV === "development") {
          const canon = stockMap.get(normalizedKey)?.displayName ?? normalizedKey;
          console.log(`[Fuzzy eşleşme (metin)] "${phrase}" → "${canon}"`);
        }
      }
    }

    if (fuzzyHit) found.push(normalizedKey);
  }

  return found;
}

// stones_text chip listesi + notlardan yakalanan ekstra stok taşları + tüm stoklu taşlar
// Fuzzy eşleşme sayesinde hatalı yazımlar da yakalanır; canonical isimler kullanılır.
function getMatchedStones(
  row: CombinationRecord,
  stockMap: Map<string, StockEntry>,
): { chipsStones: string[]; extraTextStones: string[]; allStockedDisplayNames: string[] } {
  const chipsStones = row.stones_text
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

  // Chip başına resolved stok key (exact veya fuzzy)
  const chipsResolvedKeys = new Set(
    chipsStones.map((s) => resolveStockKey(s, stockMap)).filter(Boolean) as string[],
  );

  // stones_text de taranır: cümle formatı içindeki taş adlarını yakalar
  const combinedText = [row.stones_text, row.notes_text, row.notes_text_2, row.notes_text_3]
    .filter(Boolean)
    .join(" ");

  const textNormKeys = combinedText.trim()
    ? findStockedStonesInText(combinedText, stockMap)
    : [];

  // Notlardan yakalananlar: chip listesiyle resolved key üzerinden karşılaştır
  const extraTextStones = textNormKeys
    .filter((k) => !chipsResolvedKeys.has(k))
    .map((k) => stockMap.get(k)?.displayName ?? k)
    .filter(Boolean) as string[];

  // Hesaplayıcı için tüm stoklu taşlar — canonical display name kullan (dedup)
  const seen = new Set<string>();
  const allStockedDisplayNames: string[] = [];

  for (const stone of chipsStones) {
    const stockKey = resolveStockKey(stone, stockMap);
    if (stockKey && !seen.has(stockKey)) {
      seen.add(stockKey);
      const entry = stockMap.get(stockKey);
      if (entry) allStockedDisplayNames.push(entry.displayName);
    }
  }
  for (const name of extraTextStones) {
    const key = normalizeForMatch(name);
    if (!seen.has(key)) {
      seen.add(key);
      allStockedDisplayNames.push(name);
    }
  }

  return { chipsStones, extraTextStones, allStockedDisplayNames };
}


function SearchMatchBadge() {
  return <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme</span>;
}


function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent =
  "relative z-10 mx-auto w-full max-w-[1720px] space-y-2 px-4 py-3 sm:px-5 lg:px-8 2xl:px-10";
const uiHeaderCard =
  "rounded-2xl border-[2px] border-violet-300/50 bg-white/80 p-3 shadow-md backdrop-blur-xl";
const uiVariantCard =
  "w-full rounded-xl border border-emerald-200/60 bg-white/80 p-3 shadow-sm backdrop-blur-xl";
const uiInfoCard =
  "rounded-xl border border-violet-100/60 bg-white/70 p-3 shadow-sm";
const uiEmptyText = "text-slate-400 italic text-xs";
const uiCategoryPill =
  "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-900";

type ToneKey = "violet" | "cyan" | "slate" | "amber";

function badgeClass(tone: ToneKey): string {
  const map: Record<ToneKey, string> = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    cyan: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wide ${map[tone]}`;
}

// ─── Field components ─────────────────────────────────────────────────────────

function FieldBlock({
  label,
  badge,
  tone = "violet",
  text,
  highlightQuery = "",
  hasSearchMatch = false,
}: {
  label: string;
  badge: string;
  tone?: ToneKey;
  text: string | null | undefined;
  highlightQuery?: string;
  hasSearchMatch?: boolean;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);
  const displayText = text?.trim() || "";

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={badgeClass(tone)}>{badge}</span>
        <h2 className="text-xs font-black text-slate-950">{label}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className="mt-1.5">
        {displayText ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {highlightQuery.trim()
              ? renderHighlightedText(displayText, highlightQuery)
              : displayText}
          </p>
        ) : (
          <p className={uiEmptyText}>—</p>
        )}
      </div>
    </article>
  );
}

function StonesBlock({
  stones,
  extraTextStones,
  stockMap,
  stockLoading,
  highlightQuery = "",
  hasSearchMatch = false,
}: {
  stones: string[];
  extraTextStones: string[];
  stockMap: Map<string, StockEntry>;
  stockLoading: boolean;
  highlightQuery?: string;
  hasSearchMatch?: boolean;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);

  // Chip başına stok çözümlemesi — exact veya fuzzy
  const resolvedChipData = !stockLoading
    ? stones.map((stone) => {
        const stockKey = resolveStockKey(stone, stockMap);
        const canonical =
          stockKey && stockKey !== normalizeForMatch(stone)
            ? (stockMap.get(stockKey)?.displayName ?? null)
            : null;
        return { stone, stockKey, canonical };
      })
    : stones.map((stone) => ({ stone, stockKey: null as string | null, canonical: null as string | null }));

  const inStockCount = !stockLoading
    ? resolvedChipData.filter((d) => d.stockKey !== null).length + extraTextStones.length
    : 0;

  const hasAny = stones.length > 0 || (!stockLoading && extraTextStones.length > 0);

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={badgeClass("cyan")}>TAŞLAR</span>
        <h2 className="text-xs font-black text-slate-950">Taş Listesi</h2>
        {stones.length > 0 ? (
          <span className="text-[10px] font-medium text-slate-400">
            {stones.length} taş
            {stockLoading
              ? " · stok kontrol ediliyor"
              : inStockCount > 0
                ? ` · ${inStockCount} stokta`
                : null}
          </span>
        ) : null}
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className="mt-1.5">
        {hasAny ? (
          <div className="flex flex-wrap gap-1.5">
            {resolvedChipData.map(({ stone, stockKey, canonical }, idx) => {
              if (stockLoading) {
                return (
                  <span
                    key={`c-${idx}`}
                    title="Stok bilgisi yükleniyor"
                    className="inline-flex min-h-[24px] items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-400"
                  >
                    {highlightQuery.trim()
                      ? renderHighlightedText(stone, highlightQuery)
                      : stone}
                  </span>
                );
              }
              const inStock = stockKey !== null;
              const canonical_ = canonical ?? null;
              return inStock ? (
                <span
                  key={`c-${idx}`}
                  title="Stokta var"
                  className="inline-flex min-h-[24px] items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                >
                  <span className="text-[10px] font-black text-emerald-600">✓</span>
                  {canonical_
                    ? canonical_
                    : highlightQuery.trim()
                      ? renderHighlightedText(stone, highlightQuery)
                      : stone}
                </span>
              ) : (
                <span
                  key={`c-${idx}`}
                  title="Stokta yok"
                  className="inline-flex min-h-[24px] items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                >
                  {highlightQuery.trim()
                    ? renderHighlightedText(stone, highlightQuery)
                    : stone}
                </span>
              );
            })}
            {!stockLoading && extraTextStones.map((stone, idx) => (
              <span
                key={`e-${idx}`}
                title="Stokta var"
                className="inline-flex min-h-[24px] items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
              >
                <span className="text-[10px] font-black text-emerald-600">✓</span>
                {stone}
              </span>
            ))}
          </div>
        ) : (
          <p className={uiEmptyText}>—</p>
        )}
      </div>
    </article>
  );
}

// ─── Combination calculator ───────────────────────────────────────────────────

function CombinationCalculator({
  stockedDisplayNames,
  stockMap,
}: {
  stockedDisplayNames: string[];
  stockMap: Map<string, StockEntry>;
}) {
  const [qtyMap, setQtyMap] = useState<Map<string, string>>(new Map());
  // Kâr marjı % — Ürün/Stok "Satış & Fiyatlandırma" sekmesiyle aynı mantık
  const [profitPctRaw, setProfitPctRaw] = useState("30");

  // Liste değişince adet sıfırla
  const listKey = stockedDisplayNames.join(",");
  useEffect(() => {
    setQtyMap(new Map());
  }, [listKey]);

  if (stockedDisplayNames.length === 0) return null;

  function effectiveQty(key: string): number {
    const raw = qtyMap.get(key);
    if (raw === undefined) return 1;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function handleQtyChange(key: string, value: string) {
    setQtyMap((prev) => new Map(prev).set(key, value.replace(/[^0-9]/g, "")));
  }

  const profitPctNum = Math.max(0, parseFloat(profitPctRaw) || 0);

  let totalCost = 0;
  for (const stone of stockedDisplayNames) {
    const key = normalizeForMatch(stone);
    const entry = stockMap.get(key);
    if (entry) totalCost += effectiveQty(key) * entry.unitCostTry;
  }

  // Satış fiyatı = maliyet × (1 + marj%) — Ürün/Stok salePrice formülüyle aynı
  const totalSale = totalCost * (1 + profitPctNum / 100);
  const profit = totalSale - totalCost;

  return (
    <div className="space-y-1">
      {stockedDisplayNames.map((stone) => {
          const key = normalizeForMatch(stone);
          const entry = stockMap.get(key);
          if (!entry) return null;
          const qty = effectiveQty(key);
          const rowCost = qty * entry.unitCostTry;
          const overStock = entry.adet > 0 && qty > entry.adet;

          return (
            <div
              key={stone}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-100 bg-white px-3 py-2"
            >
              <span className="min-w-[130px] text-xs font-bold text-slate-800">
                {stone}
              </span>
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="font-medium">Adet</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={qtyMap.get(key) ?? "1"}
                  onChange={(e) => handleQtyChange(key, e.target.value)}
                  className="ml-1 w-12 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/40"
                />
              </label>
              {overStock ? (
                <span className="text-[10px] font-semibold text-amber-600">
                  ⚠ mevcut: {entry.adet}
                </span>
              ) : null}
              {entry.unitCostTry > 0 ? (
                <span className="ml-auto text-[11px] font-semibold text-slate-600">
                  {fmtTL(entry.unitCostTry)}
                  {qty > 1 ? (
                    <span className="ml-1 font-black text-slate-800">× {qty} = {fmtTL(rowCost)}</span>
                  ) : null}
                </span>
              ) : (
                <span className="ml-auto text-[11px] text-slate-400">fiyat girilmemiş</span>
              )}
            </div>
          );
      })}

      {totalCost > 0 ? (
        <div className="mt-2 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-emerald-50/30 to-white px-4 py-4 shadow-md">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Toplam Maliyet</span>
              <span className="text-xl font-black leading-none text-slate-800">{fmtTL(totalCost)}</span>
            </div>
            <label className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Kâr Marjı</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={profitPctRaw}
                  onChange={(e) => setProfitPctRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-center text-sm font-black text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/40"
                />
                <span className="text-sm font-bold text-slate-500">%</span>
              </div>
            </label>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Tahmini Satış</span>
              <span className="text-xl font-black leading-none text-emerald-700">{fmtTL(totalSale)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Net Kâr</span>
              <span className="text-xl font-black leading-none text-emerald-700">
                {fmtTL(profit)}
                <span className="ml-1 text-[10px] font-semibold text-emerald-500">({profitPctNum.toFixed(1)}%)</span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Analytics helpers ───────────────────────────────────────────────────────

type VariantSummary = {
  rowId: string;
  stockedCount: number;
  totalChips: number;
  applicabilityPct: number;
  estimatedCost: number;
  stockedDisplayNames: string[];
  missingStoneNames: string[];
};

type GlobalSummary = {
  totalCombinations: number;
  totalStockedUnique: number;
  totalUniqueStones: number;
  missingNames: string[];
  criticalStones: { name: string; adet: number }[];
  bestVariantIndex: number;
  bestVariantPct: number;
  bestVariantCost: number;
};

function isLikelyStoneName(chip: string): boolean {
  const trimmed = chip.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return false;
  if (trimmed.split(/\s+/).filter(Boolean).length > 3) return false;
  const norm = normalizeForMatch(trimmed);
  const skip = ["kullan", "icin", "adet", "koy", "geri", "tamamla", "bunlar", "milim", "orta", "milimlik", "birlikte", "yapil"];
  return !skip.some((w) => norm.includes(w));
}

function computeVariantSummary(
  row: CombinationRecord,
  stockMap: Map<string, StockEntry>,
): VariantSummary {
  const { chipsStones, allStockedDisplayNames } = getMatchedStones(row, stockMap);
  const stockedCount = allStockedDisplayNames.length;
  const totalChips = chipsStones.length;
  const applicabilityPct =
    totalChips > 0
      ? Math.min(100, Math.round((stockedCount / totalChips) * 100))
      : stockedCount > 0
        ? 100
        : 0;

  const missingStoneNames = chipsStones.filter(
    (chip) => isLikelyStoneName(chip) && resolveStockKey(chip, stockMap) === null,
  );

  const estimatedCost = allStockedDisplayNames.reduce((sum, name) => {
    const entry = stockMap.get(normalizeForMatch(name));
    return sum + (entry?.unitCostTry ?? 0);
  }, 0);

  return {
    rowId: row.id,
    stockedCount,
    totalChips,
    applicabilityPct,
    estimatedCost,
    stockedDisplayNames: allStockedDisplayNames,
    missingStoneNames,
  };
}

function computeGlobalSummary(
  variantSummaries: VariantSummary[],
  stockMap: Map<string, StockEntry>,
): GlobalSummary {
  const stockedSet = new Set<string>();
  const missingSet = new Set<string>();

  for (const vs of variantSummaries) {
    vs.stockedDisplayNames.forEach((n) => stockedSet.add(normalizeForMatch(n)));
    vs.missingStoneNames.forEach((n) => {
      const k = normalizeForMatch(n);
      if (!stockedSet.has(k)) missingSet.add(n);
    });
  }

  const criticalStones: { name: string; adet: number }[] = [];
  for (const normKey of stockedSet) {
    const entry = stockMap.get(normKey);
    if (entry && entry.adet > 0 && entry.adet <= 5) {
      criticalStones.push({ name: entry.displayName, adet: entry.adet });
    }
  }
  criticalStones.sort((a, b) => a.adet - b.adet);

  const sorted = [...variantSummaries].sort((a, b) => {
    if (b.applicabilityPct !== a.applicabilityPct) return b.applicabilityPct - a.applicabilityPct;
    return a.estimatedCost - b.estimatedCost;
  });
  const best = sorted[0];
  const bestIdx = best ? variantSummaries.findIndex((v) => v.rowId === best.rowId) : 0;

  return {
    totalCombinations: variantSummaries.length,
    totalStockedUnique: stockedSet.size,
    totalUniqueStones: stockedSet.size + missingSet.size,
    missingNames: [...missingSet],
    criticalStones,
    bestVariantIndex: bestIdx,
    bestVariantPct: best?.applicabilityPct ?? 0,
    bestVariantCost: best?.estimatedCost ?? 0,
  };
}

// ─── Dashboard bileşenleri ─────────────────────────────────────────────────────

function ApplicabilityBadge({ pct }: { pct: number }) {
  const [cls, label] =
    pct === 100
      ? ["border-emerald-200 bg-emerald-50 text-emerald-700", "Tam"]
      : pct >= 50
        ? ["border-amber-200 bg-amber-50 text-amber-700", "Kısmi"]
        : ["border-rose-200 bg-rose-50 text-rose-700", "Eksik"];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${cls}`}>
      {pct}% {label}
    </span>
  );
}

function AnalysisDashboard({
  global,
  variantSummaries,
}: {
  global: GlobalSummary;
  variantSummaries: VariantSummary[];
}) {
  const showBest = variantSummaries.length > 1 && global.bestVariantPct > 0;

  return (
    <div className="space-y-2">
      {/* Özet istatistikler */}
      <div className={`${uiInfoCard} space-y-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-violet-400 bg-gradient-to-r from-violet-100 to-violet-50 px-3 py-0.5 text-[10px] font-black tracking-widest text-violet-900 shadow-sm">
            ANALİZ
          </span>
          <StatChip label="Kombinasyon" value={global.totalCombinations} color="violet" />
          <StatChip label="Stok Taşı" value={global.totalStockedUnique} color="emerald" />
          {global.missingNames.length > 0 && (
            <StatChip label="Eksik" value={global.missingNames.length} color="rose" />
          )}
          {global.criticalStones.length > 0 && (
            <StatChip label="Kritik Stok" value={global.criticalStones.length} color="amber" />
          )}
        </div>
        {showBest && (
          <div className="flex items-center gap-2.5 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-3.5 py-2.5 shadow-sm">
            <span className="text-xl text-amber-400">★</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[12px] font-black text-amber-900">
                  Önerilen: Kombinasyon {global.bestVariantIndex + 1}
                </span>
                <span className="text-[13px] font-black text-emerald-700">{global.bestVariantPct}%</span>
                {global.bestVariantCost > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500">{fmtTL(global.bestVariantCost)} tahmini maliyet</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Eksik taşlar */}
      {global.missingNames.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black tracking-wide text-rose-800">
              EKSİK TAŞLAR
            </span>
            <span className="text-[10px] font-medium text-rose-500">{global.missingNames.length} taş</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {global.missingNames.map((name, i) => (
              <span
                key={i}
                className="inline-block max-w-[180px] break-words rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold leading-snug text-rose-700"
                title={name}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Kritik stok */}
      {global.criticalStones.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black tracking-wide text-amber-900">
              KRİTİK STOK
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {global.criticalStones.map(({ name, adet }, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800"
              >
                <span className="text-amber-500">⚠</span>
                {name}
                <span className="rounded-full bg-amber-100 px-1 text-[10px] font-black text-amber-700">{adet}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "violet" | "emerald" | "rose" | "amber";
}) {
  const cls = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[color];
  return (
    <span className={`inline-flex flex-col items-center rounded-xl border px-3 py-1.5 shadow-sm ${cls}`}>
      <span className="text-lg font-black leading-none">{value}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</span>
    </span>
  );
}

// ─── Variant card ─────────────────────────────────────────────────────────────

function VariantCard({
  row,
  index,
  total,
  highlightQuery = "",
  fieldMatches,
  stockMap,
  stockLoading,
  isCalcOpen,
  onToggleCalc,
  applicabilityPct,
  isDemo = false,
  onSaved,
}: {
  row: CombinationRecord;
  index: number;
  total: number;
  highlightQuery?: string;
  fieldMatches: {
    source: boolean;
    stones: boolean;
    notes: boolean;
    notes2: boolean;
    notes3: boolean;
  };
  stockMap: Map<string, StockEntry>;
  stockLoading: boolean;
  isCalcOpen: boolean;
  onToggleCalc: () => void;
  applicabilityPct?: number;
  isDemo?: boolean;
  onSaved?: (newIssue: string) => void;
}) {
  const calcOpen = isCalcOpen;

  // ─── Düzenleme durumu (yalnız kendi tenant kombinasyonu) ───
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editIssue, setEditIssue] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editStones, setEditStones] = useState<string[]>([]);
  const [newStone, setNewStone] = useState("");

  function startEdit() {
    setEditIssue(row.issue ?? "");
    setEditDesc(row.description ?? "");
    setEditNote(row.notes_text_3 ?? "");
    setEditStones(
      row.stones_text?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    );
    setNewStone("");
    setEditError("");
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
    setEditError("");
  }
  function addStone() {
    const s = newStone.trim();
    if (!s) return;
    // Aynı taş iki kez eklenmesin (oluşturma davranışıyla uyumlu).
    const exists = editStones.some((x) => normalizeForMatch(x) === normalizeForMatch(s));
    if (!exists) setEditStones((prev) => [...prev, s]);
    setNewStone("");
  }
  function removeStone(idx: number) {
    setEditStones((prev) => prev.filter((_, i) => i !== idx));
  }
  async function saveEdit() {
    const issue = editIssue.trim();
    if (!issue) {
      setEditError("Kombinasyon adı boş bırakılamaz.");
      return;
    }
    const stones = editStones.map((s) => s.trim()).filter(Boolean);
    if (stones.length === 0) {
      setEditError("En az bir taş bulunmalıdır.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    const res = await updateCombination(row.id, {
      issue,
      description: editDesc.trim() || null,
      stones_text: stones.join(", "),
      notes_text_3: editNote.trim() || null,
    });
    setEditSaving(false);
    if (!res.ok) {
      setEditError(res.error || "Kombinasyon güncellenemedi. Lütfen tekrar deneyin.");
      return;
    }
    setIsEditing(false);
    onSaved?.(res.issue ?? issue);
  }

  const hasVariantMatch =
    fieldMatches.source ||
    fieldMatches.stones ||
    fieldMatches.notes ||
    fieldMatches.notes2 ||
    fieldMatches.notes3;
  const showMatchBadge = Boolean(highlightQuery.trim() && hasVariantMatch);
  const cardClass = mergeMatchCardClass(uiVariantCard, showMatchBadge);

  // Metin içi taş algılama — stok yüklendikten sonra hesaplanır
  const { chipsStones, extraTextStones, allStockedDisplayNames } =
    !stockLoading && stockMap.size > 0
      ? getMatchedStones(row, stockMap)
      : {
          chipsStones:
            row.stones_text?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
          extraTextStones: [] as string[],
          allStockedDisplayNames: [] as string[],
        };

  return (
    <article className={cardClass}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-gradient-to-r from-violet-100 to-indigo-50 px-3 py-1 text-[11px] font-black tracking-wide text-violet-900 shadow-sm">
          <span className="text-violet-400">◈</span>
          <span>Kombinasyon</span>
          <span>{index + 1} / {total}</span>
        </span>
        {!isDemo && applicabilityPct !== undefined && !stockLoading && !isEditing ? (
          <ApplicabilityBadge pct={applicabilityPct} />
        ) : null}
        {!isEditing && showMatchBadge ? <SearchMatchBadge /> : null}
        <div className="ml-auto flex items-center gap-2">
          {!isDemo && !isEditing ? (
            <>
              <span className="text-[9px] font-medium tabular-nums text-slate-300">
                {formatDate(row.created_at)}
              </span>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700 shadow-sm transition hover:bg-violet-100"
              >
                ✏️ Düzenle
              </button>
            </>
          ) : null}
          {!isDemo && isEditing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={editSaving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={editSaving}
                className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {editSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2.5">
          {editError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">
              {editError}
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Kombinasyon Adı
            </label>
            <input
              value={editIssue}
              onChange={(e) => setEditIssue(e.target.value)}
              placeholder="Kombinasyon adı"
              aria-label="Kombinasyon adı"
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Açıklama / Amaç
            </label>
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Açıklama / amaç (opsiyonel)"
              aria-label="Açıklama"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div>
            <label className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>Taşlar</span>
              <span className="font-medium normal-case tracking-normal text-slate-400">
                {editStones.length} taş · ✓ stokta · × ile çıkar
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
              {editStones.length === 0 ? (
                <span className="px-1 text-xs italic text-slate-400">En az bir taş ekleyin</span>
              ) : (
                editStones.map((stone, idx) => {
                  const inStock = !stockLoading && resolveStockKey(stone, stockMap) !== null;
                  return (
                    <span
                      key={`${stone}-${idx}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        inStock
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {inStock ? <span className="text-[10px] font-black text-emerald-600">✓</span> : null}
                      {stone}
                      <button
                        type="button"
                        onClick={() => removeStone(idx)}
                        aria-label={`${stone} taşını çıkar`}
                        className="ml-0.5 rounded-full px-1 text-sm font-black leading-none text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"
                      >
                        ×
                      </button>
                    </span>
                  );
                })
              )}
            </div>
            <div className="mt-1.5 flex gap-2">
              <input
                value={newStone}
                onChange={(e) => setNewStone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStone();
                  }
                }}
                placeholder="Taş adı ekle..."
                aria-label="Taş adı ekle"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={addStone}
                className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black text-violet-700 shadow-sm transition hover:bg-violet-100"
              >
                + Ekle
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">
              Not
            </label>
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={2}
              placeholder="Serbest not (opsiyonel)"
              aria-label="Not"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={editSaving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={editSaving}
              className="rounded-lg border border-emerald-500 bg-emerald-600 px-4 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {editSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      ) : (
      <DemoBlur isProtected={isDemo}>
      <div className="space-y-2">
        <FieldBlock
          label="Kaynak"
          badge="KAYNAK"
          tone="violet"
          text={row.source}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.source}
        />
        <StonesBlock
          stones={chipsStones}
          extraTextStones={extraTextStones}
          stockMap={stockMap}
          stockLoading={stockLoading}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.stones}
        />
        <div>
          <button
            type="button"
            onClick={onToggleCalc}
            disabled={stockLoading}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-black shadow-sm transition ${
              stockLoading
                ? "cursor-default border-slate-200 bg-slate-50 text-slate-400"
                : calcOpen
                  ? "border-amber-300 bg-amber-100 text-amber-900"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100"
            }`}
          >
            <span className="text-amber-500">{calcOpen ? "▲" : "▼"}</span>
            <span>Hesap Makinesi</span>
            {stockLoading ? (
              <span className="text-[10px] font-medium text-slate-400">· yükleniyor</span>
            ) : allStockedDisplayNames.length > 0 ? (
              <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-black text-amber-900">
                {allStockedDisplayNames.length}
              </span>
            ) : null}
          </button>
          {calcOpen && !stockLoading && allStockedDisplayNames.length > 0 ? (
            <div className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3 shadow-md ring-1 ring-amber-100/50">
              <CombinationCalculator
                stockedDisplayNames={allStockedDisplayNames}
                stockMap={stockMap}
              />
            </div>
          ) : calcOpen && !stockLoading ? (
            <p className="mt-2 text-[11px] font-medium text-slate-400">
              Bu kombinasyonda stokta eşleşen taş bulunamadı.
            </p>
          ) : null}
        </div>
        <FieldBlock
          label="Notlar"
          badge="NOTLAR"
          tone="slate"
          text={row.notes_text}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.notes}
        />
        {row.notes_text_2?.trim() ? (
          <FieldBlock
            label="Notlar 2"
            badge="NOTLAR 2"
            tone="slate"
            text={row.notes_text_2}
            highlightQuery={highlightQuery}
            hasSearchMatch={fieldMatches.notes2}
          />
        ) : null}
        {row.notes_text_3?.trim() ? (
          <FieldBlock
            label="Notlar 3"
            badge="NOTLAR 3"
            tone="slate"
            text={row.notes_text_3}
            highlightQuery={highlightQuery}
            hasSearchMatch={fieldMatches.notes3}
          />
        ) : null}
      </div>
      </DemoBlur>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function KombinasyonDetayPageContent() {
  const params = useParams<{ title: string | string[] }>();
  const searchParams = useSearchParams();
  const highlightQuery = searchParams.get("q")?.trim() ?? "";
  const listBackHref = highlightQuery
    ? `/dogaltas/kombinasyonlar?q=${encodeURIComponent(highlightQuery)}`
    : "/dogaltas/kombinasyonlar";

  const rawSegment = params?.title;
  const encodedTitle = Array.isArray(rawSegment) ? rawSegment[0] : rawSegment;

  const decodedIssue = useMemo(() => {
    if (!encodedTitle || typeof encodedTitle !== "string") return "";
    try {
      return decodeURIComponent(encodedTitle);
    } catch {
      return encodedTitle;
    }
  }, [encodedTitle]);

  const [rows, setRows] = useState<CombinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [openCalcIds, setOpenCalcIds] = useState<Set<string>>(new Set());
  const [stockMap, setStockMap] = useState<Map<string, StockEntry>>(new Map());
  const [stockLoading, setStockLoading] = useState(true);
  const [wordBusy, setWordBusy] = useState(false);
  const { isDemo } = useDemoGuard();
  const router = useRouter();

  const downloadWord = useCallback(async () => {
    if (!decodedIssue) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/dogaltas/combinations/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, userId, exportMode: "single", combinationTitle: decodedIssue }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = decodedIssue.toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `kombinasyon-${safe}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedIssue]);

  const categoryLabel = useMemo(() => {
    for (const row of rows) {
      const desc = row.description?.trim();
      if (desc) return desc;
    }
    return null;
  }, [rows]);

  const loadRows = useCallback(async () => {
    if (!decodedIssue) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const result = await fetchCombinationsViaApi(decodedIssue);

    setLoading(false);

    if (!result.ok) {
      setErrorMessage(`Kayıtlar alınamadı: ${result.error ?? ""}`);
      setRows([]);
      return;
    }

    const raw = result.rows as CombinationRecord[];
    const unique = deduplicateRows(raw);
    const droppedCount = raw.length - unique.length;

    if (droppedCount > 0) {
      const freq = new Map<string, number>();
      for (const row of raw) {
        const k = buildContentKey(row);
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
      console.group(`[Kombinasyon] "${decodedIssue}" — ${raw.length} ham → ${unique.length} unique (${droppedCount} duplicate temizlendi)`);
      for (const [k, count] of freq) {
        if (count > 1) {
          const preview = k.split("\x00")[0]?.slice(0, 60) ?? "(boş)";
          console.log(`  ${count}× — kaynak: "${preview}"`);
        }
      }
      console.groupEnd();
    } else {
      console.log(`[Kombinasyon] "${decodedIssue}" — ${raw.length} kayıt, duplicate yok.`);
    }

    setRows(unique);
  }, [decodedIssue]);

  const loadStockNames = useCallback(async () => {
    setStockLoading(true);
    try {
      // Stok kaynağı güvenli server API'dir (tenant sunucuda; istemci tenant göndermez).
      const { rows, error } = await fetchInventoryRows();
      if (error) return;

      type StockRow = { name?: unknown; adet?: unknown; unit_cost_try?: unknown };
      const tempMap = new Map<string, StockEntry>();
      for (const raw of rows as StockRow[]) {
        const name = String(raw.name ?? "").trim();
        const adet = Number(raw.adet) || 0;
        // Önceki sorgu .gt("adet", 0) yapıyordu — aynı davranış istemcide korunur.
        if (!name || adet <= 0) continue;
        const unitCostTry = Number(raw.unit_cost_try) || 0;
        const key = normalizeForMatch(name);
        const existing = tempMap.get(key);
        if (!existing) {
          tempMap.set(key, { adet, unitCostTry, displayName: name });
        } else {
          tempMap.set(key, { ...existing, adet: existing.adet + adet });
        }
      }
      setStockMap(tempMap);
    } finally {
      setStockLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadRows(), loadStockNames()]);
  }, [loadRows, loadStockNames]);

  useEffect(() => {
    runInEffect(() => {
      void handleRefresh();
    });
  }, [handleRefresh]);

  const sectionMatches = useMemo(() => {
    const q = highlightQuery.trim();
    if (!q) return null;

    const matchesText = (value: string | null | undefined) => textMatchesQuery(value, q);

    return {
      issue: matchesText(decodedIssue),
      category: matchesText(categoryLabel),
      description: rows.some((row) => matchesText(row.description)),
    };
  }, [highlightQuery, decodedIssue, categoryLabel, rows]);

  const variantFieldMatches = useMemo(() => {
    const q = highlightQuery.trim();
    if (!q) return [];

    const matchesText = (value: string | null | undefined) => textMatchesQuery(value, q);

    return rows.map((row) => ({
      source: matchesText(row.source),
      stones: matchesText(row.stones_text),
      notes: matchesText(row.notes_text),
      notes2: matchesText(row.notes_text_2),
      notes3: matchesText(row.notes_text_3),
    }));
  }, [highlightQuery, rows]);

  const variantSummaries = useMemo<VariantSummary[] | null>(() => {
    if (stockLoading || stockMap.size === 0 || rows.length === 0) return null;
    return rows.map((row) => computeVariantSummary(row, stockMap));
  }, [rows, stockMap, stockLoading]);

  const globalSummary = useMemo<GlobalSummary | null>(() => {
    if (!variantSummaries) return null;
    return computeGlobalSummary(variantSummaries, stockMap);
  }, [variantSummaries, stockMap]);

  const hasHighlight = Boolean(highlightQuery.trim());
  const headerHasMatch = Boolean(
    sectionMatches?.issue || sectionMatches?.category || sectionMatches?.description,
  );

  if (!decodedIssue) {
    return (
      <main className={`${pageBg} flex min-h-screen items-center justify-center`}>
        <div className={`${uiHeaderCard} w-full text-center`}>
          <p className="text-sm font-bold text-slate-600">Geçersiz başlık.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[400px] w-[400px] rounded-full bg-violet-300/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-emerald-300/15 blur-[120px]" />

      <div className={pageContent}>
        <header
          className={mergeMatchCardClass(
            `${uiHeaderCard} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`,
            Boolean(hasHighlight && headerHasMatch),
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-violet-700">
                KOMBİNASYON DETAY
              </span>
              {categoryLabel ? (
                <span className={uiCategoryPill}>
                  {hasHighlight
                    ? renderHighlightedText(categoryLabel, highlightQuery)
                    : categoryLabel}
                </span>
              ) : null}
              {hasHighlight && sectionMatches?.category ? <SearchMatchBadge /> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-950 break-words sm:text-2xl">
                {hasHighlight
                  ? renderHighlightedText(decodedIssue, highlightQuery)
                  : decodedIssue}
              </h1>
              {hasHighlight && sectionMatches?.issue ? <SearchMatchBadge /> : null}
            </div>

            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {loading
                ? "Yükleniyor..."
                : rows.length === 0
                  ? "Henüz variant kaydı yok."
                  : `${rows.length} kombinasyon variant`}
              {hasHighlight && sectionMatches?.description ? (
                <span className="ml-2 font-black text-emerald-700">· Açıklama eşleşmesi</span>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!isDemo && !loading && rows.length > 0 && (
              <button
                type="button"
                onClick={() => void downloadWord()}
                disabled={wordBusy}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-60"
              >
                {wordBusy ? "⏳..." : "📄 Word"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-emerald-50"
            >
              Yenile
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {globalSummary && variantSummaries ? (
          <DemoBlur isProtected={isDemo}>
            <AnalysisDashboard global={globalSummary} variantSummaries={variantSummaries} />
          </DemoBlur>
        ) : null}

        {loading ? (
          <div
            className={`${uiVariantCard} flex min-h-[120px] items-center justify-center text-sm font-bold text-slate-500`}
          >
            Yükleniyor...
          </div>
        ) : rows.length === 0 && !errorMessage ? (
          <div className={`${uiVariantCard} text-center py-8`}>
            <div className="text-3xl">✶</div>
            <p className="mt-2 text-base font-semibold text-slate-800">Henüz kombinasyon kaydı yok</p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Bu başlık için henüz variant aktarılmamış olabilir.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <VariantCard
                key={row.id}
                row={row}
                index={index}
                total={rows.length}
                highlightQuery={highlightQuery}
                fieldMatches={
                  variantFieldMatches[index] ?? {
                    source: false,
                    stones: false,
                    notes: false,
                    notes2: false,
                    notes3: false,
                  }
                }
                stockMap={stockMap}
                stockLoading={stockLoading}
                applicabilityPct={variantSummaries?.[index]?.applicabilityPct}
                isCalcOpen={openCalcIds.has(row.id)}
                isDemo={isDemo}
                onSaved={(newIssue) => {
                  if (newIssue && newIssue !== decodedIssue) {
                    const q = highlightQuery ? `?q=${encodeURIComponent(highlightQuery)}` : "";
                    router.push(`/dogaltas/kombinasyonlar/${encodeURIComponent(newIssue)}${q}`);
                  } else {
                    void handleRefresh();
                  }
                }}
                onToggleCalc={() =>
                  setOpenCalcIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.id)) next.delete(row.id);
                    else next.add(row.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function KombinasyonDetayPageFallback() {
  return (
    <main className={`${pageBg} flex min-h-screen items-center justify-center`}>
      <p className="text-sm font-black text-slate-600">Yükleniyor…</p>
    </main>
  );
}

export default function KombinasyonDetayPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <Suspense fallback={<KombinasyonDetayPageFallback />}>
        <KombinasyonDetayPageContent />
      </Suspense>
    </>
  );
}

"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

const COMBINATIONS_SELECT =
  "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at";

const HIGHLIGHT_MARK_CLASS = "rounded bg-yellow-200 px-1 font-bold text-slate-950";
const SEARCH_MATCH_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700";
const SEARCH_MATCH_CARD_CLASS = "border-rose-300 ring-2 ring-rose-100";

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

function normalizeTrSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function normalizeForMatch(value: string): string {
  return normalizeTrSearch(value)
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormIndexMap(text: string): { norm: string; indexMap: number[] } {
  let norm = "";
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const charNorm = normalizeTrSearch(text[i] ?? "");
    for (let j = 0; j < charNorm.length; j += 1) {
      norm += charNorm[j];
      indexMap.push(i);
    }
  }

  return { norm, indexMap };
}

function renderHighlightedText(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const queryNorm = normalizeTrSearch(trimmedQuery);
  if (!queryNorm) return text;

  const { norm, indexMap } = buildNormIndexMap(text);
  const nodes: ReactNode[] = [];
  let lastEnd = 0;
  let searchFrom = 0;

  while (searchFrom <= norm.length - queryNorm.length) {
    const idx = norm.indexOf(queryNorm, searchFrom);
    if (idx < 0) break;

    const startOrig = indexMap[idx] ?? 0;
    const endOrig = (indexMap[idx + queryNorm.length - 1] ?? startOrig) + 1;

    if (startOrig > lastEnd) {
      nodes.push(
        <Fragment key={`p-${lastEnd}`}>{text.slice(lastEnd, startOrig)}</Fragment>,
      );
    }

    nodes.push(
      <mark key={`m-${startOrig}-${idx}`} className={HIGHLIGHT_MARK_CLASS}>
        {text.slice(startOrig, endOrig)}
      </mark>,
    );

    lastEnd = endOrig;
    searchFrom = idx + queryNorm.length;
  }

  if (lastEnd < text.length) {
    nodes.push(<Fragment key="p-end">{text.slice(lastEnd)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

function textMatchesQuery(text: string | null | undefined, query: string): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return false;
  const haystack = normalizeTrSearch(String(text ?? ""));
  const needle = normalizeTrSearch(trimmedQuery);
  return Boolean(needle) && haystack.includes(needle);
}

function SearchMatchBadge() {
  return <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme</span>;
}

function mergeMatchCardClass(baseClass: string, hasSearchMatch: boolean) {
  return hasSearchMatch ? `${baseClass} ${SEARCH_MATCH_CARD_CLASS}` : baseClass;
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
  "w-full rounded-xl border border-cyan-200/60 bg-white/80 p-3 shadow-sm backdrop-blur-xl";
const uiInfoCard =
  "rounded-xl border border-violet-100/60 bg-white/70 p-3 shadow-sm";
const uiEmptyText = "text-slate-400 italic text-xs";
const uiCategoryPill =
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-black text-cyan-900";

type ToneKey = "violet" | "cyan" | "slate" | "amber";

function badgeClass(tone: ToneKey): string {
  const map: Record<ToneKey, string> = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
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
  text,
  stockNames,
  stockLoading,
  highlightQuery = "",
  hasSearchMatch = false,
}: {
  text: string | null | undefined;
  stockNames: Set<string>;
  stockLoading: boolean;
  highlightQuery?: string;
  hasSearchMatch?: boolean;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);
  const stones = text
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

  const inStockCount = !stockLoading
    ? stones.filter((s) => stockNames.has(normalizeForMatch(s))).length
    : 0;

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
        {stones.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {stones.map((stone, idx) => {
              if (stockLoading) {
                return (
                  <span
                    key={idx}
                    title="Stok bilgisi yükleniyor"
                    className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-400"
                  >
                    {highlightQuery.trim()
                      ? renderHighlightedText(stone, highlightQuery)
                      : stone}
                  </span>
                );
              }
              const inStock = stockNames.has(normalizeForMatch(stone));
              return inStock ? (
                <span
                  key={idx}
                  title="Stokta var"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                >
                  <span className="text-[10px] font-black text-emerald-600">✓</span>
                  {highlightQuery.trim()
                    ? renderHighlightedText(stone, highlightQuery)
                    : stone}
                </span>
              ) : (
                <span
                  key={idx}
                  title="Stokta yok"
                  className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
                >
                  {highlightQuery.trim()
                    ? renderHighlightedText(stone, highlightQuery)
                    : stone}
                </span>
              );
            })}
          </div>
        ) : (
          <p className={uiEmptyText}>—</p>
        )}
      </div>
    </article>
  );
}

// ─── Variant card ─────────────────────────────────────────────────────────────

function VariantCard({
  row,
  index,
  total,
  highlightQuery = "",
  fieldMatches,
  stockNames,
  stockLoading,
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
  stockNames: Set<string>;
  stockLoading: boolean;
}) {
  const hasVariantMatch =
    fieldMatches.source ||
    fieldMatches.stones ||
    fieldMatches.notes ||
    fieldMatches.notes2 ||
    fieldMatches.notes3;
  const showMatchBadge = Boolean(highlightQuery.trim() && hasVariantMatch);
  const cardClass = mergeMatchCardClass(uiVariantCard, showMatchBadge);

  return (
    <article className={cardClass}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black tracking-wide text-violet-700">
          KOMBİNASYON {index + 1}/{total}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          Variant #{row.variant_index}
        </span>
        <span className="ml-auto text-[10px] font-medium text-slate-400">
          {formatDate(row.created_at)}
        </span>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>

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
          text={row.stones_text}
          stockNames={stockNames}
          stockLoading={stockLoading}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.stones}
        />
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
  const [stockNames, setStockNames] = useState<Set<string>>(new Set());
  const [stockLoading, setStockLoading] = useState(true);

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

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setRows([]);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { data, error } = await supabase
      .from("combinations")
      .select(COMBINATIONS_SELECT)
      .eq("tenant_id", tenantId)
      .eq("issue", decodedIssue)
      .order("variant_index", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      setRows([]);
      return;
    }

    const raw = (data || []) as CombinationRecord[];
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
      const tenantId = await getSyncedTenantId();
      if (!tenantId) return;

      const { data } = await supabase
        .from("dogaltas_inventory")
        .select("name, adet")
        .eq("tenant_id", tenantId)
        .gt("adet", 0);

      if (data) {
        setStockNames(
          new Set(
            (data as { name: string; adet: number }[]).map((row) =>
              normalizeForMatch(row.name),
            ),
          ),
        );
      }
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

  const hasHighlight = Boolean(highlightQuery.trim());
  const headerHasMatch = Boolean(
    sectionMatches?.issue || sectionMatches?.category || sectionMatches?.description,
  );

  if (!decodedIssue) {
    return (
      <main className={`${pageBg} flex min-h-screen items-center justify-center`}>
        <div className={`${uiHeaderCard} w-full text-center`}>
          <p className="text-sm font-bold text-slate-600">Geçersiz başlık.</p>
          <Link
            href={listBackHref}
            className="mt-3 inline-flex rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-violet-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[400px] w-[400px] rounded-full bg-violet-300/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-cyan-300/15 blur-[120px]" />

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
                <span className="ml-2 font-black text-cyan-700">· Açıklama eşleşmesi</span>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={listBackHref}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {highlightQuery ? "Aramaya Dön" : "Listeye Dön"}
            </Link>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm hover:bg-cyan-50"
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

        {loading ? (
          <div
            className={`${uiVariantCard} flex min-h-[120px] items-center justify-center text-sm font-bold text-slate-500`}
          >
            Yükleniyor...
          </div>
        ) : rows.length === 0 && !errorMessage ? (
          <div className={`${uiVariantCard} text-center py-8`}>
            <div className="text-3xl">✶</div>
            <p className="mt-2 text-base font-black text-slate-800">Henüz kombinasyon kaydı yok</p>
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
                stockNames={stockNames}
                stockLoading={stockLoading}
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
    <Suspense fallback={<KombinasyonDetayPageFallback />}>
      <KombinasyonDetayPageContent />
    </Suspense>
  );
}

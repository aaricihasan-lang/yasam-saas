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
  "inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700";
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
    .replace(/[\u0300-\u036f]/g, "");
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
  return <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>;
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

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-violet-400/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl";
const uiVariantCard =
  "w-full rounded-[34px] border-[3px] border-cyan-300/45 bg-white/78 p-8 shadow-[0_0_50px_rgba(34,211,238,0.16)] backdrop-blur-xl";
const uiFieldBox =
  "rounded-[26px] border-[3px] border-violet-200 bg-gradient-to-br from-white/85 to-violet-50/70 p-6 shadow-[0_0_30px_rgba(139,92,246,0.10)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.16)]";
const uiFieldLabel = "text-sm font-black uppercase tracking-[0.18em] text-violet-700";
const uiFieldContent = "mt-4 text-lg font-semibold leading-8 text-slate-800";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiDatesBox =
  "rounded-[26px] border-[3px] border-amber-200 bg-gradient-to-br from-white/85 to-amber-50/70 p-6 shadow-[0_0_30px_rgba(245,158,11,0.12)]";
const uiComboBadge =
  "inline-flex items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2 text-sm font-black text-white shadow-md";
const uiCategoryPill =
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-black text-cyan-900";

function FieldBlock({
  label,
  text,
  highlightQuery = "",
  hasSearchMatch = false,
}: {
  label: string;
  text: string | null | undefined;
  highlightQuery?: string;
  hasSearchMatch?: boolean;
}) {
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiFieldBox, showMatchBadge);
  const displayText = text?.trim() || "";

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <div className={uiFieldLabel}>{label}</div>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>
      <div className={uiFieldContent}>
        {displayText ? (
          <span className="whitespace-pre-wrap">
            {highlightQuery.trim()
              ? renderHighlightedText(displayText, highlightQuery)
              : displayText}
          </span>
        ) : (
          <span className={uiEmptyText}>—</span>
        )}
      </div>
    </div>
  );
}

function VariantCard({
  row,
  index,
  total,
  highlightQuery = "",
  fieldMatches,
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
}) {
  const positionLabel = `Kombinasyon ${index + 1} / ${total}`;
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
      <div className="flex flex-col gap-3 border-b border-cyan-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={uiComboBadge}>{positionLabel}</span>
            {showMatchBadge ? <SearchMatchBadge /> : null}
          </div>
          <p className="mt-2 text-sm font-bold text-slate-500">
            Variant #{row.variant_index}
            {row.source ? (
              <>
                {" · Kaynak: "}
                {highlightQuery.trim()
                  ? renderHighlightedText(row.source, highlightQuery)
                  : row.source}
              </>
            ) : (
              ""
            )}
          </p>
        </div>
        <div className={uiDatesBox}>
          <div className={uiFieldLabel}>Kayıt tarihi</div>
          <p className="mt-2 text-base font-bold text-slate-700">{formatDate(row.created_at)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FieldBlock
          label="Kaynak"
          text={row.source}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.source}
        />
        <FieldBlock
          label="Taş metni"
          text={row.stones_text}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.stones}
        />
        <FieldBlock
          label="Notlar"
          text={row.notes_text}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.notes}
        />
        <FieldBlock
          label="Notlar 2"
          text={row.notes_text_2}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.notes2}
        />
        <FieldBlock
          label="Notlar 3"
          text={row.notes_text_3}
          highlightQuery={highlightQuery}
          hasSearchMatch={fieldMatches.notes3}
        />
      </div>
    </article>
  );
}

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

    setRows((data || []) as CombinationRecord[]);
  }, [decodedIssue]);

  useEffect(() => {
    runInEffect(() => {
      void loadRows();
    });
  }, [loadRows]);

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
          <p className="text-lg font-bold text-slate-600">Geçersiz başlık.</p>
          <Link
            href={listBackHref}
            className="mt-4 inline-flex rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-violet-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header
          className={mergeMatchCardClass(
            `${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`,
            Boolean(hasHighlight && headerHasMatch),
          )}
        >
          <div>
            <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
              KOMBİNASYON DETAY
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
                {hasHighlight
                  ? renderHighlightedText(decodedIssue, highlightQuery)
                  : decodedIssue}
              </h1>
              {hasHighlight && sectionMatches?.issue ? <SearchMatchBadge /> : null}
            </div>

            {categoryLabel ? (
              <p className="mt-3 flex flex-wrap items-center gap-2">
                <span className={uiCategoryPill}>
                  {hasHighlight
                    ? renderHighlightedText(categoryLabel, highlightQuery)
                    : categoryLabel}
                </span>
                {hasHighlight && sectionMatches?.category ? <SearchMatchBadge /> : null}
              </p>
            ) : null}

            {hasHighlight && sectionMatches?.description ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-cyan-800">
                <span>Açıklama alanında eşleşme</span>
                <SearchMatchBadge />
              </p>
            ) : null}

            <p className="mt-3 text-lg font-medium text-slate-600">
              {loading
                ? "Kayıtlar yükleniyor..."
                : rows.length === 0
                  ? "Bu issue için henüz variant kaydı yok."
                  : `${rows.length} kombinasyon variant listeleniyor.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={listBackHref}
              className="rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-violet-50"
            >
              {highlightQuery ? "Aramaya Dön" : "Listeye Dön"}
            </Link>

            <button
              type="button"
              onClick={() => void loadRows()}
              className="rounded-2xl border-2 border-cyan-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-cyan-50"
            >
              Yenile
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div
            className={`${uiVariantCard} flex min-h-[280px] items-center justify-center text-base font-bold text-slate-500`}
          >
            Yükleniyor...
          </div>
        ) : rows.length === 0 && !errorMessage ? (
          <div className={`${uiVariantCard} text-center`}>
            <div className="text-5xl">✶</div>
            <p className="mt-3 text-lg font-black text-slate-800">Henüz kombinasyon kaydı yok</p>
            <p className="mt-2 text-base font-medium text-slate-500">
              Bu başlık için henüz variant aktarılmamış olabilir.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
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

"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const COMBINATIONS_SELECT =
  "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at";

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

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={uiFieldBox}>
      <div className={uiFieldLabel}>{label}</div>
      <div className={uiFieldContent}>{children}</div>
    </div>
  );
}

function VariantCard({ row, index, total }: { row: CombinationRecord; index: number; total: number }) {
  const positionLabel = `Kombinasyon ${index + 1} / ${total}`;

  return (
    <article className={uiVariantCard}>
      <div className="flex flex-col gap-3 border-b border-cyan-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className={uiComboBadge}>{positionLabel}</span>
          <p className="mt-2 text-sm font-bold text-slate-500">
            Variant #{row.variant_index}
            {row.source ? ` · Kaynak: ${row.source}` : ""}
          </p>
        </div>
        <div className={uiDatesBox}>
          <div className={uiFieldLabel}>Kayıt tarihi</div>
          <p className="mt-2 text-base font-bold text-slate-700">{formatDate(row.created_at)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FieldBlock label="Kaynak">
          {row.source?.trim() ? (
            <span className="whitespace-pre-wrap">{row.source}</span>
          ) : (
            <span className={uiEmptyText}>—</span>
          )}
        </FieldBlock>

        <FieldBlock label="Taş metni">
          {row.stones_text?.trim() ? (
            <span className="whitespace-pre-wrap">{row.stones_text}</span>
          ) : (
            <span className={uiEmptyText}>—</span>
          )}
        </FieldBlock>

        <FieldBlock label="Notlar">
          {row.notes_text?.trim() ? (
            <span className="whitespace-pre-wrap">{row.notes_text}</span>
          ) : (
            <span className={uiEmptyText}>—</span>
          )}
        </FieldBlock>

        <FieldBlock label="Notlar 2">
          {row.notes_text_2?.trim() ? (
            <span className="whitespace-pre-wrap">{row.notes_text_2}</span>
          ) : (
            <span className={uiEmptyText}>—</span>
          )}
        </FieldBlock>

        <FieldBlock label="Notlar 3">
          {row.notes_text_3?.trim() ? (
            <span className="whitespace-pre-wrap">{row.notes_text_3}</span>
          ) : (
            <span className={uiEmptyText}>—</span>
          )}
        </FieldBlock>
      </div>
    </article>
  );
}

export default function KombinasyonDetayPage() {
  const params = useParams<{ title: string | string[] }>();
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

    const { data, error } = await supabase
      .from("combinations")
      .select(COMBINATIONS_SELECT)
      .eq("tenant_id", TENANT_ID)
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
      loadRows();
    });
  }, [loadRows]);

  if (!decodedIssue) {
    return (
      <main className={`${pageBg} flex min-h-screen items-center justify-center`}>
        <div className={`${uiHeaderCard} w-full text-center`}>
          <p className="text-lg font-bold text-slate-600">Geçersiz başlık.</p>
          <Link
            href="/dogaltas/kombinasyonlar"
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
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
              KOMBİNASYON DETAY
            </div>

            <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
              {decodedIssue}
            </h1>

            {categoryLabel ? (
              <p className="mt-3">
                <span className={uiCategoryPill}>{categoryLabel}</span>
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
              href="/dogaltas/kombinasyonlar"
              className="rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-violet-50"
            >
              Listeye Dön
            </Link>

            <button
              type="button"
              onClick={loadRows}
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
              <VariantCard key={row.id} row={row} index={index} total={rows.length} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

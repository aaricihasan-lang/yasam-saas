"use client";

import { useTranslations } from "next-intl";
import { useAromaReadError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import { ReadError } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { MethodRevisionForm } from "@/app/aromaterapi/katalog/_components/MethodRevisionForm";
import { fetchMethodRevision, fetchMethodSeries } from "@/lib/aromaterapi/methodData";
import { readYasamUser } from "@/lib/auth/yasamUser";
import type { MethodRevisionDetail } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Yeni revizyon ekranı. Serinin en güncel revizyonundan ön-doldurma için
 * seri + son revizyon içeriği yüklenir; sonra append-only revizyon formu gösterilir.
 */
export default function YeniRevizyonPage() {
  const params = useParams<{ id: string; seriesId: string }>();
  const preparationId = typeof params?.id === "string" ? params.id : "";
  const seriesId = typeof params?.seriesId === "string" ? params.seriesId : "";
  const isDemo = readYasamUser()?.is_demo_account === true;
  const t = useTranslations("aromatherapy.catalog.methodForm.pages");
  const readError = useAromaReadError();

  // loading TÜRETİLİR (effect içinde senkron setState YOK → cascading render/lint yok).
  const [state, setState] = useState<{
    base: MethodRevisionDetail | null;
    expected: number | null;
    notFound: boolean;
    errorCode: string | null;
    fetchedKey: string;
  }>({ base: null, expected: null, notFound: false, errorCode: null, fetchedKey: "" });
  const [tick, setTick] = useState(0);
  const currentKey = `${seriesId}#${tick}`;
  const loading = Boolean(seriesId) && state.fetchedKey !== currentKey;

  useEffect(() => {
    if (!seriesId) return;
    const controller = new AbortController();
    fetchMethodSeries(seriesId, controller.signal)
      .then(async (r) => {
        if (controller.signal.aborted) return;
        if (r.notFound) {
          setState({ base: null, expected: null, notFound: true, errorCode: null, fetchedKey: currentKey });
          return;
        }
        if (!r.ok || !r.data) {
          if (r.errorCode === null) return; // abort
          setState({ base: null, expected: null, notFound: false, errorCode: r.errorCode, fetchedKey: currentKey });
          return;
        }
        const rev = await fetchMethodRevision(seriesId, r.data.latest_revision_id, controller.signal);
        if (controller.signal.aborted) return;
        if (!rev.ok || !rev.data) {
          if (rev.errorCode === null) return; // abort
          setState({ base: null, expected: null, notFound: false, errorCode: rev.errorCode, fetchedKey: currentKey });
          return;
        }
        setState({ base: rev.data, expected: r.data.latest_revision, notFound: false, errorCode: null, fetchedKey: currentKey });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ base: null, expected: null, notFound: false, errorCode: "AROMA_READ_FAILED", fetchedKey: currentKey });
        }
      });
    return () => controller.abort();
  }, [seriesId, currentKey]);

  const { base, expected, notFound, errorCode } = state;

  return (
    <AromaterapiSectionShell
      title={t("revTitle")}
      subtitle={t("revSubtitle")}
      icon="🧪"
      breadcrumbLeaf={t("revTitle")}
      actions={
        <Link
          href={`/aromaterapi/katalog/preparatlar/${preparationId}/yontemler/${seriesId}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          {t("backMethod")}
        </Link>
      }
    >
      {loading ? (
        <AromaterapiDetailSkeleton />
      ) : notFound ? (
        <AromaterapiEmptyState
          variant="empty"
          icon="🔎"
          title={t("notFound")}
          message={t("notFoundBody")}
          action={
            <Link
              href={`/aromaterapi/katalog/preparatlar/${preparationId}`}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
            >
              {t("prep")}
            </Link>
          }
        />
      ) : errorCode ? (
        <ReadError message={readError(errorCode)} onRetry={() => setTick((k) => k + 1)} />
      ) : base && expected !== null ? (
        <MethodRevisionForm
          seriesId={seriesId}
          preparationId={preparationId}
          expectedLatestRevision={expected}
          base={base}
          isDemo={isDemo}
        />
      ) : null}
    </AromaterapiSectionShell>
  );
}

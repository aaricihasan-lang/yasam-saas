"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/ui/ToastProvider";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { runInEffect } from "@/lib/runInEffect";
import { anamnezAuthHeaders, anamnezBase, anamnezFetch } from "@/lib/danisan/anamnez/client";
import { formatIsoDate } from "@/lib/danisan/anamnez/format";
import { normalizeLocale } from "@/lib/danisan/anamnez/schema";
import type { AnamnezSummary } from "@/lib/danisan/anamnez/types";
import { NewAnamnezDialog, errorKey } from "@/components/danisan/anamnez/AnamnezDialogs";
import { SourceBadge } from "@/components/danisan/anamnez/AnamnezSectionCard";

/**
 * Danışan Detayı › Anamnez sekmesi — tarihçe + yeni anamnez + boş form PDF.
 * Liste yalnız metadata taşır (cevaplar yüklenmez). Düzenleme ayrı odaklı rotada.
 */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "ready"; items: AnamnezSummary[]; explicitConsent: boolean | null; truncated: boolean; demo: boolean };

export default function AnamnezTab({
  clientId,
  onOpenConsent,
}: {
  clientId: string;
  onOpenConsent: () => void;
}) {
  const t = useTranslations("clients.anamnez");
  const locale = normalizeLocale(useLocale());
  const router = useRouter();
  const { showToast } = useToast();
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const res = await anamnezFetch<{ anamneses: AnamnezSummary[]; explicitConsent: boolean | null; truncated: boolean; demo?: boolean }>(
      anamnezBase(clientId),
    );
    if (!res.ok) {
      setState({ kind: "error", code: res.code });
      return;
    }
    setState({
      kind: "ready",
      items: res.data.anamneses ?? [],
      explicitConsent: res.data.explicitConsent ?? null,
      truncated: res.data.truncated === true,
      demo: res.data.demo === true,
    });
  }, [clientId]);

  useEffect(() => {
    runInEffect(() => void load());
  }, [load]);

  const openEditor = (id: string) => router.push(`/dashboard/clients/${encodeURIComponent(clientId)}/anamnez/${id}`);

  async function downloadBlank() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`${anamnezBase(clientId)}/blank-form?locale=${locale}`, { headers: anamnezAuthHeaders(), cache: "no-store" });
      if (!res.ok) {
        let code = "generic";
        try { code = ((await res.json()) as { code?: string }).code ?? "generic"; } catch { /* yok */ }
        showToast({ type: "error", title: t("title"), message: t(`errors.${errorKey(code)}`) });
        return;
      }
      await downloadFileResponse(res, locale === "en" ? "intake-form.pdf" : "anamnez-formu.pdf");
    } finally {
      setPdfBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="animate-pulse space-y-3" aria-busy="true" aria-label={t("list.loading")}>
        <div className="h-8 w-52 rounded-lg bg-slate-200" />
        <div className="h-20 rounded-2xl bg-slate-100" />
        <div className="h-20 rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] font-bold text-rose-800">
        {state.code === "NOT_READY" ? t("errors.NOT_READY") : t("list.error")}
        <button type="button" onClick={() => void load()} className="ml-3 underline">{t("list.retry")}</button>
      </div>
    );
  }

  const draft = state.items.find((a) => a.status === "draft") ?? null;
  const completed = state.items.filter((a) => a.status === "completed");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-black text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] font-medium text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadBlank()} disabled={pdfBusy} className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {pdfBusy ? t("list.blankFormBusy") : t("list.blankForm")}
          </button>
          {!state.demo ? (
            <button
              type="button"
              onClick={() => (draft ? openEditor(draft.id) : setDialogOpen(true))}
              className="btn-secondary min-h-[42px]"
            >
              {draft ? t("list.continue") : t("list.new")}
            </button>
          ) : null}
        </div>
      </div>

      {state.explicitConsent === false ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold text-amber-900">{t("consent.missing")}</p>
          <button type="button" onClick={onOpenConsent} className="shrink-0 text-left text-[13px] font-extrabold text-amber-900 underline">
            {t("consent.action")}
          </button>
        </div>
      ) : null}

      {draft ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
          <div className="text-[12px] font-black uppercase tracking-wide text-amber-800">{t("list.draftTitle")}</div>
          <HistoryRow item={draft} locale={locale} onOpen={() => openEditor(draft.id)} />
          <p className="mt-1 text-[12px] font-medium text-amber-800/80">{t("list.draftHint")}</p>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-[14px] font-extrabold text-slate-700">{t("list.history")}</h3>
        {completed.length === 0 && !draft ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center">
            <p className="text-[14px] font-bold text-slate-700">{t("list.empty")}</p>
            <p className="mt-1 text-[13px] font-medium text-slate-500">{t("list.emptyHint")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {completed.map((a) => (
              <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <HistoryRow item={a} locale={locale} onOpen={() => openEditor(a.id)} />
              </li>
            ))}
          </ul>
        )}
        {state.truncated ? <p className="mt-2 text-[12px] font-medium text-slate-500">{t("list.truncated")}</p> : null}
      </div>

      <NewAnamnezDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        clientId={clientId}
        completed={completed}
        locale={locale}
        onCreated={(id) => {
          setDialogOpen(false);
          openEditor(id);
        }}
        onDraftExists={(draftId) => {
          setDialogOpen(false);
          showToast({ type: "warning", title: t("title"), message: t("create.draftExists") });
          if (draftId) openEditor(draftId);
          else void load();
        }}
      />
    </div>
  );
}

function HistoryRow({ item, locale, onOpen }: { item: AnamnezSummary; locale: "tr" | "en"; onOpen: () => void }) {
  const t = useTranslations("clients.anamnez");
  const locked = item.status === "completed";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-black tabular-nums text-slate-900">{formatIsoDate(item.assessment_date, locale)}</span>
          <span className="text-[14px] font-bold text-slate-700">{item.title || t(`kind.${item.kind}`)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${locked ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-800"}`}>
            {locked ? `🔒 ${t("status.completed")}` : t("status.draft")}
          </span>
          {item.attachment_count > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">📎 {t("list.attachments", { count: item.attachment_count })}</span>
          ) : null}
          {item.source_changed ? <SourceBadge state="changed" /> : null}
        </div>
      </div>
      <button type="button" onClick={onOpen} className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-teal-300 bg-white px-4 text-[13px] font-extrabold text-teal-700 hover:bg-teal-50">
        {locked ? t("list.open") : t("list.continue")}
      </button>
    </div>
  );
}

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
import { ANAMNEZ_PDF_CTA_HIDE } from "@/components/danisan/anamnez/styles";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

/**
 * Danışan Detayı › Anamnez sekmesi — tarihçe + yeni anamnez + boş form PDF + kayıtlı form PDF.
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
  const [filledBusy, setFilledBusy] = useState<string | null>(null);

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

  /** Kayıtlı (dolu) form PDF'i — listelenen revizyonla istenir; arada değiştiyse 409 → liste yenilenir. */
  async function downloadFilled(item: AnamnezSummary) {
    if (filledBusy) return;
    setFilledBusy(item.id);
    try {
      const res = await fetch(`${anamnezBase(clientId)}/${encodeURIComponent(item.id)}/pdf?rev=${item.revision}&locale=${locale}`, {
        headers: anamnezAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        let code = "generic";
        try { code = ((await res.json()) as { code?: string }).code ?? "generic"; } catch { /* yok */ }
        showToast({ type: "error", title: t("title"), message: t(`errors.${errorKey(code)}`) });
        if (code === "CONFLICT") void load();
        return;
      }
      await downloadFileResponse(res, `anamnez-${item.assessment_date}.pdf`);
    } catch {
      showToast({ type: "error", title: t("title"), message: t("errors.generic") });
    } finally {
      setFilledBusy(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="animate-pulse space-y-3" aria-busy="true" aria-label={t("list.loading")}>
        <div className="h-8 w-52 rounded-lg bg-[#e3e7ee]" />
        <div className="h-20 rounded-xl bg-[#f2f4f7]" />
        <div className="h-20 rounded-xl bg-[#f2f4f7]" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={`${dyp.kAlertDanger} font-bold`}>
        {state.code === "NOT_READY" ? t("errors.NOT_READY") : t("list.error")}
        <button type="button" onClick={() => void load()} className="ml-3 underline">{t("list.retry")}</button>
      </div>
    );
  }

  const draft = state.items.find((a) => a.status === "draft") ?? null;
  const completed = state.items.filter((a) => a.status === "completed");

  return (
    <div className="space-y-4">
      <div className={`${dyp.kHeader} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
        <div>
          <h2 className={dyp.kTitle}>{t("title")}</h2>
          <p className={`${dyp.kDesc} mt-0.5 max-w-2xl`}>{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadBlank()} disabled={pdfBusy} className={`${ANAMNEZ_PDF_CTA_HIDE} ${dyp.kBtnSecondary} min-h-[42px] items-center`}>
            {pdfBusy ? t("list.blankFormBusy") : t("list.blankForm")}
          </button>
          {!state.demo ? (
            <button
              type="button"
              onClick={() => (draft ? openEditor(draft.id) : setDialogOpen(true))}
              className={`${dyp.kBtnPrimary} min-h-[42px]`}
            >
              {draft ? t("list.continue") : t("list.new")}
            </button>
          ) : null}
        </div>
      </div>

      {state.explicitConsent === false ? (
        <div className={`${dyp.kAlertWarn} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="font-semibold">{t("consent.missing")}</p>
          <button type="button" onClick={onOpenConsent} className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} shrink-0 self-start text-left sm:self-auto`}>
            {t("consent.action")}
          </button>
        </div>
      ) : null}

      {draft ? (
        <div className={dyp.kCardMuted}>
          <div className={dyp.kEyebrow} style={{ color: "#9a6100" }}>{t("list.draftTitle")}</div>
          <HistoryRow
            item={draft}
            locale={locale}
            onOpen={() => openEditor(draft.id)}
            onPdf={() => void downloadFilled(draft)}
            pdfBusy={filledBusy === draft.id}
            pdfDisabled={filledBusy !== null}
          />
          <p className={`${dyp.kMeta} mt-1`}>{t("list.draftHint")}</p>
        </div>
      ) : null}

      <div>
        <h3 className={`${dyp.kSubtitle} mb-2`}>{t("list.history")}</h3>
        {completed.length === 0 && !draft ? (
          <div className={dyp.kEmpty}>
            <p className="font-bold text-[#1f3050]">{t("list.empty")}</p>
            <p className="mt-1 text-[13px]">{t("list.emptyHint")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {completed.map((a) => (
              <li key={a.id} className={dyp.kCard}>
                <HistoryRow
                  item={a}
                  locale={locale}
                  onOpen={() => openEditor(a.id)}
                  onPdf={() => void downloadFilled(a)}
                  pdfBusy={filledBusy === a.id}
                  pdfDisabled={filledBusy !== null}
                />
              </li>
            ))}
          </ul>
        )}
        {state.truncated ? <p className={`${dyp.kMeta} mt-2`}>{t("list.truncated")}</p> : null}
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

function HistoryRow({
  item,
  locale,
  onOpen,
  onPdf,
  pdfBusy,
  pdfDisabled,
}: {
  item: AnamnezSummary;
  locale: "tr" | "en";
  onOpen: () => void;
  onPdf: () => void;
  pdfBusy: boolean;
  pdfDisabled: boolean;
}) {
  const t = useTranslations("clients.anamnez");
  const locked = item.status === "completed";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold tabular-nums text-[#0f1d36]">{formatIsoDate(item.assessment_date, locale)}</span>
          <span className="text-[14px] font-semibold text-[#55637a]">{item.title || t(`kind.${item.kind}`)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={locked ? dyp.kChipBlue : dyp.kChipWarn}>
            {locked ? `🔒 ${t("status.completed")}` : t("status.draft")}
          </span>
          {item.attachment_count > 0 ? (
            <span className={dyp.kChip}>📎 {t("list.attachments", { count: item.attachment_count })}</span>
          ) : null}
          {item.source_changed ? <SourceBadge state="changed" /> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPdf}
          disabled={pdfDisabled}
          className={`${ANAMNEZ_PDF_CTA_HIDE} ${dyp.kBtnSecondary} min-h-[40px] items-center justify-center`}
        >
          {pdfBusy ? t("list.filledFormBusy") : t("list.filledForm")}
        </button>
        <button type="button" onClick={onOpen} className={`${dyp.kBtnPrimary} inline-flex min-h-[40px] items-center justify-center`}>
          {locked ? t("list.open") : t("list.continue")}
        </button>
      </div>
    </div>
  );
}

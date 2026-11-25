"use client";

import { useSourceWriteError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import {
  deleteSource,
  describeSourceReferences,
  sourceRemovalMode,
  updateSource,
} from "@/lib/aromaterapi/sourceWrite";
import type { SourceDetail } from "@/lib/aromaterapi/readTypes";

type DialogState = null | "archive" | "delete" | "in-use";

/**
 * Kaynak detay eylemleri: Düzenle / Arşivle / Sil (demo'da HİÇ render edilmez).
 *   - Kullanılan kaynak (pasaj / bilgi kaydı atfı) → "Bu kaynak kullanılıyor; arşivleyebilirsiniz".
 *   - Kullanılmayan kaynak → gerekçeli kalıcı silme (sunucu referansı yeniden sayar; 409 ise
 *     sayılarla birlikte arşivleme önerilir).
 */
export function KaynakDetailActions({
  data,
  isDemo,
  onChanged,
}: {
  data: SourceDetail;
  isDemo: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { run, pending } = useSubmitLock();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reason, setReason] = useState("");
  const ta = useTranslations("aromatherapy.sources.actions");
  const locale = useLocale();
  const sourceError = useSourceWriteError();
  // Referans özeti: tr'de describeSourceReferences birebir; diğer dilde aynı sayılarla katalogdan.
  const describeRefs = (r: Parameters<typeof describeSourceReferences>[0]) => {
    if (locale === "tr" || !r) return describeSourceReferences(r);
    const parts: string[] = [];
    if (r.passages > 0) parts.push(ta("refPassages", { n: r.passages, count: r.passages }));
    if (r.claimSources > 0) parts.push(ta("refClaims", { n: r.claimSources, count: r.claimSources }));
    if (r.methodSeries > 0) parts.push(ta("refMethods", { n: r.methodSeries, count: r.methodSeries }));
    return parts.join(", ");
  };
  const [inUseText, setInUseText] = useState("");

  if (isDemo) return null;

  const isArchived = data.status === "archived";

  function open(next: DialogState) {
    setReason("");
    setDialog(next);
  }

  function onDeleteClick() {
    if (sourceRemovalMode(data) === "archive-suggested") {
      setInUseText(
        describeRefs({
          passages: data.passage_count,
          claimSources: data.knowledge_record_count,
          methodSeries: 0,
        }),
      );
      open("in-use");
      return;
    }
    open("delete");
  }

  function handleArchive() {
    if (reason.trim() === "") return;
    run(async (signal) => {
      const res = await updateSource(
        data.id,
        {
          source_type: data.source_type,
          title: data.title,
          authors: data.authors,
          organization: data.organization,
          publication_year: data.publication_year,
          doi: data.doi,
          pmid: data.pmid,
          isbn: data.isbn,
          url: data.url,
          document_no: data.document_no,
          notes: data.notes,
          status: "archived",
          expected_updated_at: data.updated_at,
          reason: reason.trim(),
        },
        signal,
      );
      if (res.ok) {
        setDialog(null);
        showToast({ title: ta("archivedTitle"), message: ta("archived"), type: "success" });
        onChanged();
      } else if (res.errorCode) {
        showToast({ title: ta("errorTitle"), message: sourceError(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: ta("errorTitle"), message: sourceError("AROMA_WRITE_FAILED"), type: "error" }));
  }

  function handleDelete() {
    if (reason.trim() === "") return;
    run(async (signal) => {
      const res = await deleteSource(data.id, { expected_updated_at: data.updated_at, reason: reason.trim() }, signal);
      if (res.ok) {
        setDialog(null);
        showToast({ title: ta("deletedTitle"), message: ta("deleted"), type: "success" });
        router.push("/aromaterapi/kaynaklar");
        return;
      }
      if (res.errorCode === "AROMA_SOURCE_REFERENCED") {
        setInUseText(describeRefs(res.references));
        setDialog("in-use");
        return;
      }
      if (res.errorCode) {
        showToast({ title: ta("failedTitle"), message: sourceError(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: ta("failedTitle"), message: sourceError("AROMA_WRITE_FAILED"), type: "error" }));
  }

  const btn =
    "inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-[13px] font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60";

  return (
    <>
      <Link
        href={`/aromaterapi/kaynaklar/${data.id}/duzenle`}
        className={`${btn} border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus-visible:ring-slate-300/60`}
      >
        {ta("edit")}
      </Link>
      {!isArchived ? (
        <button
          type="button"
          onClick={() => open("archive")}
          disabled={pending}
          className={`${btn} border-amber-200 bg-white text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-300/60`}
        >
          {ta("archive")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDeleteClick}
        disabled={pending}
        className={`${btn} border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-300/60`}
      >
        {ta("delete")}
      </button>

      <AromaterapiConfirmDialog
        open={dialog === "archive" || dialog === "delete"}
        tone="danger"
        title={dialog === "delete" ? ta("deleteTitle") : ta("archiveTitle")}
        description={
          dialog === "delete" ? (
            <>
              {ta.rich("deleteBody", { name: data.title, strong: (c) => <strong>{c}</strong> })}
            </>
          ) : (
            <>
              {ta.rich("archiveBody", { name: data.title, strong: (c) => <strong>{c}</strong> })}
            </>
          )
        }
        confirmLabel={pending ? ta("processing") : dialog === "delete" ? ta("confirmDelete") : ta("confirmArchive")}
        cancelLabel={ta("cancel")}
        confirmDisabled={pending || reason.trim() === ""}
        onConfirm={() => (dialog === "delete" ? handleDelete() : handleArchive())}
        onCancel={() => setDialog(null)}
      >
        <label className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          {ta("reason")} <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={dialog === "delete" ? ta("deletePlaceholder") : ta("archivePlaceholder")}
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none focus-visible:border-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300/50"
        />
      </AromaterapiConfirmDialog>

      <AromaterapiConfirmDialog
        open={dialog === "in-use"}
        title={ta("inUseTitle")}
        description={
          <>
            {inUseText
              ? ta.rich("inUseBodyRefs", { name: data.title, refs: inUseText, strong: (c) => <strong>{c}</strong> })
              : ta.rich("inUseBody", { name: data.title, strong: (c) => <strong>{c}</strong> })}
          </>
        }
        confirmLabel={isArchived ? ta("ok") : ta("archive")}
        cancelLabel={ta("cancel")}
        onConfirm={() => (isArchived ? setDialog(null) : open("archive"))}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

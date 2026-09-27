"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import {
  deleteSource,
  describeSourceReferences,
  sourceMessageForCode,
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
        describeSourceReferences({
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
        showToast({ title: "Arşivlendi", message: "Kaynak arşive alındı.", type: "success" });
        onChanged();
      } else if (res.errorCode) {
        showToast({ title: "Hata", message: sourceMessageForCode(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: "Hata", message: sourceMessageForCode("AROMA_WRITE_FAILED"), type: "error" }));
  }

  function handleDelete() {
    if (reason.trim() === "") return;
    run(async (signal) => {
      const res = await deleteSource(data.id, { expected_updated_at: data.updated_at, reason: reason.trim() }, signal);
      if (res.ok) {
        setDialog(null);
        showToast({ title: "Silindi", message: "Kaynak kalıcı olarak silindi.", type: "success" });
        router.push("/aromaterapi/kaynaklar");
        return;
      }
      if (res.errorCode === "AROMA_SOURCE_REFERENCED") {
        setInUseText(describeSourceReferences(res.references));
        setDialog("in-use");
        return;
      }
      if (res.errorCode) {
        showToast({ title: "Silinemedi", message: sourceMessageForCode(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: "Silinemedi", message: sourceMessageForCode("AROMA_WRITE_FAILED"), type: "error" }));
  }

  const btn =
    "inline-flex min-h-[44px] items-center rounded-xl border px-3.5 text-[13px] font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60";

  return (
    <>
      <Link
        href={`/aromaterapi/kaynaklar/${data.id}/duzenle`}
        className={`${btn} border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus-visible:ring-slate-300/60`}
      >
        Düzenle
      </Link>
      {!isArchived ? (
        <button
          type="button"
          onClick={() => open("archive")}
          disabled={pending}
          className={`${btn} border-amber-200 bg-white text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-300/60`}
        >
          Arşivle
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDeleteClick}
        disabled={pending}
        className={`${btn} border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-300/60`}
      >
        Sil
      </button>

      <AromaterapiConfirmDialog
        open={dialog === "archive" || dialog === "delete"}
        tone="danger"
        title={dialog === "delete" ? "Bu kaynağı kalıcı olarak silmek istiyor musunuz?" : "Bu kaynağı arşive almak istiyor musunuz?"}
        description={
          dialog === "delete" ? (
            <>
              <strong>{data.title}</strong> kaynağı kalıcı olarak silinecek. Bu işlem geri alınamaz; silme kaydı
              denetim günlüğünde tutulur.
            </>
          ) : (
            <>
              <strong>{data.title}</strong> kaynağı arşive alınacak (durum: Arşivlenmiş). Kayıt silinmez; durum
              filtresiyle görünmeye devam eder.
            </>
          )
        }
        confirmLabel={pending ? "İşleniyor…" : dialog === "delete" ? "Evet, Kalıcı Sil" : "Evet, Arşivle"}
        cancelLabel="Vazgeç"
        confirmDisabled={pending || reason.trim() === ""}
        onConfirm={() => (dialog === "delete" ? handleDelete() : handleArchive())}
        onCancel={() => setDialog(null)}
      >
        <label className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          Gerekçe <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={dialog === "delete" ? "Silme nedenini kısaca yazın…" : "Arşivleme nedenini kısaca yazın…"}
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none focus-visible:border-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300/50"
        />
      </AromaterapiConfirmDialog>

      <AromaterapiConfirmDialog
        open={dialog === "in-use"}
        title="Bu kaynak kullanılıyor"
        description={
          <>
            <strong>{data.title}</strong> kaynağı kullanılıyor{inUseText ? ` (${inUseText})` : ""}; bu nedenle
            silinemez. Bunun yerine arşivleyebilirsiniz — kayıtlar ve atıflar korunur.
          </>
        }
        confirmLabel={isArchived ? "Tamam" : "Arşivle"}
        cancelLabel="Vazgeç"
        onConfirm={() => (isArchived ? setDialog(null) : open("archive"))}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

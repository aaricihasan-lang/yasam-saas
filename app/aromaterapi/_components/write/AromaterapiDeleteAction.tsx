"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import {
  contentDeleteMessageForCode,
  deleteContentRecord,
  describeContentReferences,
  REFERENCED_CODE,
  type ContentDeleteKind,
} from "@/lib/aromaterapi/contentDeleteClient";

type DialogState = null | "confirm" | "in-use" | "stale";

/**
 * Bitki / Preparat / Bilgi Kaydı detay "Sil" eylemi (AROMA-4; demo'da HİÇ render edilmez).
 * KaynakDetailActions deseniyle aynı: gerekçeli kalıcı silme + iyimser sürüm (updated_at);
 * tek gönderim (useSubmitLock). Sunucu referansları yeniden sayar:
 *   - 409 *_REFERENCED → hangi kayıtların engellediği gösterilir ("önce onları silin").
 *   - 409 AROMA_STALE → yeniden yükleme önerilir (otomatik silme/ezme YOK).
 *   - Başarı → liste sayfasına dönülür.
 */
export function AromaterapiDeleteAction({
  kind,
  id,
  updatedAt,
  recordLabel,
  entityNoun,
  listHref,
  isDemo,
  onReload,
}: {
  kind: ContentDeleteKind;
  id: string;
  updatedAt: string;
  /** Onay diyaloğunda gösterilecek kayıt adı. */
  recordLabel: ReactNode;
  /** "bitki" / "preparat" / "bilgi kaydı" — diyalog metinleri için. */
  entityNoun: string;
  listHref: string;
  isDemo: boolean;
  onReload: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { run, pending } = useSubmitLock();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reason, setReason] = useState("");
  const [inUseText, setInUseText] = useState("");

  if (isDemo) return null;

  function openConfirm() {
    setReason("");
    setDialog("confirm");
  }

  function handleDelete() {
    if (pending || reason.trim() === "") return;
    run(async (signal) => {
      const res = await deleteContentRecord(kind, id, { expected_updated_at: updatedAt, reason: reason.trim() }, signal);
      if (res.ok) {
        setDialog(null);
        showToast({ title: "Silindi", message: "Kayıt kalıcı olarak silindi.", type: "success" });
        router.push(listHref);
        return;
      }
      if (res.errorCode === REFERENCED_CODE[kind]) {
        setInUseText(describeContentReferences(kind, res.references));
        setDialog("in-use");
        return;
      }
      if (res.errorCode === "AROMA_STALE") {
        setDialog("stale");
        return;
      }
      if (res.errorCode) {
        showToast({ title: "Silinemedi", message: contentDeleteMessageForCode(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: "Silinemedi", message: contentDeleteMessageForCode("AROMA_NETWORK_ERROR"), type: "error" }));
  }

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded-xl border border-rose-200 bg-white px-3.5 text-[13px] font-black text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 disabled:opacity-60"
      >
        Sil
      </button>

      <AromaterapiConfirmDialog
        open={dialog === "confirm"}
        tone="danger"
        title={`Bu ${entityNoun} kalıcı olarak silinsin mi?`}
        description={
          <>
            <strong className="break-words [overflow-wrap:anywhere]">{recordLabel}</strong> kalıcı olarak silinecek. Bu
            işlem geri alınamaz; silme kaydı denetim günlüğünde tutulur.
          </>
        }
        confirmLabel={pending ? "Siliniyor…" : "Evet, Kalıcı Sil"}
        cancelLabel="Vazgeç"
        confirmDisabled={pending || reason.trim() === ""}
        onConfirm={handleDelete}
        onCancel={() => { if (!pending) setDialog(null); }}
      >
        <label htmlFor={`aroma-delete-reason-${id}`} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          Gerekçe <span className="text-rose-500">*</span>
        </label>
        <textarea
          id={`aroma-delete-reason-${id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Silme nedenini kısaca yazın…"
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none focus-visible:border-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300/50"
        />
      </AromaterapiConfirmDialog>

      <AromaterapiConfirmDialog
        open={dialog === "in-use"}
        title={`Bu ${entityNoun} silinemez`}
        description={inUseText}
        confirmLabel="Tamam"
        cancelLabel="Kapat"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />

      <AromaterapiConfirmDialog
        open={dialog === "stale"}
        title="Kayıt güncellendi"
        description={contentDeleteMessageForCode("AROMA_STALE")}
        confirmLabel="Son hâlini yükle"
        cancelLabel="Vazgeç"
        onConfirm={() => { setDialog(null); onReload(); }}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

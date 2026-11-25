"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import {
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
  const td = useTranslations("aromatherapy.shared.delete");
  const locale = useLocale();
  // Silme hata kodu → ekran metni (TR = contentDeleteClient DELETE_MESSAGES birebir).
  const deleteError = (code: string | null) => (code && td.has(`errors.${code}`) ? td(`errors.${code}`) : td("errors.generic"));
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
        showToast({ title: td("deletedTitle"), message: td("deleted"), type: "success" });
        router.push(listHref);
        return;
      }
      if (res.errorCode === REFERENCED_CODE[kind]) {
        // Referans açıklaması (Türkçe tür adlarıyla kurulur) yalnız tr'de; diğer dilde çevrilmiş genel metin.
        setInUseText(locale === "tr" ? describeContentReferences(kind, res.references) : td("inUseGeneric"));
        setDialog("in-use");
        return;
      }
      if (res.errorCode === "AROMA_STALE") {
        setDialog("stale");
        return;
      }
      if (res.errorCode) {
        showToast({ title: td("failedTitle"), message: deleteError(res.errorCode), type: "error" });
      }
    }).catch(() => showToast({ title: td("failedTitle"), message: deleteError("AROMA_NETWORK_ERROR"), type: "error" }));
  }

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded-xl border border-rose-200 bg-white px-3.5 text-[13px] font-black text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 disabled:opacity-60"
      >
        {td("button")}
      </button>

      <AromaterapiConfirmDialog
        open={dialog === "confirm"}
        tone="danger"
        title={td("confirmTitle", { noun: entityNoun })}
        description={
          <>
            {td.rich("confirmBody", { name: "", strong: () => <strong className="break-words [overflow-wrap:anywhere]">{recordLabel}</strong> })}
          </>
        }
        confirmLabel={pending ? td("deleting") : td("confirm")}
        cancelLabel={td("cancel")}
        confirmDisabled={pending || reason.trim() === ""}
        onConfirm={handleDelete}
        onCancel={() => { if (!pending) setDialog(null); }}
      >
        <label htmlFor={`aroma-delete-reason-${id}`} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
          {td("reason")} <span className="text-rose-500">*</span>
        </label>
        <textarea
          id={`aroma-delete-reason-${id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={td("reasonPlaceholder")}
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none focus-visible:border-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300/50"
        />
      </AromaterapiConfirmDialog>

      <AromaterapiConfirmDialog
        open={dialog === "in-use"}
        title={td("inUseTitle", { noun: entityNoun })}
        description={inUseText}
        confirmLabel={td("ok")}
        cancelLabel={td("close")}
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />

      <AromaterapiConfirmDialog
        open={dialog === "stale"}
        title={td("staleTitle")}
        description={deleteError("AROMA_STALE")}
        confirmLabel={td("reload")}
        cancelLabel={td("cancel")}
        onConfirm={() => { setDialog(null); onReload(); }}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}

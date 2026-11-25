"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useConfirmLeave, useReportDirty } from "../hooks/protocolDirty";
import { useToast } from "@/components/ui/ToastProvider";
import { kupaBtnGhost, kupaBtnSuccess, kupaRowAction } from "@/app/kupa/components/KupaShell";
import { updateProtocol } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell } from "./ProtocolSectionShell";
import { InlineLongText } from "./InlineLongText";

/** Hazırlık / Sonrası / Takip — protokol root kolonları (section-level edit). */
export function PrepSection({ doc }: { doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const t = useTranslations("cupping.protocols.prep");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();
  const p = doc.protocol;
  const [editing, setEditing] = useState(false);
  const [prep, setPrep] = useState("");
  const [after, setAfter] = useState("");
  const [follow, setFollow] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const confirmLeave = useConfirmLeave();
  const dirty =
    editing &&
    (prep !== (p?.preparation_note ?? "") || after !== (p?.aftercare_note ?? "") || follow !== (p?.follow_up_note ?? ""));
  useReportDirty("prep", dirty);
  async function cancel() {
    if (dirty && !(await confirmLeave())) return;
    setEditing(false);
  }

  function open() {
    setPrep(p?.preparation_note ?? "");
    setAfter(p?.aftercare_note ?? "");
    setFollow(p?.follow_up_note ?? "");
    setEditing(true);
  }

  async function save() {
    if (!p || busyRef.current) return; // çift tık → tek kayıt
    busyRef.current = true;
    setBusy(true);
    try {
      await updateProtocol(p.id, {
        preparation_note: prep.trim() || null,
        aftercare_note: after.trim() || null,
        follow_up_note: follow.trim() || null,
      });
      await doc.reload.protocol();
      setEditing(false);
      showToast({ message: tc("saved"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, tc("saveFailed")), type: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const block = (label: string, value?: string | null) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      {value ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{value}</p>
      ) : (
        <p className="mt-0.5 text-[13px] text-slate-400">—</p>
      )}
    </div>
  );

  return (
    <ProtocolSectionShell
      title={t("title")}
      action={
        !editing ? (
          <button type="button" onClick={open} className={kupaRowAction}>
            {tc("edit")}
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <InlineLongText label={t("preparation")} value={prep} onChange={setPrep} rows={3} />
          <InlineLongText label={t("aftercare")} value={after} onChange={setAfter} rows={3} />
          <InlineLongText label={t("followUp")} value={follow} onChange={setFollow} rows={3} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save} data-testid="kupa-prep-save">{busy ? tc("saving") : tc("save")}</button>
            <button type="button" className={kupaBtnGhost} onClick={() => void cancel()}>{tc("cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {block(t("preparation"), p?.preparation_note)}
          {block(t("aftercare"), p?.aftercare_note)}
          {block(t("followUp"), p?.follow_up_note)}
        </div>
      )}
    </ProtocolSectionShell>
  );
}

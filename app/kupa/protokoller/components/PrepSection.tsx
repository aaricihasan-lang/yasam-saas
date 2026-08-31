"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { kupaBtnGhost, kupaBtnSuccess } from "@/app/kupa/components/KupaShell";
import { updateProtocol } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell } from "./ProtocolSectionShell";
import { InlineLongText } from "./InlineLongText";

/** Hazırlık / Sonrası / Takip — protokol root kolonları (section-level edit). */
export function PrepSection({ doc }: { doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const p = doc.protocol;
  const [editing, setEditing] = useState(false);
  const [prep, setPrep] = useState("");
  const [after, setAfter] = useState("");
  const [follow, setFollow] = useState("");
  const [busy, setBusy] = useState(false);

  function open() {
    setPrep(p?.preparation_note ?? "");
    setAfter(p?.aftercare_note ?? "");
    setFollow(p?.follow_up_note ?? "");
    setEditing(true);
  }

  async function save() {
    if (!p) return;
    setBusy(true);
    try {
      await updateProtocol(p.id, {
        preparation_note: prep.trim() || null,
        aftercare_note: after.trim() || null,
        follow_up_note: follow.trim() || null,
      });
      await doc.reload.protocol();
      setEditing(false);
      showToast({ message: "Güncellendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
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
      title="Hazırlık / Sonrası / Takip"
      action={
        !editing ? (
          <button type="button" onClick={open} className="text-xs font-semibold text-amber-700 hover:underline">
            Düzenle
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <InlineLongText label="Uygulama Öncesi Hazırlık" value={prep} onChange={setPrep} rows={3} />
          <InlineLongText label="Uygulama Sonrası" value={after} onChange={setAfter} rows={3} />
          <InlineLongText label="Takip / Sonraki Seans" value={follow} onChange={setFollow} rows={3} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save}>Kaydet</button>
            <button type="button" className={kupaBtnGhost} onClick={() => setEditing(false)}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {block("Uygulama Öncesi Hazırlık", p?.preparation_note)}
          {block("Uygulama Sonrası", p?.aftercare_note)}
          {block("Takip / Sonraki Seans", p?.follow_up_note)}
        </div>
      )}
    </ProtocolSectionShell>
  );
}

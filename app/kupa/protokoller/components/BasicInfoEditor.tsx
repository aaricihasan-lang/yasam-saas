"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
import { updateProtocol } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { InlineLongText } from "./InlineLongText";

/** Temel Bilgi (title/category/summary/tags/aktif) section-level düzenleme paneli. */
export function BasicInfoEditor({ doc, onClose }: { doc: ProtocolDocument; onClose: () => void }) {
  const { showToast } = useToast();
  const p = doc.protocol;
  const [title, setTitle] = useState(p?.title ?? "");
  const [category, setCategory] = useState(p?.category ?? "");
  const [summary, setSummary] = useState(p?.summary ?? "");
  const [tags, setTags] = useState((p?.tags ?? []).join(", "));
  const [isActive, setIsActive] = useState(p?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!p) return;
    if (!title.trim()) {
      showToast({ message: "Protokol başlığı gerekli.", type: "warning" });
      return;
    }
    setBusy(true);
    try {
      await updateProtocol(p.id, {
        title: title.trim(),
        category: category.trim() || null,
        summary: summary.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        is_active: isActive,
      });
      await doc.reload.protocol();
      showToast({ message: "Güncellendi.", type: "success" });
      onClose();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label="Temel Bilgiyi Düzenle">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl lg:h-auto lg:max-h-[85vh] lg:max-w-lg lg:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-black text-slate-800">Temel Bilgiyi Düzenle</h3>
          <button type="button" onClick={onClose} className={kupaBtnGhost}>Kapat</button>
        </div>
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="pf-title">Protokol Adı *</label>
            <input id="pf-title" className={kupaInput} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="pf-cat">Kategori</label>
            <input id="pf-cat" className={kupaInput} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Örn. Baş & Boyun" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500">Kısa Açıklama</label>
            <InlineLongText label="Kısa Açıklama" value={summary} onChange={setSummary} rows={3} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500" htmlFor="pf-tags">Etiketler (virgülle)</label>
            <input id="pf-tags" className={kupaInput} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="etiket1, etiket2" />
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            Aktif
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button type="button" className={kupaBtnGhost} onClick={onClose}>Vazgeç</button>
          <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
import { addProtocolStep, updateProtocolStep, deleteProtocolStep, type CuppingProtocolStep } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell, ProtocolEmpty } from "./ProtocolSectionShell";
import { InlineLongText } from "./InlineLongText";

type Draft = { title: string; body: string; stage_label: string; ref_point_id: string; ref_technique_id: string };
const EMPTY: Draft = { title: "", body: "", stage_label: "", ref_point_id: "", ref_technique_id: "" };

export function StepsSection({ protocolId, doc }: { protocolId: string; doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const steps = [...doc.steps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // ref dropdown seçenekleri YALNIZ bu protokole bağlı bölge/teknik (DB membership'i UI'da da korur).
  const boundPoints = doc.points.map((r) => ({ id: r.point_id, name: doc.pointName(r.point_id) }));
  const boundTechniques = doc.techniques.map((r) => ({ id: r.technique_id, name: doc.techniqueName(r.technique_id) }));

  function openNew() {
    setEditingId(null);
    setDraft(EMPTY);
    setFormOpen(true);
  }
  function openEdit(s: CuppingProtocolStep) {
    setEditingId(s.id);
    setDraft({
      title: s.title ?? "",
      body: s.body ?? "",
      stage_label: s.stage_label ?? "",
      ref_point_id: s.ref_point_id ?? "",
      ref_technique_id: s.ref_technique_id ?? "",
    });
    setFormOpen(true);
  }

  async function save() {
    if (!draft.body.trim()) {
      showToast({ message: "Adım metni gerekli.", type: "warning" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: draft.title.trim() || null,
        body: draft.body.trim(),
        stage_label: draft.stage_label.trim() || null,
        ref_point_id: draft.ref_point_id || null,
        ref_technique_id: draft.ref_technique_id || null,
      };
      if (editingId) await updateProtocolStep(editingId, payload);
      else await addProtocolStep({ protocol_id: protocolId, sort_order: steps.length, ...payload });
      await doc.reload.steps();
      setFormOpen(false);
      showToast({ message: editingId ? "Adım güncellendi." : "Adım eklendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: CuppingProtocolStep) {
    const ok = await confirm({ title: "Adımı Sil", message: "Bu uygulama adımı silinsin mi?", confirmText: "Sil", cancelText: "Vazgeç", tone: "danger" });
    if (!ok) return;
    try {
      await deleteProtocolStep(s.id);
      await doc.reload.steps();
      showToast({ message: "Adım silindi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  // ↑/↓ sıralama: komşu iki adımın sort_order'ını takas et → server canonical yeniden çek.
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    const a = steps[index];
    const b = steps[j];
    try {
      await updateProtocolStep(a.id, { sort_order: b.sort_order ?? j });
      await updateProtocolStep(b.id, { sort_order: a.sort_order ?? index });
      await doc.reload.steps();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Sıralanamadı.", type: "error" });
    }
  }

  return (
    <ProtocolSectionShell
      title="Uygulama Akışı"
      description="Uygulama adımlarını sırayla ekleyerek protokol akışınızı oluşturun."
      action={
        <button type="button" onClick={openNew} className={kupaBtnPrimary}>
          + Adım Ekle
        </button>
      }
    >
      {steps.length === 0 && !formOpen ? (
        <ProtocolEmpty message="Uygulama adımlarını sırayla ekleyerek protokol akışınızı oluşturun." />
      ) : (
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-800">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {s.title ? <p className="text-sm font-bold text-slate-800">{s.title}</p> : null}
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{s.body}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.stage_label ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s.stage_label}</span> : null}
                    {s.ref_point_id ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">Bölge: {doc.pointName(s.ref_point_id)}</span> : null}
                    {s.ref_technique_id ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">Teknik: {doc.techniqueName(s.ref_technique_id)}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Yukarı taşı" disabled={i === 0} className="rounded-md border border-slate-200 px-1.5 text-slate-500 disabled:opacity-30" onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label="Aşağı taşı" disabled={i === steps.length - 1} className="rounded-md border border-slate-200 px-1.5 text-slate-500 disabled:opacity-30" onClick={() => move(i, 1)}>
                      ↓
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => openEdit(s)}>
                      Düzenle
                    </button>
                    <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => remove(s)}>
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {formOpen ? (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          <div className="space-y-2">
            <input className={kupaInput} placeholder="Adım başlığı (opsiyonel)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Adım başlığı" />
            <InlineLongText label="Adım metni *" value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} rows={3} placeholder="Bu adımda ne yapılır?" />
            <input className={kupaInput} placeholder="Aşama/seans etiketi (opsiyonel)" value={draft.stage_label} onChange={(e) => setDraft({ ...draft, stage_label: e.target.value })} aria-label="Aşama etiketi" />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className={kupaInput} value={draft.ref_point_id} onChange={(e) => setDraft({ ...draft, ref_point_id: e.target.value })} aria-label="Bağlı bölge">
                <option value="">Bağlı bölge yok</option>
                {boundPoints.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select className={kupaInput} value={draft.ref_technique_id} onChange={(e) => setDraft({ ...draft, ref_technique_id: e.target.value })} aria-label="Bağlı teknik">
                <option value="">Bağlı teknik yok</option>
                {boundTechniques.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-400">Yalnızca bu protokole eklenmiş bölge/teknikler adıma bağlanabilir.</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save}>
                {editingId ? "Adımı Kaydet" : "Adımı Ekle"}
              </button>
              <button type="button" className={kupaBtnGhost} onClick={() => setFormOpen(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ProtocolSectionShell>
  );
}

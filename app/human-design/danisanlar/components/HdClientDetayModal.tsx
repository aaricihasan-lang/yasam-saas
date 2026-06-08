"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { updateHdClient, type HdClientRow } from "../helpers/hdClients";
import { HdChartImageUpload } from "./HdChartImageUpload";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

type FormState = {
  name: string;
  birth_date: string;
  birth_time: string;
  birth_place: string;
  chart_image_url: string;
  external_chart_url: string;
  notes: string;
};

function rowToForm(row: HdClientRow): FormState {
  return {
    name: row.name,
    birth_date: row.birth_date ?? "",
    birth_time: row.birth_time ?? "",
    birth_place: row.birth_place ?? "",
    chart_image_url: row.chart_image_url ?? "",
    external_chart_url: row.external_chart_url ?? "",
    notes: row.notes ?? "",
  };
}

type Props = {
  row: HdClientRow;
  onClose: () => void;
  onSaved: () => void;
};

export function HdClientDetayModal({ row, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => rowToForm(row));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(rowToForm(row));
  }, [row]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast({ message: "Ad Soyad zorunludur.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await updateHdClient(row.id, {
      name: form.name.trim(),
      birth_date: form.birth_date || null,
      birth_time: form.birth_time || null,
      birth_place: form.birth_place.trim() || null,
      chart_image_url: form.chart_image_url.trim() || null,
      external_chart_url: form.external_chart_url.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      showToast({ message: `Hata: ${error}`, type: "error" });
    } else {
      showToast({ message: "Danışan güncellendi.", type: "success" });
      onSaved();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl rounded-[28px] border-2 border-indigo-200/80 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-[26px] border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-500">
              Danışan Düzenle
            </p>
            <h2 className="mt-0.5 text-lg font-black text-slate-900">{row.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Kişisel Bilgiler */}
            <section>
              <p className={sectionCls}>Kişisel Bilgiler</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Ad Soyad *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={set("name")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Doğum Tarihi</label>
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={set("birth_date")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Doğum Saati</label>
                  <input
                    type="time"
                    value={form.birth_time}
                    onChange={set("birth_time")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Doğum Yeri</label>
                  <input
                    type="text"
                    value={form.birth_place}
                    onChange={set("birth_place")}
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
              </div>
            </section>

            {/* Harita Kaynakları */}
            <section>
              <p className={sectionCls}>Harita Kaynakları</p>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Harita Görseli</label>
                  <HdChartImageUpload
                    clientId={row.id}
                    currentImageUrl={form.chart_image_url || null}
                    onUrlChange={(url) =>
                      setForm((p) => ({ ...p, chart_image_url: url ?? "" }))
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Harita Linki</label>
                  <input
                    type="url"
                    value={form.external_chart_url}
                    onChange={set("external_chart_url")}
                    placeholder="https://..."
                    className={`h-9 ${fieldBase}`}
                  />
                </div>
              </div>
            </section>

            {/* Not */}
            <section>
              <p className={sectionCls}>Not</p>
              <textarea
                value={form.notes}
                onChange={set("notes")}
                rows={4}
                className={`${fieldBase} resize-y leading-relaxed`}
              />
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 rounded-b-[26px] border-t border-indigo-100/80 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Kaydediliyor..." : "Güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}

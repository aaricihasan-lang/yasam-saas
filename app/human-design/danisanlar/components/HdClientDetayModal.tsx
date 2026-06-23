"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import Link from "next/link";
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
    /* Overlay — tüm ekranı kaplar, modal ortalar */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />

      {/* Modal kartı — flex sütun, maksimum yükseklik ekrana göre */}
      <div className="relative z-10 flex w-full max-w-5xl flex-col rounded-[28px] border-2 border-indigo-200/80 bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>
        {/* Header — sabit */}
        <div className="flex-shrink-0 flex items-center justify-between rounded-t-[26px] border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-4">
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

        {/* Body — yalnızca bu scroll eder */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Harita Görseli — en üstte, hemen görünsün */}
            <section>
              <p className={sectionCls}>Harita Görseli</p>
              <HdChartImageUpload
                clientId={row.id}
                currentImageUrl={form.chart_image_url || null}
                onUrlChange={(url) =>
                  setForm((p) => ({ ...p, chart_image_url: url ?? "" }))
                }
              />
            </section>

            {/* Hızlı Erişim */}
            <section>
              <p className={sectionCls}>Hızlı Erişim</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/human-design/harita-kaydi?clientId=${row.id}`}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-violet-300/80 bg-violet-50 px-4 text-sm font-bold text-violet-800 no-underline transition hover:border-violet-400 hover:bg-violet-100"
                >
                  Harita Bilgilerini Düzenle
                </Link>
                <Link
                  href={`/human-design/rapor-olustur?clientId=${row.id}`}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-indigo-300/80 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 no-underline transition hover:border-indigo-400 hover:bg-indigo-100"
                >
                  Rapor Oluştur
                </Link>
                <Link
                  href="/human-design/kayitli-raporlar"
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 no-underline transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Kayıtlı Raporlar
                </Link>
              </div>
            </section>

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

            {/* Harita Linki & Not */}
            <section>
              <p className={sectionCls}>Ek Bilgiler</p>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Harita Linki (Jovian Archive vb.)</label>
                  <input
                    type="url"
                    value={form.external_chart_url}
                    onChange={set("external_chart_url")}
                    placeholder="https://..."
                    className={`h-9 ${fieldBase}`}
                  />
                  {form.external_chart_url.trim() && (
                    <a
                      href={form.external_chart_url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-lg border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <span className="truncate">Haritayı Dış Sitede Aç</span>
                      <span aria-hidden className="shrink-0">↗</span>
                    </a>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Not</label>
                  <textarea
                    value={form.notes}
                    onChange={set("notes")}
                    rows={3}
                    className={`${fieldBase} resize-y leading-relaxed`}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer — sabit */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 rounded-b-[26px] border-t border-indigo-100/80 bg-slate-50/60 px-6 py-4">
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

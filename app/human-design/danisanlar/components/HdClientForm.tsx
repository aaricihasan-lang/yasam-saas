"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { insertHdClient } from "../helpers/hdClients";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

const empty = {
  name: "",
  birth_date: "",
  birth_time: "",
  birth_place: "",
  chart_image_url: "",
  external_chart_url: "",
  notes: "",
};

type Props = { onSuccess?: () => void };

export function HdClientForm({ onSuccess }: Props) {
  const { showToast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  function set(field: keyof typeof empty) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast({ message: "Ad Soyad zorunludur.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await insertHdClient({
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
      showToast({ message: "Danışan eklendi.", type: "success" });
      setForm(empty);
      onSuccess?.();
    }
  }

  return (
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
              placeholder="Ahmet Yılmaz"
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
              placeholder="İstanbul, Türkiye"
              className={`h-9 ${fieldBase}`}
            />
          </div>
        </div>
      </section>

      {/* Harita Kaynakları */}
      <section>
        <p className={sectionCls}>Harita Kaynakları</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Harita Görseli URL</label>
            <input
              type="url"
              value={form.chart_image_url}
              onChange={set("chart_image_url")}
              placeholder="https://..."
              className={`h-9 ${fieldBase}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Harita Linki (Jovian Archive vb.)</label>
            <input
              type="url"
              value={form.external_chart_url}
              onChange={set("external_chart_url")}
              placeholder="https://jovianarchive.com/..."
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
          placeholder="Danışanla ilgili kısa notlar..."
          rows={4}
          className={`${fieldBase} resize-y leading-relaxed`}
        />
      </section>

      {/* Aksiyon */}
      <div className="flex items-center justify-end gap-3 border-t border-indigo-100/80 pt-4">
        <button
          type="button"
          onClick={() => setForm(empty)}
          className="h-9 rounded-xl border border-indigo-200/90 bg-white px-5 text-sm font-black uppercase tracking-wide text-indigo-900 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/80"
        >
          Temizle
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

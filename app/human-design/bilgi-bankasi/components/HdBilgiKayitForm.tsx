"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  HD_KNOWLEDGE_CATEGORIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_GATES,
  type HdKnowledgeCategory,
} from "@/lib/human-design/constants";
import { buildKnowledgeCode } from "@/lib/human-design/codeHelpers";
import { insertHdKnowledgeRecord } from "../helpers/hdBilgiKayit";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

type Props = { onSuccess?: () => void };

const empty = {
  category: "" as HdKnowledgeCategory | "",
  title: "",
  code: "",
  content: "",
  keywordsText: "",
  tagsText: "",
  related_centers: [] as string[],
  related_channels: [] as string[],
  related_gates: [] as number[],
  sort_order: 0,
  is_active: true,
};

function parseCSV(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

export function HdBilgiKayitForm({ onSuccess }: Props) {
  const { showToast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form.category && form.title.trim()) {
      const generated = buildKnowledgeCode(
        form.category as HdKnowledgeCategory,
        form.title.trim(),
      );
      setForm((p) => ({ ...p, code: generated }));
    } else {
      setForm((p) => ({ ...p, code: "" }));
    }
  }, [form.category, form.title]);

  function toggleCenter(code: string) {
    setForm((p) => ({
      ...p,
      related_centers: p.related_centers.includes(code)
        ? p.related_centers.filter((c) => c !== code)
        : [...p.related_centers, code],
    }));
  }

  function toggleChannel(code: string) {
    setForm((p) => ({
      ...p,
      related_channels: p.related_channels.includes(code)
        ? p.related_channels.filter((c) => c !== code)
        : [...p.related_channels, code],
    }));
  }

  function toggleGate(gate: number) {
    setForm((p) => ({
      ...p,
      related_gates: p.related_gates.includes(gate)
        ? p.related_gates.filter((g) => g !== gate)
        : [...p.related_gates, gate].sort((a, b) => a - b),
    }));
  }

  async function handleSave() {
    if (!form.category) {
      showToast({ message: "Kategori seçin.", type: "warning" });
      return;
    }
    if (!form.title.trim()) {
      showToast({ message: "Başlık girin.", type: "warning" });
      return;
    }
    if (!form.content.trim()) {
      showToast({ message: "İçerik alanını doldurun.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await insertHdKnowledgeRecord({
      category: form.category,
      title: form.title.trim(),
      code: form.code,
      content: form.content.trim(),
      keywords: parseCSV(form.keywordsText),
      tags: parseCSV(form.tagsText),
      related_centers: form.related_centers,
      related_channels: form.related_channels,
      related_gates: form.related_gates,
      sort_order: form.sort_order,
      is_active: form.is_active,
    });
    setSaving(false);
    if (error) {
      showToast({ message: `Hata: ${error}`, type: "error" });
    } else {
      showToast({ message: "Kayıt eklendi.", type: "success" });
      setForm(empty);
      onSuccess?.();
    }
  }

  return (
    <div className="space-y-6">
      {/* Temel Bilgiler */}
      <section>
        <p className={sectionCls}>Temel Bilgiler</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Kategori *</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({ ...p, category: e.target.value as HdKnowledgeCategory }))
              }
              className={`h-9 ${fieldBase}`}
            >
              <option value="">Seçin...</option>
              {HD_KNOWLEDGE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Başlık *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Örn: Generator"
              className={`h-9 ${fieldBase}`}
            />
          </div>

          <div>
            <label className={labelCls}>Kod (otomatik)</label>
            <input
              type="text"
              value={form.code}
              readOnly
              className={`h-9 ${fieldBase} cursor-not-allowed bg-slate-50/80 text-slate-400`}
            />
          </div>

          <div>
            <label className={labelCls}>Sıralama</label>
            <input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
              className={`h-9 ${fieldBase}`}
            />
          </div>

          <div className="flex items-center gap-2.5 sm:col-span-2">
            <input
              id="hd-form-is-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
            />
            <label htmlFor="hd-form-is-active" className="text-sm font-semibold text-slate-700">
              Aktif kayıt
            </label>
          </div>
        </div>
      </section>

      {/* İçerik */}
      <section>
        <p className={sectionCls}>İçerik</p>
        <label className={labelCls}>Yorum / Açıklama *</label>
        <textarea
          value={form.content}
          onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
          placeholder="Bu kayda ait Human Design yorumunu buraya yazın..."
          rows={7}
          className={`${fieldBase} resize-y leading-relaxed`}
        />
      </section>

      {/* Merkezler */}
      <section>
        <p className={sectionCls}>İlişkili Merkezler</p>
        <div className="flex flex-wrap gap-2">
          {HUMAN_DESIGN_CENTERS.map((center) => {
            const sel = form.related_centers.includes(center.code);
            return (
              <button
                key={center.code}
                type="button"
                onClick={() => toggleCenter(center.code)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  sel
                    ? "border-transparent bg-indigo-600 text-white shadow-[0_3px_10px_rgba(79,70,229,0.3)]"
                    : "border-indigo-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              >
                {center.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Kanallar */}
      <section>
        <p className={sectionCls}>İlişkili Kanallar</p>
        <div className="max-h-44 overflow-y-auto rounded-xl border border-indigo-200/80 bg-white/70 p-3">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {HUMAN_DESIGN_CHANNELS.map((ch) => {
              const sel = form.related_channels.includes(ch.code);
              return (
                <label
                  key={ch.code}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                    sel ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggleChannel(ch.code)}
                    className="h-3.5 w-3.5 rounded border-indigo-300 accent-indigo-600"
                  />
                  {ch.label}
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* Kapılar */}
      <section>
        <p className={sectionCls}>İlişkili Kapılar</p>
        <div className="rounded-xl border border-indigo-200/80 bg-white/70 p-3">
          <div className="grid grid-cols-8 gap-1.5">
            {HUMAN_DESIGN_GATES.map((gate) => {
              const sel = form.related_gates.includes(gate.code);
              return (
                <button
                  key={gate.code}
                  type="button"
                  onClick={() => toggleGate(gate.code)}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    sel
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800"
                  }`}
                >
                  {gate.code}
                </button>
              );
            })}
          </div>
          {form.related_gates.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Seçili kapılar: {form.related_gates.join(", ")}
            </p>
          )}
        </div>
      </section>

      {/* Etiketler */}
      <section>
        <p className={sectionCls}>Anahtar Kelimeler & Etiketler</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Anahtar Kelimeler</label>
            <input
              type="text"
              value={form.keywordsText}
              onChange={(e) => setForm((p) => ({ ...p, keywordsText: e.target.value }))}
              placeholder="virgülle ayırın: enerji, güç, sacral"
              className={`h-9 ${fieldBase}`}
            />
          </div>
          <div>
            <label className={labelCls}>Etiketler</label>
            <input
              type="text"
              value={form.tagsText}
              onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
              placeholder="virgülle ayırın: temel, önemli"
              className={`h-9 ${fieldBase}`}
            />
          </div>
        </div>
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

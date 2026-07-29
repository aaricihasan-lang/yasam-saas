"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import {
  HD_KNOWLEDGE_CATEGORIES,
  type HdKnowledgeCategory,
} from "@/lib/human-design/constants";
import {
  buildKnowledgeCode,
  buildKnowledgeCodeFromValue,
  getStructuredCategoryOptions,
  type StructuredOption,
} from "@/lib/human-design/codeHelpers";
import { insertHdKnowledgeRecord } from "../helpers/hdBilgiKayit";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-3 text-xs font-black uppercase tracking-widest text-indigo-700";

type Props = { onSuccess?: () => void };

const empty = {
  category: "" as HdKnowledgeCategory | "",
  title: "",
  structuredValue: "",
  sort_order: 0,
};

function computeCode(category: string, title: string, structuredValue: string): string {
  if (!category) return "";
  const opts = getStructuredCategoryOptions(category);
  if (opts !== null) {
    return structuredValue ? buildKnowledgeCodeFromValue(category, structuredValue) : "";
  }
  return title.trim() ? buildKnowledgeCode(category as HdKnowledgeCategory, title.trim()) : "";
}

export function HdBilgiKayitForm({ onSuccess }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.category) {
      showToast({ message: "Kategori seçin.", type: "warning" });
      return;
    }
    if (!form.title.trim()) {
      const isStructured = !!getStructuredCategoryOptions(form.category);
      showToast({ message: isStructured ? "Değer seçin." : "Başlık girin.", type: "warning" });
      return;
    }
    const code = computeCode(form.category, form.title, form.structuredValue);
    setSaving(true);
    // İlk oluşturmada yalnız temel kayıt; içerik/notlar/ilişki/kaynaklar tam sayfa
    // editörde girilir. Boş varsayılanlar DB sözleşmesini karşılar (content NOT NULL).
    const { id, error } = await insertHdKnowledgeRecord({
      category: form.category,
      title: form.title.trim(),
      code,
      content: "",
      keywords: [],
      tags: [],
      related_centers: [],
      related_channels: [],
      related_gates: [],
      sort_order: form.sort_order,
      // Taslak: yeni kayıt daima pasif oluşturulur. Editöryal Özet tamamlanınca
      // düzenleme sayfasından aktif edilir ("Ya doğru bilgi ya hiç").
      is_active: false,
      expert_notes: null,
    });
    setSaving(false);
    if (error || !id) {
      showToast({ message: `Hata: ${error ?? "Kayıt oluşturulamadı."}`, type: "error" });
      return;
    }
    showToast({ message: "Kayıt oluşturuldu. Editöre yönlendiriliyorsunuz...", type: "success" });
    onSuccess?.();
    // Yeni kayıt bütünsel tam sayfa editöre yönlendirilir.
    router.push(`/human-design/bilgi-bankasi/${id}`);
  }

  return (
    <div className="space-y-6">
      <section>
        <p className={sectionCls}>Temel Bilgiler</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Kategori *</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  category: e.target.value as HdKnowledgeCategory,
                  title: "",
                  structuredValue: "",
                }))
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
            {(() => {
              const opts: StructuredOption[] | null = getStructuredCategoryOptions(form.category);
              if (opts) {
                return (
                  <select
                    value={form.structuredValue}
                    onChange={(e) => {
                      const opt = opts.find((o) => o.code === e.target.value);
                      setForm((p) => ({
                        ...p,
                        structuredValue: e.target.value,
                        title: opt?.label ?? "",
                      }));
                    }}
                    className={`h-9 ${fieldBase}`}
                  >
                    <option value="">— Seçin —</option>
                    {opts.map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.label}</option>
                    ))}
                  </select>
                );
              }
              return (
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Başlık girin..."
                  className={`h-9 ${fieldBase}`}
                />
              );
            })()}
          </div>

          <div>
            <label className={labelCls}>Kod (otomatik)</label>
            <input
              type="text"
              value={computeCode(form.category, form.title, form.structuredValue)}
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

          <div className="sm:col-span-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            Kayıt <span className="font-bold">taslak</span> olarak oluşturulur. Editöryal Özet tamamlandıktan sonra düzenleme sayfasından aktif edebilirsiniz. <span className="font-bold">Editöryal Özet, Uzman Notu, Kaynaklar ve İlişkiler</span> açılan tam sayfa editörde girilir.
          </div>
        </div>
      </section>

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
          {saving ? "Oluşturuluyor..." : "Oluştur ve Düzenle"}
        </button>
      </div>
    </div>
  );
}

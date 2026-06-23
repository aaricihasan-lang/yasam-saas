"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { getHdClient, updateHdClient, type HdClientRow } from "../helpers/hdClients";
import { HdChartImageUpload } from "../components/HdChartImageUpload";
import { HumanDesignShell } from "../../components/HumanDesignShell";

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

type Props = { clientId: string };

export function HdDanisanDetayContent({ clientId }: Props) {
  const { showToast } = useToast();

  const [row, setRow] = useState<HdClientRow | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadClient = useCallback(async () => {
    setLoading(true);
    const { row: data, error } = await getHdClient(clientId);
    setLoading(false);
    if (error || !data) {
      setNotFound(true);
      showToast({ message: error ?? "Danışan bulunamadı.", type: "error" });
      return;
    }
    setRow(data);
    setForm(rowToForm(data));
  }, [clientId, showToast]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => (p ? { ...p, [field]: e.target.value } : p));
  }

  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) {
      showToast({ message: "Ad Soyad zorunludur.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await updateHdClient(clientId, {
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
    }
  }

  if (loading) {
    return (
      <HumanDesignShell>
        <div className="flex items-center justify-center py-32 text-sm text-slate-500">
          Yükleniyor...
        </div>
      </HumanDesignShell>
    );
  }

  if (notFound || !row || !form) {
    return (
      <HumanDesignShell>
        <div className="flex flex-col items-center gap-4 py-32">
          <p className="text-sm text-slate-500">Danışan bulunamadı.</p>
          <Link
            href="/human-design/danisanlar"
            className="text-sm font-bold text-indigo-600 hover:underline"
          >
            ← Danışan Listesine Dön
          </Link>
        </div>
      </HumanDesignShell>
    );
  }

  return (
    <HumanDesignShell>
      {/* Sayfa başlığı */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">
            Danışan Detayı
          </p>
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            {row.name}
          </h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Sol: Harita Görseli + Hızlı Erişim */}
        <div className="space-y-4">
          {/* Harita Görseli */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <p className={sectionCls}>Harita Görseli</p>
            <HdChartImageUpload
              clientId={clientId}
              currentImageUrl={form.chart_image_url || null}
              onUrlChange={(url) =>
                setForm((p) => (p ? { ...p, chart_image_url: url ?? "" } : p))
              }
            />
          </div>

          {/* Hızlı Erişim */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <p className={sectionCls}>Hızlı Erişim</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/human-design/harita-kaydi?clientId=${clientId}`}
                className="flex h-9 items-center rounded-xl border border-violet-300/80 bg-violet-50 px-4 text-sm font-bold text-violet-800 no-underline transition hover:border-violet-400 hover:bg-violet-100"
              >
                Harita Bilgilerini Düzenle
              </Link>
              <Link
                href={`/human-design/rapor-olustur?clientId=${clientId}`}
                className="flex h-9 items-center rounded-xl border border-indigo-300/80 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 no-underline transition hover:border-indigo-400 hover:bg-indigo-100"
              >
                Rapor Oluştur
              </Link>
              <Link
                href="/human-design/kayitli-raporlar"
                className="flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 no-underline transition hover:border-slate-300 hover:bg-slate-50"
              >
                Kayıtlı Raporlar
              </Link>
            </div>
          </div>
        </div>

        {/* Sağ: Kişisel Bilgiler + Kaydet */}
        <div className="space-y-4">
          {/* Kişisel Bilgiler */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
            <p className={sectionCls}>Kişisel Bilgiler</p>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Ad Soyad *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div>
                <label className={labelCls}>Doğum Yeri</label>
                <input
                  type="text"
                  value={form.birth_place}
                  onChange={set("birth_place")}
                  className={`h-9 ${fieldBase}`}
                />
              </div>
            </div>
          </div>

          {/* Ek Bilgiler */}
          <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60">
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
                  rows={4}
                  className={`${fieldBase} resize-y leading-relaxed`}
                />
              </div>
            </div>
          </div>

          {/* Kaydet */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-8 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Güncelle"}
            </button>
          </div>
        </div>
      </div>
    </HumanDesignShell>
  );
}

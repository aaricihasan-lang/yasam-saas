"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { settingsApi } from "@/app/admin/magaza/magazaAdminApi";

export default function SettingsPanel() {
  const { showToast } = useToast();
  const [number, setNumber] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await settingsApi.get();
      if (res.ok) {
        setNumber(res.data.whatsapp_number ?? "");
        setEnabled(res.data.whatsapp_enabled);
      } else {
        showToast({ type: "error", message: res.error });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    const res = await settingsApi.update({
      whatsapp_number: number.trim() === "" ? null : number.trim(),
      whatsapp_enabled: enabled,
    });
    setSaving(false);
    if (res.ok) {
      setNumber(res.data.whatsapp_number ?? "");
      setEnabled(res.data.whatsapp_enabled);
      showToast({ type: "success", message: "WhatsApp ayarı kaydedildi." });
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  if (loading) return <p className="py-8 text-center text-sm text-stone-400">Yükleniyor…</p>;

  return (
    <div className="max-w-xl space-y-5">
      <div className="rounded-2xl border border-stone-200/70 bg-white p-6">
        <h3 className="text-sm font-black uppercase tracking-wide text-stone-700">WhatsApp İletişim</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
          Ürün detay sayfasındaki “WhatsApp’tan Bilgi Al” butonu bu numarayı kullanır. Numara
          uluslararası formatta, ülke kodu dahil girilmelidir (örn. 90 ile başlayan Türkiye numarası).
        </p>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-stone-600">WhatsApp Numarası</span>
            <input
              className="store-input"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="90 5xx xxx xx xx"
              inputMode="tel"
            />
            <span className="text-[11px] text-stone-400">
              Yalnız rakamlar kullanılır; +, boşluk ve ayraçlar otomatik temizlenir.
            </span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            WhatsApp iletişimini aktif et
          </label>
          {enabled && number.trim() === "" ? (
            <p className="text-[12px] font-medium text-amber-700">
              Aktif etmek için geçerli bir numara girin.
            </p>
          ) : null}
        </div>

        <div className="mt-6">
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200/70 bg-stone-50/60 p-5 text-[13px] leading-relaxed text-stone-500">
        <strong className="font-semibold text-stone-700">Durum:</strong>{" "}
        {enabled && number.trim() !== ""
          ? "Aktif — müşteriler ürün sayfasından WhatsApp ile iletişime geçebilir."
          : "Pasif — ürün sayfasında WhatsApp butonu gösterilmez."}
      </div>
    </div>
  );
}

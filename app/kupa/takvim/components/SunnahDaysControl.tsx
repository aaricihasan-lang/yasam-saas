"use client";

import { useState } from "react";
import { kupaBtnGhost, kupaBtnPrimary } from "@/app/kupa/components/KupaShell";

/**
 * FAZ 5 / AŞAMA 3 — "Sünnet Günleri" kontrolü (AYNI takvim çalışma alanında; İKİNCİ takvim
 *   DEĞİL). Kompakt, katlanabilir ikincil panel.
 *
 * Uzman geleneksel otomatik günleri: (1) tutar, (2) tek tek takvimden kaldırır, (3) tümünü
 *   temizler ("Sünnet Günlerini Temizle" — YALNIZ sistem-otomatik satırlar; manuel günler
 *   KORUNUR), (4) eksikleri yeniden ekler ("Ekle"/"Yeniden Ekle" — idempotent).
 *   Tıbbi üstünlük iddiası YOK.
 */
export function SunnahDaysControl({
  autoCount,
  busy,
  onRestore,
  onClear,
}: {
  autoCount: number;
  busy: boolean;
  onRestore: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-100/90 bg-white/95 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-base" aria-hidden>
            🌙
          </span>
          <span className="text-sm font-black text-slate-800">Sünnet Günleri</span>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {autoCount} otomatik gün
          </span>
        </span>
        <span className="text-xs font-semibold text-amber-700" aria-hidden>
          {open ? "Gizle" : "Göster"}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Bu günler geleneksel takvim tercihi olarak otomatik eklenir. Farklı ekollerde
            uygulama değişebileceği için uzman dilediği günleri kaldırabilir veya takvimi
            tamamen kendisi oluşturabilir. Takvim üzerindeki bir günü tek tek kaldırmak için
            o güne dokunup değişikliği kaydetmeniz yeterlidir.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              className={`${kupaBtnPrimary} min-h-[40px]`}
              onClick={onRestore}
              disabled={busy}
            >
              {busy
                ? "İşleniyor…"
                : autoCount > 0
                  ? "Eksik Sünnet Günlerini Yeniden Ekle"
                  : "Sünnet Günlerini Ekle"}
            </button>
            {autoCount > 0 ? (
              <button
                type="button"
                className={`${kupaBtnGhost} min-h-[40px] border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50`}
                onClick={onClear}
                disabled={busy}
              >
                Sünnet Günlerini Temizle
              </button>
            ) : null}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            &quot;Temizle&quot; yalnızca takvime otomatik eklenen Sünnet ve Altın günleri kaldırır;
            kendi eklediğiniz günler korunur.
          </p>
        </div>
      ) : null}
    </section>
  );
}

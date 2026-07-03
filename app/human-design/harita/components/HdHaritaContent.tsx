"use client";

// FAZ 5 / ADIM 3a — Human Design Haritası. Form + sonuç (yalnız olgusal; yorum YOK).
// DB/PDF/Word/SVG/cross-tema-adı YOK. Engine sunucuda; burada yalnız fetch + render.
// FAZ 10A — sonuç görünümü koyu premium HdResultDashboard'a taşındı (form açık kalır).

import { useState } from "react";
import { computeHdChart } from "@/lib/human-design/api/computeClient";
import { saveComputedChart } from "@/lib/human-design/api/chartsClient";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import { LocationPicker } from "./LocationPicker";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { SEED_LOCATIONS } from "@/lib/location/data";
import { HdResultDashboard } from "./HdResultDashboard";

// FAZ 8B — HD doğum yeri arama kümesi: TR 81 il + global seed (TR olmayanlar).
// SEED içindeki TR kayıtları (İstanbul/Ankara/İzmir/Manisa) TR_LOCATIONS'ta zaten
// olduğundan tekrar önlemek için yalnız countryCode !== "TR" alınır.
const HD_LOCATIONS = [...TR_LOCATIONS, ...SEED_LOCATIONS.filter((l) => l.countryCode !== "TR")];

// IANA timezone listesi (yeni paket yok). supportedValuesOf yoksa yaygın liste.
const TIMEZONES: string[] = (() => {
  const withTz = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    if (typeof withTz.supportedValuesOf === "function") {
      return withTz.supportedValuesOf("timeZone");
    }
  } catch {
    /* fallback */
  }
  return [
    "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Vienna",
    "America/New_York", "Asia/Kolkata", "Australia/Adelaide", "UTC",
  ];
})();

const labelCls = "block text-xs font-bold text-slate-700 mb-1";
const inputCls =
  "w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200";
const cardCls =
  "rounded-2xl border border-indigo-200/70 bg-white/90 p-4 shadow-sm ring-1 ring-indigo-100/60 backdrop-blur";

export function HdHaritaContent() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [tz, setTz] = useState("Europe/Istanbul");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HdChartResult | null>(null);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "done" | "error"; msg?: string }>({
    status: "idle",
  });

  const canSubmit = date !== "" && time !== "" && tz !== "" && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSaveState({ status: "idle" });
    setLoading(true);
    const r = await computeHdChart({ date, time, timezone: tz });
    setLoading(false);
    if (r.ok) {
      setResult(r.data);
    } else if (r.status === 401 || r.status === 403) {
      setError("Oturum gerekli. Lütfen tekrar giriş yapın.");
    } else {
      setError(r.error);
    }
  }

  async function handleSaveChart() {
    if (!result || saveState.status === "saving") return;
    setSaveState({ status: "saving" });
    const r = await saveComputedChart({ date, time, timezone: tz }, { birthPlace: place });
    if (r.ok) {
      setSaveState({ status: "done", msg: "Kaydedildi ✓" });
    } else {
      setSaveState({ status: "error", msg: r.error });
    }
  }

  return (
    <div className="space-y-4">
      {/* ── GİRİŞ (açık tema) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Form */}
        <form onSubmit={onSubmit} className={`${cardCls} lg:col-span-2`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <label htmlFor="hd-date" className={labelCls}>Doğum Tarihi</label>
              <input id="hd-date" type="date" min="1800-01-01" max="2100-12-31"
                value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label htmlFor="hd-time" className={labelCls}>Doğum Saati</label>
              <input id="hd-time" type="time" value={time}
                onChange={(e) => setTime(e.target.value)} className={inputCls} required />
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Kesin saat önemlidir; belirsizse sonuç güvenilir olmayabilir.
              </p>
            </div>
            <div>
              <label htmlFor="hd-place" className={labelCls}>Doğum Yeri</label>
              <LocationPicker
                id="hd-place"
                dataset={HD_LOCATIONS}
                onSelect={(loc) => { setPlace(loc.name); setTz(loc.tz); }}
              />
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Şehir seçtiğinizde saat dilimi otomatik dolar; bulunamazsa aşağıdan elle seçebilirsiniz.
              </p>
            </div>
            <div>
              <label htmlFor="hd-tz" className={labelCls}>Saat Dilimi</label>
              <select id="hd-tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls} required>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" disabled={!canSubmit} className="btn-primary mt-4 w-full justify-center">
            {loading ? "Hesaplanıyor…" : "Haritayı Oluştur"}
          </button>

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
        </form>

        {/* Durum ipucu */}
        <div className="lg:col-span-3" aria-live="polite">
          <div className={`${cardCls} flex min-h-[12rem] items-center justify-center text-center text-sm text-slate-500`}>
            {result
              ? "Harita hazır — sonuç aşağıdaki premium panelde görünüyor ↓"
              : "Harita sonucu burada görünecek."}
          </div>
        </div>
      </div>

      {/* ── PREMIUM SONUÇ DASHBOARD (koyu; tam genişlik) ── */}
      {result && (
        <HdResultDashboard
          result={result}
          birth={{ date, time, place, timezone: tz }}
          saveState={saveState}
          onSave={() => void handleSaveChart()}
        />
      )}
    </div>
  );
}

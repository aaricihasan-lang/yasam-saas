"use client";

// FAZ 5 / ADIM 3a — Human Design Haritası. Form + sonuç (yalnız olgusal; yorum YOK).
// DB/PDF/Word/SVG/cross-tema-adı YOK. Engine sunucuda; burada yalnız fetch + render.

import { useState } from "react";
import { computeHdChart } from "@/lib/human-design/api/computeClient";
import type { HdChartResult } from "@/lib/human-design/engine/contract";
import { BodyGraph } from "./BodyGraph";
import { LocationPicker } from "./LocationPicker";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { SEED_LOCATIONS } from "@/lib/location/data";

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

const CENTER_TR: Record<string, string> = {
  Head: "Baş", Ajna: "Anja", Throat: "Boğaz", G: "G (Kimlik)", Heart: "Ego / Kalp",
  Spleen: "Dalak", SolarPlexus: "Solar Pleksus", Sacral: "Sakral", Root: "Kök",
};

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

  const canSubmit = date !== "" && time !== "" && tz !== "" && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* ── FORM ── */}
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

      {/* ── SONUÇ ── */}
      <div className="lg:col-span-3" aria-live="polite">
        {!result ? (
          <div className={`${cardCls} flex min-h-[12rem] items-center justify-center text-sm text-slate-500`}>
            Harita sonucu burada görünecek.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(400px,470px)_minmax(0,1fr)]">
            {/* BodyGraph — mobil/tablet üstte, xl'de solda (responsive ölçek + overflow güvenli) */}
            <div className="flex min-w-0 items-start justify-center overflow-hidden rounded-2xl border border-indigo-200/70 bg-white/90 p-3 shadow-sm ring-1 ring-indigo-100/60 backdrop-blur sm:p-4">
              <BodyGraph result={result} />
            </div>

            {/* Veri kartları */}
            <div className="space-y-3">
            {/* Üst şerit */}
            <div className={cardCls}>
              <div className="flex flex-wrap gap-2">
                <Badge label="Type" value={result.type} tone="indigo" />
                <Badge label="Authority" value={result.authority} tone="violet" />
                <Badge label="Profile" value={result.profile} tone="fuchsia" />
                <Badge
                  label="Definition"
                  value={`${result.definition.kind} · ${result.definition.componentCount} bileşen`}
                  tone="sky"
                />
              </div>
            </div>

            {/* Centers */}
            <div className={cardCls}>
              <h3 className="mb-2 text-sm font-black text-slate-900">Merkezler (Centers)</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Tanımlı</p>
                  <p className="text-sm text-slate-800">
                    {result.centers.defined.map((c) => CENTER_TR[c] ?? c).join(", ") || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Açık</p>
                  <p className="text-sm text-slate-600">
                    {result.centers.open.map((c) => CENTER_TR[c] ?? c).join(", ") || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Channels */}
            <div className={cardCls}>
              <h3 className="mb-2 text-sm font-black text-slate-900">Kanallar (Channels)</h3>
              {result.channels.length === 0 ? (
                <p className="text-sm text-slate-500">Tanımlı kanal yok.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {result.channels.map((ch) => (
                    <li key={ch.id} className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-200">
                      {ch.id} <span className="font-normal text-indigo-600">{ch.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Cross Gates (gates-only) */}
            <div className={cardCls}>
              <h3 className="mb-1 text-sm font-black text-slate-900">Incarnation Cross</h3>
              <p className="text-sm text-slate-800">
                {result.incarnationCross.angle ? `${result.incarnationCross.angle} Cross — ` : "Cross — "}
                Gates {result.incarnationCross.gates.join("/")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Cross tema adı gösterilmez (doğrulanmış referans tablosu yok).
              </p>
            </div>

            {/* Validation Status */}
            <div className={cardCls}>
              <h3 className="mb-1.5 text-sm font-black text-slate-900">Doğrulama Durumu</h3>
              {result.validation.overall === "validated" ? (
                <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  Doğrulanmış kapsam
                </span>
              ) : (
                <div>
                  <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                    Doğrulama beklemede
                  </span>
                  <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                    {result.validation.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className={`${cardCls} border-amber-200/80`}>
                <h3 className="mb-1.5 text-sm font-black text-amber-800">Uyarılar</h3>
                <ul className="list-disc pl-5 text-xs text-amber-800">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Disclaimer */}
            <p className="px-1 text-[11px] leading-4 text-slate-400">
              {result.meta.disclaimer} Bu ekran yorum içermez; yalnız hesaplanmış değerleri gösterir.
            </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ label, value, tone }: { label: string; value: string; tone: string }) {
  const toneCls: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    violet: "bg-violet-100 text-violet-800 ring-violet-200",
    fuchsia: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
    sky: "bg-sky-100 text-sky-800 ring-sky-200",
  };
  return (
    <div className={`rounded-xl px-3 py-1.5 ring-1 ring-inset ${toneCls[tone] ?? toneCls.indigo}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-sm font-black">{value}</span>
    </div>
  );
}

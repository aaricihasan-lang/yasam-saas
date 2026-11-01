"use client";

/**
 * Gökyüzü Atlası — PROFESYONEL EFEMERİS masası (izole; varsayılan KAPALI bayrakla sunulur, menüye bağlı değildir).
 *
 * Satırlar = günler (00:00 UT), sütunlar = cisimler; gösterilen büyüklük sekmeyle seçilir (boylam / enlem / RA / deklinasyon / hız).
 * Hassasiyet ÖLÇÜLMÜŞ hataya göre sunucudan gelir (meta.precision) — daha ince basamak gösterilmez. Olaylar (burç girişi, istasyon)
 * UT ve tarayıcı saat diliminde, belirsizliğiyle listelenir. CSV yalnız yerel kaynakta. Girdi değişince eski tablo gizlenir; geciken
 * yanıt yeni durumu ezemez (kuşak sayacı).
 */
import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { EphemerisBody, EphemerisField, EphemerisResult, EphemerisSource, Zodiac } from "@/lib/astrology/pro/ephemeris/types";
import { BODY_NAME_TR, eventLabel, formatLon, formatRa, formatSigned, formatUncertainty, toCsv } from "@/lib/astrology/pro/ephemeris/format";
import { astroFetch } from "../../_lib/api";
import { atlasEyebrow, atlasNightBg, atlasPanel, atlasPaperInput, atlasPrimaryBtn, atlasSecondaryBtn } from "../AtlasShell";

type View = "day" | "month" | "year" | "range";
const VIEWS: [View, string][] = [
  ["day", "Gün"],
  ["month", "Ay"],
  ["year", "Yıl"],
  ["range", "Aralık"],
];
const FIELDS: [Exclude<EphemerisField, "retro">, string][] = [
  ["lon", "Boylam"],
  ["lat", "Enlem"],
  ["ra", "Sağ açıklık"],
  ["dec", "Deklinasyon"],
  ["speed", "Günlük hareket"],
];
const PLANETS: EphemerisBody[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const SHORT: Record<EphemerisBody, string> = { sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars", jupiter: "Jüpiter", saturn: "Satürn", uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton", mean_node: "Ort. düğüm", true_node: "Gerç. düğüm" };
const ctl = "min-h-[44px] w-full min-w-0";
const today = () => new Date().toISOString().slice(0, 10);
const PRECISION_LABEL = { arcsec: "saniye", tenth_arcmin: "0,1 dakika", arcmin: "dakika" } as const;

export default function EphemerisDesk() {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [source, setSource] = useState<EphemerisSource>("local");
  const [zodiac, setZodiac] = useState<Zodiac>("tropical");
  const [nodeType, setNodeType] = useState<"true" | "mean">("true");
  const [bodies, setBodies] = useState<EphemerisBody[]>([...PLANETS, "true_node"]);
  const [field, setField] = useState<Exclude<EphemerisField, "retro">>("lon");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; error: string } | null>(null);
  const [res, setRes] = useState<EphemerisResult | null>(null);
  const gen = useRef(0);
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  /** Girdi değişince eski sonuç gizlenir (yanlış tabloyla çalışma riski). */
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    gen.current++;
    set(v);
    setRes(null);
    setErr(null);
    setPage(0);
  };
  const nodeId: EphemerisBody = nodeType === "true" ? "true_node" : "mean_node";
  const toggleBody = (b: EphemerisBody) => edit(setBodies)(bodies.includes(b) ? bodies.filter((x) => x !== b) : [...bodies, b]);
  const setNode = (v: "true" | "mean") => {
    const other: EphemerisBody = v === "true" ? "mean_node" : "true_node";
    const had = bodies.includes(other);
    edit(setNodeType)(v);
    if (had) setBodies((bs) => [...bs.filter((x) => x !== other), v === "true" ? "true_node" : "mean_node"]);
  };

  function body(p: number): Record<string, unknown> {
    const common = { page: p, bodies, zodiac, source, nodeType };
    if (view === "day") return { view, date, ...common };
    if (view === "month") return { view, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), ...common };
    if (view === "year") return { view, year: Number(year), ...common };
    return { view, start, end, ...common };
  }

  async function load(p: number) {
    if (busy) return;
    if (bodies.length === 0) {
      setErr({ field: "bodies", error: "En az bir cisim seçin." });
      return;
    }
    const my = ++gen.current;
    setBusy(true);
    setErr(null);
    const r = await astroFetch<{ ok: true; result: EphemerisResult }>("/api/admin/astroloji/efemeris", { method: "POST", body: body(p) });
    setBusy(false); // aynı anda tek istek (busy iken load reddedilir)
    if (my !== gen.current) return; // geciken yanıt: girdi bu arada değiştiyse yeni durumu ezmez
    if (!r.ok) {
      setRes(null);
      setErr({ field: typeof r.data?.field === "string" ? r.data.field : undefined, error: r.error || "Tablo oluşturulamadı." });
      return;
    }
    setPage(p);
    setRes(r.data.result);
  }

  function downloadCsv() {
    if (!res || res.meta.source !== "local") return;
    const blob = new Blob(["﻿" + toCsv(res)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `efemeris-${res.page.startDate}_${res.page.endDate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const cell = (p: EphemerisResult["rows"][number]["positions"][number]) => {
    if (!res) return "";
    const P = res.meta.bodyPrecision[p.body] ?? res.meta.precision;
    if (field === "lon") return formatLon(p.lon, P.lon);
    if (field === "lat") return p.lat === null ? "—" : formatSigned(p.lat, P.lat, 1);
    if (field === "ra") return p.ra === null ? "—" : formatRa(p.ra, P.ra);
    if (field === "dec") return p.dec === null ? "—" : formatSigned(p.dec, P.dec, 2);
    return formatSigned(p.speed, P.speed, 2);
  };
  const localTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("tr-TR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };
  const fieldErr = (f: string) => (err?.field === f ? "border-rose-400 ring-2 ring-rose-200" : "");
  const shownBodies = res ? res.rows[0]?.positions.map((p) => p.body) ?? [] : [];

  return (
    <main className={`min-h-screen ${atlasNightBg} px-0 py-6 sm:px-6`} data-testid="pro-ephemeris">
      <div className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-col gap-4">
        <header className="min-w-0 max-sm:px-3">
          <p className={atlasEyebrow}>Gökyüzü Atlası · Efemeris</p>
          <h1 className="mt-0.5 text-[1.45rem] font-light leading-tight tracking-[0.02em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-[1.75rem]">Profesyonel Efemeris</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#F6F2EA]/75">Günlük 00:00 UT konumları, burç girişleri ve istasyonlar. Gösterilen basamak, ölçülmüş hesap doğruluğuyla sınırlıdır.</p>
        </header>

        <form
          className={`${atlasPanel} grid min-w-0 grid-cols-1 gap-4 px-4 py-5 sm:px-6`}
          onSubmit={(e) => {
            e.preventDefault();
            void load(0);
          }}
          data-testid="eph-form"
        >
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Görünüm">
            {VIEWS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => edit(setView)(v)} className={`${view === v ? atlasPrimaryBtn : atlasSecondaryBtn} min-h-[44px] min-w-[72px]`} data-testid={`eph-view-${v}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {view === "day" && (
              <label className="grid min-w-0 gap-1.5">
                <span className="text-sm font-medium text-slate-700">Tarih</span>
                <input type="date" min="1600-01-01" max="2600-12-31" className={`${atlasPaperInput} ${ctl} ${fieldErr("date")}`} value={date} onChange={(e) => edit(setDate)(e.target.value)} data-testid="eph-date" />
              </label>
            )}
            {view === "month" && (
              <label className="grid min-w-0 gap-1.5">
                <span className="text-sm font-medium text-slate-700">Ay</span>
                <input type="month" min="1600-01" max="2600-12" className={`${atlasPaperInput} ${ctl} ${fieldErr("month")}`} value={month} onChange={(e) => edit(setMonth)(e.target.value)} data-testid="eph-month" />
              </label>
            )}
            {view === "year" && (
              <label className="grid min-w-0 gap-1.5">
                <span className="text-sm font-medium text-slate-700">Yıl</span>
                <input type="number" min={1600} max={2600} inputMode="numeric" className={`${atlasPaperInput} ${ctl} ${fieldErr("year")}`} value={year} onChange={(e) => edit(setYear)(e.target.value)} data-testid="eph-year" />
              </label>
            )}
            {view === "range" && (
              <>
                <label className="grid min-w-0 gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Başlangıç</span>
                  <input type="date" min="1600-01-01" max="2600-12-31" className={`${atlasPaperInput} ${ctl} ${fieldErr("start")}`} value={start} onChange={(e) => edit(setStart)(e.target.value)} data-testid="eph-start" />
                </label>
                <label className="grid min-w-0 gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Bitiş (en çok 10 yıl)</span>
                  <input type="date" min="1600-01-01" max="2600-12-31" className={`${atlasPaperInput} ${ctl} ${fieldErr("end")}`} value={end} onChange={(e) => edit(setEnd)(e.target.value)} data-testid="eph-end" />
                </label>
              </>
            )}
            <label className="grid min-w-0 gap-1.5">
              <span className="text-sm font-medium text-slate-700">Zodyak</span>
              <select className={`${atlasPaperInput} ${ctl}`} value={zodiac} onChange={(e) => edit(setZodiac)(e.target.value as Zodiac)} data-testid="eph-zodiac">
                <option value="tropical">Tropikal</option>
                <option value="sidereal_lahiri">Sidereal (Lahiri)</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1.5">
              <span className="text-sm font-medium text-slate-700">Kaynak</span>
              <select className={`${atlasPaperInput} ${ctl} ${fieldErr("source")}`} value={source} onChange={(e) => edit(setSource)(e.target.value as EphemerisSource)} data-testid="eph-source">
                <option value="local">Yerel hesap (dakika)</option>
                <option value="provider">Hesaplama altyapısı (saniye)</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1.5">
              <span className="text-sm font-medium text-slate-700">Ay düğümü</span>
              <select className={`${atlasPaperInput} ${ctl}`} value={nodeType} onChange={(e) => setNode(e.target.value as "true" | "mean")} data-testid="eph-node">
                <option value="true">Gerçek düğüm</option>
                <option value="mean">Ortalama düğüm</option>
              </select>
            </label>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Cisimler</legend>
            <div className={`flex min-w-0 flex-wrap gap-2 rounded-lg ${err?.field === "bodies" ? "ring-2 ring-rose-200" : ""}`}>
              {[...PLANETS, nodeId].map((b) => (
                <label key={b} className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${bodies.includes(b) ? "border-[#b8954e] bg-[#F6EBD3] text-[#0B1430]" : "border-[#d9c9a3] bg-white text-slate-600"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-[#b8954e]" checked={bodies.includes(b)} onChange={() => toggleBody(b)} data-testid={`eph-body-${b}`} />
                  {BODY_NAME_TR[b]}
                </label>
              ))}
            </div>
          </fieldset>

          {err && (
            <div role="alert" className="min-w-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="eph-error" data-field={err.field ?? ""}>
              {err.error}
            </div>
          )}
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button type="submit" className={`${atlasPrimaryBtn} min-h-[44px]`} disabled={busy} aria-busy={busy} data-testid="eph-submit">
              {busy ? "Hesaplanıyor…" : "Tabloyu Oluştur"}
            </button>
            {source === "provider" && <span className="text-xs text-slate-500">Hesaplama altyapısı kaynağında her gün için ayrı istek yapılır; sayfa en çok 31 gündür.</span>}
          </div>
        </form>

        {res && (
          <section className={`${atlasPanel} min-w-0 px-0 py-4 sm:px-2`} data-testid="eph-result">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4">
              <div className="flex min-w-0 flex-wrap gap-1.5" role="tablist" aria-label="Gösterilen büyüklük">
                {FIELDS.map(([f, l]) => (
                  <button key={f} type="button" role="tab" aria-selected={field === f} onClick={() => setField(f)} className={`${field === f ? atlasPrimaryBtn : atlasSecondaryBtn} min-h-[44px]`} data-testid={`eph-field-${f}`}>
                    {l}
                  </button>
                ))}
              </div>
              {res.meta.source === "local" && (
                <button type="button" onClick={downloadCsv} className={`${atlasSecondaryBtn} min-h-[44px]`} data-testid="eph-csv">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  CSV
                </button>
              )}
            </div>

            <div className="mt-3 w-full min-w-0 overflow-x-auto overscroll-x-contain" data-testid="eph-table-wrap">
              <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] tabular-nums" data-testid="eph-table">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 border-b border-[#e7dcc3] bg-[#F3ECDD] px-3 py-2 text-left font-semibold text-[#0B1430]">
                      Tarih <span className="font-normal text-slate-500">0h UT</span>
                    </th>
                    {shownBodies.map((b) => (
                      <th key={b} scope="col" className="whitespace-nowrap border-b border-[#e7dcc3] bg-[#F3ECDD] px-3 py-2 text-right font-semibold text-[#0B1430]">
                        {SHORT[b]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((row) => (
                    <tr key={row.date} className="odd:bg-white even:bg-[#FBF8F2]">
                      <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-[#efe6d2] bg-inherit px-3 py-1.5 text-left font-medium text-slate-700">
                        {row.date}
                      </th>
                      {row.positions.map((p) => (
                        <td key={p.body} className="whitespace-nowrap border-b border-[#efe6d2] px-3 py-1.5 text-right text-slate-800" data-testid={`eph-cell-${row.date}-${p.body}`}>
                          {cell(p)}
                          {(field === "lon" || field === "speed") && (p.stationary ? <span className="ml-1 font-semibold text-amber-700" title="Durağan (istasyon yakını)">S</span> : p.retro ? <span className="ml-1 font-semibold text-rose-700" title="Geri hareket">℞</span> : null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {res.page.total > 1 && (
              <nav className="mt-3 flex min-w-0 flex-wrap items-center gap-2 px-4" aria-label="Sayfalar" data-testid="eph-pager">
                <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} disabled={busy || res.page.index === 0} onClick={() => void load(page - 1)} data-testid="eph-prev">
                  Önceki
                </button>
                <span className="text-sm text-slate-600" data-testid="eph-page">
                  {res.page.index + 1} / {res.page.total} · {res.page.startDate} – {res.page.endDate}
                </span>
                <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} disabled={busy || res.page.index + 1 >= res.page.total} onClick={() => void load(page + 1)} data-testid="eph-next">
                  Sonraki
                </button>
              </nav>
            )}

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#0B1430]">Olaylar ({res.events.length})</h2>
                {res.events.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Bu aralıkta burç girişi ya da istasyon yok.</p>
                ) : (
                  <ul className="mt-2 grid min-w-0 gap-1.5" data-testid="eph-events">
                    {res.events.map((e) => (
                      <li key={`${e.kind}-${e.body}-${e.ms}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg border border-[#efe6d2] bg-white px-3 py-2 text-sm">
                        <span className="min-w-0 font-medium text-slate-800">{eventLabel(e)}</span>
                        <span className="text-xs text-slate-600">
                          {e.ut.replace("T", " ").replace("Z", " UT")} · {localTime(e.ut)} ({tz}) · {formatUncertainty(e.uncertaintySec)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <aside className="min-w-0 rounded-xl border border-[#e7dcc3] bg-[#F7F1E4] px-4 py-3 text-xs leading-relaxed text-slate-700" data-testid="eph-meta">
                <p className="text-sm font-semibold text-[#0B1430]">Kaynak ve zaman standardı</p>
                <p className="mt-1">{res.meta.source === "provider" ? "Kaynak: hesaplama altyapısı (sunucu)" : "Kaynak: yerel astronomik hesap"}</p>
                <p className="mt-1">{res.meta.timeStandard}</p>
                <p className="mt-1">{res.meta.deltaTNote}</p>
                <p className="mt-1">{res.meta.nodeNote}</p>
                {res.meta.ayanamsa && <p className="mt-1">Lahiri ayanamsa (ortalama, ilk gün): {formatSigned(res.meta.ayanamsa.valueAtStart, "arcsec").replace("+", "")}</p>}
                <p className="mt-1" data-testid="eph-precision">
                  Gösterim (en kaba sütun): boylam {PRECISION_LABEL[res.meta.precision.lon]}, enlem {PRECISION_LABEL[res.meta.precision.lat]}, RA/deklinasyon {PRECISION_LABEL[res.meta.precision.ra]}, hız {PRECISION_LABEL[res.meta.precision.speed]}. Basamak, cismin ölçülmüş doğruluğuna göre seçilir. ℞ geri, S durağan.
                </p>
              </aside>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

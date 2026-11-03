"use client";

/**
 * Gökyüzü Araçları — EFEMERİS sekmesi (#645; owner GÖRSEL PASS 02.11.2026 prototipi). Yerel hesap; hiçbir şey kaydedilmez.
 *
 * Görünüm: Gün · Ay · Yıl · Aralık (günlük 00:00 UT satırları, 31 günlük sayfalar) ve Olaylar (seçilen aydaki burç girişleri ve
 * istasyonlar). Sütunlar: Boylam (tarih × cisim) ya da RA · Dek · Hız (tarih × cisim satırlarında boylam, enlem, RA, deklinasyon,
 * hız). Hassasiyet ÖLÇÜLMÜŞ hataya göre sunucudan gelir (meta.precision) — daha ince basamak gösterilmez. Girdi değişince eski tablo
 * gizlenir; geciken yanıt yeni durumu ezemez (kuşak sayacı). CSV yalnız yerel kaynakta.
 */
import { useRef, useState } from "react";
import type { EphemerisBody, EphemerisResult, Zodiac } from "@/lib/astrology/pro/ephemeris/types";
import { BODY_NAME_TR, eventLabel, formatLon, formatRa, formatSigned, formatUncertainty, toCsv } from "@/lib/astrology/pro/ephemeris/format";
import { astroFetch } from "../../_lib/api";
import { DataTable, ParamsPanel, Seg, fmtLocal, fmtUt, st as s, useTimeZone } from "./skyToolsUi";

type View = "day" | "month" | "year" | "range" | "events";
type Cols = "lon" | "radec";
const VIEWS = [
  ["day", "Gün"],
  ["month", "Ay"],
  ["year", "Yıl"],
  ["range", "Aralık"],
  ["events", "Olaylar"],
] as const;
const PLANETS: EphemerisBody[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const SHORT: Record<EphemerisBody, string> = { sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars", jupiter: "Jüpiter", saturn: "Satürn", uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton", mean_node: "Ort. düğüm", true_node: "K. Ay Düğümü" };
const PRECISION_LABEL = { arcsec: "saniye", tenth_arcmin: "0,1 dakika", arcmin: "dakika" } as const;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const today = () => new Date().toISOString().slice(0, 10);
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default function EphemerisDesk() {
  const { tz, label: tzLabel } = useTimeZone();
  const [view, setView] = useState<View>("month");
  const [cols, setCols] = useState<Cols>("lon");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [zodiac, setZodiac] = useState<Zodiac>("tropical");
  const [nodeType, setNodeType] = useState<"true" | "mean">("true");
  const [bodies, setBodies] = useState<EphemerisBody[]>([...PLANETS, "true_node"]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; error: string } | null>(null);
  const [res, setRes] = useState<EphemerisResult | null>(null);
  const [resView, setResView] = useState<View>("month");
  const [open, setOpen] = useState(true);
  const gen = useRef(0);

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
    const common = { page: p, bodies, zodiac, source: "local", nodeType };
    if (view === "day") return { view, date, ...common };
    if (view === "month" || view === "events") return { view: "month", year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), ...common };
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
    setResView(view);
    setRes(r.data.result);
    setOpen(false);
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

  const prec = (b: EphemerisBody) => (res ? (res.meta.bodyPrecision[b] ?? res.meta.precision) : null);
  const mark = (p: EphemerisResult["rows"][number]["positions"][number]) =>
    p.stationary ? (
      <span className={s.retro} title="Durağan (istasyon yakını)">
        S
      </span>
    ) : p.retro ? (
      <span className={s.retro} title="Geri hareket">
        ℞
      </span>
    ) : null;

  const periodLabel = () => {
    if (view === "day") return dmy(date);
    if (view === "month" || view === "events") return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
    if (view === "year") return year;
    return `${dmy(start)} – ${dmy(end)}`;
  };
  const summary = `${VIEWS.find((v) => v[0] === view)?.[1]} · ${periodLabel()} · ${zodiac === "tropical" ? "Tropikal" : "Sidereal"}${view === "events" ? "" : ` · ${cols === "lon" ? "Boylam" : "RA · Dek · Hız"}`}`;

  function resultBody(r: EphemerisResult) {
    if (resView === "events") {
      if (r.events.length === 0) return <p className={s.empty}>Bu dönemde burç girişi ya da istasyon yok.</p>;
      const rows = r.events.map((e) => ({
        key: `${e.kind}-${e.body}-${e.ms}`,
        cells: [
          e.kind === "ingress" ? "Burç girişi" : e.direction === "retrograde" ? "Retro başlar" : "Direkt başlar",
          BODY_NAME_TR[e.body],
          e.kind === "ingress" ? eventLabel(e).replace(`${BODY_NAME_TR[e.body]} `, "") : formatLon(e.lon, prec(e.body)?.lon ?? "arcmin"),
          fmtLocal(e.ms, tz),
          fmtUt(e.ms),
          formatUncertainty(e.uncertaintySec),
        ],
      }));
      return <DataTable head={["Olay", "Cisim", "Ayrıntı", `Tarih (${tzLabel})`, "UT", "Belirsizlik"]} mobileHead={["Olay", "Cisim", "Ayrıntı", tzLabel, "UT", "±"]} rows={rows} testId="eph-events" />;
    }
    const shown = r.rows[0]?.positions.map((p) => p.body) ?? [];
    if (cols === "lon") {
      const rows = r.rows.map((row) => ({
        key: row.date,
        cells: [
          `${row.date.slice(8, 10)}.${row.date.slice(5, 7)}${resView === "year" || resView === "range" ? `.${row.date.slice(0, 4)}` : ""}`,
          ...row.positions.map((p) => (
            <span key={p.body} data-testid={`eph-cell-${row.date}-${p.body}`}>
              {formatLon(p.lon, prec(p.body)!.lon)}
              {mark(p)}
            </span>
          )),
        ],
      }));
      return <DataTable head={["Tarih", ...shown.map((b) => SHORT[b])]} rows={rows} testId="eph-table" />;
    }
    const rows = r.rows.flatMap((row) =>
      row.positions.map((p) => {
        const P = prec(p.body)!;
        return {
          key: `${row.date}-${p.body}`,
          cells: [
            `${dmy(row.date)} · ${SHORT[p.body]}`,
            formatLon(p.lon, P.lon),
            p.lat === null ? "—" : formatSigned(p.lat, P.lat, 1),
            p.ra === null ? "—" : formatRa(p.ra, P.ra),
            p.dec === null ? "—" : formatSigned(p.dec, P.dec, 2),
            <span key="h">
              {formatSigned(p.speed, P.speed, 2)}
              {mark(p)}
            </span>,
          ],
        };
      }),
    );
    return <DataTable head={["Tarih · Cisim", "Boylam", "Enlem", "RA", "Dek", "Hız (°/gün)"]} rows={rows} testId="eph-table" />;
  }

  const resTitle = res ? (resView === "events" ? `Burç girişleri ve istasyonlar · ${res.page.startDate === res.page.endDate ? dmy(res.page.startDate) : `${dmy(res.page.startDate)} – ${dmy(res.page.endDate)}`}` : `Günlük efemeris · ${dmy(res.page.startDate)} – ${dmy(res.page.endDate)}`) : "";

  return (
    <section className={s.grid} data-testid="pro-ephemeris">
      <ParamsPanel summary={summary} open={open || !res} onToggle={() => setOpen((o) => !o)}>
        <form
          className={s.paramsBody}
          onSubmit={(e) => {
            e.preventDefault();
            void load(0);
          }}
          data-testid="eph-form"
        >
          <div className={s.field}>
            <span className={s.fieldLabel}>Görünüm</span>
            <Seg label="Görünüm" options={VIEWS} value={view} onChange={edit(setView)} testId="eph-view" />
          </div>
          {view === "day" && (
            <label className={s.field}>
              <span className={s.fieldLabel}>Tarih</span>
              <input type="date" min="1600-01-01" max="2600-12-31" className={s.input} value={date} onChange={(e) => edit(setDate)(e.target.value)} data-testid="eph-date" />
            </label>
          )}
          {(view === "month" || view === "events") && (
            <label className={s.field}>
              <span className={s.fieldLabel}>Dönem</span>
              <input type="month" min="1600-01" max="2600-12" className={s.input} value={month} onChange={(e) => edit(setMonth)(e.target.value)} data-testid="eph-month" />
            </label>
          )}
          {view === "year" && (
            <label className={s.field}>
              <span className={s.fieldLabel}>Yıl</span>
              <input type="number" min={1600} max={2600} inputMode="numeric" className={s.input} value={year} onChange={(e) => edit(setYear)(e.target.value)} data-testid="eph-year" />
            </label>
          )}
          {view === "range" && (
            <>
              <label className={s.field}>
                <span className={s.fieldLabel}>Başlangıç</span>
                <input type="date" min="1600-01-01" max="2600-12-31" className={s.input} value={start} onChange={(e) => edit(setStart)(e.target.value)} data-testid="eph-start" />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Bitiş (en çok 10 yıl)</span>
                <input type="date" min="1600-01-01" max="2600-12-31" className={s.input} value={end} onChange={(e) => edit(setEnd)(e.target.value)} data-testid="eph-end" />
              </label>
            </>
          )}
          <label className={s.field}>
            <span className={s.fieldLabel}>Zodyak</span>
            <select className={s.input} value={zodiac} onChange={(e) => edit(setZodiac)(e.target.value as Zodiac)} data-testid="eph-zodiac">
              <option value="tropical">Tropikal</option>
              <option value="sidereal_lahiri">Sidereal (Lahiri)</option>
            </select>
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Ay düğümü</span>
            <select className={s.input} value={nodeType} onChange={(e) => setNode(e.target.value as "true" | "mean")} data-testid="eph-node">
              <option value="true">Gerçek düğüm</option>
              <option value="mean">Ortalama düğüm</option>
            </select>
          </label>
          {view !== "events" && (
            <div className={s.field}>
              <span className={s.fieldLabel}>Sütunlar</span>
              <Seg
                label="Sütunlar"
                options={[
                  ["lon", "Boylam"],
                  ["radec", "RA · Dek · Hız"],
                ]}
                value={cols}
                onChange={setCols}
                testId="eph-cols"
              />
            </div>
          )}
          <div className={s.field}>
            <span className={s.fieldLabel}>Cisimler</span>
            <div className={s.chips}>
              {[...PLANETS, nodeId].map((b) => (
                <button key={b} type="button" className={`${s.chip} ${s.chipBtn}`} aria-pressed={bodies.includes(b)} onClick={() => toggleBody(b)} data-testid={`eph-body-${b}`}>
                  {SHORT[b]}
                </button>
              ))}
            </div>
            {err?.field === "bodies" && <p className={s.fieldError}>{err.error}</p>}
          </div>
          {err && err.field !== "bodies" && (
            <p role="alert" className={s.errorBox} data-testid="eph-error" data-field={err.field ?? ""}>
              {err.error}
            </p>
          )}
          <div className={s.actions}>
            <button type="submit" className={s.btnGold} disabled={busy} aria-busy={busy} data-testid="eph-submit">
              {busy ? "Hesaplanıyor…" : view === "events" ? "Olayları hesapla" : "Tabloyu hesapla"}
            </button>
            <button type="button" className={s.btnLight} onClick={downloadCsv} disabled={!res || res.meta.source !== "local"} data-testid="eph-csv">
              CSV indir
            </button>
          </div>
          <p className={s.sourceNote}>
            <b>Kaynak:</b> Yaşam Sistemi yerel hesap (görünür konum, gerçek ekliptik). Zaman: astronomik olaylar TT ile hesaplanır, ekranda UT ve {tzLabel} ayrı gösterilir. ±: ölçülmüş konum hata sınırından türetilen zaman belirsizliği.
          </p>
        </form>
      </ParamsPanel>

      <section className={`${s.panel} ${s.results}`} aria-live="polite" data-testid="eph-result">
        {!res ? (
          <p className={s.empty}>{busy ? "Hesaplanıyor…" : "Dönemi ve cisimleri seçip tabloyu hesaplayın."}</p>
        ) : (
          <>
            <div className={s.resHead}>
              <h2>{resTitle}</h2>
              <div className={s.resMeta}>
                <span className={s.chip}>{res.meta.zodiac === "tropical" ? "Tropikal" : "Sidereal (Lahiri)"}</span>
                {resView === "events" ? <span className={s.chip}>{res.events.length} olay</span> : <span className={s.chip}>00:00 UT satırları</span>}
                <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap · 0 servis çağrısı</span>
              </div>
            </div>
            {resultBody(res)}
            {res.page.total > 1 && (
              <nav className={s.pager} aria-label="Sayfalar" data-testid="eph-pager">
                <button type="button" className={s.btnLight} disabled={busy || res.page.index === 0} onClick={() => void load(page - 1)} data-testid="eph-prev">
                  Önceki
                </button>
                <span data-testid="eph-page">
                  {res.page.index + 1} / {res.page.total}
                </span>
                <button type="button" className={s.btnLight} disabled={busy || res.page.index + 1 >= res.page.total} onClick={() => void load(page + 1)} data-testid="eph-next">
                  Sonraki
                </button>
              </nav>
            )}
            <p className={s.small} data-testid="eph-precision">
              Gösterim hassasiyeti ölçülmüş hata sınırına göre seçilir: boylam {PRECISION_LABEL[res.meta.precision.lon]}, enlem {PRECISION_LABEL[res.meta.precision.lat]}, RA/deklinasyon {PRECISION_LABEL[res.meta.precision.ra]}, hız {PRECISION_LABEL[res.meta.precision.speed]}. ℞ geri, S durağan. {res.meta.timeStandard} {res.meta.deltaTNote} {res.meta.nodeNote}
              {res.meta.ayanamsa ? ` Lahiri ayanamsa (ilk gün): ${formatSigned(res.meta.ayanamsa.valueAtStart, "arcsec").replace("+", "")}.` : ""}
              {res.meta.positionEngine ? ` Konum kaynağı: ${res.meta.positionEngine.label}.` : ""}
            </p>
            {res.meta.positionEngine?.fallback && (
              <p className={s.small} role="alert" data-testid="eph-fallback">
                ⚠ {res.meta.positionEngine.note}
              </p>
            )}
          </>
        )}
      </section>
    </section>
  );
}

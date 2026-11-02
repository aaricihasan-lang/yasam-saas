"use client";

/**
 * Gökyüzü Araçları — DERECE GEÇİŞLERİ sekmesi (#663; owner GÖRSEL PASS 02.11.2026 prototipi). Yerel hesap.
 * Serbest derece (burç + derece) ve owner'ın onayladığı hazır kritik derece listeleri; her geçişte yön, tekrar (retro döngüsünde
 * aynı derece birden çok kez geçilir) ve belirsizlik. 1 saati aşan belirsizlikte saat gösterilmez, yalnız tarih (≈).
 */
import { useRef, useState } from "react";
import type { EphemerisBody, Zodiac } from "@/lib/astrology/pro/ephemeris/types";
import type { DegreeResult } from "@/lib/astrology/pro/degrees/request";
import { CRITICAL_DEGREE_PRESETS, type CriticalDegreePresetId } from "@/lib/astrology/pro/degrees/presets";
import { BODY_NAME_TR, SIGN_NAME_TR, formatUncertainty } from "@/lib/astrology/pro/ephemeris/format";
import { astroFetch } from "../../_lib/api";
import { DataTable, ParamsPanel, fmtLocalU, fmtUtU, st as s, useTimeZone } from "./skyToolsUi";

const BODIES: EphemerisBody[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "true_node", "mean_node"];
const MAX_DEGREES = 36;
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const degLabel = (d: number) => {
  const sign = Math.floor(d / 30);
  const inSign = Math.round((d - sign * 30) * 100) / 100;
  return `${String(inSign).replace(".", ",")}° ${SIGN_NAME_TR[sign]}`;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function DegreesTool() {
  const { tz, label: tzLabel } = useTimeZone();
  const [body, setBody] = useState<EphemerisBody>("pluto");
  const [degrees, setDegrees] = useState<number[]>([300]);
  const [preset, setPreset] = useState<CriticalDegreePresetId | null>(null);
  const [addSign, setAddSign] = useState(0);
  const [addDeg, setAddDeg] = useState("0");
  const [start, setStart] = useState(isoDay(new Date()));
  const [end, setEnd] = useState(`${new Date().getUTCFullYear() + 2}-12-31`);
  const [zodiac, setZodiac] = useState<Zodiac>("tropical");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; error: string } | null>(null);
  const [res, setRes] = useState<DegreeResult | null>(null);
  const [open, setOpen] = useState(true);
  const gen = useRef(0);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    gen.current++;
    set(v);
    setRes(null);
    setErr(null);
  };
  const choosePreset = (id: CriticalDegreePresetId) => {
    const p = CRITICAL_DEGREE_PRESETS.find((x) => x.id === id)!;
    edit(setDegrees)(p.degrees);
    setPreset(id);
  };
  const addDegree = () => {
    const d = Number(addDeg.replace(",", "."));
    if (!Number.isFinite(d) || d < 0 || d >= 30) {
      setErr({ field: "degrees", error: "Burç içi derece 0 ile 30 arasında olmalı (30 hariç)." });
      return;
    }
    const lon = Math.round((addSign * 30 + d) * 1e6) / 1e6;
    if (degrees.includes(lon)) return;
    if (degrees.length >= MAX_DEGREES) {
      setErr({ field: "degrees", error: `En çok ${MAX_DEGREES} derece seçilebilir.` });
      return;
    }
    edit(setDegrees)([...degrees, lon].sort((a, b) => a - b));
    setPreset(null);
  };
  const removeDegree = (d: number) => {
    edit(setDegrees)(degrees.filter((x) => x !== d));
    setPreset(null);
  };

  async function load() {
    if (busy) return;
    if (degrees.length === 0) {
      setErr({ field: "degrees", error: "En az bir derece seçin." });
      return;
    }
    const my = ++gen.current;
    setBusy(true);
    setErr(null);
    const r = await astroFetch<{ ok: true; result: DegreeResult }>("/api/admin/astroloji/efemeris/derece", { method: "POST", body: { body, degrees, start, end, zodiac } });
    setBusy(false);
    if (my !== gen.current) return;
    if (!r.ok) {
      setRes(null);
      setErr({ field: typeof r.data?.field === "string" ? r.data.field : undefined, error: r.error || "Hesap yapılamadı." });
      return;
    }
    setRes(r.data.result);
    setOpen(false);
  }

  const presetObj = preset ? CRITICAL_DEGREE_PRESETS.find((p) => p.id === preset)! : null;
  const degreeSummary = presetObj ? presetObj.label : degrees.length === 1 ? degLabel(degrees[0]) : `${degrees.length} derece`;
  const summary = `${BODY_NAME_TR[body]} · ${degreeSummary} · ${dmy(start)} – ${dmy(end)}`;

  return (
    <section className={s.grid} data-testid="sky-degrees">
      <ParamsPanel summary={summary} open={open || !res} onToggle={() => setOpen((o) => !o)}>
        <form
          className={s.paramsBody}
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label className={s.field}>
            <span className={s.fieldLabel}>Cisim</span>
            <select className={s.input} value={body} onChange={(e) => edit(setBody)(e.target.value as EphemerisBody)} data-testid="sky-deg-body">
              {BODIES.map((b) => (
                <option key={b} value={b}>
                  {BODY_NAME_TR[b]}
                </option>
              ))}
            </select>
          </label>
          <div className={s.field}>
            <span className={s.fieldLabel}>Hazır kritik derece listeleri</span>
            <div className={s.chips}>
              {CRITICAL_DEGREE_PRESETS.map((p) => (
                <button key={p.id} type="button" className={`${s.chip} ${s.chipBtn}`} aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)} data-testid={`sky-deg-preset-${p.id}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {presetObj && <p className={s.small}>{presetObj.note}</p>}
          </div>
          <div className={s.field}>
            <span className={s.fieldLabel}>
              Dereceler ({degrees.length} / en çok {MAX_DEGREES})
            </span>
            <div className={s.chips} data-testid="sky-deg-list">
              {degrees.map((d) => (
                <button key={d} type="button" className={`${s.chip} ${s.chipBtn}`} aria-pressed="true" onClick={() => removeDegree(d)} aria-label={`${degLabel(d)} kaldır`}>
                  {degLabel(d)} ×
                </button>
              ))}
            </div>
            <div className={s.actions}>
              <select className={s.input} style={{ flex: "1 1 120px", width: "auto" }} value={addSign} onChange={(e) => setAddSign(Number(e.target.value))} aria-label="Burç">
                {SIGN_NAME_TR.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <input className={s.input} style={{ flex: "0 1 80px", width: "auto" }} inputMode="decimal" value={addDeg} onChange={(e) => setAddDeg(e.target.value)} aria-label="Burç içi derece" />
              <button type="button" className={s.btnLight} onClick={addDegree} data-testid="sky-deg-add">
                Ekle
              </button>
            </div>
            {err?.field === "degrees" && <p className={s.fieldError}>{err.error}</p>}
          </div>
          <label className={s.field}>
            <span className={s.fieldLabel}>Başlangıç</span>
            <input type="date" min="1920-01-01" max="2150-12-31" className={s.input} value={start} onChange={(e) => edit(setStart)(e.target.value)} data-testid="sky-deg-start" />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Bitiş (en çok 10 yıl; Ay için 400 gün)</span>
            <input type="date" min="1920-01-01" max="2150-12-31" className={s.input} value={end} onChange={(e) => edit(setEnd)(e.target.value)} data-testid="sky-deg-end" />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Zodyak</span>
            <select className={s.input} value={zodiac} onChange={(e) => edit(setZodiac)(e.target.value as Zodiac)}>
              <option value="tropical">Tropikal</option>
              <option value="sidereal_lahiri">Sidereal (Lahiri)</option>
            </select>
          </label>
          {err && err.field !== "degrees" && (
            <p role="alert" className={s.errorBox} data-testid="sky-deg-error">
              {err.error}
            </p>
          )}
          <div className={s.actions}>
            <button type="submit" className={s.btnGold} disabled={busy} aria-busy={busy} data-testid="sky-deg-submit">
              {busy ? "Hesaplanıyor…" : "Geçişleri bul"}
            </button>
          </div>
          <p className={s.sourceNote}>
            <b>Kritik derece listeleri</b> gelenek bağımlıdır; seçilen listenin kaynak notu yukarıda gösterilir. Değer, derecenin başlangıcıdır (ör. 13° = 13°00′).
          </p>
          <p className={s.sourceNote}>
            <b>Kaynak:</b> Yaşam Sistemi yerel hesap (görünür konum, gerçek ekliptik). Zaman: astronomik olaylar TT ile hesaplanır, ekranda UT ve {tzLabel} ayrı gösterilir. ±: ölçülmüş konum hata sınırından türetilen zaman belirsizliği.
          </p>
        </form>
      </ParamsPanel>

      <section className={`${s.panel} ${s.results}`} aria-live="polite" data-testid="sky-deg-result">
        {!res ? (
          <p className={s.empty}>{busy ? "Hesaplanıyor…" : "Cisim, derece ve tarih aralığını seçip geçişleri bulun."}</p>
        ) : (
          <>
            <div className={s.resHead}>
              <h2>
                {BODY_NAME_TR[res.body]} · {presetObj ? presetObj.label : res.degrees.length === 1 ? degLabel(res.degrees[0]) : `${res.degrees.length} derece`} · {dmy(res.range.start)} – {dmy(res.range.end)}
              </h2>
              <div className={s.resMeta}>
                <span className={s.chip}>{res.events.length} geçiş</span>
                <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap</span>
              </div>
            </div>
            {res.events.length === 0 ? (
              <p className={s.empty}>Bu aralıkta geçiş yok.</p>
            ) : (
              <DataTable
                head={["Cisim", "Derece", "Yön", "Tekrar", `Tarih (${tzLabel})`, "UT", "Belirsizlik"]}
                mobileHead={["Cisim", "Derece", "Yön", "Tekrar", tzLabel, "UT", "±"]}
                rows={res.events.map((e) => ({
                  key: `${e.degree}-${e.ms}`,
                  cells: [
                    BODY_NAME_TR[e.body],
                    degLabel(e.degree),
                    e.direction === "direct" ? <span key="d" className={s.dirD}>Direkt</span> : <span key="d" className={s.dirR}>Retro ℞</span>,
                    e.passCount > 1 ? <span key="t" className={s.pass}>{`${e.pass}/${e.passCount}`}</span> : <span key="t" className={s.muted}>tek</span>,
                    fmtLocalU(e.ms, e.uncertaintySec, tz),
                    fmtUtU(e.ms, e.uncertaintySec),
                    formatUncertainty(e.uncertaintySec),
                  ],
                }))}
                testId="sky-deg-table"
              />
            )}
            <p className={s.small}>Tekrar: retro döngüsünde aynı derece birden çok kez geçilir (ör. 1/3 = döngünün ilk geçişi). Yavaş cisimlerde belirsizlik saatler mertebesindedir; 1 saati aşan belirsizlikte saat gösterilmez, yalnız tarih (≈) verilir.</p>
          </>
        )}
      </section>
    </section>
  );
}

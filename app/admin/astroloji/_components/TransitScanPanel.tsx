"use client";

/**
 * 02.11.2026 — TRANSİT TARAMASI (#646) teknik görünümü (owner GÖRSEL PASS prototipi). Hesap YAPILMAZ; sunucunun yerel tarama sonucu
 * gösterilir. Orb pencereleri (giriş · tam an(lar) 1/2 · çıkış · tür) ve olay takvimi (kronolojik kartlar: ≥1280 3 sütun, 768–1279
 * 2 sütun, <768 tek sütun). Zamanlar gösterim saat diliminde; belirsizlik 1 saati aşarsa saat yerine tarih (≈). Canlı sonuç ve
 * kayıtlı analizde aynı bileşen.
 */
import { useMemo, useState } from "react";
import {
  TRANSIT_SCAN_ASPECT_LABELS as ASP,
  TRANSIT_SCAN_CLASS_LABELS,
  TRANSIT_SCAN_ENGINE_LABEL,
  TRANSIT_SCAN_LABELS as L,
  TRANSIT_SCAN_SIGNS,
  TRANSIT_SCAN_SIGN_KEYS,
  transitScanEngineOf,
  transitScanUnc,
  type TransitScanTechnical,
} from "@/lib/astrology/model/westernTransitScan";
import { ProTable, pt as s } from "./proTechniqueUi";

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
function fmt(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}
const signTr = (k: string | null) => (k === null ? "—" : (TRANSIT_SCAN_SIGNS[TRANSIT_SCAN_SIGN_KEYS.indexOf(k)] ?? k));
const lonTr = (lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  const sg = Math.floor(l / 30);
  let d = Math.floor(l - sg * 30);
  let m = Math.round((l - sg * 30 - d) * 60);
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${String(m).padStart(2, "0")}′ ${TRANSIT_SCAN_SIGNS[sg]}`;
};

export function TransitScanPanel({ t }: { t: TransitScanTechnical }) {
  const [sub, setSub] = useState<"pencere" | "takvim">("pencere");
  const tz = t.displayTz || "Europe/Istanbul";
  const tzLabel = tz === "Europe/Istanbul" ? "TSİ" : tz;
  const when = (ms: number | null, u: number | null | undefined) => (ms === null ? null : (u ?? 0) > 3600 ? `≈ ${fmt(ms, tz).slice(0, 10)}` : fmt(ms, tz));
  const events = useMemo(() => [...t.scan.events].sort((a, b) => a.ms - b.ms), [t.scan.events]);

  return (
    <div className={s.root} data-testid="astro-transit-scan-panel">
      <div className={s.chips}>
        <span className={s.chip}>
          {dmy(t.range.start)} – {dmy(t.range.end)}
        </span>
        <span className={s.chip}>Orb {String(t.orb).replace(".", ",")}°</span>
        <span className={s.chip}>{t.scan.windows.length} pencere</span>
        <span className={s.chip}>Saatler {tzLabel}</span>
        <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap</span>
      </div>
      <div className={s.subtabs} role="group" aria-label="Sonuç bölümü">
        <button type="button" aria-pressed={sub === "pencere"} onClick={() => setSub("pencere")} data-testid="astro-transit-scan-sub-pencere">
          Orb pencereleri
        </button>
        <button type="button" aria-pressed={sub === "takvim"} onClick={() => setSub("takvim")} data-testid="astro-transit-scan-sub-takvim">
          Olay takvimi
        </button>
      </div>
      {sub === "pencere" ? (
        t.scan.windows.length === 0 ? (
          <p className={s.small}>Bu aralıkta seçilen açılarla orb penceresi yok.</p>
        ) : (
          <ProTable
            head={["Transit", "Orba giriş", "Tam an(lar)", "Orbdan çıkış", "Tür"]}
            wrap={[2]}
            full={[1, 2, 3, 4]}
            long={[]}
            testId="astro-transit-scan-windows"
            rows={t.scan.windows.map((w) => ({
              key: w.id,
              cells: [
                <b key="t">
                  {L[w.a] ?? w.a} {ASP[w.aspect] ?? w.aspect} {L[w.b] ?? w.b}
                </b>,
                w.startsBeforeRange ? (
                  <span key="g" className={s.muted}>
                    aralık başında içeride
                  </span>
                ) : (
                  <span key="g">
                    {when(w.enterMs, w.enterUncertaintySec)} <span className={s.unc}>{transitScanUnc(w.enterUncertaintySec)}</span>
                  </span>
                ),
                w.passes.length ? (
                  <span key="p">
                    {w.passes.map((p) => (
                      <span key={p.ms} className={s.pline}>
                        {when(p.ms, p.uncertaintySec)} <span className={s.pass}>{`${p.pass}/${p.of}`}</span>
                        {p.aRetrograde ? <span className={s.retro}>℞</span> : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span key="p" className={s.muted}>
                    tam olmuyor · en yakın {w.closest.separationDeg.toFixed(2).replace(".", ",")}°
                  </span>
                ),
                w.endsAfterRange ? (
                  <span key="c" className={s.muted}>
                    aralık sonunda içeride
                  </span>
                ) : (
                  <span key="c">
                    {when(w.exitMs, w.exitUncertaintySec)} <span className={s.unc}>{transitScanUnc(w.exitUncertaintySec)}</span>
                  </span>
                ),
                TRANSIT_SCAN_CLASS_LABELS[w.classification] ?? w.classification,
              ],
            }))}
          />
        )
      ) : events.length === 0 ? (
        <p className={s.small}>Bu aralıkta olay yok.</p>
      ) : (
        <div className={s.evgrid} data-testid="astro-transit-scan-events">
          {events.map((e, i) => {
            let type: string;
            let title: React.ReactNode;
            let cls = "";
            if (e.type === "station") {
              type = `İstasyon · ${e.station === "direct" ? "direkt" : "retro"}`;
              cls = s.evStation;
              title = (
                <>
                  <b>{L[e.body]}</b> {e.station === "direct" ? "direkt" : "retro"} döner {typeof e.lon === "number" ? <span className={s.muted}>· {lonTr(e.lon)}</span> : null}
                </>
              );
            } else if (e.type === "ingress") {
              type = "Burç girişi";
              cls = s.evIngress;
              title = (
                <>
                  <b>{L[e.body]}</b> {signTr(e.toSign ?? e.other)} burcuna girer{e.retrograde ? <span className={s.retro}> ℞</span> : null}
                </>
              );
            } else {
              type = e.type === "exact" ? `Tam açı${e.of && e.of > 1 ? ` · ${e.pass}/${e.of}` : ""}` : e.type === "orb_enter" ? "Orba giriş" : "Orbdan çıkış";
              cls = e.type === "exact" ? s.evExact : "";
              title = (
                <b>
                  {L[e.body]} {e.aspect ? ASP[e.aspect] : ""} {e.other ? (L[e.other] ?? e.other) : ""}
                </b>
              );
            }
            const u = e.uncertaintySec;
            const f = fmt(e.ms, tz);
            return (
              <article key={`${e.type}-${e.ms}-${i}`} className={`${s.ev} ${cls}`}>
                <div className={s.evTop}>
                  <span className={s.evType}>{type}</span>
                  <span className={s.unc}>{transitScanUnc(u)}</span>
                </div>
                <div className={s.evTitle}>{title}</div>
                <div className={s.evWhen}>
                  {u > 3600 ? (
                    <>
                      <span className={s.evDate}>≈ {f.slice(0, 10)}</span>
                      <span className={s.evTimeNa}>saat belirsiz</span>
                    </>
                  ) : (
                    <>
                      <span className={s.evDate}>{f.slice(0, 10)}</span>
                      <span>{f.slice(11)}</span>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className={s.small}>Tam anlarda 1/2, 2/2 … retro döngüsündeki geçiş sırasıdır. Belirsizlik 1 saati aşarsa saat yerine tarih (≈) gösterilir. Natal noktalar natal sonucundan alınır. Transit konumları: {TRANSIT_SCAN_ENGINE_LABEL[transitScanEngineOf(t)]}.</p>
    </div>
  );
}

"use client";

/**
 * Gökyüzü Araçları — AY EVRELERİ ve TUTULMALAR sekmesi (#662 / #681; owner GÖRSEL PASS 02.11.2026 prototipi). Yerel hesap.
 * Ay tutulması: P1–U1–U2–tepe–U3–U4–P4 temas anları (her yerden aynı). Güneş tutulması: Dünya üzerinde global başlangıç–tepe–bitiş.
 * Şehirden görünürlük ve örtülme oranı bu sürümde YOK (ekranda notla belirtilir).
 */
import { useRef, useState } from "react";
import type { LunarPhase } from "@/lib/astrology/pro/lunations/phases";
import type { EclipseRow, LunationResult } from "@/lib/astrology/pro/lunations/request";
import { formatLon, formatUncertainty } from "@/lib/astrology/pro/ephemeris/format";
import { astroFetch } from "../../_lib/api";
import { DataTable, ParamsPanel, Seg, fmtLocal, fmtLocalClock, fmtLocalDate, fmtUt, st as s, useTimeZone } from "./skyToolsUi";

type Kind = "phases" | "eclipses";
const PHASE_TR: Record<LunarPhase, string> = { new_moon: "Yeniay", first_quarter: "İlk dördün", full_moon: "Dolunay", last_quarter: "Son dördün" };
const PHASES: LunarPhase[] = ["new_moon", "first_quarter", "full_moon", "last_quarter"];
const LUNAR_TR = { penumbral: "Yarı gölge", partial: "Parçalı", total: "Tam" } as const;
const SOLAR_TR = { partial: "Parçalı", annular: "Halkalı", total: "Tam" } as const;
const CENTRAL_TR = { central: "merkezi", non_central: "merkezi olmayan", none: "" } as const;
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusMonths = (n: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoDay(d);
};

export default function LunationsTool() {
  const { tz, label: tzLabel } = useTimeZone();
  const [kind, setKind] = useState<Kind>("phases");
  const [start, setStart] = useState(isoDay(new Date()));
  const [end, setEnd] = useState(plusMonths(4));
  const [eStart, setEStart] = useState(`${new Date().getUTCFullYear()}-01-01`);
  const [eEnd, setEEnd] = useState(`${new Date().getUTCFullYear() + 2}-12-31`);
  const [phases, setPhases] = useState<LunarPhase[]>([...PHASES]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; error: string } | null>(null);
  const [res, setRes] = useState<LunationResult | null>(null);
  const [open, setOpen] = useState(true);
  const gen = useRef(0);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    gen.current++;
    set(v);
    setRes(null);
    setErr(null);
  };
  const s0 = kind === "phases" ? start : eStart;
  const s1 = kind === "phases" ? end : eEnd;

  async function load() {
    if (busy) return;
    if (kind === "phases" && phases.length === 0) {
      setErr({ field: "phases", error: "En az bir evre seçin." });
      return;
    }
    const my = ++gen.current;
    setBusy(true);
    setErr(null);
    const r = await astroFetch<{ ok: true; result: LunationResult }>("/api/admin/astroloji/efemeris/ay", { method: "POST", body: { kind, start: s0, end: s1, ...(kind === "phases" ? { phases } : {}) } });
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

  const tm = (ms: number | null | undefined) => (ms == null ? "—" : fmtLocalClock(ms, tz));
  function eclipseCard(e: EclipseRow) {
    const steps: [string, number | null][] =
      e.body === "sun"
        ? [
            ["Başlangıç (Dünya'da ilk)", e.contacts?.begin ?? null],
            ["Tepe", e.peakMs],
            ["Bitiş (Dünya'da son)", e.contacts?.end ?? null],
          ]
        : (
            [
              ["Yarı gölge başl. P1", e.contacts?.p1 ?? null],
              ["Parçalı başl. U1", e.contacts?.u1 ?? null],
              ["Tam başl. U2", e.contacts?.u2 ?? null],
              ["Tepe", e.peakMs],
              ["Tam bitiş U3", e.contacts?.u3 ?? null],
              ["Parçalı bitiş U4", e.contacts?.u4 ?? null],
              ["Yarı gölge bitiş P4", e.contacts?.p4 ?? null],
            ] as [string, number | null][]
          ).filter(([k, v]) => v !== null || k === "Tepe");
    const totality = e.body === "moon" && e.contacts?.u2 != null && e.contacts?.u3 != null ? Math.round((e.contacts.u3 - e.contacts.u2) / 60000) : null;
    return (
      <article key={`${e.body}-${e.peakMs}`} className={s.ecl} data-testid="sky-eclipse">
        <header>
          <b>{e.body === "sun" ? "Güneş tutulması" : "Ay tutulması"}</b> ·{" "}
          {e.body === "sun" ? (
            <>
              {SOLAR_TR[e.kind]}
              {CENTRAL_TR[e.centrality] ? <span className={s.muted}> ({CENTRAL_TR[e.centrality]})</span> : null}
            </>
          ) : (
            LUNAR_TR[e.kind]
          )}{" "}
          · {fmtLocalDate(e.peakMs, tz)} {totality !== null && <span className={s.chip}>Tamlık {totality} dk</span>}
        </header>
        {e.contacts === null && <p className={s.small}>Temas anları bu tutulma için hesaplanamadı; yalnız tepe anı gösterilir.</p>}
        <ol className={s.steps}>
          {steps.map(([k, v]) => (
            <li key={k} className={k === "Tepe" ? s.peak : ""}>
              <span className={s.k}>{k}</span>
              <span>{tm(v)}</span>
            </li>
          ))}
        </ol>
      </article>
    );
  }

  const summary = kind === "phases" ? `Ay evreleri · ${dmy(start)} – ${dmy(end)}` : `Tutulmalar · ${dmy(eStart)} – ${dmy(eEnd)}`;

  return (
    <section className={s.grid} data-testid="sky-lunations">
      <ParamsPanel summary={summary} open={open || !res} onToggle={() => setOpen((o) => !o)}>
        <form
          className={s.paramsBody}
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <div className={s.field}>
            <span className={s.fieldLabel}>Gösterilecek</span>
            <Seg
              label="Gösterilecek"
              options={[
                ["phases", "Ay evreleri"],
                ["eclipses", "Tutulmalar"],
              ]}
              value={kind}
              onChange={edit(setKind)}
              testId="sky-lun-kind"
            />
          </div>
          <label className={s.field}>
            <span className={s.fieldLabel}>Başlangıç</span>
            <input type="date" min="1920-01-01" max="2150-12-31" className={s.input} value={s0} onChange={(e) => edit(kind === "phases" ? setStart : setEStart)(e.target.value)} data-testid="sky-lun-start" />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Bitiş{kind === "phases" ? " (en çok 10 yıl)" : " (en çok 50 yıl)"}</span>
            <input type="date" min="1920-01-01" max="2150-12-31" className={s.input} value={s1} onChange={(e) => edit(kind === "phases" ? setEnd : setEEnd)(e.target.value)} data-testid="sky-lun-end" />
          </label>
          {kind === "phases" && (
            <div className={s.field}>
              <span className={s.fieldLabel}>Evreler</span>
              <div className={s.chips}>
                {PHASES.map((p) => (
                  <button key={p} type="button" className={`${s.chip} ${s.chipBtn}`} aria-pressed={phases.includes(p)} onClick={() => edit(setPhases)(phases.includes(p) ? phases.filter((x) => x !== p) : PHASES.filter((x) => x === p || phases.includes(x)))}>
                    {PHASE_TR[p]}
                  </button>
                ))}
              </div>
              {err?.field === "phases" && <p className={s.fieldError}>{err.error}</p>}
            </div>
          )}
          {err && err.field !== "phases" && (
            <p role="alert" className={s.errorBox} data-testid="sky-lun-error">
              {err.error}
            </p>
          )}
          <div className={s.actions}>
            <button type="submit" className={s.btnGold} disabled={busy} aria-busy={busy} data-testid="sky-lun-submit">
              {busy ? "Hesaplanıyor…" : "Hesapla"}
            </button>
          </div>
          <p className={s.sourceNote}>
            <b>Desteklenen aralık:</b> 1920–2150 (bağımsız doğrulama aralığı).
          </p>
          <p className={s.sourceNote}>
            <b>Kaynak:</b> Yaşam Sistemi yerel hesap (görünür konum, gerçek ekliptik). Zaman: astronomik olaylar TT ile hesaplanır, ekranda UT ve {tzLabel} ayrı gösterilir. ±: ölçülmüş konum hata sınırından türetilen zaman belirsizliği.
          </p>
        </form>
      </ParamsPanel>

      <section className={`${s.panel} ${s.results}`} aria-live="polite" data-testid="sky-lun-result">
        {!res ? (
          <p className={s.empty}>{busy ? "Hesaplanıyor…" : "Tarih aralığını seçip hesaplayın."}</p>
        ) : res.kind === "phases" ? (
          <>
            <div className={s.resHead}>
              <h2>
                Ay evreleri · {dmy(res.range.start)} – {dmy(res.range.end)}
              </h2>
              <div className={s.resMeta}>
                <span className={s.chip}>{res.phases.length} evre</span>
                <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap</span>
              </div>
            </div>
            {res.phases.length === 0 ? (
              <p className={s.empty}>Bu aralıkta seçilen evre yok.</p>
            ) : (
              <DataTable
                head={["Evre", `Tarih (${tzLabel})`, "UT", "Ay konumu", "Belirsizlik"]}
                mobileHead={["Evre", tzLabel, "UT", "Ay", "±"]}
                rows={res.phases.map((p) => ({ key: `${p.phase}-${p.ms}`, cells: [<b key="p">{PHASE_TR[p.phase]}</b>, fmtLocal(p.ms, tz), fmtUt(p.ms), formatLon(p.moonLon, "arcmin"), formatUncertainty(p.uncertaintySec)] }))}
                testId="sky-phases"
              />
            )}
          </>
        ) : (
          <>
            <div className={s.resHead}>
              <h2>
                Tutulmalar · {dmy(res.range.start)} – {dmy(res.range.end)}
              </h2>
              <div className={s.resMeta}>
                <span className={s.chip}>
                  {res.counts.moon} Ay · {res.counts.sun} Güneş
                </span>
                <span className={s.chip}>Saatler {tzLabel}</span>
                <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap</span>
              </div>
            </div>
            {res.eclipses.length === 0 ? <p className={s.empty}>Bu aralıkta tutulma yok.</p> : <div className={s.eclList}>{res.eclipses.map(eclipseCard)}</div>}
            <p className={s.small}>
              Ay tutulmasının temas anları her yerden aynıdır; Ay&apos;ın o anda ufkun üstünde olup olmadığı şehre göre değişir. Güneş tutulmasında başlangıç/bitiş, tutulmanın Dünya üzerinde herhangi bir yerde başladığı ve bittiği anlardır. Temas anları bağımsız referansla en çok 2 dakika farklıdır.
            </p>
            <p className={s.note}>Bu sürümde şehirden görünürlük ve örtülme oranı yoktur.</p>
          </>
        )}
      </section>
    </section>
  );
}

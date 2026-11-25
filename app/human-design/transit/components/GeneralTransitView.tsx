"use client";

// Günün Human Design Transitleri — seçilen anın (seçilen saat diliminde yerel saat; varsayılan Türkiye) genel transiti.
// Doğum verisi YOK; tip/otorite/profil YOK. Saat dilimi yalnız UTC anını belirler; astronomik hesap UTC'den.
//
// Güvenilirlik kuralları:
//   • Yalnız TAM sonuç (13 aktivasyonun tamamı kesin) BodyGraph olarak çizilir. EKSİK sonuçta grafik ÇİZİLMEZ (kısmi veriden
//     tamamlanmış harita görünümü oluşmaz; mühürlü çizim motoruna yeni durum eklenmez) — yerine belirsizlik paneli: hangi
//     gezegen, iki aday, kesin olan / kesin olmayan kanal ve merkezler ayrı.
//   • Eski (yerini yeni sorguya bırakmış) ağ yanıtı ekranı DEĞİŞTİRMEZ: nesil sayacı + AbortController; sonuç yalnız
//     ekrandaki tarih/saat + saat dilimiyle eşleşiyorsa gösterilir.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localParts, nowTransitMoment, utcOffsetLabel } from "@/lib/human-design/transit/transitMoment";
import { transitSceneState } from "@/lib/human-design/transit/transitScene";
import { CBG_PERSON_COLOR } from "@/lib/human-design/relations/connectionBodygraphScene";
import { PLANET_GLYPH } from "@/lib/human-design/bodygraph/planetGlyphs";
import { useTransitI18n } from "../helpers/useTransitI18n";
import { CENTERS, CHANNELS } from "@/lib/human-design/engine/channels";
import type { GeneralTransit } from "@/lib/human-design/transit/generalTransit";
import { fetchGeneralTransit, type GeneralTransitResult } from "../helpers/transitClient";
import { TRANSIT_GRAPH_SIZE_STYLE, TRANSIT_GRID_CLASS, TransitBodygraphPanel } from "./TransitBodygraphPanel";
import { MomentPicker } from "./MomentPicker";
import { TransitZonePanel, UtcPreview, type TransitZone } from "./TransitZonePanel";

const card = "rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm";
const CH = new Map(CHANNELS.map((c) => [c.id, c]));

/** Grafik yalnız tüm aktivasyonlar kesin ve sunucu sonucu TAM bildirdiyse çizilir (savunmacı: bütün işaretler tutarlı olmalı). */
function isCompleteTransit(r: GeneralTransitResult): boolean {
  const t = r.transit;
  return r.complete && !t.hasUncertainty && t.activations.every((a) => a.certain) && t.possibleChannels.length === 0 && t.uncertainCenters.length === 0;
}

/** Kapısı kesin olmayan (iki adayı farklı kapıda) aktivasyonların aday kapıları. */
function candidateGates(t: GeneralTransit): Set<number> {
  const s = new Set<number>();
  for (const a of t.activations) if (!a.certain && a.alternative && a.alternative.gate !== a.gate) { s.add(a.gate); s.add(a.alternative.gate); }
  return s;
}

export function GeneralTransitView({ zone, onZone }: { zone: TransitZone; onZone: (z: TransitZone) => void }) {
  const tz = zone.tz;
  // Ekran dili etiketleri (yalnız gösterim). `t` aşağıda transit verisidir; çeviri işlevi `tx`.
  const L = useTransitI18n();
  const tx = L.t;
  const bodyLabel = L.body;
  const transitCenterLabel = L.center;
  const transitChannelLabel = L.channel;
  const [initTz] = useState(tz);
  const init = useMemo(() => localParts(new Date(), initTz), [initTz]);
  const [date, setDate] = useState(init.localDate);
  const [time, setTime] = useState(init.localTime);
  const [busy, setBusy] = useState(true);
  // Hata metni çizimde dile çevrilir (kod + sunucu metni saklanır; dil değişimi isteği yeniden başlatmaz).
  const [error, setError] = useState<{ error: string; code?: string } | null>(null);
  const [data, setData] = useState<GeneralTransitResult | null>(null);
  /** Yalnız iki kez yaşanan yerel saatte kullanıcının AÇIKÇA seçtiği UTC ofseti. */
  const [offset, setOffset] = useState<number | null>(null);
  // Nesil sayacı: her yeni sorgu / girdi değişikliği / kapanış artırır; eski nesil yanıtı yok sayılır.
  const gen = useRef(0);
  const ctrl = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    gen.current++;
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);

  /** Yeni nesil istek başlatır; yanıt yalnız hâlâ geçerli nesilse ve istenen anla eşleşiyorsa ekrana yazılır. */
  const start = useCallback(
    (d: string, t: string, z: string, off: number | null) => {
      invalidate();
      const id = gen.current;
      const ac = new AbortController();
      ctrl.current = ac;
      void fetchGeneralTransit(d, t, ac.signal, { tz: z, offset: off }).then((r) => {
        if (id !== gen.current) return; // eski (iptal edilmiş / yerini yenisine bırakmış) yanıt: ekran DEĞİŞMEZ
        ctrl.current = null;
        setBusy(false);
        if (!r.ok) {
          setError({ error: r.error, code: r.code }); // başarısız sorguda önceki sonuç GÖSTERİLMEZ
          return;
        }
        if (r.moment.localDate !== d || r.moment.localTime !== t || r.moment.timeZone !== z) {
          setError({ error: "", code: "MOMENT_MISMATCH" });
          return;
        }
        setData({ moment: r.moment, transit: r.transit, resolution: r.resolution, complete: r.complete });
      });
    },
    [invalidate],
  );
  const run = (d: string, t: string, off: number | null = offset) => {
    setBusy(true);
    setError(null);
    setData(null); // yeni hesap başladı: eski sonuç yeni sonuç gibi görünmesin
    start(d, t, tz, off);
  };

  // İlk açılış: başlangıç saat dilimine göre "şimdi" (başlangıç durumu zaten "hesaplanıyor"). Kapanışta istek iptal edilir.
  useEffect(() => {
    const n = nowTransitMoment(new Date(), initTz);
    start(init.localDate, init.localTime, initTz, n.ok ? n.moment.offsetSeconds : null);
    return invalidate;
  }, [start, invalidate, init, initTz]);

  /** Girdi (tarih / saat / saat dilimi / ofset) değişti: süren isteğin yanıtı artık bu ekrana ait değil. */
  const reset = () => {
    invalidate();
    setBusy(false);
    setData(null);
    setError(null);
  };
  const onInput = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setOffset(null);
    reset();
  };

  // Ekran koruması: sonuç yalnız EKRANDAKİ tarih/saat + saat dilimiyle eşleşiyorsa gösterilir.
  const shown = data && data.moment.localDate === date && data.moment.localTime === time && data.moment.timeZone === tz ? data : null;
  const t = shown?.transit ?? null;
  const complete = shown ? isCompleteTransit(shown) : false;
  const state = useMemo(() => (t && complete ? transitSceneState(t) : null), [t, complete]);
  const candidates = useMemo(() => (t ? candidateGates(t) : new Set<number>()), [t]);
  const uncertainActs = t ? t.activations.filter((a) => !a.certain) : [];

  const describe = (id: string) => {
    if (!t) return null;
    const ch = CH.get(id);
    if (!ch) return null;
    const bodies = (g: number) => (t.gateBodies[g] ?? []).map(bodyLabel).join(", ");
    const done = t.channels.find((c) => c.id === id);
    if (done) {
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-orange-700">· {tx("general.completedChannelTag")}</span></p>
          <p className="mt-0.5 text-slate-700">{tx("gateN", { g: done.gateA })}: {bodies(done.gateA)} · {tx("gateN", { g: done.gateB })}: {bodies(done.gateB)}</p>
          <p className="mt-0.5 text-slate-500">{tx("general.connectsCenters", { a: transitCenterLabel(done.centerA), b: transitCenterLabel(done.centerB) })}</p>
        </>
      );
    }
    if (t.possibleChannels.some((c) => c.id === id) || candidates.has(ch.gateA) || candidates.has(ch.gateB)) {
      const gateState = (g: number) => (t.activeGates.includes(g) ? tx("general.gateCertainActive", { bodies: bodies(g) }) : candidates.has(g) ? tx("general.dependsOnBoundary") : tx("general.notInTransit"));
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-amber-700">· {tx("general.notCertainTag")}</span></p>
          <p className="mt-0.5 text-slate-700">{tx("gateN", { g: ch.gateA })}: {gateState(ch.gateA)} · {tx("gateN", { g: ch.gateB })}: {gateState(ch.gateB)}</p>
        </>
      );
    }
    const half = t.halfChannels.find((h) => h.id === id);
    if (half) {
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-amber-700">· {tx("general.halfTag")}</span></p>
          <p className="mt-0.5 text-slate-700">{tx("general.halfDetail", { g: half.activeGate, bodies: bodies(half.activeGate), other: half.activeGate === half.gateA ? half.gateB : half.gateA })}</p>
        </>
      );
    }
    return <p className="text-slate-700"><b>{transitChannelLabel(id, ch.name)}</b> — {tx("general.noTransitOnGates")}</p>;
  };

  return (
    <div className="space-y-4" data-hd-transit-view="general">
      <section className={card}>
        <TransitZonePanel
          zone={zone}
          testId="general"
          onZone={(z) => {
            onZone(z);
            setOffset(null);
            reset();
          }}
        />
        <MomentPicker
          date={date}
          time={time}
          busy={busy}
          onDate={onInput(setDate)}
          onTime={onInput(setTime)}
          onNow={() => {
            const n = nowTransitMoment(new Date(), tz);
            const p = localParts(new Date(), tz);
            const off = n.ok ? n.moment.offsetSeconds : null;
            setDate(n.ok ? n.moment.localDate : p.localDate);
            setTime(n.ok ? n.moment.localTime : p.localTime);
            setOffset(off);
            run(n.ok ? n.moment.localDate : p.localDate, n.ok ? n.moment.localTime : p.localTime, off);
          }}
          onSubmit={() => run(date, time)}
          submitLabel={tx("general.submit")}
        />
        <UtcPreview
          date={date}
          time={time}
          tz={tz}
          offset={offset}
          testId="general"
          onOffset={(o) => {
            setOffset(o);
            reset();
          }}
        />
        {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700" data-hd-transit-error>{error.code === "MOMENT_MISMATCH" ? tx("errors.MOMENT_MISMATCH") : L.error(error)}</p> : null}
        {shown ? (
          <p className="mt-3 rounded-xl bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900" data-hd-transit-moment={shown.moment.utcIso}>
            {L.caption(shown.moment)} <span className="font-normal text-indigo-700">{"· UTC "}{shown.moment.utcIso.slice(0, 16).replace("T", " ")} ({utcOffsetLabel(shown.moment.offsetSeconds)})</span>
          </p>
        ) : null}
        {shown ? (
          complete ? (
            <p className="mt-2 text-[11px] text-emerald-800" data-hd-transit-complete="1" data-hd-transit-resolution={shown.resolution}>
              {tx("general.complete")}{shown.resolution === "roxy-resolved" ? ` ${tx("general.completeResolved")}` : ""}
            </p>
          ) : (
            <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200" data-hd-transit-complete="0" data-hd-transit-resolution={shown.resolution}>
              {tx("general.incomplete", {
                count: uncertainActs.length,
                bodies: uncertainActs.map((a) => bodyLabel(a.body)).join(", "),
                reason: shown.resolution === "unresolved" ? tx("general.reasonUnresolved") : tx("general.reasonBoundary"),
              })}
            </p>
          )
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-hd-transit-note>{tx("notes.general")}</p>
      </section>

      {t && shown ? (
        <div className={TRANSIT_GRID_CLASS} style={TRANSIT_GRAPH_SIZE_STYLE}>
          {complete && state ? (
            <section className={`${card} lg:self-start`}>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{tx("graph.title")}</h2>
              <TransitBodygraphPanel
                state={state}
                testId="general"
                label={tx("graph.labelGeneral", { caption: L.caption(shown.moment) })}
                hint={tx("graph.hintGeneral")}
                describe={describe}
                legend={
                  <>
                    <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.B }} />{tx("legend.transitGate")}</li>
                    <li>{tx("legend.completed")}</li>
                    <li>{tx("legend.half")}</li>
                    <li>{tx("legend.centers")}</li>
                  </>
                }
              />
            </section>
          ) : (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4 shadow-sm" data-hd-transit-uncertainty-panel>
              <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest text-amber-800">{tx("general.noGraphTitle")}</h2>
              <p className="text-xs leading-relaxed text-amber-900">
                {tx("general.noGraphBody", { count: uncertainActs.length })}
              </p>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-amber-800">{tx("general.uncertainActsTitle")}</h3>
              <ul className="mt-1 space-y-1">
                {uncertainActs.map((a) => (
                  <li key={a.body} className="rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-800 ring-1 ring-amber-200" data-hd-transit-uncertain-body={a.body}>
                    <b>{bodyLabel(a.body)}</b>: {tx("general.orAlt", { a: `${a.gate}.${a.line}`, b: `${a.alternative!.gate}.${a.alternative!.line}` })}{" "}
                    <span className="text-slate-600">
                      {a.alternative!.gate === a.gate ? tx("general.gateCertainLineUnsure", { g: a.gate }) : tx("general.gateUnsure", { a: a.gate, b: a.alternative!.gate })}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-emerald-800">{tx("general.certainTitle")}</h3>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700" data-hd-transit-certain-summary>
                <li>{tx("general.certainCount", { n: t.activations.length - uncertainActs.length })}</li>
                <li>{tx("general.certainGates", { list: t.activeGates.join(", ") || tx("none") })}</li>
                <li>{tx("general.certainChannels", { list: t.channels.length ? t.channels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ") : tx("none") })}</li>
                <li>{tx("general.certainCenters", { list: t.definedCenters.length ? t.definedCenters.map(transitCenterLabel).join(" · ") : tx("none") })}</li>
                <li>{tx("general.openCenters", { list: t.openCenters.length ? t.openCenters.map(transitCenterLabel).join(" · ") : tx("none") })}</li>
              </ul>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-amber-800">{tx("general.uncertainTitle")}</h3>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700" data-hd-transit-uncertain-summary>
                <li>{tx("general.possibleChannels", { list: t.possibleChannels.length ? t.possibleChannels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ") : tx("none") })}</li>
                <li>{tx("general.boundaryCenters", { list: t.uncertainCenters.length ? t.uncertainCenters.map(transitCenterLabel).join(" · ") : tx("none") })}</li>
              </ul>
            </section>
          )}
          <div className="space-y-4">
            <section className={card} data-hd-transit-activations>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{tx("general.activationsTitle")}</h2>
              <ul className="divide-y divide-slate-100">
                {t.activations.map((a) => (
                  <li key={a.body} className="flex items-center justify-between gap-2 py-1.5 text-sm" data-hd-transit-activation={`${a.body}:${a.gate}.${a.line}`} data-hd-transit-certain={a.certain ? "1" : "0"}>
                    <span className="min-w-0 text-slate-800">
                      <span className="mr-1.5 inline-block w-4 text-center text-slate-500" aria-hidden>{PLANET_GLYPH[a.body]}</span>
                      {bodyLabel(a.body)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {a.certain ? (
                        <span className="font-mono text-sm font-bold text-slate-900">{a.gate}.{a.line}</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title={tx("notes.uncertain")} data-hd-transit-uncertain>{tx("general.uncertainBadge")}</span>
                          <span className="font-mono text-sm font-bold text-amber-900">{a.gate}.{a.line} / {a.alternative!.gate}.{a.alternative!.line}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">{complete ? tx("general.gateLineActive") : tx("general.gateLineCertainActive")}: <span data-hd-transit-gates>{t.activeGates.join(", ")}</span></p>
              {t.hasUncertainty ? <p className="mt-1 text-[11px] text-amber-800" data-hd-transit-uncertain-note>{tx("notes.uncertain")}</p> : null}
            </section>
            <section className={card} data-hd-transit-channels>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{complete ? tx("general.channelsTitle", { n: t.channels.length }) : tx("general.channelsCertainTitle", { n: t.channels.length })}</h2>
              {t.channels.length === 0 ? (
                <p className="text-xs text-slate-600">
                  {t.possibleChannels.length ? tx("general.noCertainChannel") : tx("general.noChannel")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {t.channels.map((c) => (
                    <li key={c.id} className="rounded-lg bg-orange-50/60 px-3 py-2 text-xs text-slate-700" data-hd-transit-channel={c.id}>
                      <b className="text-slate-900">{transitChannelLabel(c.id, c.name)}</b>
                      <span className="block">
                        {tx("gateN", { g: c.gateA })} ({(c.bodiesA ?? []).map(bodyLabel).join(", ")}) – {tx("gateN", { g: c.gateB })} ({(c.bodiesB ?? []).map(bodyLabel).join(", ")})
                      </span>
                      <span className="block text-slate-500">{transitCenterLabel(c.centerA)} – {transitCenterLabel(c.centerB)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {t.possibleChannels.length ? (
                <div className="mt-2" data-hd-transit-possible>
                  <p className="text-[11px] font-bold text-amber-800">{tx("general.possibleChannelsTitle")}</p>
                  <p className="text-xs text-slate-700">{t.possibleChannels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ")}</p>
                </div>
              ) : null}
            </section>
            <section className={card} data-hd-transit-centers>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{tx("general.centersTitle")}</h2>
              <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                {CENTERS.map((c) => {
                  const on = t.definedCenters.includes(c);
                  const unsure = t.uncertainCenters.includes(c);
                  return (
                    <li key={c} className={`rounded-lg px-2.5 py-1.5 ${on ? "bg-orange-50 font-bold text-orange-900 ring-1 ring-orange-200" : unsure ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-slate-50 text-slate-600"}`} data-hd-transit-center={`${c}:${on ? "on" : unsure ? "unsure" : "off"}`}>
                      {transitCenterLabel(c)} <span className="font-normal">· {on ? tx("general.centerOn") : unsure ? tx("general.dependsOnBoundary") : tx("general.centerOff")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      ) : busy ? (
        <p className="text-xs text-slate-500">{tx("picker.calculating")}</p>
      ) : null}
    </div>
  );
}

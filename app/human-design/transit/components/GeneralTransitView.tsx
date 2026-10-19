"use client";

// Günün Human Design Transitleri — seçilen anın (Türkiye saati) genel transiti. Doğum verisi YOK; tip/otorite/profil YOK.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneralTransit } from "@/lib/human-design/transit/generalTransit";
import { istanbulLocalParts, utcOffsetLabel, type TransitMoment } from "@/lib/human-design/transit/transitMoment";
import { transitSceneState } from "@/lib/human-design/transit/transitScene";
import { CBG_PERSON_COLOR } from "@/lib/human-design/relations/connectionBodygraphScene";
import { PLANET_GLYPH } from "@/lib/human-design/bodygraph/planetGlyphs";
import { bodyLabel, GENERAL_TRANSIT_NOTE, UNCERTAIN_NOTE, transitCenterLabel, transitChannelLabel } from "@/lib/human-design/transit/transitLabels";
import { CENTERS, CHANNELS } from "@/lib/human-design/engine/channels";
import { fetchGeneralTransit } from "../helpers/transitClient";
import { TransitBodygraphPanel } from "./TransitBodygraphPanel";
import { MomentPicker, momentCaption } from "./MomentPicker";

const card = "rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm";
const CH = new Map(CHANNELS.map((c) => [c.id, c]));

export function GeneralTransitView() {
  const init = useMemo(() => istanbulLocalParts(new Date()), []);
  const [date, setDate] = useState(init.localDate);
  const [time, setTime] = useState(init.localTime);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ moment: TransitMoment; transit: GeneralTransit } | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchGeneralTransit>>) => {
    setBusy(false);
    if (r.ok) setData({ moment: r.moment, transit: r.transit });
    else setError(r.error);
  }, []);
  const run = useCallback(
    async (d: string, t: string) => {
      setBusy(true);
      setError(null);
      apply(await fetchGeneralTransit(d, t));
    },
    [apply],
  );
  // İlk açılış: Türkiye saatine göre "şimdi".
  useEffect(() => {
    let alive = true;
    fetchGeneralTransit(init.localDate, init.localTime).then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [apply, init]);

  const t = data?.transit ?? null;
  const state = useMemo(() => (t ? transitSceneState(t) : null), [t]);
  const describe = (id: string) => {
    if (!t) return null;
    const ch = CH.get(id);
    if (!ch) return null;
    const done = t.channels.find((c) => c.id === id);
    const bodies = (g: number) => (t.gateBodies[g] ?? []).map(bodyLabel).join(", ");
    if (done) {
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-orange-700">· transitin tamamladığı kanal</span></p>
          <p className="mt-0.5 text-slate-700">{done.gateA}. kapı: {bodies(done.gateA)} · {done.gateB}. kapı: {bodies(done.gateB)}</p>
          <p className="mt-0.5 text-slate-500">Bağladığı merkezler: {transitCenterLabel(done.centerA)} – {transitCenterLabel(done.centerB)}</p>
        </>
      );
    }
    const half = t.halfChannels.find((h) => h.id === id);
    if (half) {
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-amber-700">· yarım (tamamlanmadı)</span></p>
          <p className="mt-0.5 text-slate-700">Yalnız {half.activeGate}. kapı aktif: {bodies(half.activeGate)}. Diğer kapı ({half.activeGate === half.gateA ? half.gateB : half.gateA}) bu anda transitte değil.</p>
        </>
      );
    }
    return <p className="text-slate-700"><b>{transitChannelLabel(id, ch.name)}</b> — bu anda iki kapısında da transit yok.</p>;
  };

  return (
    <div className="space-y-4" data-hd-transit-view="general">
      <section className={card}>
        <MomentPicker
          date={date}
          time={time}
          busy={busy}
          onDate={setDate}
          onTime={setTime}
          onNow={() => {
            const n = istanbulLocalParts(new Date());
            setDate(n.localDate);
            setTime(n.localTime);
            void run(n.localDate, n.localTime);
          }}
          onSubmit={() => void run(date, time)}
          submitLabel="Transitleri Göster"
        />
        {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700" data-hd-transit-error>{error}</p> : null}
        {data ? (
          <p className="mt-3 rounded-xl bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900" data-hd-transit-moment={data.moment.utcIso}>
            {momentCaption(data.moment)} <span className="font-normal text-indigo-700">· UTC {data.moment.utcIso.slice(0, 16).replace("T", " ")} ({utcOffsetLabel(data.moment.offsetSeconds)})</span>
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-hd-transit-note>{GENERAL_TRANSIT_NOTE}</p>
      </section>

      {t && state && data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <section className={card}>
            <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Transit BodyGraph</h2>
            <TransitBodygraphPanel
              state={state}
              testId="general"
              label={`Genel transit BodyGraph: ${momentCaption(data.moment)}`}
              hint="Bir kanalın üzerine gelin ya da dokunun: kapılar ve o kapılardaki gezegenler burada görünür."
              describe={describe}
              legend={
                <>
                  <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.B }} />Turuncu: transit kapısı</li>
                  <li>İki yarısı boyalı: transitin tamamladığı kanal</li>
                  <li>Kesikli tek yarı: yalnız bir kapı aktif (kanal tamamlanmadı)</li>
                  <li>Renkli merkez: transit kanalıyla bağlanan · beyaz: bağlanmayan</li>
                </>
              }
            />
          </section>
          <div className="space-y-4">
            <section className={card} data-hd-transit-activations>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">13 Aktivasyon</h2>
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
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title={UNCERTAIN_NOTE} data-hd-transit-uncertain>kesinleştirilemedi</span>
                          <span className="font-mono text-sm font-bold text-amber-900">{a.gate}.{a.line} / {a.alternative!.gate}.{a.alternative!.line}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">Kapı.çizgi · aktif kapılar: <span data-hd-transit-gates>{t.activeGates.join(", ")}</span></p>
              {t.hasUncertainty ? <p className="mt-1 text-[11px] text-amber-800" data-hd-transit-uncertain-note>{UNCERTAIN_NOTE}</p> : null}
            </section>
            <section className={card} data-hd-transit-channels>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Transitin Tamamladığı Kanallar ({t.channels.length})</h2>
              {t.channels.length === 0 ? (
                <p className="text-xs text-slate-600">Bu anda transitler kendi başına hiçbir kanalı tamamlamıyor.</p>
              ) : (
                <ul className="space-y-1.5">
                  {t.channels.map((c) => (
                    <li key={c.id} className="rounded-lg bg-orange-50/60 px-3 py-2 text-xs text-slate-700" data-hd-transit-channel={c.id}>
                      <b className="text-slate-900">{transitChannelLabel(c.id, c.name)}</b>
                      <span className="block">
                        {c.gateA}. kapı ({(c.bodiesA ?? []).map(bodyLabel).join(", ")}) – {c.gateB}. kapı ({(c.bodiesB ?? []).map(bodyLabel).join(", ")})
                      </span>
                      <span className="block text-slate-500">{transitCenterLabel(c.centerA)} – {transitCenterLabel(c.centerB)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {t.possibleChannels.length ? (
                <div className="mt-2" data-hd-transit-possible>
                  <p className="text-[11px] font-bold text-amber-800">Sınırdaki aktivasyona bağlı olası kanallar (kesin değil):</p>
                  <p className="text-xs text-slate-700">{t.possibleChannels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ")}</p>
                </div>
              ) : null}
            </section>
            <section className={card} data-hd-transit-centers>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Merkezler</h2>
              <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                {CENTERS.map((c) => {
                  const on = t.definedCenters.includes(c);
                  const unsure = t.uncertainCenters.includes(c);
                  return (
                    <li key={c} className={`rounded-lg px-2.5 py-1.5 ${on ? "bg-orange-50 font-bold text-orange-900 ring-1 ring-orange-200" : unsure ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-slate-50 text-slate-600"}`} data-hd-transit-center={`${c}:${on ? "on" : unsure ? "unsure" : "off"}`}>
                      {transitCenterLabel(c)} <span className="font-normal">· {on ? "transit kanalıyla bağlı" : unsure ? "sınırdaki aktivasyona bağlı" : "bağlı değil"}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      ) : busy ? (
        <p className="text-xs text-slate-500">Hesaplanıyor…</p>
      ) : null}
    </div>
  );
}

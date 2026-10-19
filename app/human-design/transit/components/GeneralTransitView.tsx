"use client";

// Günün Human Design Transitleri — seçilen anın (Türkiye saati) genel transiti. Doğum verisi YOK; tip/otorite/profil YOK.
//
// Güvenilirlik kuralları:
//   • Yalnız TAM sonuç (13 aktivasyonun tamamı kesin) BodyGraph olarak çizilir. EKSİK sonuçta grafik ÇİZİLMEZ (kısmi veriden
//     tamamlanmış harita görünümü oluşmaz; mühürlü çizim motoruna yeni durum eklenmez) — yerine belirsizlik paneli: hangi
//     gezegen, iki aday, kesin olan / kesin olmayan kanal ve merkezler ayrı.
//   • Eski (yerini yeni sorguya bırakmış) ağ yanıtı ekranı DEĞİŞTİRMEZ: nesil sayacı + AbortController; sonuç yalnız
//     ekrandaki tarih/saatle eşleşiyorsa gösterilir.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { istanbulLocalParts, utcOffsetLabel } from "@/lib/human-design/transit/transitMoment";
import { transitSceneState } from "@/lib/human-design/transit/transitScene";
import { CBG_PERSON_COLOR } from "@/lib/human-design/relations/connectionBodygraphScene";
import { PLANET_GLYPH } from "@/lib/human-design/bodygraph/planetGlyphs";
import { bodyLabel, GENERAL_TRANSIT_NOTE, UNCERTAIN_NOTE, transitCenterLabel, transitChannelLabel } from "@/lib/human-design/transit/transitLabels";
import { CENTERS, CHANNELS } from "@/lib/human-design/engine/channels";
import type { GeneralTransit } from "@/lib/human-design/transit/generalTransit";
import { fetchGeneralTransit, type GeneralTransitResult } from "../helpers/transitClient";
import { TransitBodygraphPanel } from "./TransitBodygraphPanel";
import { MomentPicker, momentCaption } from "./MomentPicker";

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

export function GeneralTransitView() {
  const init = useMemo(() => istanbulLocalParts(new Date()), []);
  const [date, setDate] = useState(init.localDate);
  const [time, setTime] = useState(init.localTime);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GeneralTransitResult | null>(null);
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
    (d: string, t: string) => {
      invalidate();
      const id = gen.current;
      const ac = new AbortController();
      ctrl.current = ac;
      void fetchGeneralTransit(d, t, ac.signal).then((r) => {
        if (id !== gen.current) return; // eski (iptal edilmiş / yerini yenisine bırakmış) yanıt: ekran DEĞİŞMEZ
        ctrl.current = null;
        setBusy(false);
        if (!r.ok) {
          setError(r.error); // başarısız sorguda önceki sonuç GÖSTERİLMEZ
          return;
        }
        if (r.moment.localDate !== d || r.moment.localTime !== t) {
          setError("Sunucu yanıtı seçilen anla eşleşmedi; sonuç gösterilmedi. Lütfen tekrar deneyin.");
          return;
        }
        setData({ moment: r.moment, transit: r.transit, resolution: r.resolution, complete: r.complete });
      });
    },
    [invalidate],
  );
  const run = (d: string, t: string) => {
    setBusy(true);
    setError(null);
    setData(null); // yeni hesap başladı: eski sonuç yeni sonuç gibi görünmesin
    start(d, t);
  };

  // İlk açılış: Türkiye saatine göre "şimdi" (başlangıç durumu zaten "hesaplanıyor"). Kapanışta bekleyen istek iptal edilir.
  useEffect(() => {
    start(init.localDate, init.localTime);
    return invalidate;
  }, [start, invalidate, init]);

  const onInput = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    invalidate(); // süren istek varsa yanıtı artık bu ekrana ait değil
    setBusy(false);
    setData(null);
    setError(null);
  };

  // Ekran koruması: sonuç yalnız EKRANDAKİ tarih/saatle eşleşiyorsa gösterilir.
  const shown = data && data.moment.localDate === date && data.moment.localTime === time ? data : null;
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
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-orange-700">· transitin tamamladığı kanal</span></p>
          <p className="mt-0.5 text-slate-700">{done.gateA}. kapı: {bodies(done.gateA)} · {done.gateB}. kapı: {bodies(done.gateB)}</p>
          <p className="mt-0.5 text-slate-500">Bağladığı merkezler: {transitCenterLabel(done.centerA)} – {transitCenterLabel(done.centerB)}</p>
        </>
      );
    }
    if (t.possibleChannels.some((c) => c.id === id) || candidates.has(ch.gateA) || candidates.has(ch.gateB)) {
      const gateState = (g: number) => (t.activeGates.includes(g) ? `kesin aktif (${bodies(g)})` : candidates.has(g) ? "sınırdaki aktivasyona bağlı (kesin değil)" : "transitte değil");
      return (
        <>
          <p className="font-bold text-slate-900">{transitChannelLabel(id, ch.name)} <span className="font-semibold text-amber-700">· kesin değil</span></p>
          <p className="mt-0.5 text-slate-700">{ch.gateA}. kapı: {gateState(ch.gateA)} · {ch.gateB}. kapı: {gateState(ch.gateB)}</p>
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
          onDate={onInput(setDate)}
          onTime={onInput(setTime)}
          onNow={() => {
            const n = istanbulLocalParts(new Date());
            setDate(n.localDate);
            setTime(n.localTime);
            run(n.localDate, n.localTime);
          }}
          onSubmit={() => run(date, time)}
          submitLabel="Transitleri Göster"
        />
        {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700" data-hd-transit-error>{error}</p> : null}
        {shown ? (
          <p className="mt-3 rounded-xl bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900" data-hd-transit-moment={shown.moment.utcIso}>
            {momentCaption(shown.moment)} <span className="font-normal text-indigo-700">· UTC {shown.moment.utcIso.slice(0, 16).replace("T", " ")} ({utcOffsetLabel(shown.moment.offsetSeconds)})</span>
          </p>
        ) : null}
        {shown ? (
          complete ? (
            <p className="mt-2 text-[11px] text-emerald-800" data-hd-transit-complete="1" data-hd-transit-resolution={shown.resolution}>
              Sonuç tam: 13 aktivasyonun tamamı kesin.{shown.resolution === "roxy-resolved" ? " Sınıra çok yakın gezegenler hassas efemerisle netleştirildi ve bağımsız olarak denetlendi." : ""}
            </p>
          ) : (
            <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200" data-hd-transit-complete="0" data-hd-transit-resolution={shown.resolution}>
              Sonuç EKSİK: {uncertainActs.length} aktivasyon kesinleştirilemedi ({uncertainActs.map((a) => bodyLabel(a.body)).join(", ")})
              {shown.resolution === "unresolved" ? " — hassas doğrulama kaynağına şu anda ulaşılamadı; birkaç dakika sonra tekrar deneyin." : " — gezegen çizgi sınırına hassas efemerisin ölçülmüş payından da yakın; yeniden denemek sonucu değiştirmez, bir dakika önceki veya sonraki anı seçin."} Bu aktivasyonlar ve bağlı kanal / merkezler kesin olarak gösterilmez; BodyGraph çizilmez.
            </p>
          )
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-hd-transit-note>{GENERAL_TRANSIT_NOTE}</p>
      </section>

      {t && shown ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          {complete && state ? (
            <section className={card}>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Transit BodyGraph</h2>
              <TransitBodygraphPanel
                state={state}
                testId="general"
                label={`Genel transit BodyGraph: ${momentCaption(shown.moment)}`}
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
          ) : (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4 shadow-sm" data-hd-transit-uncertainty-panel>
              <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest text-amber-800">Bu an için BodyGraph gösterilmiyor</h2>
              <p className="text-xs leading-relaxed text-amber-900">
                {uncertainActs.length} aktivasyon kesinleştirilemediği için sonuç eksiktir. Kısmi veriden çizilen bir BodyGraph tamamlanmış bir analiz gibi
                görünebileceğinden grafik çizilmez. Aşağıda kesin olan ve kesin olmayan bilgiler ayrı gösterilir.
              </p>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-amber-800">Kesinleştirilemeyen aktivasyonlar</h3>
              <ul className="mt-1 space-y-1">
                {uncertainActs.map((a) => (
                  <li key={a.body} className="rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-800 ring-1 ring-amber-200" data-hd-transit-uncertain-body={a.body}>
                    <b>{bodyLabel(a.body)}</b>: {a.gate}.{a.line} ya da {a.alternative!.gate}.{a.alternative!.line}{" "}
                    <span className="text-slate-600">
                      {a.alternative!.gate === a.gate ? `— kapı kesin (${a.gate}), yalnız çizgi belirsiz` : `— kapı da belirsiz (${a.gate} ya da ${a.alternative!.gate})`}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-emerald-800">Güvenle hesaplananlar</h3>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700" data-hd-transit-certain-summary>
                <li>{t.activations.length - uncertainActs.length}/13 aktivasyon kesin.</li>
                <li>Kesin aktif kapılar: {t.activeGates.join(", ") || "yok"}</li>
                <li>Kesin tamamlanan kanallar: {t.channels.length ? t.channels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ") : "yok"}</li>
                <li>Kesin bağlı merkezler: {t.definedCenters.length ? t.definedCenters.map(transitCenterLabel).join(" · ") : "yok"}</li>
                <li>Her olasılıkta bağlı olmayan merkezler: {t.openCenters.length ? t.openCenters.map(transitCenterLabel).join(" · ") : "yok"}</li>
              </ul>
              <h3 className="mt-3 text-[11px] font-black uppercase tracking-widest text-amber-800">Kesin olmayanlar</h3>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-700" data-hd-transit-uncertain-summary>
                <li>Olası kanallar: {t.possibleChannels.length ? t.possibleChannels.map((c) => transitChannelLabel(c.id, c.name)).join(" · ") : "yok"}</li>
                <li>Sınırdaki aktivasyona bağlı merkezler: {t.uncertainCenters.length ? t.uncertainCenters.map(transitCenterLabel).join(" · ") : "yok"}</li>
              </ul>
            </section>
          )}
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
              <p className="mt-2 text-[11px] text-slate-500">Kapı.çizgi · {complete ? "aktif kapılar" : "kesin aktif kapılar"}: <span data-hd-transit-gates>{t.activeGates.join(", ")}</span></p>
              {t.hasUncertainty ? <p className="mt-1 text-[11px] text-amber-800" data-hd-transit-uncertain-note>{UNCERTAIN_NOTE}</p> : null}
            </section>
            <section className={card} data-hd-transit-channels>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{complete ? "Transitin Tamamladığı Kanallar" : "Transitin Kesin Tamamladığı Kanallar"} ({t.channels.length})</h2>
              {t.channels.length === 0 ? (
                <p className="text-xs text-slate-600">
                  {t.possibleChannels.length ? "Kesin tamamlanan kanal yok; aşağıdaki olası kanallar sınırdaki aktivasyona bağlıdır." : "Bu anda transitler kendi başına hiçbir kanalı tamamlamıyor."}
                </p>
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
                      {transitCenterLabel(c)} <span className="font-normal">· {on ? "transit kanalıyla bağlı" : unsure ? "sınırdaki aktivasyona bağlı (kesin değil)" : "bağlı değil"}</span>
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

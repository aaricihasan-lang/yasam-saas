"use client";

// Kişisel Transit — kayıtlı danışan analizi (natal) üzerine seçilen anın transiti. Natal analiz DEĞİŞMEZ.
// Yalnız "Kişisel Transiti Hesapla" sunucuya hesap isteği gönderir; aynı danışan + aynı an tekrar hesaplanmaz.

import { useEffect, useMemo, useState } from "react";
import type { RelationCandidate } from "@/lib/human-design/relations/relationService";
import { istanbulLocalParts, utcOffsetLabel } from "@/lib/human-design/transit/transitMoment";
import { overlaySceneState } from "@/lib/human-design/transit/transitScene";
import { CBG_PERSON_COLOR } from "@/lib/human-design/relations/connectionBodygraphScene";
import { PLANET_GLYPH } from "@/lib/human-design/bodygraph/planetGlyphs";
import { bodyLabel, NEAR_BOUNDARY_NOTE, transitCenterLabel, transitChannelLabel } from "@/lib/human-design/transit/transitLabels";
import { CHANNELS } from "@/lib/human-design/engine/channels";
import type { OverlayChannel } from "@/lib/human-design/transit/personalTransit";
import { fetchRelationCandidates } from "@/app/human-design/iliski-grup/helpers/relationsClient";
import { fetchPersonalTransit, type PersonalTransitResult } from "../helpers/transitClient";
import { TransitBodygraphPanel } from "./TransitBodygraphPanel";
import { MomentPicker, momentCaption } from "./MomentPicker";

const card = "rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm";
const CH = new Map(CHANNELS.map((c) => [c.id, c]));
const REASON: Record<NonNullable<RelationCandidate["reason"]>, string> = {
  no_auto_chart: "otomatik BodyGraph analizi yok",
  birth_data_changed: "doğum bilgisi değişti — bireysel analizi güncelleyin",
  chart_incomplete: "kayıtlı analiz eksik",
};
export const PERSONAL_TRANSIT_NOTE =
  "Kişisel transit, danışanın kayıtlı Human Design analizinin üzerine seçilen andaki gezegen aktivasyonlarını yerleştirir. Kayıtlı bireysel analiz değişmez. Transit etkisi geçicidir ve yalnız gösterilen an içindir.";

export function PersonalTransitView() {
  const init = useMemo(() => istanbulLocalParts(new Date()), []);
  const [date, setDate] = useState(init.localDate);
  const [time, setTime] = useState(init.localTime);
  const [cands, setCands] = useState<RelationCandidate[] | null>(null);
  const [candErr, setCandErr] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<PersonalTransitResult | null>(null);
  const [memo, setMemo] = useState<Record<string, PersonalTransitResult>>({});

  useEffect(() => {
    let alive = true;
    fetchRelationCandidates().then((r) => {
      if (!alive) return;
      if (r.ok) setCands(r.rows);
      else setCandErr(r.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cand = cands?.find((c) => c.clientId === clientId) ?? null;
  const run = async () => {
    if (!cand?.chart || busy) return;
    const key = `${cand.chart.id}|${date}|${time}`;
    if (memo[key]) {
      setRes(memo[key]);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await fetchPersonalTransit({ clientId: cand.clientId, chartId: cand.chart.id, date, time });
    setBusy(false);
    if (r.ok) {
      setRes(r);
      setMemo((m) => ({ ...m, [key]: r }));
    } else setError(r.error);
  };

  const v = res?.view ?? null;
  const state = useMemo(() => (v ? overlaySceneState(v.natal.gates, v.transit.gates) : null), [v]);
  const natalSet = useMemo(() => new Set(v?.natal.gates ?? []), [v]);
  const bodies = (g: number) => (v?.transit.gateBodies[g] ?? []).map(bodyLabel).join(", ");
  const gateWho = (g: number) => {
    const n = natalSet.has(g);
    const t = (v?.transit.gateBodies[g] ?? []).length > 0;
    return n && t ? `natal + transit (${bodies(g)})` : n ? "natal" : t ? `transit (${bodies(g)})` : "aktif değil";
  };
  const describe = (id: string) => {
    if (!v) return null;
    const ch = CH.get(id);
    if (!ch) return null;
    const label = transitChannelLabel(id, ch.name);
    const line = <p className="mt-0.5 text-slate-700">{ch.gateA}. kapı: {gateWho(ch.gateA)} · {ch.gateB}. kapı: {gateWho(ch.gateB)}</p>;
    if (v.natal.channels.includes(id)) return <><p className="font-bold text-slate-900">{label} <span className="font-semibold text-blue-700">· natalde tanımlı (korunur)</span></p>{line}</>;
    if (v.personal.some((c) => c.id === id)) return <><p className="font-bold text-slate-900">{label} <span className="font-semibold text-orange-700">· transit natal kapıyı tamamlıyor</span></p>{line}</>;
    if (v.educational.some((c) => c.id === id)) return <><p className="font-bold text-slate-900">{label} <span className="font-semibold text-orange-700">· iki kapı da transitten</span></p>{line}</>;
    return <><p className="font-bold text-slate-900">{label} <span className="font-semibold text-slate-500">· tamamlanmadı</span></p>{line}</>;
  };
  const channelRow = (c: OverlayChannel, attr: string) => (
    <li key={c.id} className="rounded-lg bg-orange-50/60 px-3 py-2 text-xs text-slate-700" data-hd-ptransit-channel={`${attr}:${c.id}`}>
      <b className="text-slate-900">{transitChannelLabel(c.id, c.name)}</b>
      <span className="block">
        {[c.gateA, c.gateB].map((g) => `${g}. kapı (${natalSet.has(g) ? "natal" : `transit: ${bodies(g)}`})`).join(" – ")}
      </span>
      <span className="block text-slate-500">{transitCenterLabel(c.centerA)} – {transitCenterLabel(c.centerB)}</span>
    </li>
  );

  return (
    <div className="space-y-4" data-hd-transit-view="personal">
      <section className={card}>
        <label className="block text-xs font-bold text-slate-700">
          Danışan
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setRes(null); setError(null); }} className="mt-1 h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-base text-slate-900 sm:text-sm" data-hd-ptransit-client>
            <option value="">{cands ? "Danışan seçin…" : "Yükleniyor…"}</option>
            {(cands ?? []).map((c) => (
              <option key={c.clientId} value={c.clientId} disabled={!c.chart}>
                {c.name}{c.chart ? "" : ` — ${REASON[c.reason ?? "no_auto_chart"]}`}
              </option>
            ))}
          </select>
        </label>
        {candErr ? <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{candErr}</p> : null}
        {cands && cands.length === 0 ? <p className="mt-1 text-xs text-slate-600">Henüz Human Design danışanınız yok.</p> : null}
        <div className="mt-3">
          <MomentPicker
            date={date}
            time={time}
            busy={busy}
            disabled={!cand?.chart}
            onDate={setDate}
            onTime={setTime}
            onNow={() => {
              const n = istanbulLocalParts(new Date());
              setDate(n.localDate);
              setTime(n.localTime);
            }}
            onSubmit={() => void run()}
            submitLabel="Kişisel Transiti Hesapla"
          />
        </div>
        {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700" data-hd-ptransit-error>{error}</p> : null}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{PERSONAL_TRANSIT_NOTE} Aynı danışan ve aynı an için sonuç tekrar hesaplanmaz.</p>
      </section>

      {res && v && state ? (
        <>
          <p className="rounded-xl bg-indigo-50/70 px-3 py-2 text-xs font-semibold text-indigo-900" data-hd-ptransit-moment={res.moment.utcIso}>
            {res.client.name} · {momentCaption(res.moment)} <span className="font-normal text-indigo-700">· UTC {res.moment.utcIso.slice(0, 16).replace("T", " ")} ({utcOffsetLabel(res.moment.offsetSeconds)})</span>
          </p>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
            <section className={card}>
              <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Natal + Transit BodyGraph</h2>
              <TransitBodygraphPanel
                state={state}
                testId="personal"
                label={`Kişisel transit BodyGraph: ${res.client.name}, ${momentCaption(res.moment)}`}
                hint="Bir kanalın üzerine gelin ya da dokunun: kapıların natal mı transit mi olduğu burada görünür."
                describe={describe}
                legend={
                  <>
                    <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.A }} />Mavi: natal kapı (kayıtlı analiz)</li>
                    <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.B }} />Turuncu: transit kapısı</li>
                    <li>Mavi-turuncu çizgili: natalde ve transitte aynı kapı</li>
                    <li>Kesikli tek yarı: kanal tamamlanmadı</li>
                  </>
                }
              />
            </section>
            <div className="space-y-4">
              <section className={card} data-hd-ptransit-activations>
                <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Transit Aktivasyonları (13)</h2>
                <ul className="divide-y divide-slate-100">
                  {v.transit.activations.map((a) => (
                    <li key={a.body} className="flex items-center justify-between gap-2 py-1.5 text-sm" data-hd-ptransit-activation={`${a.body}:${a.gate}.${a.line}`}>
                      <span className="min-w-0 text-slate-800"><span className="mr-1.5 inline-block w-4 text-center text-slate-500" aria-hidden>{PLANET_GLYPH[a.body]}</span>{bodyLabel(a.body)}</span>
                      <span className="flex items-center gap-1.5">
                        {natalSet.has(a.gate) ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800 ring-1 ring-blue-200">natalde de var</span> : null}
                        <span className="font-mono text-sm font-bold text-slate-900">{a.gate}.{a.line}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">Natal kapılar: <span data-hd-ptransit-natal-gates>{v.natal.gates.join(", ")}</span></p>
                {v.boundaryDifferences.length ? <p className="mt-1 text-[11px] text-amber-800">{NEAR_BOUNDARY_NOTE}</p> : null}
              </section>
              <section className={card} data-hd-ptransit-personal>
                <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Transitin Natal Kapıyı Tamamladığı Kanallar ({v.personal.length})</h2>
                {v.personal.length ? <ul className="space-y-1.5">{v.personal.map((c) => channelRow(c, "personal"))}</ul> : <p className="text-xs text-slate-600">Bu anda transit, natal kapılardan hiçbirinin kanalını tamamlamıyor.</p>}
              </section>
              <section className={card} data-hd-ptransit-educational>
                <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">İki Kapısı da Transitten Gelen Kanallar ({v.educational.length})</h2>
                {v.educational.length ? <ul className="space-y-1.5">{v.educational.map((c) => channelRow(c, "educational"))}</ul> : <p className="text-xs text-slate-600">Bu anda natalde açık olup transitin iki kapısını birden sağladığı kanal yok.</p>}
              </section>
              <section className={card} data-hd-ptransit-natal>
                <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Natalde Tanımlı Kanallar (korunur)</h2>
                <p className="text-xs text-slate-700" data-hd-ptransit-natal-channels>{v.natal.channels.length ? v.natal.channels.map((id) => transitChannelLabel(id, CH.get(id)?.name ?? "")).join(" · ") : "Natalde tanımlı kanal yok."}</p>
              </section>
              <section className={card} data-hd-ptransit-centers>
                <h2 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Geçici Tanımlanan Merkezler</h2>
                <p className="text-xs text-slate-700" data-hd-ptransit-temp-centers>{v.temporaryCenters.length ? v.temporaryCenters.map(transitCenterLabel).join(" · ") : "Bu anda natalde açık bir merkez transitle tanımlanmıyor."}</p>
                <p className="mt-1 text-[11px] text-slate-500">Natalde tanımlı merkezler: {v.natal.centers.length ? v.natal.centers.map(transitCenterLabel).join(" · ") : "yok"}</p>
              </section>
              {v.providerSummary ? (
                <section className={card} data-hd-ptransit-summary>
                  <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-500">Hesaplama Servisinin Teknik Özeti</h2>
                  <p className="text-xs text-slate-600">{v.providerSummary}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Yalnız sayısal özettir; yorum değildir.</p>
                </section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

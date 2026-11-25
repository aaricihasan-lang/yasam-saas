"use client";

// İlişki (Connection) ve Grup (Penta) sonuç görünümleri — SAF SUNUM (fetch yok, hesap yok).
// Kaynak: kayıtlı ve doğrulanmış sonuç. Roxy'nin vermediği yorum/puan/yüzde gösterilmez.
// Connection birleşik BodyGraph'ı: Yaşam Sistemi premium silüetli çizim (mühürlü V9 kanal geometrisi; Word ile aynı
// sahne). Penta: Yaşam Sistemi Türkçe şeması.

import { hdGateDefaultName } from "@/lib/human-design/knowledge/hdNames";
import { channelCenterCodes, type ConnectionDynamic, type HdConnectionResult } from "@/lib/human-design/relations/connection";
import type { HdPentaResult } from "@/lib/human-design/relations/penta";
import type { RelationAnalysisView } from "@/lib/human-design/relations/relationService";
import type { HdCenterCode } from "@/lib/human-design/types";
import { useMemo, useState } from "react";
import { HD_CHART_LOGO_SRC } from "@/app/human-design/kayitli-haritalar/components/HdChartInfoPanel";
import { ConnectionBodygraph } from "./ConnectionBodygraph";
import { LegacyRoxyCompositePanel, LegacySchematicCompositePanel } from "./LegacyConnectionPanels";
import { HD_CONNECTION_BODYGRAPH } from "@/lib/human-design/bodygraph/rendererConfig";
import { buildCompositeModel } from "@/lib/human-design/relations/compositeModel";
import { buildConnectionBodygraphScene, CBG_PERSON_COLOR, cbgStateFromModel, cbgStateFromResult } from "@/lib/human-design/relations/connectionBodygraphScene";
import { buildPentaScene, pentaChannelLines, PENTA_VIEW } from "@/lib/human-design/relations/pentaScene";
import { SceneSvg } from "./SceneSvg";
import { DYNAMIC_ORDER, participantTag } from "@/lib/human-design/relations/labels";
import { useRelationLabels } from "../helpers/useRelationLabels";
import { useLocalizedCenterText } from "@/app/human-design/_i18n/bodygraphCenterText";

export const DYNAMIC_COLOR: Readonly<Record<ConnectionDynamic, { stroke: string; chip: string }>> = {
  Electromagnetic: { stroke: "#7c3aed", chip: "bg-violet-50 text-violet-800 ring-violet-200" },
  Dominance: { stroke: "#d97706", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  Compromise: { stroke: "#0284c7", chip: "bg-sky-50 text-sky-800 ring-sky-200" },
  Companionship: { stroke: "#059669", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

const Card = ({ title, children, attr }: { title: string; children: React.ReactNode; attr?: string }) => (
  <section className="rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm" data-hd-rel-card={attr}>
    <h3 className="mb-3 text-[11px] font-black uppercase tracking-widest text-indigo-700">{title}</h3>
    {children}
  </section>
);

// Şematik merkez konumları (viewBox 300×420).
const POS: Record<HdCenterCode, [number, number]> = {
  head: [150, 30],
  ajna: [150, 92],
  throat: [150, 160],
  g_identity: [150, 236],
  heart_ego: [212, 262],
  spleen: [56, 300],
  sacral: [150, 322],
  solar_plexus: [244, 300],
  root: [150, 392],
};

function ConnectionDiagram({ r }: { r: HdConnectionResult }) {
  const L = useRelationLabels();
  const pairCount = new Map<string, number>();
  return (
    <svg viewBox="0 0 300 420" role="img" aria-label={L.t("view.diagramAria")} className="mx-auto h-auto w-full max-w-[320px]" data-hd-rel-diagram="connection">
      {r.channels.map((c) => {
        const cc = channelCenterCodes(c.id);
        if (!cc) return null;
        const key = [...cc].sort().join("|");
        const n = pairCount.get(key) ?? 0;
        pairCount.set(key, n + 1);
        const off = n * 5; // aynı merkez çiftindeki kanallar yan yana
        const [x1, y1] = POS[cc[0]];
        const [x2, y2] = POS[cc[1]];
        return (
          <line key={c.id} x1={x1 + off} y1={y1} x2={x2 + off} y2={y2} stroke={DYNAMIC_COLOR[c.dynamic].stroke} strokeWidth={4} strokeLinecap="round" opacity={0.9} data-hd-rel-line={`${c.id}:${c.dynamic}`}>
            <title>{`${L.channel(c.id, c.name)} — ${L.dynamic(c.dynamic)}`}</title>
          </line>
        );
      })}
      {r.centers.map((c) => {
        const [x, y] = POS[c.code];
        return (
          <g key={c.code} data-hd-rel-center={`${c.code}:${c.defined ? "defined" : "open"}`}>
            <circle cx={x} cy={y} r={20} fill={c.defined ? "#c7d2fe" : "#ffffff"} stroke={c.defined ? "#4f46e5" : "#94a3b8"} strokeWidth={2} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1e293b">
              {L.shortCenter(c.code).split(" ")[0]}
            </text>
            {c.definedBy.length ? (
              <text x={x + 23} y={y - 12} fontSize={9} fontWeight={800} fill="#4f46e5">{c.definedBy.join("+")}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}



/** Yaşam Sistemi marka imzası (mevcut logo; yeni tasarım yok). */
export function RelationBrand({ className = "" }: { className?: string }) {
  const { t } = useRelationLabels();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- statik, küçük, şeffaf marka görseli
    <img src={HD_CHART_LOGO_SRC} alt={t("view.brandAlt")} width={520} height={390} className={`h-auto select-none object-contain ${className}`} draggable={false} data-hd-rel-brand />
  );
}

/**
 * Birleşik İlişki BodyGraph'ı — Yaşam Sistemi premium silüetli çizim, mühürlü V9 kanal geometrisi.
 * Veri: kayıtlı bireysel kapılar kayıtlı sonuçla BİREBİR doğrulanırsa tam çizim (tanımlı + yarım kanallar);
 * değilse yalnız kayıtlı sonuçtaki tanımlı kanallar (açık not ile). Uydurma çizim yok.
 */
function CompositePanel({ a, r }: { a: RelationAnalysisView; r: HdConnectionResult }) {
  const build = useMemo(() => buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r), [a, r]);
  const state = useMemo(() => (build.ok ? cbgStateFromModel(build.model) : cbgStateFromResult(r)), [build, r]);
  const scenePrims = useMemo(() => buildConnectionBodygraphScene(state), [state]);
  const L = useRelationLabels();
  const t = L.t;
  const localizeCenters = useLocalizedCenterText();
  const prims = localizeCenters(scenePrims);
  const [sel, setSel] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const nameA = a.participants[0]?.name ?? "A";
  const nameB = a.participants[1]?.name ?? "B";
  const st = sel ? state.channels[sel] : null;
  const [gLo, gHi] = sel ? sel.split("-").map(Number) : [0, 0];
  const who = (h: "A" | "B" | "both" | null) => (h === "both" ? t("view.whoShared", { a: nameA, b: nameB }) : h === "A" ? nameA : h === "B" ? nameB : t("view.nobody"));
  const definedIds = Object.values(state.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join(",");
  const halfIds = Object.values(state.channels).filter((c) => c.state === "half").map((c) => c.id).sort().join(",");
  return (
    <div data-hd-composite={state.full ? "ok" : "result-only"} data-hd-composite-defined={definedIds} data-hd-composite-half={halfIds}>
      {!state.full ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" data-hd-composite-notice>
          {t("view.resultOnlyNotice")}
        </p>
      ) : null}
      <div className="mb-1 flex justify-end sm:hidden">
        <button type="button" onClick={() => setWide((w) => !w)} className="min-h-[36px] rounded-lg border border-indigo-200 px-2.5 text-[11px] font-bold text-indigo-700" data-hd-composite-zoom aria-pressed={wide}>
          {wide ? t("view.zoomOut") : t("view.zoomIn")}
        </button>
      </div>
      {/* Telefonda büyütme: grafik sabit genişlikte çizilir, kap yatay kaydırır (sayfa taşmaz). */}
      <div className={wide ? "-mx-2 overflow-x-auto overscroll-x-contain" : ""} data-hd-composite-scroll>
        <ConnectionBodygraph
          prims={prims}
          wide={wide}
          logoSrc={HD_CHART_LOGO_SRC}
          label={t("view.compositeLabel", { a: nameA, b: nameB })}
          selected={sel}
          onSelect={setSel}
          channelLabel={(id) => L.channel(id, id)}
        />
      </div>
      <div className="mt-2 min-h-[64px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-composite-info={sel ?? ""}>
        {!st ? (
          <p className="text-slate-500">{t("view.hoverHint")}</p>
        ) : st.state === "defined" ? (
          <>
            <p className="font-bold text-slate-900">{L.channel(st.id, st.id)} <span className="font-semibold text-indigo-700">· {L.dynamic(st.dynamic)}</span></p>
            <p className="mt-0.5 text-slate-700">{t("view.gateHolders", { lo: gLo, wa: who(st.holderA), hi: gHi, wb: who(st.holderB) })}</p>
            <p className="mt-0.5 text-slate-500">{L.dynamicDef(st.dynamic)}</p>
          </>
        ) : st.state === "half" ? (
          <>
            <p className="font-bold text-slate-900">{L.channel(st.id, st.id)} <span className="font-semibold text-amber-700">{t("view.halfChannel")}</span></p>
            <p className="mt-0.5 text-slate-700">{t("view.gateHolders", { lo: gLo, wa: who(st.holderA), hi: gHi, wb: who(st.holderB) })}</p>
            <p className="mt-0.5 text-slate-500">{t("view.halfChannelDesc")}</p>
          </>
        ) : (
          <p className="text-slate-700"><b>{L.channel(st.id, st.id)}</b> — {state.full ? t("view.noActiveGate") : t("view.notDefinedCombined")}</p>
        )}
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-composite-legend>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.A }} />A · {nameA}</li>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.B }} />B · {nameB}</li>
        <li>{t("view.legendActive")}</li>
        <li>{t("view.legendShared")}</li>
        <li>{t("view.legendHalves")}</li>
        <li>{t("view.legendCenter")}</li>
        <li>{t("view.legendType")}</li>
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-indigo-700">{t("view.summaryDiagram")}</summary>
        <ConnectionDiagram r={r} />
      </details>
    </div>
  );
}

function PentaPanel({ a, r }: { a: RelationAnalysisView; r: HdPentaResult }) {
  const L = useRelationLabels();
  const t = L.t;
  const pentaLabels = L.pentaLabels;
  const scene = useMemo(() => buildPentaScene(r, pentaLabels), [r, pentaLabels]);
  const [sel, setSel] = useState<string | null>(null);
  const c = sel ? r.channels.find((x) => x.id === sel) ?? null : null;
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${a.participants[i]?.name ?? "?"}`).join(", ") : t("view.nobody"));
  return (
    <div data-hd-penta-diagram>
      <SceneSvg prims={scene} view={PENTA_VIEW} wide={false} large label={t("penta.diagramLabel")} hitRoutes={pentaChannelLines()} selected={sel} onSelect={setSel} channelLabel={(id) => L.channel(id, id)} testId="penta" />
      <div className="mt-2 min-h-[56px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-penta-info={sel ?? ""}>
        {!c ? (
          <p className="text-slate-500">{t("penta.hint")}</p>
        ) : (
          <>
            <p className="font-bold text-slate-900">{L.channel(c.id, c.name)}{c.isCore ? t("penta.core") : ""} <span className={c.defined ? "text-emerald-700" : "text-amber-700"}>· {c.defined ? t("penta.strong") : t("penta.gap")}</span></p>
            <p className="mt-0.5 text-slate-700">{t("view.gateHolders", { lo: c.gateA, wa: who(c.gateAHeldBy), hi: c.gateB, wb: who(c.gateBHeldBy) })}</p>
          </>
        )}
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-penta-legend>
        <li><span className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-indigo-600 align-middle" />{t("penta.legendDefined")}</li>
        <li><span className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-pink-700 align-middle" />{t("penta.legendCore")}</li>
        <li><span className="mr-1.5 inline-block w-5 border-t-2 border-dotted border-slate-300 align-middle" />{t("penta.legendGap")}</li>
        <li><span className="mr-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-600 align-middle text-[8px] font-black text-white">1</span>{t("penta.legendMember")}</li>
        <li><span className="mr-1.5 inline-block h-3.5 w-3.5 rounded-full border border-dashed border-slate-400 align-middle" />{t("penta.legendNoMember")}</li>
      </ul>
      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-700" data-hd-penta-members-legend>
        {a.participants.map((p) => (<li key={p.position}>{p.position + 1}. {p.name}</li>))}
      </ol>
    </div>
  );
}

/**
 * Liste görünümü: yarım kanallar (birlikte tek kapısı aktif) ve her kişinin TÜM aktif
 * kapıları. Kaynak: kayıtlı bireysel analizler (kayıtlı sonuçla doğrulanmış model). Kaynak yoksa açıkça söylenir.
 */
function ActiveGatesCard({ a, r }: { a: RelationAnalysisView; r: HdConnectionResult }) {
  const build = useMemo(() => buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r), [a, r]);
  const L = useRelationLabels();
  const t = L.t;
  const nameA = a.participants[0]?.name ?? "A";
  const nameB = a.participants[1]?.name ?? "B";
  if (!build.ok) {
    return (
      <Card title={t("view.activeGatesTitle")} attr="active-gates">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" data-hd-active-gates="unavailable">
          {t("view.activeGatesUnavailable")}
        </p>
      </Card>
    );
  }
  const m = build.model;
  const connected = new Set(r.channels.flatMap((c) => [c.gateA, c.gateB]));
  const halves = Object.values(m.channels).filter((c): c is Extract<typeof c, { state: "half" }> => c.state === "half").sort((x, y) => Number(x.id.split("-")[0]) - Number(y.id.split("-")[0]));
  const gatesOf = (p: "A" | "B") => Object.entries(m.gates).filter(([, h]) => h === p || h === "both").map(([g]) => Number(g)).sort((x, y) => x - y);
  const who = (h: "A" | "B" | "both" | null) => (h === "both" ? t("view.whoBoth", { a: nameA, b: nameB }) : h === "A" ? `A · ${nameA}` : h === "B" ? `B · ${nameB}` : "—");
  return (
    <Card title={t("view.activeGatesTitle")} attr="active-gates">
      <div className="grid gap-4 lg:grid-cols-2" data-hd-active-gates="ok">
        <div>
          <p className="text-xs font-bold text-slate-800">{t("view.halfChannels", { count: halves.length })}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t("view.halfChannelsDesc")}</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {halves.map((c) => {
              const [lo, hi] = c.id.split("-").map(Number);
              return (
                <li key={c.id} className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 px-2.5 py-1.5 text-xs" data-hd-half-channel={c.id}>
                  <p className="font-bold text-slate-800">{L.channel(c.id, c.id)}</p>
                  <p className="text-slate-600">{t("view.gateHolders", { lo, wa: who(c.holderA), hi, wb: who(c.holderB) })}</p>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-800">{t("view.allGates")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t("view.allGatesDesc")}</p>
          {(["A", "B"] as const).map((p) => (
            <div key={p} className="mt-2" data-hd-person-gates={p}>
              <p className="text-[11px] font-semibold text-slate-700"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR[p] }} />{p} · {p === "A" ? nameA : nameB}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {gatesOf(p).map((g) => (
                  <span key={g} className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ring-1 ${connected.has(g) ? "bg-indigo-50 font-black text-indigo-800 ring-indigo-200" : "bg-white text-slate-600 ring-slate-200"}`} title={(L.isTr ? hdGateDefaultName(g) : null) ?? undefined}>{g}</span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function ConnectionResultView({ a }: { a: RelationAnalysisView }) {
  const r = a.result as HdConnectionResult;
  const L = useRelationLabels();
  const t = L.t;
  const name = (p: "A" | "B") => a.participants[p === "A" ? 0 : 1]?.name ?? p;
  return (
    <div className="space-y-4" data-hd-rel-view="connection">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-center">
          <p className="text-2xl font-black tabular-nums text-indigo-800" data-hd-rel-total>{r.totalChannels}</p>
          <p className="text-[11px] font-semibold text-slate-600">{t("view.connectedChannels")}</p>
        </div>
        {DYNAMIC_ORDER.map((d) => (
          <div key={d} className={`rounded-xl px-3 py-2 text-center ring-1 ${DYNAMIC_COLOR[d].chip}`} data-hd-rel-summary={d}>
            <p className="text-2xl font-black tabular-nums">{r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]]}</p>
            <p className="text-[11px] font-semibold leading-tight">{L.dynamic(d)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,660px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-indigo-100 bg-white px-4 py-4 shadow-sm sm:px-5" data-hd-rel-card="diagram">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-3" data-hd-rel-chart-head>
            <div className="min-w-0">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("view.compositeTitle")}</h3>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-800">
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.A }} />A · {name("A")}</span>
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: CBG_PERSON_COLOR.B }} />B · {name("B")}</span>
              </p>
            </div>
            {/* Logo grafiğin içinde (referans tasarım); başlıkta tekrar edilmez. */}
          </div>
          {/* AKTİF: premium (rendererConfig). PASİF eski paneller silinmedi: LegacyConnectionPanels.tsx */}
          {HD_CONNECTION_BODYGRAPH === "premium" ? (
            <CompositePanel a={a} r={r} />
          ) : HD_CONNECTION_BODYGRAPH === "legacy-roxy" ? (
            <LegacyRoxyCompositePanel a={a} r={r} summary={<ConnectionDiagram r={r} />} />
          ) : (
            <LegacySchematicCompositePanel a={a} r={r} notice={null} summary={<ConnectionDiagram r={r} />} />
          )}
          <p className="mt-2 text-xs font-semibold text-slate-700" data-hd-rel-definition>
            {t("view.combinedDefinition", { value: L.combinedDefinition(r.combinedDefinition) })}
          </p>
        </section>

        <Card title={t("view.channelsTitle")} attr="channels">
          {r.channels.length === 0 ? <p className="text-xs text-slate-500">{t("view.noChannels")}</p> : null}
          <div className="space-y-4">
            {DYNAMIC_ORDER.map((d) => {
              const list = r.channels.filter((c) => c.dynamic === d);
              if (list.length === 0) return null;
              return (
                <div key={d} data-hd-rel-dynamic={d}>
                  <p className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${DYNAMIC_COLOR[d].chip}`}>{L.dynamic(d)} · {list.length}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{L.dynamicDef(d)}</p>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((c) => {
                      const cc = channelCenterCodes(c.id);
                      return (
                        <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs" data-hd-rel-channel={c.id}>
                          <p className="font-bold text-slate-800">{L.channel(c.id, c.name)}</p>
                          <p className="mt-0.5 text-slate-500">
                            {cc ? `${L.shortCenter(cc[0])} ↔ ${L.shortCenter(cc[1])}` : null} · {L.circuit(c.circuit)}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-slate-700">
                            <span>A · {name("A")}: <b>{c.personAGates.length ? c.personAGates.join(", ") : "—"}</b></span>
                            <span>B · {name("B")}: <b>{c.personBGates.length ? c.personBGates.join(", ") : "—"}</b></span>
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <ActiveGatesCard a={a} r={r} />

      <Card title={t("view.centersTitle")} attr="centers">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {r.centers.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs odd:bg-slate-50/70" data-hd-rel-center-row={c.code}>
              <span className="text-slate-700">{L.center(c.code)}</span>
              <span className="flex flex-wrap items-center gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.defined ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                  {c.defined ? t("view.combinedDefined") : t("view.combinedUndefined")}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {c.definedBy.length === 2 ? t("view.definedBoth") : c.definedBy.length === 1 ? t("view.definedOnly", { tag: c.definedBy[0], name: name(c.definedBy[0]) }) : t("view.definedNeither")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ─── Penta ────────────────────────────────────────────────────────────────

export function PentaResultView({ a }: { a: RelationAnalysisView }) {
  const r = a.result as HdPentaResult;
  const L = useRelationLabels();
  const t = L.t;
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${a.participants[i]?.name ?? "?"}`).join(", ") : "—");
  return (
    <div className="space-y-4" data-hd-rel-view="penta">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("penta.sumDefined"), `${r.summary.definedChannels} / 6`, "defined"],
          [t("penta.sumFilled"), `${r.summary.filledGates} / 12`, "filled"],
          [t("penta.sumCore"), r.summary.coreDefined ? t("penta.defined") : t("penta.notDefined"), "core"],
          [t("penta.sumGaps"), r.summary.gapGates.length ? r.summary.gapGates.join(", ") : t("penta.none"), "gaps"],
        ].map(([l, v, k]) => (
          <div key={k} className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-center" data-hd-penta-summary={k}>
            <p className="text-lg font-black text-indigo-800">{v}</p>
            <p className="text-[11px] font-semibold text-slate-600">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,580px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-indigo-100 bg-white px-4 py-4 shadow-sm sm:px-5" data-hd-rel-card="diagram">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-3" data-hd-rel-chart-head>
            <div className="min-w-0">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("penta.chartTitle")}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-800">{t("penta.groupMeta", { count: a.participants.length })}</p>
            </div>
            <RelationBrand className="w-[92px] shrink-0 sm:w-[110px]" />
          </div>
          <PentaPanel a={a} r={r} />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t("note.pentaCore")}</p>
        </section>
        <div className="space-y-4">
          {(["upper", "lower"] as const).map((pos) => (
            <Card key={pos} title={t(`pentaPosition.${pos}`)} attr={`penta-${pos}`}>
              <p className="mb-2 text-[11px] text-slate-500">{t(`pentaPositionDef.${pos}`)}</p>
              <ul className="space-y-1.5">
                {r.channels.filter((c) => c.position === pos).map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs" data-hd-penta-channel={`${c.id}:${c.defined ? "defined" : "gap"}`}>
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{L.channel(c.id, c.name)}{c.isCore ? t("penta.core") : ""}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.defined ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>
                        {c.defined ? t("penta.strong") : t("penta.gap")}
                      </span>
                    </p>
                    <p className="mt-1 text-slate-700">{t("penta.gateRow", { gate: c.gateA })} <b>{who(c.gateAHeldBy)}</b></p>
                    <p className="text-slate-700">{t("penta.gateRow", { gate: c.gateB })} <b>{who(c.gateBHeldBy)}</b></p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      <Card title={t("penta.gatesTitle")} attr="gates">
        <p className="mb-2 text-[11px] text-slate-500">{t("note.pentaGap")}</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {r.gates.map((g) => (
            <li key={g.gate} className={`rounded-lg px-2.5 py-1.5 text-xs ${g.filled ? "bg-slate-50/80" : "bg-amber-50/70 ring-1 ring-amber-200"}`} data-hd-penta-gate={`${g.gate}:${g.filled ? "filled" : "gap"}`}>
              <span className="font-black tabular-nums text-indigo-800">{g.gate}</span>{" "}
              <span className="text-slate-700">{L.isTr ? hdGateDefaultName(g.gate) ?? g.gateNameLocalized ?? g.gateName : g.gateName}</span>
              <span className="block text-slate-500">{g.filled ? who(g.heldBy) : t("penta.gapNobody")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("penta.membersTitle")} attr="members">
        <ul className="space-y-1">
          {a.participants.map((p) => {
            const gates = r.gates.filter((g) => g.heldBy.includes(p.position)).map((g) => g.gate);
            return (
              <li key={p.position} className="text-xs text-slate-700" data-hd-penta-member={p.position}>
                <b>{participantTag(a.kind, p.position)}. {p.name}</b>: {gates.length ? t("penta.memberGates", { gates: gates.join(", ") }) : t("penta.memberNoGates")}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

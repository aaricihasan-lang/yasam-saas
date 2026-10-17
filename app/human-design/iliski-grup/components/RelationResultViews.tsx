"use client";

// İlişki (Connection) ve Grup (Penta) sonuç görünümleri — SAF SUNUM (fetch yok, hesap yok).
// Kaynak: kayıtlı ve doğrulanmış sonuç. Roxy'nin vermediği yorum/puan/yüzde gösterilmez.
// Diyagramlar Yaşam Sistemi'nin kendi şematik çizimidir; onaylı tek kişilik BodyGraph DEĞİŞMEDİ.

import { hdCenterLabelFromCode } from "@/lib/human-design/codeHelpers";
import { hdGateDefaultName } from "@/lib/human-design/knowledge/hdNames";
import { channelCenterCodes, type ConnectionDynamic, type HdConnectionResult } from "@/lib/human-design/relations/connection";
import type { HdPentaResult } from "@/lib/human-design/relations/penta";
import type { RelationAnalysisView } from "@/lib/human-design/relations/relationService";
import type { HdCenterCode } from "@/lib/human-design/types";
import { useMemo, useState } from "react";
import { buildCompositeModel } from "@/lib/human-design/relations/compositeModel";
import { buildCompositeScene, DYNAMIC_SHAPE, PERSON_COLOR } from "@/lib/human-design/relations/compositeScene";
import { COMPOSITE_ROUTES, COMPOSITE_VIEW } from "@/lib/human-design/relations/compositeLayout";
import { buildPentaScene, pentaChannelLines, PENTA_VIEW } from "@/lib/human-design/relations/pentaScene";
import { SceneSvg } from "./SceneSvg";
import {
  circuitLabel,
  combinedDefinitionLabel,
  DYNAMIC_DEFINITION,
  DYNAMIC_LABEL,
  DYNAMIC_ORDER,
  participantTag,
  PENTA_CORE_NOTE,
  PENTA_GAP_NOTE,
  PENTA_POSITION_DEFINITION,
  PENTA_POSITION_LABEL,
  relationChannelLabel,
} from "@/lib/human-design/relations/labels";

const shortCenter = (c: HdCenterCode) => hdCenterLabelFromCode(c).replace(/\s*\(.*\)$/, "");

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
  const pairCount = new Map<string, number>();
  return (
    <svg viewBox="0 0 300 420" role="img" aria-label="İlişki haritası şeması: birleşik merkezler ve kanal bağlantıları" className="mx-auto h-auto w-full max-w-[320px]" data-hd-rel-diagram="connection">
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
            <title>{`${relationChannelLabel(c.id, c.name)} — ${DYNAMIC_LABEL[c.dynamic]}`}</title>
          </line>
        );
      })}
      {r.centers.map((c) => {
        const [x, y] = POS[c.code];
        return (
          <g key={c.code} data-hd-rel-center={`${c.code}:${c.defined ? "defined" : "open"}`}>
            <circle cx={x} cy={y} r={20} fill={c.defined ? "#c7d2fe" : "#ffffff"} stroke={c.defined ? "#4f46e5" : "#94a3b8"} strokeWidth={2} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#1e293b">
              {shortCenter(c.code).split(" ")[0]}
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


const SHAPE_GLYPH: Record<"diamond" | "triangle" | "square" | "circle", string> = { diamond: "◆", triangle: "▲", square: "■", circle: "●" };

/** Birleşik BodyGraph + lejant + seçili kanal bilgisi. Kaynak veri yok/tutarsız → güvenli yedek özet şema. */
function CompositePanel({ a, r }: { a: RelationAnalysisView; r: HdConnectionResult }) {
  const build = useMemo(() => buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r), [a, r]);
  const scene = useMemo(() => (build.ok ? buildCompositeScene(build.model) : null), [build]);
  const [sel, setSel] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const nameA = a.participants[0]?.name ?? "A";
  const nameB = a.participants[1]?.name ?? "B";
  if (!build.ok || !scene) {
    return (
      <div data-hd-composite="fallback">
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
          Birleşik harita çizilemedi: kaynak bireysel analiz verisi artık mevcut değil. Kayıtlı sonuçtan özet şema gösteriliyor.
        </p>
        <ConnectionDiagram r={r} />
      </div>
    );
  }
  const m = build.model;
  const st = sel ? m.channels[sel] : null;
  const who = (h: "A" | "B" | "both" | null) => (h === "both" ? `${nameA} ve ${nameB} (ortak)` : h === "A" ? nameA : h === "B" ? nameB : "kimse");
  const route = sel ? COMPOSITE_ROUTES.find((x) => x.id === sel) : null;
  return (
    <div data-hd-composite="ok" data-hd-composite-defined={m.definedChannelIds.join(",")}>
      <div className="mb-1 flex justify-end sm:hidden">
        <button type="button" onClick={() => setWide((w) => !w)} className="min-h-[36px] rounded-lg border border-indigo-200 px-2.5 text-[11px] font-bold text-indigo-700" data-hd-composite-zoom aria-pressed={wide}>
          {wide ? "Haritayı küçült" : "Haritayı büyüt"}
        </button>
      </div>
      <div className={wide ? "-mx-2 overflow-x-auto overscroll-x-contain" : ""} data-hd-composite-scroll>
      <SceneSvg
        wide={wide}
        prims={scene}
        view={COMPOSITE_VIEW}
        label={`Birleşik İlişki BodyGraph'ı: ${nameA} ve ${nameB}`}
        hitRoutes={COMPOSITE_ROUTES.map((x) => ({ id: x.id, points: x.points }))}
        selected={sel}
        onSelect={setSel}
        channelLabel={(id) => relationChannelLabel(id, id)}
        testId="composite"
      />
      </div>
      <div className="mt-2 min-h-[64px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-composite-info={sel ?? ""}>
        {!st || !route ? (
          <p className="text-slate-500">Bir kanalın üzerine gelin ya da dokunun: kanal adı, kapılar ve bağlantı türü burada görünür.</p>
        ) : st.state === "defined" ? (
          <>
            <p className="font-bold text-slate-900">{relationChannelLabel(st.id, st.id)} <span className="font-semibold text-indigo-700">· {DYNAMIC_LABEL[st.dynamic]}</span></p>
            <p className="mt-0.5 text-slate-700">{route.gateA}. kapı: {who(st.holderA)} · {route.gateB}. kapı: {who(st.holderB)}</p>
            <p className="mt-0.5 text-slate-500">{DYNAMIC_DEFINITION[st.dynamic]}</p>
          </>
        ) : st.state === "half" ? (
          <>
            <p className="font-bold text-slate-900">{relationChannelLabel(st.id, st.id)} <span className="font-semibold text-amber-700">· Yarım kanal (tanımlı değil)</span></p>
            <p className="mt-0.5 text-slate-700">{route.gateA}. kapı: {who(st.holderA)} · {route.gateB}. kapı: {who(st.holderB)}</p>
            <p className="mt-0.5 text-slate-500">Birlikte kanalın yalnız bir kapısı aktif; birleşik haritada tanımlı değildir.</p>
          </>
        ) : (
          <p className="text-slate-700"><b>{relationChannelLabel(st.id, st.id)}</b> — iki haritada da aktif kapısı yok.</p>
        )}
      </div>
      <ul className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-composite-legend>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PERSON_COLOR.A }} />A · {nameA}</li>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PERSON_COLOR.B }} />B · {nameB}</li>
        <li>İki renkli kapı / çizgili kanal yarısı: ortak kapı</li>
        <li>Kalın kanal: tanımlı · ince kesikli: yarım kanal</li>
        {DYNAMIC_ORDER.map((d) => (<li key={d}>{SHAPE_GLYPH[DYNAMIC_SHAPE[d]]} {DYNAMIC_LABEL[d]}</li>))}
        <li>Dolgulu merkez: birleşik haritada tanımlı · A/B: kendi haritasında tanımlayan</li>
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-indigo-700">Özet bağlantı şeması (ikincil)</summary>
        <ConnectionDiagram r={r} />
      </details>
    </div>
  );
}

function PentaPanel({ a, r }: { a: RelationAnalysisView; r: HdPentaResult }) {
  const scene = useMemo(() => buildPentaScene(r), [r]);
  const [sel, setSel] = useState<string | null>(null);
  const c = sel ? r.channels.find((x) => x.id === sel) ?? null : null;
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${a.participants[i]?.name ?? "?"}`).join(", ") : "kimse");
  return (
    <div data-hd-penta-diagram>
      <SceneSvg prims={scene} view={PENTA_VIEW} label="Penta şeması: üst ve alt Penta kanalları" hitRoutes={pentaChannelLines()} selected={sel} onSelect={setSel} channelLabel={(id) => relationChannelLabel(id, id)} testId="penta" />
      <div className="mt-2 min-h-[56px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-penta-info={sel ?? ""}>
        {!c ? (
          <p className="text-slate-500">Bir Penta kanalına dokunun: kapılar ve taşıyan üyeler burada görünür.</p>
        ) : (
          <>
            <p className="font-bold text-slate-900">{relationChannelLabel(c.id, c.name)}{c.isCore ? " · çekirdek" : ""} <span className={c.defined ? "text-emerald-700" : "text-amber-700"}>· {c.defined ? "Güçlü yön" : "Boşluk var"}</span></p>
            <p className="mt-0.5 text-slate-700">{c.gateA}. kapı: {who(c.gateAHeldBy)} · {c.gateB}. kapı: {who(c.gateBHeldBy)}</p>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Mor çizgi: grupta tanımlı kanal (güçlü yön). Pembe kalın: 2/14 çekirdek. Kesikli gri: boşluk. Kapı yanındaki numaralar taşıyan üyeler; “boşluk” hiçbir üyenin taşımadığı kapı.</p>
    </div>
  );
}

export function ConnectionResultView({ a }: { a: RelationAnalysisView }) {
  const r = a.result as HdConnectionResult;
  const name = (t: "A" | "B") => a.participants[t === "A" ? 0 : 1]?.name ?? t;
  return (
    <div className="space-y-4" data-hd-rel-view="connection">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-center">
          <p className="text-2xl font-black tabular-nums text-indigo-800" data-hd-rel-total>{r.totalChannels}</p>
          <p className="text-[11px] font-semibold text-slate-600">Bağlı kanal</p>
        </div>
        {DYNAMIC_ORDER.map((d) => (
          <div key={d} className={`rounded-xl px-3 py-2 text-center ring-1 ${DYNAMIC_COLOR[d].chip}`} data-hd-rel-summary={d}>
            <p className="text-2xl font-black tabular-nums">{r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]]}</p>
            <p className="text-[11px] font-semibold leading-tight">{DYNAMIC_LABEL[d]}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <Card title="Birleşik İlişki BodyGraph'ı" attr="diagram">
          <CompositePanel a={a} r={r} />
          <p className="mt-2 text-xs font-semibold text-slate-700" data-hd-rel-definition>
            Birleşik Tanım (Combined Definition): {combinedDefinitionLabel(r.combinedDefinition)}
          </p>
        </Card>

        <Card title="Kanal Bağlantıları" attr="channels">
          {r.channels.length === 0 ? <p className="text-xs text-slate-500">İki kişi birlikte hiçbir kanalı tamamlamıyor.</p> : null}
          <div className="space-y-4">
            {DYNAMIC_ORDER.map((d) => {
              const list = r.channels.filter((c) => c.dynamic === d);
              if (list.length === 0) return null;
              return (
                <div key={d} data-hd-rel-dynamic={d}>
                  <p className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${DYNAMIC_COLOR[d].chip}`}>{DYNAMIC_LABEL[d]} · {list.length}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{DYNAMIC_DEFINITION[d]}</p>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((c) => {
                      const cc = channelCenterCodes(c.id);
                      return (
                        <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs" data-hd-rel-channel={c.id}>
                          <p className="font-bold text-slate-800">{relationChannelLabel(c.id, c.name)}</p>
                          <p className="mt-0.5 text-slate-500">
                            {cc ? `${shortCenter(cc[0])} ↔ ${shortCenter(cc[1])}` : null} · {circuitLabel(c.circuit)}
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

      <Card title="Birleşik Merkezler" attr="centers">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {r.centers.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs odd:bg-slate-50/70" data-hd-rel-center-row={c.code}>
              <span className="text-slate-700">{hdCenterLabelFromCode(c.code)}</span>
              <span className="flex flex-wrap items-center gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.defined ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                  {c.defined ? "Birleşik: Tanımlı" : "Birleşik: Tanımlı değil"}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                  {c.definedBy.length === 2 ? "Her ikisinde tanımlı" : c.definedBy.length === 1 ? `Yalnız ${c.definedBy[0]} (${name(c.definedBy[0])})` : "İkisinde de tanımlı değil"}
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
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${a.participants[i]?.name ?? "?"}`).join(", ") : "—");
  return (
    <div className="space-y-4" data-hd-rel-view="penta">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Güçlü yön (tanımlı kanal)", `${r.summary.definedChannels} / 6`, "defined"],
          ["Dolu Penta kapısı", `${r.summary.filledGates} / 12`, "filled"],
          ["2/14 çekirdek", r.summary.coreDefined ? "Tanımlı" : "Tanımlı değil", "core"],
          ["Eksik işlev (boşluk)", r.summary.gapGates.length ? r.summary.gapGates.join(", ") : "Yok", "gaps"],
        ].map(([l, v, k]) => (
          <div key={k} className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-center" data-hd-penta-summary={k}>
            <p className="text-lg font-black text-indigo-800">{v}</p>
            <p className="text-[11px] font-semibold text-slate-600">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card title="Penta Haritası" attr="diagram">
          <PentaPanel a={a} r={r} />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Düz çizgi: grupta tanımlı (güçlü yön) kanal. Kesikli: boşluk var. Pembe kalın çizgi: 2/14 çekirdek.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{PENTA_CORE_NOTE}</p>
        </Card>
        <div className="space-y-4">
          {(["upper", "lower"] as const).map((pos) => (
            <Card key={pos} title={PENTA_POSITION_LABEL[pos]} attr={`penta-${pos}`}>
              <p className="mb-2 text-[11px] text-slate-500">{PENTA_POSITION_DEFINITION[pos]}</p>
              <ul className="space-y-1.5">
                {r.channels.filter((c) => c.position === pos).map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs" data-hd-penta-channel={`${c.id}:${c.defined ? "defined" : "gap"}`}>
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{relationChannelLabel(c.id, c.name)}{c.isCore ? " · çekirdek" : ""}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.defined ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>
                        {c.defined ? "Güçlü yön" : "Boşluk var"}
                      </span>
                    </p>
                    <p className="mt-1 text-slate-700">Kapı {c.gateA}: <b>{who(c.gateAHeldBy)}</b></p>
                    <p className="text-slate-700">Kapı {c.gateB}: <b>{who(c.gateBHeldBy)}</b></p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      <Card title="Penta Kapıları ve Katkılar" attr="gates">
        <p className="mb-2 text-[11px] text-slate-500">{PENTA_GAP_NOTE}</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {r.gates.map((g) => (
            <li key={g.gate} className={`rounded-lg px-2.5 py-1.5 text-xs ${g.filled ? "bg-slate-50/80" : "bg-amber-50/70 ring-1 ring-amber-200"}`} data-hd-penta-gate={`${g.gate}:${g.filled ? "filled" : "gap"}`}>
              <span className="font-black tabular-nums text-indigo-800">{g.gate}</span>{" "}
              <span className="text-slate-700">{hdGateDefaultName(g.gate) ?? g.gateNameLocalized ?? g.gateName}</span>
              <span className="block text-slate-500">{g.filled ? who(g.heldBy) : "Boşluk — hiçbir üye taşımıyor"}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Üye Katkıları" attr="members">
        <ul className="space-y-1">
          {a.participants.map((p) => {
            const gates = r.gates.filter((g) => g.heldBy.includes(p.position)).map((g) => g.gate);
            return (
              <li key={p.position} className="text-xs text-slate-700" data-hd-penta-member={p.position}>
                <b>{participantTag(a.kind, p.position)}. {p.name}</b>: {gates.length ? `Penta kapıları ${gates.join(", ")}` : "Penta kapısı taşımıyor"}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

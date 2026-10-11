"use client";

/**
 * Aşama 6G — KP (Krishnamurti Paddhati) görünümleri. Tüm değerler Roxy'den gelir; burada HESAP YAPILMAZ.
 *
 * Harita: Roxy'de KP harita görseli yok (`<roxy-kp-chart>` yalnız tablo) → kendi Güney Hindistan (burç-sabit) düzenimiz. KP'de evler
 * Placidus cusp'larıyla başlar; burç kutuları ev DEĞİLDİR → her kutuda o burca düşen cusp başlangıçları ("1. ev 11°25′") ve gezegenler
 * derece sırasıyla gösterilir. CSS ızgara + sarmalanan etiketler → yoğun burçta bile üst üste binme yok.
 */

import { useMemo, useState } from "react";
import { KP_NODE_SIG_METHODS, KP_NODE_SIG_SOURCE, isKpNode, type KpBody, type KpChartTechnical, type KpCusp, type KpHoraryTechnical, type KpLevel, type KpNodeSigMethodId, type KpPoint, type KpRulingTechnical, type KpSignificators, type KpTransitTechnical } from "@/lib/astrology/model/kp";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import { GRAHA_TR, SIGN_TR_ABBR, grahaTrName } from "../_lib/kundliLocalize";
import type { KbLookup } from "./VedicPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const LEVELS: KpLevel[] = [1, 2, 3, 4];
const LEVEL_LABEL: Record<KpLevel, string> = { 1: "L1 · yıldızı sakinde", 2: "L2 · sakin", 3: "L3 · yıldızı sahipte", 4: "L4 · sahip" };
const AY: Record<string, string> = { "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };

/** Derece/dakika/saniye (KESİLİR, yuvarlanmaz: 29°59′59″ asla 30° olmaz). */
export function fmtDms(deg: number): string {
  const total = Math.floor(deg * 3600 + 1e-7);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}
const posLabel = (p: KpPoint) => `${SIGN_LABELS[p.rashi]} ${fmtDms(p.degreeInRashi)}`;
const g = (id: VedicGrahaId | null) => (id ? GRAHA_LABELS[id] : "—");
const gs = (id: VedicGrahaId | null) => (id ? GRAHA_TR[id].tr : "—");

function KbBox({ kb, empty }: { kb: ReturnType<KbLookup> | null; empty: string }) {
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-kp-kb">
      <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam (KP)</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
      ) : kb.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {kb.map((e) => (
            <li key={`${e.topicKey}-${e.title}`} className="rounded-lg bg-white px-2 py-1 text-xs">
              <div className="font-medium text-indigo-900">{e.topicLabel}</div>
              <div className="font-semibold text-slate-800">{e.title}</div>
              <p className="whitespace-pre-line text-slate-700">{e.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Güney Hindistan burç-sabit KP haritası ───────────────────────────────────
/** 4×4 ızgarada burç konumları (satır, sütun): Balık sol üst, saat yönünde. Ortadaki 2×2 başlık. */
const SOUTH_CELLS: Record<SignId, [number, number]> = {
  pisces: [1, 1], aries: [1, 2], taurus: [1, 3], gemini: [1, 4],
  aquarius: [2, 1], cancer: [2, 4],
  capricorn: [3, 1], leo: [3, 4],
  sagittarius: [4, 1], scorpio: [4, 2], libra: [4, 3], virgo: [4, 4],
};
export type KpSel = { kind: "cusp"; house: number } | { kind: "body"; id: VedicGrahaId };
type ChartItem = { key: string; lon: number; sel: KpSel; label: string; title: string; cusp: boolean; strong?: boolean };

export function kpChartItems(cusps: KpCusp[], bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[]): Record<SignId, ChartItem[]> {
  const out = Object.fromEntries(SIGN_IDS.map((s) => [s, [] as ChartItem[]])) as Record<SignId, ChartItem[]>;
  for (const c of cusps) {
    out[c.rashi].push({ key: `c${c.house}`, lon: c.longitude, sel: { kind: "cusp", house: c.house }, cusp: true, strong: c.house === 1, label: `${c.house}. ev ${Math.floor(c.degreeInRashi)}°${String(Math.floor((c.degreeInRashi % 1) * 60)).padStart(2, "0")}′`, title: `${c.house}. ev başlangıcı (Placidus cusp) · ${posLabel(c)} · sub lord ${gs(c.subLord)}` });
  }
  for (const b of bodies) {
    out[b.rashi].push({ key: b.id, lon: b.longitude, sel: { kind: "body", id: b.id }, cusp: false, label: `${GRAHA_TR[b.id].abbr} ${Math.floor(b.degreeInRashi)}°${String(Math.floor((b.degreeInRashi % 1) * 60)).padStart(2, "0")}′${b.retrograde ? "ʳ" : ""}`, title: `${grahaTrName(b.id)} · ${posLabel(b)}${b.house ? ` · ${b.house}. ev (Placidus)` : ""} · star ${gs(b.starLord)} · sub ${gs(b.subLord)}${b.retrograde ? " · vakri" : ""}` });
  }
  for (const s of SIGN_IDS) out[s].sort((a, b) => a.lon - b.lon || (a.cusp ? -1 : 1));
  return out;
}

export function KpSouthChart({ cusps, bodies, center, sel, onSel }: { cusps: KpCusp[]; bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[]; center: React.ReactNode; sel: KpSel | null; onSel: (s: KpSel) => void }) {
  const items = useMemo(() => kpChartItems(cusps, bodies), [cusps, bodies]);
  const isSel = (s: KpSel) => !!sel && sel.kind === s.kind && (s.kind === "cusp" ? sel.kind === "cusp" && sel.house === s.house : sel.kind === "body" && sel.id === s.id);
  return (
    <div className="mx-auto w-full max-w-[560px]" data-testid="astro-kp-chart">
      <div className="grid grid-cols-4 grid-rows-[repeat(4,minmax(5.5rem,auto))] overflow-hidden rounded-xl sm:grid-rows-[repeat(4,minmax(8.5rem,auto))] border border-slate-300 bg-white text-[10px] sm:text-xs">
        {SIGN_IDS.map((s) => {
          const [r, c] = SOUTH_CELLS[s];
          const hasAsc = items[s].some((x) => x.key === "c1");
          return (
            <div key={s} style={{ gridRow: r, gridColumn: c }} className={`flex min-w-0 flex-col gap-0.5 overflow-hidden border border-slate-200 p-1 ${hasAsc ? "bg-amber-50" : ""}`} data-kp-sign={s}>
              <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]" title={SIGN_LABELS[s]}>
                <span>{SIGN_TR_ABBR[s]}</span>
                <span aria-hidden>{SIGN_GLYPHS[s]}</span>
              </div>
              <div className="flex min-w-0 flex-wrap content-start gap-0.5">
                {items[s].map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    title={it.title}
                    onClick={() => onSel(it.sel)}
                    data-kp-item={it.key}
                    className={`inline-flex min-h-[24px] max-w-full items-center truncate rounded px-1 leading-tight ${it.cusp ? `border ${it.strong ? "border-amber-500 font-bold text-amber-900" : "border-amber-300 text-amber-800"} bg-white` : "bg-slate-100 font-semibold text-slate-900"} ${isSel(it.sel) ? "ring-2 ring-violet-500" : ""}`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ gridRow: "2 / span 2", gridColumn: "2 / span 2" }} className="flex flex-col items-center justify-center gap-0.5 border border-slate-200 bg-slate-50 p-2 text-center text-slate-600">
          {center}
        </div>
      </div>
      <p className="mt-1 text-center text-[11px] leading-snug text-slate-500">
        Burç kutuları sabit (Güney Hindistan). Çerçeveli etiket = Placidus ev başlangıcı (cusp); gri = graha. KP evleri burç kutusu değildir — bir burçta iki cusp
        olabilir, bir ev iki burca yayılabilir. ʳ vakri. Ayrıntı için etikete dokunun.
      </p>
    </div>
  );
}

function LordCells({ p, subSub = true }: { p: KpPoint; subSub?: boolean }) {
  return (
    <>
      <td className={`${td} whitespace-nowrap`}>{gs(p.signLord)}</td>
      <td className={`${td} whitespace-nowrap`}>{gs(p.starLord)}</td>
      <td className={`${td} whitespace-nowrap font-semibold text-indigo-900`}>{gs(p.subLord)}</td>
      {subSub && <td className={`${td} whitespace-nowrap`}>{gs(p.subSubLord)}</td>}
      <td className={`${td} tabular-nums`}>{p.kpNumber}</td>
    </>
  );
}
/** Sub-sub sütunu yalnız Roxy en az bir noktada verdiyse (horary cusp'larında YOK → boş sütun gösterilmez). */
const LordHead = ({ subSub }: { subSub: boolean }) => (
  <>
    <th className={th}>Burç lordu</th>
    <th className={th}>Star lord</th>
    <th className={th}>Sub lord</th>
    {subSub && <th className={th}>Sub-sub</th>}
    <th className={th}>KP no.</th>
  </>
);

export function KpCuspTable({ cusps, sel, onSel, testId = "astro-kp-cusp-table" }: { cusps: KpCusp[]; sel: KpSel | null; onSel: (s: KpSel) => void; testId?: string }) {
  const subSub = cusps.some((c) => c.subSubLord !== null);
  return (
    <div className={`${card} overflow-x-auto`}>
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Ev başlangıçları (Placidus cusp)</h4>
      <table className="min-w-full" data-testid={testId}>
        <thead>
          <tr>
            <th className={th}>Ev</th>
            <th className={th}>Cusp derecesi</th>
            <th className={th}>Nakshatra</th>
            <LordHead subSub={subSub} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cusps.map((c) => (
            <tr key={c.house} className={`cursor-pointer ${sel?.kind === "cusp" && sel.house === c.house ? "bg-amber-50" : ""}`} onClick={() => onSel({ kind: "cusp", house: c.house })} data-kp-cusp={c.house}>
              <td className={`${td} font-semibold`}>{c.house}.</td>
              <td className={`${td} whitespace-nowrap`}>
                {SIGN_GLYPHS[c.rashi]} {posLabel(c)}
              </td>
              <td className={`${td} whitespace-nowrap text-xs`}>
                {NAKSHATRA_LABELS[c.nakshatra.id]}
                {c.nakshatra.pada ? ` · ${c.nakshatra.pada}` : ""}
              </td>
              <LordCells p={c} subSub={subSub} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KpBodyTable({ bodies, sel, onSel, title = "Gezegenler", testId = "astro-kp-body-table" }: { bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[]; sel: KpSel | null; onSel: (s: KpSel) => void; title?: string; testId?: string }) {
  const hasHouse = bodies.some((b) => b.house !== undefined);
  const subSub = bodies.some((b) => b.subSubLord !== null);
  return (
    <div className={`${card} overflow-x-auto`}>
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{title}</h4>
      <table className="min-w-full" data-testid={testId}>
        <thead>
          <tr>
            <th className={th}>Graha</th>
            <th className={th}>Derece</th>
            {hasHouse && <th className={th}>Ev (Placidus)</th>}
            <LordHead subSub={subSub} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bodies.map((b) => (
            <tr key={b.id} className={`cursor-pointer ${sel?.kind === "body" && sel.id === b.id ? "bg-amber-50" : ""}`} onClick={() => onSel({ kind: "body", id: b.id })} data-kp-body={b.id}>
              <td className={`${td} whitespace-nowrap font-medium`}>
                {g(b.id)}
                {b.retrograde ? <span className="ml-1 text-[11px] text-rose-700">vakri</span> : null}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {SIGN_GLYPHS[b.rashi]} {posLabel(b)}
              </td>
              {hasHouse && <td className={`${td} tabular-nums`}>{b.house}.</td>}
              <LordCells p={b} subSub={subSub} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 6.1A: Rahu/Ketu yöntem etiketi (her düğüm satırında listenin hangi Roxy kuralından geldiği) ─────────────
export function KpNodeMethodTag({ method }: { method: KpNodeSigMethodId }) {
  const m = KP_NODE_SIG_METHODS[method];
  return (
    <span
      className={`ml-1 inline-block whitespace-nowrap rounded border px-1 text-[10px] font-medium ${method === "agent_houses" ? "border-amber-400 bg-amber-50 text-amber-900" : method === "agent" ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-300 bg-slate-50 text-slate-700"}`}
      title={`${m.label}. ${m.status}`}
      data-kp-node-method={method}
    >
      {m.short}
    </span>
  );
}
export function KpNodeMethodLegend({ methods, context }: { methods: KpNodeSigMethodId[]; context: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-700" data-testid="astro-kp-node-method">
      <p className="font-semibold text-slate-800">Rahu/Ketu significator yöntemi — {context}</p>
      {methods.map((id) => (
        <p key={id} className="mt-1">
          <KpNodeMethodTag method={id} /> <strong>{KP_NODE_SIG_METHODS[id].label}.</strong> {KP_NODE_SIG_METHODS[id].detail} <em>{KP_NODE_SIG_METHODS[id].status}</em>
        </p>
      ))}
      <p className="mt-1 text-slate-500">Roxy uçları düğümler için farklı kurallar kullanır; bu yüzden aynı düğümün ev listesi harita, dasha ve ruling ekranlarında farklı olabilir. Listeler birbirine dönüştürülmez.</p>
    </div>
  );
}

export function KpSignificatorTables({ s, note, nodeMethod, agentMethod, context }: { s: KpSignificators; note: string; nodeMethod: KpNodeSigMethodId; agentMethod?: KpNodeSigMethodId; context: string }) {
  const [view, setView] = useState<"planet" | "house">("planet");
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="astro-kp-significators">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-700">Significator (KP 4 düzey; Roxy)</h4>
        <div className="flex gap-1" role="tablist" aria-label="Significator görünümü">
          {(["planet", "house"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-[32px] rounded-lg border px-2 py-1 text-xs ${view === v ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}>
              {v === "planet" ? "Gezegen → evler" : "Ev → gezegenler"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">{note}</p>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full" data-testid={`astro-kp-sig-${view}`}>
          <thead>
            <tr>
              <th className={th}>{view === "planet" ? "Graha" : "Ev"}</th>
              {LEVELS.map((l) => (
                <th key={l} className={th}>
                  {LEVEL_LABEL[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view === "planet"
              ? s.planets.map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} whitespace-nowrap font-medium`}>
                      {gs(p.id)}
                      {isKpNode(p.id) && <KpNodeMethodTag method={nodeMethod} />}
                    </td>
                    {LEVELS.map((l) => (
                      <td key={l} className={`${td} tabular-nums text-xs`}>
                        {p.levels[l].join(", ") || "—"}
                        {p.agent && p.agent.levels[l].some((h) => !p.levels[l].includes(h)) ? (
                          <span className="ml-1 text-indigo-700" title={`${KP_NODE_SIG_METHODS[agentMethod ?? "agent"].label} — Roxy ajan eki`}>+{p.agent.levels[l].filter((h) => !p.levels[l].includes(h)).join(",")}</span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))
              : s.houses.map((h) => (
                  <tr key={h.house}>
                    <td className={`${td} font-semibold`}>{h.house}.</td>
                    {LEVELS.map((l) => (
                      <td key={l} className={`${td} text-xs`}>
                        {[...new Set(h.levels[l])].map((x) => GRAHA_TR[x].abbr).join(", ") || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <KpNodeMethodLegend methods={agentMethod ? [nodeMethod, agentMethod] : [nodeMethod]} context={context} />
    </div>
  );
}

const SIG_NOTE =
  "L1 = ev sakininin yıldızındaki grahalar (en güçlü) · L2 = evdeki grahalar · L3 = ev sahibinin yıldızındaki grahalar · L4 = ev sahibi (cusp burç lordu).";

function Detail({ sel, cusps, bodies, sig, kbLookup }: { sel: KpSel | null; cusps: KpCusp[]; bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[]; sig?: KpSignificators; kbLookup?: KbLookup | null }) {
  if (!sel) return <p className="text-sm text-slate-500">Haritada veya tabloda bir cusp/graha seçin.</p>;
  if (sel.kind === "cusp") {
    const c = cusps.find((x) => x.house === sel.house)!;
    const kb = kbLookup ? kbLookup([`kp_cusp_sublord:${c.house}:${c.subLord}`, `kp_cusp_starlord:${c.house}:${c.starLord}`, `kp_cusp_rashi:${c.house}:${c.rashi}`]) : null;
    const signif = sig?.houses.find((h) => h.house === c.house);
    return (
      <>
        <h4 className="font-semibold text-amber-900">{c.house}. ev başlangıcı (cusp)</h4>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Derece</dt>
          <dd>{posLabel(c)}</dd>
          <dt className="text-slate-500">Nakshatra</dt>
          <dd>
            {NAKSHATRA_LABELS[c.nakshatra.id]}
            {c.nakshatra.pada ? ` · ${c.nakshatra.pada}. pada` : ""}
          </dd>
          <dt className="text-slate-500">Lord zinciri</dt>
          <dd>
            {g(c.signLord)} → {g(c.starLord)} → <strong>{g(c.subLord)}</strong>
            {c.subSubLord ? ` → ${g(c.subSubLord)}` : ""} · KP {c.kpNumber}
          </dd>
          {signif && (
            <>
              <dt className="text-slate-500">Significator</dt>
              <dd>{LEVELS.map((l) => `L${l}: ${[...new Set(signif.levels[l])].map((x) => GRAHA_TR[x].abbr).join(", ") || "—"}`).join(" · ")}</dd>
            </>
          )}
        </dl>
        <p className="mt-1 text-xs text-slate-500">KP: cusp sub lordu bu evin konusunun vaadini okumak için kullanılır — yorum uzmana aittir; Yaşam Sistemi hüküm üretmez.</p>
        <KbBox kb={kb} empty="Bu cusp için KP Bilgi Bankası kaydınız yok." />
      </>
    );
  }
  const b = bodies.find((x) => x.id === sel.id)!;
  const ps = sig?.planets.find((p) => p.id === b.id);
  const kb = kbLookup ? kbLookup([`kp_planet_starlord:${b.id}:${b.starLord}`, `kp_planet_sublord:${b.id}:${b.subLord}`, ...(b.house ? [`kp_planet_in_house:${b.id}:${b.house}`] : []), ...(ps ? [...new Set(LEVELS.flatMap((l) => ps.levels[l]))].map((h) => `kp_significator:${b.id}:${h}`) : [])]) : null;
  return (
    <>
      <h4 className="font-semibold text-amber-900">{grahaTrName(b.id)}</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">Derece</dt>
        <dd>
          {posLabel(b)}
          {b.retrograde ? " · vakri" : b.retrograde === null ? " · düğüm (ortalama düğüm her zaman geri hareketli)" : ""}
        </dd>
        {b.house !== undefined && (
          <>
            <dt className="text-slate-500">Ev</dt>
            <dd>{b.house}. ev (Placidus)</dd>
          </>
        )}
        <dt className="text-slate-500">Lord zinciri</dt>
        <dd>
          {g(b.signLord)} → {g(b.starLord)} → <strong>{g(b.subLord)}</strong>
          {b.subSubLord ? ` → ${g(b.subSubLord)}` : ""} · KP {b.kpNumber}
        </dd>
        {ps && (
          <>
            <dt className="text-slate-500">Gösterdiği evler</dt>
            <dd>{LEVELS.map((l) => `L${l}: ${ps.levels[l].join(", ") || "—"}`).join(" · ")}</dd>
          </>
        )}
      </dl>
      <KbBox kb={kb} empty="Bu graha için KP Bilgi Bankası kaydınız yok." />
    </>
  );
}

function Center({ title, lines }: { title: string; lines: string[] }) {
  return (
    <>
      <div className="text-xs font-bold text-slate-800 sm:text-sm">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-[9px] leading-tight sm:text-[11px]">
          {l}
        </div>
      ))}
    </>
  );
}

// ─── KP doğum haritası ───────────────────────────────────────────────────────
export function KpChartPanel({ t, kbLookup }: { t: KpChartTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<KpSel | null>({ kind: "cusp", house: 1 });
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-chart-panel">
      <p className="text-sm text-slate-700">
        <strong>KP doğum haritası</strong> · sidereal, {AY[t.frame.ayanamsa]} {fmtDms(t.frame.ayanamsaDegrees)} · ev sistemi <strong>Placidus</strong> (Roxy KP&apos;de tek seçenek) ·
        düğüm {t.nodeType === "mean" ? "ortalama" : "gerçek"} · Lagna {posLabel(t.ascendant)}
      </p>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <KpSouthChart cusps={t.cusps} bodies={t.bodies} sel={sel} onSel={setSel} center={<Center title="KP · Placidus" lines={[AY[t.frame.ayanamsa], `Lagna ${SIGN_LABELS[t.ascendant.rashi]}`]} />} />
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="KP seçili ayrıntı" data-testid="astro-kp-detail">
          <Detail sel={sel} cusps={t.cusps} bodies={t.bodies} sig={t.significators} kbLookup={kbLookup} />
        </section>
      </div>
      <KpCuspTable cusps={t.cusps} sel={sel} onSel={setSel} />
      <KpBodyTable bodies={t.bodies} sel={sel} onSel={setSel} />
      <KpSignificatorTables s={t.significators} note={SIG_NOTE} nodeMethod={KP_NODE_SIG_SOURCE.chart} context="KP haritası (kp/chart ucu)" />
    </div>
  );
}

// ─── Ruling planets ──────────────────────────────────────────────────────────
/** 9A-P2-04: Aşama 9A öncesi kayıt + gözlem yeri ≠ doğum yeri → significator'lar gözlem yeri haritasından (yanlış konum). */
export function kpRulingLegacyPlaceMismatch(t: KpRulingTechnical, birthplace: { lat: number; lon: number } | null | undefined): boolean {
  if (t.significatorsOmitted || !birthplace || t.significators.length === 0) return false;
  return Math.abs(t.place.latitude - birthplace.lat) > 1e-6 || Math.abs(t.place.longitude - birthplace.lon) > 1e-6;
}

export function KpRulingPanel({ t, kbLookup, placeLabel, birthplace }: { t: KpRulingTechnical; kbLookup?: KbLookup | null; placeLabel?: string | null; birthplace?: { lat: number; lon: number } | null }) {
  const legacyMismatch = kpRulingLegacyPlaceMismatch(t, birthplace);
  const kb = kbLookup ? kbLookup(t.rulingPlanets.map((r) => `kp_ruling_planet:${r}`)) : null;
  const local = `${t.at.local.slice(8, 10)}.${t.at.local.slice(5, 7)}.${t.at.local.slice(0, 4)} ${t.at.local.slice(11, 16)}`;
  const row = (label: string, l: KpRulingTechnical["moon"]) => (
    <tr>
      <td className={`${td} font-medium`}>{label}</td>
      <td className={td}>{gs(l.sign)}</td>
      <td className={td}>{gs(l.star)}</td>
      <td className={`${td} font-semibold text-indigo-900`}>{gs(l.sub)}</td>
      <td className={td}>{gs(l.subSub)}</td>
    </tr>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-ruling-panel">
      <p className="text-sm text-slate-700">
        <strong>KP ruling planets</strong> · {t.at.utc.slice(8, 10)}.{t.at.utc.slice(5, 7)}.{t.at.utc.slice(0, 4)} {t.at.utc.slice(11, 16)} UTC (doğum ofsetinde {local}) · gözlem yeri{" "}
        {placeLabel ? `${placeLabel} (${t.place.latitude.toFixed(4)}, ${t.place.longitude.toFixed(4)})` : `${t.place.latitude.toFixed(4)}, ${t.place.longitude.toFixed(4)}`} · KP-Newcomb (Roxy dahili)
      </p>
      <div className="flex flex-wrap gap-2" data-testid="astro-kp-ruling-list">
        {t.rulingPlanets.map((r, i) => (
          <span key={r} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900">
            {i + 1}. {grahaTrName(r)}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Roxy sırası (güçlüden zayıfa). Küme klasik 5 öğeden kurulur: gün lordu (gün doğumu esaslı vara), Ay burç + yıldız lordu, Lagna burç + yıldız lordu. Sub lordlar aşağıda
        gösterilir ama kümeye katılmaz.
      </p>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full" data-testid="astro-kp-ruling-table">
          <thead>
            <tr>
              <th className={th}>Nokta</th>
              <th className={th}>Burç lordu</th>
              <th className={th}>Star lord</th>
              <th className={th}>Sub lord</th>
              <th className={th}>Sub-sub</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className={`${td} font-medium`}>Gün lordu</td>
              <td className={td} colSpan={4}>
                {gs(t.dayLord)}
              </td>
            </tr>
            {row("Ay", t.moon)}
            {row("Lagna (an)", t.lagna)}
          </tbody>
        </table>
      </div>
      {t.significatorsOmitted === "place_differs" && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="astro-kp-ruling-sig-omitted">
          Gözlem yeri doğum yerinden farklı olduğu için natal significator&apos;lar bu hesapta gösterilmez: sağlayıcı bu uçta natal haritayı da gözlem
          yerinde kurar, bu da yanlış konum olur. Natal significator&apos;lar için &quot;KP doğum haritası&quot; tekniğini kullanın veya ruling&apos;i doğum yerinde hesaplayın.
        </p>
      )}
      {legacyMismatch && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="astro-kp-ruling-legacy-warning">
          Uyarı: Bu eski kayıtta gözlem yeri doğum yerinden farklı; aşağıdaki significator&apos;lar doğum yeri yerine gözlem yeri haritasından hesaplanmıştır ve natal
          significator olarak kullanılmamalıdır.
        </p>
      )}
      {t.significators.length > 0 && (
      <div className={`${card} overflow-x-auto`}>
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Ruling planet&apos;lerin natal significator&apos;ları (Roxy, güç sırası)</h4>
        <table className="min-w-full" data-testid="astro-kp-ruling-sig">
          <tbody className="divide-y divide-slate-100">
            {t.significators.map((s) => (
              <tr key={s.id}>
                <td className={`${td} whitespace-nowrap font-medium`}>
                  {gs(s.id)}
                  {isKpNode(s.id) && <KpNodeMethodTag method={KP_NODE_SIG_SOURCE.ruling} />}
                </td>
                <td className={`${td} tabular-nums`}>{s.houses.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {t.significators.some((x) => isKpNode(x.id)) && <KpNodeMethodLegend methods={[KP_NODE_SIG_SOURCE.ruling]} context="ruling planets (kp/ruling-planets ucu)" />}
      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm">
        <KbBox kb={kb} empty="Bu ruling planet'ler için KP Bilgi Bankası kaydınız yok." />
      </section>
    </div>
  );
}

// ─── KP transit (efemeris; KISMİ) ────────────────────────────────────────────
export function KpTransitPanel({ t, kbLookup }: { t: KpTransitTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<KpSel | null>({ kind: "body", id: "moon" });
  const b = sel?.kind === "body" ? t.bodies.find((x) => x.id === sel.id) : null;
  const kb = b && kbLookup ? kbLookup([`kp_transit_starlord:${b.id}:${b.starLord}`, `kp_transit_sublord:${b.id}:${b.subLord}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-transit-panel">
      <p className="text-sm text-slate-700">
        <strong>KP transit</strong> · {t.at.utc.slice(8, 10)}.{t.at.utc.slice(5, 7)}.{t.at.utc.slice(0, 4)} {t.at.utc.slice(11, 16)} UTC · {AY[t.frame.ayanamsa]} {fmtDms(t.frame.ayanamsaDegrees)}
      </p>
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-testid="astro-kp-transit-partial">
        <strong>Kısmi destek:</strong> Roxy bu an için KP hiyerarşili gökyüzünü (star / sub / sub-sub lord) verir; natal cusp&apos;lara göre ev yerleşimi ve transit–natal ilişki
        analizi Roxy&apos;de YOKTUR ve Yaşam Sistemi bunu hesaplamaz. Batı transiti ve Vedik Gochara ayrı tekniklerdir.
      </p>
      <KpSouthChart cusps={[]} bodies={t.bodies} sel={sel} onSel={setSel} center={<Center title="KP transit" lines={["gökyüzü (an)", AY[t.frame.ayanamsa]]} />} />
      <KpBodyTable bodies={t.bodies} sel={sel} onSel={setSel} title="Transit gezegenler (KP)" testId="astro-kp-transit-table" />
      {b && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm">
          <h4 className="font-semibold text-amber-900">Transit {grahaTrName(b.id)}</h4>
          <p>
            {posLabel(b)} · {g(b.signLord)} → {g(b.starLord)} → <strong>{g(b.subLord)}</strong> → {g(b.subSubLord)} · KP {b.kpNumber}
            {b.retrograde ? " · vakri" : ""}
          </p>
          <KbBox kb={kb} empty="Bu transit için KP Bilgi Bankası kaydınız yok." />
        </section>
      )}
    </div>
  );
}

// ─── KP horary ───────────────────────────────────────────────────────────────
export function KpHoraryPanel({ t, kbLookup, placeLabel }: { t: KpHoraryTechnical; kbLookup?: KbLookup | null; placeLabel?: string | null }) {
  const [sel, setSel] = useState<KpSel | null>({ kind: "cusp", house: 1 });
  const kbNum = kbLookup ? kbLookup([`kp_horary_number:${t.horaryNumber}`]) : null;
  const cuspKb: KbLookup | null = kbLookup ? (keys) => kbLookup([...keys.filter((k) => !k.startsWith("kp_cusp_")), ...keys.filter((k) => k.startsWith("kp_cusp_sublord:")).map((k) => k.replace("kp_cusp_sublord:", "kp_horary_cusp_sublord:"))]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-horary-panel">
      <p className="text-sm text-slate-700">
        <strong>KP horary · sayı {t.horaryNumber}</strong> · soru anı {t.at.utc.slice(8, 10)}.{t.at.utc.slice(5, 7)}.{t.at.utc.slice(0, 4)} {t.at.utc.slice(11, 16)} UTC · değerlendirme yeri{" "}
        {placeLabel ?? `${t.place.latitude.toFixed(4)}, ${t.place.longitude.toFixed(4)}`} · {AY[t.frame.ayanamsa]} · Placidus
      </p>
      <p className="text-xs text-slate-500" data-testid="astro-kp-horary-method">
        Doğum verisi KULLANILMAZ. Sayı (1–249) KP alt bölümünü seçer: Lagna = dilimin orta noktası ({fmtDms(t.span.from % 30)}–{fmtDms(t.span.to % 30)} {SIGN_LABELS[t.ascendant.rashi]} →{" "}
        {posLabel(t.ascendant)}); diğer 11 cusp bu Lagna&apos;dan değerlendirme yerinin enleminde, gezegenler soru anının gökyüzünden (Roxy). Ruling planets soru anının
        ZAMAN Lagna&apos;sından okunur (sayıdan değil).
      </p>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <KpSouthChart cusps={t.cusps} bodies={t.bodies} sel={sel} onSel={setSel} center={<Center title={`Horary ${t.horaryNumber}`} lines={["KP · Placidus", `Lagna ${SIGN_LABELS[t.ascendant.rashi]}`]} />} />
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Horary seçili ayrıntı">
          <Detail sel={sel} cusps={t.cusps} bodies={t.bodies} sig={t.significators} kbLookup={cuspKb} />
          <KbBox kb={kbNum} empty="Bu horary sayısı için KP Bilgi Bankası kaydınız yok." />
        </section>
      </div>
      <KpCuspTable cusps={t.cusps} sel={sel} onSel={setSel} testId="astro-kp-horary-cusps" />
      <KpBodyTable bodies={t.bodies} sel={sel} onSel={setSel} testId="astro-kp-horary-bodies" />
      <KpSignificatorTables
        s={t.significators}
        note={`${SIG_NOTE} Horary'de düğümler için tablo sade kuralı gösterir; mavi '+' ile işaretli evler Roxy'nin aynı yanıtta verdiği ajan ekli listeden gelir.`}
        nodeMethod={KP_NODE_SIG_SOURCE.horaryLevels}
        agentMethod={KP_NODE_SIG_SOURCE.horaryAgent}
        context="KP horary (kp/horary ucu)"
      />
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" data-testid="astro-kp-horary-ruling">
        <strong>Ruling planets (soru anı):</strong> {t.ruling.rulingPlanets.map((r) => GRAHA_TR[r].tr).join(" · ")}
      </div>
    </div>
  );
}

export type { KpBody };

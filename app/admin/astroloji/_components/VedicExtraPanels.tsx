"use client";

/**
 * Aşama 5F — Graha Drishti · Ashtakavarga · Shadbala · Janma Panchanga görünümleri. Yalnız teknik katman
 * (sağlayıcı anlatısı ayrı "Roxy Otomatik Yorumu" panelinde, yetkiye bağlı). Değerler Roxy'den gelir; burada
 * hesap YAPILMAZ — yalnız tablo/ızgara/çubuk olarak düzenlenir.
 */

import { useState } from "react";
import {
  SHADBALA_COMPONENTS,
  type KakshaLord,
  type ShadbalaComponent,
  type VedicAshtakavargaTechnical,
  type VedicDrishtiTechnical,
  type VedicGrahaId,
  type VedicPanchangaTechnical,
  type VedicShadbalaTechnical,
  type VedicTransitTechnical,
} from "@/lib/astrology/model/vedic";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, KARANA_LABELS, NAKSHATRA_LABELS, NITYA_YOGA_LABELS, TITHI_LABELS } from "@/lib/astrology/topics/vedic";
import type { KbLookup } from "./VedicPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const lbl = (id: VedicGrahaId | "lagna") => (id === "lagna" ? "Lagna" : GRAHA_LABELS[id]);

function KbBox({ kb, empty }: { kb: ReturnType<KbLookup> | null; empty: string }) {
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-extra-kb">
      <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
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

// ─── Graha Drishti ──────────────────────────────────────────────────────────
export function VedicDrishtiPanel({ t, kbLookup }: { t: VedicDrishtiTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState(0);
  const a = t.aspects[Math.min(sel, t.aspects.length - 1)] ?? null;
  const kb = a && kbLookup ? kbLookup([`graha_drishti:${a.from}:${a.to}`]) : null;
  const isMutual = (x: { from: VedicGrahaId; to: VedicGrahaId }) => t.mutual.some((m) => (m.a === x.from && m.b === x.to) || (m.a === x.to && m.b === x.from));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-drishti-panel">
      <p className="text-sm text-slate-700">
        <strong>Graha Drishti</strong> · Lahiri (sabit) · Roxy yöntemi: <strong>derece + orb</strong> (herkes 7.; Mars 4./8.; Jüpiter 5./9.; Satürn 3./10.). Bütün-burç (rashi)
        drishti listesi değildir; orb dışındaki bakışlar listelenmez.
      </p>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-drishti-table">
            <thead>
              <tr>
                <th className={th}>Bakan</th>
                <th className={th}>Bakılan</th>
                <th className={th}>Tür</th>
                <th className={th}>Orb</th>
                <th className={th}>Güç</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.aspects.length === 0 && (
                <tr>
                  <td className={td} colSpan={5}>
                    Orb içinde bakış yok.
                  </td>
                </tr>
              )}
              {t.aspects.map((x, i) => (
                <tr key={`${x.from}-${x.to}-${x.type}`} className={`cursor-pointer ${sel === i ? "bg-amber-50" : ""}`} onClick={() => setSel(i)} data-drishti={`${x.from}-${x.to}`}>
                  <td className={`${td} font-medium`}>{GRAHA_LABELS[x.from]}</td>
                  <td className={td}>{GRAHA_LABELS[x.to]}</td>
                  <td className={td}>
                    {x.type}.{isMutual(x) ? <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">karşılıklı</span> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{x.orb.toFixed(2)}°</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded bg-slate-100" aria-hidden>
                        <div className="h-full bg-indigo-400" style={{ width: `${x.strength}%` }} />
                      </div>
                      <span className="text-xs">%{Math.round(x.strength)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili bakış">
          {a ? (
            <>
              <h4 className="font-semibold text-amber-900">
                {GRAHA_LABELS[a.from]} → {GRAHA_LABELS[a.to]} · {a.type}. bakış
              </h4>
              <p className="text-xs text-slate-600">
                {GRAHA_LABELS[a.from]} {formatDegree(t.positions.find((p) => p.id === a.from)!.longitude % 30)} {SIGN_LABELS[t.positions.find((p) => p.id === a.from)!.rashi]} ·{" "}
                {GRAHA_LABELS[a.to]} {formatDegree(t.positions.find((p) => p.id === a.to)!.longitude % 30)} {SIGN_LABELS[t.positions.find((p) => p.id === a.to)!.rashi]} · orb {a.orb.toFixed(2)}°
              </p>
              <KbBox kb={kb} empty="Bu bakış için Bilgi Bankası kaydınız yok." />
            </>
          ) : (
            <p className="text-slate-500">Bakış seçilmedi.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── 5.1A Gochara (Vedik transit) ───────────────────────────────────────────
const KAKSHA_LORD_LABEL = (l: KakshaLord) => (l === "lagna" ? "Lagna" : GRAHA_LABELS[l]);
const drishtiLabel = (n: number) => (n === 1 ? "aynı rashi" : `${n}.`);
export function VedicTransitPanel({ t, kbLookup }: { t: VedicTransitTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<VedicGrahaId>(t.slow[0] ?? t.transits[0]?.id ?? "sun");
  const x = t.transits.find((y) => y.id === sel) ?? t.transits[0];
  const kb = x && kbLookup ? kbLookup([`gochara_graha_in_rashi:${x.id}:${x.rashi}`, `gochara_from_moon:${x.id}:${x.houseFromMoon}`, `gochara_in_bhava:${x.id}:${x.natalHouse}`, ...x.drishti.map((d) => `gochara_drishti:${x.id}:${d.to}`)]) : null;
  const local = `${t.at.local.slice(8, 10)}.${t.at.local.slice(5, 7)}.${t.at.local.slice(0, 4)} ${t.at.local.slice(11, 16)}`;
  const off = `${t.at.utcOffsetHours >= 0 ? "+" : "−"}${Math.abs(t.at.utcOffsetHours)}`;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-transit-panel">
      <p className="text-sm text-slate-700">
        <strong>Gochara</strong> · {t.at.utc.slice(8, 10)}.{t.at.utc.slice(5, 7)}.{t.at.utc.slice(0, 4)} {t.at.utc.slice(11, 16)} UTC (doğum ofsetinde {local}, UTC{off}) · sidereal, Lahiri
        (sabit) · Janma Rashi <strong>{SIGN_LABELS[t.janmaRashi]}</strong> · Lagna <strong>{SIGN_LABELS[t.lagnaRashi]}</strong>
      </p>
      <p className="text-xs text-slate-500">
        Klasik Gochara Janma Rashi&apos;den (natal Ay rashisi) sayılır; Lagna&apos;dan ev ayrıca gösterilir. Drishti bütün-burç (Parashari): herkes 7.; Mars 4./8.; Jüpiter 5./9.;
        Satürn 3./10.; Rahu/Ketu bakış atmaz. Batı açıları (kare/üçgen) bu görünümde YOKTUR.
      </p>
      <div className="min-w-0 overflow-x-auto" data-testid="astro-vedic-transit-moonstrip">
        <ol className="grid min-w-[36rem] grid-cols-12 gap-1">
          {Array.from({ length: 12 }, (_, i) => {
            const rashi = SIGN_IDS[(SIGN_IDS.indexOf(t.janmaRashi) + i) % 12];
            const here = t.transits.filter((y) => y.houseFromMoon === i + 1);
            return (
              <li key={i} className={`rounded-lg border px-1 py-1 text-center ${i === 0 ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`} title={`Janma Rashi'den ${i + 1}. ev · ${SIGN_LABELS[rashi]}`}>
                <div className="text-[10px] font-semibold text-slate-500">{i + 1}</div>
                <div className="text-xs text-slate-600">{SIGN_GLYPHS[rashi]}</div>
                <div className="flex min-h-[1rem] flex-wrap justify-center gap-0.5">
                  {here.map((y) => (
                    <button key={y.id} type="button" onClick={() => setSel(y.id)} className={`rounded px-0.5 text-[10px] font-semibold ${sel === y.id ? "bg-amber-200 text-amber-950" : "text-indigo-900"}`} title={GRAHA_LABELS[y.id]}>
                      {GRAHA_LABELS[y.id].split(" ")[0]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-transit-table">
            <thead>
              <tr>
                <th className={th}>Transit graha</th>
                <th className={th}>Rashi</th>
                <th className={th}>Janma Rashi&apos;den</th>
                <th className={th}>Lagna&apos;dan</th>
                <th className={th}>Drishti (natal)</th>
                <th className={th}>Kaksha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.transits.map((y) => (
                <tr key={y.id} className={`cursor-pointer ${sel === y.id ? "bg-amber-50" : ""}`} onClick={() => setSel(y.id)} data-gochara={y.id}>
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    {GRAHA_LABELS[y.id]}
                    {t.slow.includes(y.id) && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">yavaş</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {SIGN_GLYPHS[y.rashi]} {SIGN_LABELS[y.rashi]} {formatDegree(y.degreeInRashi)}
                  </td>
                  <td className={`${td} tabular-nums`}>{y.houseFromMoon}.</td>
                  <td className={`${td} tabular-nums`}>{y.natalHouse}.</td>
                  <td className={`${td} text-xs`}>{y.drishti.length === 0 ? "—" : y.drishti.map((d) => `${drishtiLabel(d.type)} → ${GRAHA_LABELS[d.to].split(" ")[0]}`).join(", ")}</td>
                  <td className={`${td} whitespace-nowrap text-xs`}>
                    {y.kaksha.number}. · {KAKSHA_LORD_LABEL(y.kaksha.lord).split(" ")[0]}
                    {y.kaksha.bindu === null ? "" : y.kaksha.bindu ? " · bindu var" : " · bindu yok"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {x && (
          <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili transit graha" data-testid="astro-vedic-transit-detail">
            <h4 className="font-semibold text-amber-900">
              Transit {GRAHA_LABELS[x.id]} · {SIGN_LABELS[x.rashi]} {formatDegree(x.degreeInRashi)}
            </h4>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-500">Janma Rashi&apos;den</dt>
              <dd>{x.houseFromMoon}. ev</dd>
              <dt className="text-slate-500">Lagna&apos;dan</dt>
              <dd>{x.natalHouse}. bhava</dd>
              <dt className="text-slate-500">Drishti</dt>
              <dd>
                {x.drishti.length === 0
                  ? x.id === "rahu" || x.id === "ketu"
                    ? "Rahu/Ketu drishti atmaz (Roxy)."
                    : "Bakılan burçlarda natal graha yok."
                  : x.drishti.map((d) => `${drishtiLabel(d.type)} bakış → natal ${GRAHA_LABELS[d.to]} (burç-içi fark ${d.orb.toFixed(2)}°)`).join("; ")}
              </dd>
              <dt className="text-slate-500">Kaksha</dt>
              <dd>
                {x.kaksha.number}/8 · {formatDegree(x.kaksha.start)}–{formatDegree(x.kaksha.end)} · yönetici {KAKSHA_LORD_LABEL(x.kaksha.lord)}
                {x.kaksha.bindu === null
                  ? " · Rahu/Ketu için Bhinnashtakavarga yok (bindu sorusu uygulanmaz)"
                  : ` · kaksha yöneticisi bindu ${x.kaksha.bindu ? "vermiş" : "vermemiş"} · bu rashide ${x.kaksha.binduCount}/8 bindu (natal BAV)`}
              </dd>
            </dl>
            <KbBox kb={kb} empty="Bu transit için Bilgi Bankası kaydınız yok." />
          </section>
        )}
      </div>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">Natal grahalar (Gochara referansı)</summary>
        <ul className="mt-1 grid gap-x-4 sm:grid-cols-3">
          {t.natal.map((n) => (
            <li key={n.id}>
              {GRAHA_LABELS[n.id]}: {SIGN_LABELS[n.rashi]} {formatDegree(n.longitude % 30)} · {n.house}. bhava
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ─── Ashtakavarga ───────────────────────────────────────────────────────────
const SIGN_SHORT = SIGN_IDS.map((s) => SIGN_LABELS[s].slice(0, 3));
export function VedicAshtakavargaPanel({ t }: { t: VedicAshtakavargaTechnical }) {
  const [reduced, setReduced] = useState(false);
  const rows = reduced ? t.reducedBav : t.bav;
  const sav = reduced ? t.reducedSav : t.sav;
  const maxSav = Math.max(...sav.bindus, 1);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-ashtakavarga-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          <strong>Ashtakavarga</strong> (BPHS) · bindu ızgarası Koç → Balık · SAV toplamı {t.sav.total}
          {reduced ? ` · indirgenmiş (Trikona + Ekadhipati Shodhana) toplam ${t.reducedSav.total}` : ""}
        </p>
        <div className="flex gap-1" role="tablist" aria-label="Ashtakavarga görünümü">
          {[false, true].map((r) => (
            <button
              key={String(r)}
              type="button"
              role="tab"
              aria-selected={reduced === r}
              onClick={() => setReduced(r)}
              className={`rounded-lg border px-2 py-1 text-xs ${reduced === r ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}
            >
              {r ? "İndirgenmiş (Shodhana)" : "Bhinna / Sarva"}
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full text-center" data-testid="astro-vedic-ashtakavarga-grid">
          <thead>
            <tr>
              <th className={th}>Graha</th>
              {SIGN_IDS.map((s, i) => (
                <th key={s} className={`${th} text-center`} title={SIGN_LABELS[s]}>
                  {SIGN_GLYPHS[s]} {SIGN_SHORT[i]}
                </th>
              ))}
              <th className={th}>Top.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.id === "lagna" ? "text-slate-500" : ""}>
                <td className={`${td} whitespace-nowrap text-left font-medium`}>{lbl(r.id)}</td>
                {r.bindus.map((b, i) => (
                  <td key={i} className={`${td} tabular-nums`}>
                    {b}
                  </td>
                ))}
                <td className={`${td} font-semibold tabular-nums`}>{r.total}</td>
              </tr>
            ))}
            <tr className="bg-amber-50/60" data-testid="astro-vedic-sav-row">
              <td className={`${td} text-left font-semibold`}>SAV</td>
              {sav.bindus.map((b, i) => (
                <td key={i} className={`${td} font-semibold tabular-nums`}>
                  <span className="inline-block min-w-[1.6rem] rounded" style={{ background: `rgba(217,119,6,${0.08 + 0.32 * (b / maxSav)})` }}>
                    {b}
                  </span>
                </td>
              ))}
              <td className={`${td} font-semibold tabular-nums`}>{sav.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">SAV satırı 7 grahanın toplamıdır (Lagna hariç). Renk yoğunluğu yalnız tablo içindeki göreli büyüklüğü gösterir; yorum eşiği uygulanmaz.</p>
      <div className={`${card} overflow-x-auto`}>
        <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Shodhya Pinda (BPHS 69)</h4>
        <table className="min-w-full" data-testid="astro-vedic-shodhya-table">
          <thead>
            <tr>
              <th className={th}>Graha</th>
              <th className={th}>Rashi Pinda</th>
              <th className={th}>Graha Pinda</th>
              <th className={th}>Shodhya Pinda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.shodhyaPinda.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-medium`}>{lbl(p.id)}</td>
                <td className={`${td} tabular-nums`}>{p.rashiPinda}</td>
                <td className={`${td} tabular-nums`}>{p.grahaPinda}</td>
                <td className={`${td} font-semibold tabular-nums`}>{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shadbala ───────────────────────────────────────────────────────────────
const COMP_LABEL: Record<ShadbalaComponent, string> = {
  sthanaBala: "Sthana",
  digBala: "Dig",
  kalaBala: "Kala",
  chestaBala: "Chesta",
  naisargikaBala: "Naisargika",
  drikBala: "Drik",
};
export function VedicShadbalaPanel({ t, kbLookup }: { t: VedicShadbalaTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<VedicGrahaId>(t.planets.find((p) => p.rank === 1)?.id ?? "sun");
  const p = t.planets.find((x) => x.id === sel) ?? t.planets[0];
  const kb = kbLookup ? kbLookup([`${p.strengthRatio >= 1 ? "shadbala_above_min" : "shadbala_below_min"}:${p.id}`]) : null;
  const maxRatio = Math.max(...t.planets.map((x) => x.strengthRatio), 1.2);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-shadbala-panel">
      <p className="text-sm text-slate-700">
        <strong>Shadbala</strong> (BPHS) · virupa; toplam rupa = virupa / 60; oran = rupa / BPHS asgari rupa (1,00 çizgisi asgari). Sıra 1 = en güçlü.
      </p>
      <div className={`${card} p-3`} data-testid="astro-vedic-shadbala-bars">
        {[...t.planets]
          .sort((a, b) => a.rank - b.rank)
          .map((x) => (
            <button key={x.id} type="button" onClick={() => setSel(x.id)} className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs ${sel === x.id ? "bg-amber-50" : ""}`}>
              <span className="w-28 shrink-0 truncate font-medium">
                {x.rank}. {GRAHA_LABELS[x.id]}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <span className={`absolute inset-y-0 left-0 ${x.strengthRatio >= 1 ? "bg-emerald-400" : "bg-rose-300"}`} style={{ width: `${(Math.max(0, x.strengthRatio) / maxRatio) * 100}%` }} />
                <span className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${(1 / maxRatio) * 100}%` }} aria-hidden />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums">{x.strengthRatio.toFixed(2)}</span>
            </button>
          ))}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full" data-testid="astro-vedic-shadbala-table">
            <thead>
              <tr>
                <th className={th}>Graha</th>
                {SHADBALA_COMPONENTS.map((c) => (
                  <th key={c} className={th}>
                    {COMP_LABEL[c]}
                  </th>
                ))}
                <th className={th}>Rupa</th>
                <th className={th}>Asgari</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.planets.map((x) => (
                <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : ""}`} onClick={() => setSel(x.id)} data-shadbala={x.id}>
                  <td className={`${td} font-medium`}>{GRAHA_LABELS[x.id]}</td>
                  {SHADBALA_COMPONENTS.map((c) => (
                    <td key={c} className={`${td} tabular-nums text-xs`}>
                      {x[c].toFixed(2)}
                    </td>
                  ))}
                  <td className={`${td} font-semibold tabular-nums`}>{x.totalRupas.toFixed(2)}</td>
                  <td className={`${td} tabular-nums`}>{x.minRequired}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili graha gücü">
          <h4 className="font-semibold text-amber-900">
            {GRAHA_LABELS[p.id]} · sıra {p.rank}/7
          </h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Toplam</dt>
            <dd>
              {p.totalVirupas.toFixed(2)} virupa = {p.totalRupas.toFixed(2)} rupa
            </dd>
            <dt className="text-slate-500">Oran</dt>
            <dd>
              {p.strengthRatio.toFixed(2)} ({p.strengthRatio >= 1 ? "BPHS asgarisinin üstünde" : "BPHS asgarisinin altında"})
            </dd>
            <dt className="text-slate-500">Ishta / Kashta</dt>
            <dd>
              {p.ishtaPhala.toFixed(2)} / {p.kashtaPhala.toFixed(2)}
            </dd>
          </dl>
          <KbBox kb={kb} empty="Bu güç durumu için Bilgi Bankası kaydınız yok." />
        </section>
      </div>
    </div>
  );
}

// ─── Janma Panchanga ────────────────────────────────────────────────────────
function Limb({ title, name, sub, percent, testId }: { title: string; name: string; sub: string; percent: number | null; testId: string }) {
  return (
    <div className={`${card} p-3`} data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-base font-semibold text-slate-900">{name}</div>
      <div className="text-xs text-slate-600">{sub}</div>
      {percent !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100" aria-hidden>
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(percent)}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-slate-600">%{Math.round(percent)} geçti</span>
        </div>
      )}
    </div>
  );
}
export function VedicPanchangaPanel({ t, kbLookup }: { t: VedicPanchangaTechnical; kbLookup?: KbLookup | null }) {
  const kb = kbLookup ? kbLookup([`panchanga_tithi:${t.tithi.number}`, `panchanga_nitya_yoga:${t.nityaYoga.number}`, `panchanga_karana:${t.karana.id}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-panchanga-panel">
      <p className="text-sm text-slate-700">
        <strong>Janma Panchanga</strong> · doğum anı · Lahiri (sabit) · Güneş {formatDegree(t.sunLongitude % 30)} {SIGN_LABELS[SIGN_IDS[Math.floor(t.sunLongitude / 30)]]} · Ay{" "}
        {formatDegree(t.moonLongitude % 30)} {SIGN_LABELS[SIGN_IDS[Math.floor(t.moonLongitude / 30)]]}
      </p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Limb
          testId="astro-vedic-panchanga-tithi"
          title="Tithi"
          name={`${t.tithi.number}. ${TITHI_LABELS[t.tithi.number - 1]}`}
          sub={[t.tithi.paksha === "shukla" ? "Shukla paksha (büyüyen)" : "Krishna paksha (küçülen)", t.tithi.deity ? `deva: ${t.tithi.deity}` : "", t.tithi.rulingPlanet ? `yönetici: ${GRAHA_LABELS[t.tithi.rulingPlanet]}` : "", t.tithi.element ?? ""].filter(Boolean).join(" · ")}
          percent={t.tithi.percent}
        />
        <Limb
          testId="astro-vedic-panchanga-nakshatra"
          title="Nakshatra"
          name={`${t.nakshatra.index + 1}. ${NAKSHATRA_LABELS[t.nakshatra.id]}`}
          sub={[`${t.nakshatra.pada}. pada`, `yönetici: ${GRAHA_LABELS[t.nakshatra.lord]}`, t.nakshatra.deity ? `deva: ${t.nakshatra.deity}` : "", t.nakshatra.symbol ? `sembol: ${t.nakshatra.symbol}` : ""].filter(Boolean).join(" · ")}
          percent={null}
        />
        <Limb testId="astro-vedic-panchanga-yoga" title="Nitya yoga" name={`${t.nityaYoga.number}. ${NITYA_YOGA_LABELS[t.nityaYoga.number - 1]}`} sub="Güneş + Ay boylamı toplamından" percent={t.nityaYoga.percent} />
        <Limb testId="astro-vedic-panchanga-karana" title="Karana" name={KARANA_LABELS[t.karana.id]} sub={t.karana.movable ? "hareketli (chara) karana" : "sabit (sthira) karana"} percent={t.karana.percent} />
      </div>
      <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Panchanga Bilgi Bankası">
        <KbBox kb={kb} empty="Bu tithi / nitya yoga / karana için Bilgi Bankası kaydınız yok." />
      </section>
    </div>
  );
}

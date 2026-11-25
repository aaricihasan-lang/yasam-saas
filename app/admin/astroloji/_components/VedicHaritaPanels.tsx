"use client";

/**
 * 22.10.2026 — Vedik harita görünümleri: Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala. Yalnız teknik katman (sağlayıcı
 * açıklamaları ayrı "Teknik Açıklama" panelinde, yetkiye bağlı). Değerler sağlayıcıdan gelir; burada hesap YAPILMAZ — yalnız
 * tablo / kundli / çubuk olarak düzenlenir. D1 (bütün-burç rashi evi) ile Bhav Chalit bhavası hiçbir yerde aynı etiketi taşımaz.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import {
  ARUDHA_ABBR,
  ARUDHA_NAMES,
  BHAVA_SYSTEM_LABELS,
  CHARA_KARAKA_ABBR,
  CHARA_KARAKA_NAMES,
  type ArudhaPadaId,
  type CharaKarakaId,
  type VedicArudhaTechnical,
  type VedicBhavaBalaTechnical,
  type VedicBhavChalitTechnical,
  type VedicCharaKarakaTechnical,
} from "@/lib/astrology/model/vedicHarita";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, formatDegree } from "@/lib/astrology/labels/tr";
import { RoxyKundli, type KbLookup } from "./VedicPanels";
import { chalitKundliTitles, toChalitKundliData } from "../_lib/chalitKundli";
import type { KundliLocale } from "../_lib/kundliLocalize";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const AYANAMSA_IDS = new Set(["lahiri", "raman", "kp-newcomb", "kp-old"]);

/**
 * I18N ATLAS-V: ekran dili yardımcıları. Lib notları / şema ve bhava yöntemi etiketleri Word/PDF ile ortaktır → TR katalog değeri
 * lib ile birebir (atlas-vedic-harita-i18n kilidi); graha / burç adları ortak terim kataloğundan.
 */
function useHaritaText() {
  const t = useTranslations("atlas.vedicHarita");
  const tv = useTranslations("atlas.vedic");
  const tt = useTranslations("terms");
  const locale: KundliLocale = useLocale() === "en" ? "en" : "tr";
  const graha = (id: VedicGrahaId) => tt(`graha.${id}`);
  const sign = (s: SignId) => `${SIGN_GLYPHS[s]} ${tt(`zodiac.${s}`)}`;
  const lon = (x: number) => `${sign(SIGN_IDS[Math.floor((((x % 360) + 360) % 360) / 30) % 12])} ${formatDegree(((x % 30) + 30) % 30)}`;
  const num2 = (x: number) => (locale === "tr" ? x.toFixed(2).replace(".", ",") : x.toFixed(2));
  const bhavaSystem = (v: string) => (v in BHAVA_SYSTEM_LABELS ? t(`bhavaSystem.${v as "sripati"}`) : v);
  const signName = (s: SignId) => tt(`zodiac.${s}`);
  return { t, tv, locale, graha, sign, signName, lon, num2, bhavaSystem };
}

function Frame({ t, extra }: { t: { frame: { ayanamsa: string; ayanamsaDegrees: number } }; extra?: string }) {
  const { t: tx, tv } = useHaritaText();
  return (
    <p className="text-sm text-slate-700">
      {tx("frame.prefix")}
      <strong>{AYANAMSA_IDS.has(t.frame.ayanamsa) ? tv(`ayanamsa.${t.frame.ayanamsa}`) : t.frame.ayanamsa}</strong> {t.frame.ayanamsaDegrees.toFixed(4)}°{extra ? ` · ${extra}` : ""}
    </p>
  );
}
function Note({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs leading-relaxed text-indigo-950" data-testid={testId}>
      {text}
    </p>
  );
}
function KbBox({ kb, empty }: { kb: ReturnType<KbLookup> | null; empty: string }) {
  const { tv } = useHaritaText();
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-harita-kb">
      <div className="text-xs font-semibold text-indigo-900">{tv("kb.title")}</div>
      {kb === null ? (
        <p className="text-xs text-slate-500">{tv("kb.notLoaded")}</p>
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

// ─── A · Bhav Chalit ────────────────────────────────────────────────────────
export function VedicBhavChalitPanel({ t, kbLookup }: { t: VedicBhavChalitTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, locale, graha, lon, num2, sign, bhavaSystem } = useHaritaText();
  const [sel, setSel] = useState<VedicGrahaId>(t.grahas.find((g) => g.moved)?.id ?? t.grahas[0]?.id ?? "sun");
  const data = useMemo(() => toChalitKundliData(t), [t]);
  const titles = useMemo(() => chalitKundliTitles(t, locale), [t, locale]);
  const g = t.grahas.find((x) => x.id === sel) ?? t.grahas[0];
  const kb = g && kbLookup ? kbLookup([`chalit_graha_in_bhava:${g.id}:${g.bhava}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-bhav-chalit-panel">
      <Frame t={t} extra={tx("frame.bhavaMethod", { m: bhavaSystem(t.houseSystem) })} />
      <Note text={tx("note.chalitVsD1")} testId="astro-chalit-method-note" />
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${card} p-2`} aria-label={tx("chalit.chartLabel")}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1 px-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{tx("chalit.viewTitle")}</span>
            <span data-testid="astro-chalit-moved-count">
              {tx("chalit.movedCount")}
              {t.movedCount}
            </span>
          </div>
          <div data-testid="astro-chalit-kundli">
            <RoxyKundli data={data} style="north" titles={titles} centreText={tx("centre")} />
          </div>
          <p className="mt-1 px-1 text-[11px] leading-snug text-slate-500">{tx("note.chalitKundli")}</p>
        </section>
        <section className={`${card} overflow-x-auto`} aria-label={tx("chalit.compareLabel")}>
          <table className="min-w-full" data-testid="astro-chalit-compare-table">
            <thead>
              <tr>
                <th className={th}>{tx("col.graha")}</th>
                <th className={th}>{tx("col.rashiDegree")}</th>
                <th className={th}>{tx("chalit.colRashiHouse")}</th>
                <th className={th}>{tx("chalit.colChalitBhava")}</th>
                <th className={th}>{tx("chalit.colMoved")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.grahas.map((x) => (
                <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : x.moved ? "bg-indigo-50/40" : ""}`} onClick={() => setSel(x.id)} data-chalit-graha={x.id} data-moved={x.moved ? "1" : "0"}>
                  <td className={`${td} font-medium`}>{graha(x.id)}</td>
                  <td className={`${td} text-xs`}>{lon(x.longitude)}</td>
                  <td className={`${td} tabular-nums`}>
                    {x.rashiHouse}
                    {tx("ord.house", { n: x.rashiHouse })}
                  </td>
                  <td className={`${td} tabular-nums font-semibold`}>
                    {x.bhava}
                    {tx("ord.bhava", { n: x.bhava })}
                  </td>
                  <td className={td}>{x.moved ? <strong className="text-indigo-800">{tx("yes")}</strong> : tx("no")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g && (
            <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("chalit.selectedLabel")}>
              <h4 className="font-semibold text-amber-900">
                {graha(g.id)}
                {tx("chalit.selChalit")}
                {g.bhava}
                {tx("chalit.selBhavaD1", { n: g.bhava })}
                {g.rashiHouse}
                {tx("ord.house", { n: g.rashiHouse })}
              </h4>
              <KbBox kb={kb} empty={tx("chalit.kbEmpty")} />
            </div>
          )}
        </section>
      </div>
      <section className={`${card} overflow-x-auto`} aria-label={tx("chalit.boundsLabel")}>
        <table className="min-w-full" data-testid="astro-chalit-bhava-table">
          <thead>
            <tr>
              <th className={th}>{tx("col.bhava")}</th>
              <th className={th}>{tx("chalit.colStart")}</th>
              <th className={th}>{tx("chalit.colMadhya")}</th>
              <th className={th}>{tx("chalit.colEnd")}</th>
              <th className={th}>{tx("chalit.colSpan")}</th>
              <th className={th}>{tx("chalit.colMadhyaRashi")}</th>
              <th className={th}>{tx("chalit.colGrahas")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bhavas.map((b) => (
              <tr key={b.house} data-chalit-bhava={b.house}>
                <td className={`${td} font-medium tabular-nums`}>{b.house}.</td>
                <td className={`${td} text-xs`}>{lon(b.start)}</td>
                <td className={`${td} text-xs font-medium`}>{lon(b.madhya)}</td>
                <td className={`${td} text-xs`}>{lon(b.end)}</td>
                <td className={`${td} text-xs tabular-nums`}>{num2(b.span)}°</td>
                <td className={td}>{sign(b.rashi)}</td>
                <td className={`${td} text-xs`}>{b.grahas.length ? b.grahas.map((x) => graha(x).split(" ")[0]).join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── B · Chara Karaka ───────────────────────────────────────────────────────
export function VedicCharaKarakaPanel({ t, kbLookup }: { t: VedicCharaKarakaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, sign } = useHaritaText();
  const [sel, setSel] = useState<CharaKarakaId>("atmakaraka");
  const k = t.karakas.find((x) => x.id === sel) ?? t.karakas[0];
  const kb = k && kbLookup ? kbLookup([`chara_karaka:${k.id}:${k.graha}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-chara-karaka-panel">
      <Frame t={t} extra={tx("frame.scheme", { s: tx(`scheme.${t.scheme}`) })} />
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className={`${card} p-3`} data-testid="astro-chara-ak">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tx("chara.ak")}</div>
          <div className="text-base font-semibold text-slate-900">{graha(t.atmakaraka)}</div>
        </div>
        <div className={`${card} p-3`} data-testid="astro-chara-dk">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tx("chara.dk")}</div>
          <div className="text-base font-semibold text-slate-900">{graha(t.darakaraka)}</div>
        </div>
      </div>
      <Note text={tx("note.charaMethod")} testId="astro-chara-method-note" />
      <section className={`${card} overflow-x-auto`} aria-label={tx("chara.rankingLabel")}>
        <table className="min-w-full" data-testid="astro-chara-karaka-table" data-scheme={t.scheme}>
          <thead>
            <tr>
              <th className={th}>{tx("col.rank")}</th>
              <th className={th}>{tx("chara.colKaraka")}</th>
              <th className={th}>{tx("col.graha")}</th>
              <th className={th}>{tx("col.rashiDegree")}</th>
              <th className={th}>{tx("chara.colRankingDegree")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.karakas.map((x, i) => (
              <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : ""}`} onClick={() => setSel(x.id)} data-karaka={x.id}>
                <td className={`${td} tabular-nums`}>{i + 1}</td>
                <td className={`${td} font-medium`}>
                  {CHARA_KARAKA_NAMES[x.id]} <span className="text-xs text-slate-500">({CHARA_KARAKA_ABBR[x.id]})</span>
                </td>
                <td className={td}>{graha(x.graha)}</td>
                <td className={`${td} text-xs`}>
                  {sign(x.rashi)} {formatDegree(x.degreeInRashi)}
                </td>
                <td className={`${td} text-xs tabular-nums`}>
                  {formatDegree(x.rankingDegree)}
                  {x.reversed ? tx("chara.reversed") : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {k && (
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("chara.selectedLabel")}>
            <h4 className="font-semibold text-amber-900">
              {CHARA_KARAKA_NAMES[k.id]} · {graha(k.graha)}
            </h4>
            <KbBox kb={kb} empty={tx("chara.kbEmpty")} />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── C · Arudha Pada ────────────────────────────────────────────────────────
export function VedicArudhaPanel({ t, kbLookup }: { t: VedicArudhaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, sign } = useHaritaText();
  const [sel, setSel] = useState<ArudhaPadaId>("a1");
  const p = t.padas.find((x) => x.id === sel) ?? t.padas[0];
  const kb = p && kbLookup ? kbLookup([`arudha_pada_in_rashi:${p.id}:${p.rashi}`, `arudha_pada_in_bhava:${p.id}:${p.houseFromLagna}`]) : null;
  const al = t.padas.find((x) => x.id === "a1");
  const ul = t.padas.find((x) => x.id === "a12");
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-arudha-panel">
      <Frame t={t} extra={tx("frame.lagna", { s: sign(t.lagnaRashi) })} />
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className={`${card} p-3`} data-testid="astro-arudha-al">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tx("arudha.al")}</div>
          <div className="text-base font-semibold text-slate-900">
            {sign(t.arudhaLagna)}
            {al ? tx("arudha.fromLagna", { n: al.houseFromLagna }) : ""}
          </div>
        </div>
        <div className={`${card} p-3`} data-testid="astro-arudha-ul">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tx("arudha.ul")}</div>
          <div className="text-base font-semibold text-slate-900">
            {sign(t.upapada)}
            {ul ? tx("arudha.fromLagna", { n: ul.houseFromLagna }) : ""}
          </div>
        </div>
      </div>
      <Note text={tx("note.arudhaMethod")} testId="astro-arudha-method-note" />
      <section className={`${card} overflow-x-auto`} aria-label={tx("arudha.tableLabel")}>
        <table className="min-w-full" data-testid="astro-arudha-table">
          <thead>
            <tr>
              <th className={th}>{tx("arudha.colPada")}</th>
              <th className={th}>{tx("col.bhava")}</th>
              <th className={th}>{tx("col.lord")}</th>
              <th className={th}>{tx("arudha.colLordRashi")}</th>
              <th className={th}>{tx("arudha.colCount")}</th>
              <th className={th}>{tx("arudha.colException")}</th>
              <th className={th}>{tx("arudha.colPadaRashi")}</th>
              <th className={th}>{tx("arudha.colFromLagna")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.padas.map((x) => (
              <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : ""}`} onClick={() => setSel(x.id)} data-arudha={x.id} data-exception={x.exceptionApplied ? "1" : "0"}>
                <td className={`${td} font-medium`}>
                  {ARUDHA_ABBR[x.id]} <span className="text-xs font-normal text-slate-500">{ARUDHA_NAMES[x.id]}</span>
                </td>
                <td className={`${td} text-xs`}>
                  {x.house}. · {sign(x.bhavaRashi)}
                </td>
                <td className={td}>{graha(x.lord).split(" ")[0]}</td>
                <td className={`${td} text-xs`}>{sign(x.lordRashi)}</td>
                <td className={`${td} tabular-nums`}>{x.count}</td>
                <td className={`${td} text-xs`}>
                  {x.exceptionApplied ? (
                    <strong className="text-indigo-800">
                      {tx("yesSep")}
                      {sign(x.rawRashi)} → 10.
                    </strong>
                  ) : (
                    tx("no")
                  )}
                </td>
                <td className={`${td} font-semibold`}>{sign(x.rashi)}</td>
                <td className={`${td} tabular-nums`}>
                  {x.houseFromLagna}
                  {tx("ord.house", { n: x.houseFromLagna })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {p && (
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("arudha.selectedLabel")}>
            <h4 className="font-semibold text-amber-900">
              {ARUDHA_NAMES[p.id]} ({ARUDHA_ABBR[p.id]}) · {sign(p.rashi)}
              {tx("arudha.selFrom")}
              {p.houseFromLagna}
              {tx("ord.house", { n: p.houseFromLagna })}
            </h4>
            <KbBox kb={kb} empty={tx("arudha.kbEmpty")} />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── D · Bhava Bala ─────────────────────────────────────────────────────────
export function VedicBhavaBalaPanel({ t, kbLookup }: { t: VedicBhavaBalaTechnical; kbLookup?: KbLookup | null }) {
  const { t: tx, graha, signName, lon, num2, bhavaSystem } = useHaritaText();
  const [sel, setSel] = useState<number>(t.bhavas.find((b) => b.rank === 1)?.house ?? 1);
  const b = t.bhavas.find((x) => x.house === sel) ?? t.bhavas[0];
  const kb = b && kbLookup ? kbLookup(b.rank === 1 ? [`bhava_bala_strongest:${b.house}`] : b.rank === 12 ? [`bhava_bala_weakest:${b.house}`] : []) : null;
  const max = Math.max(...t.bhavas.map((x) => x.totalRupas), 1);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-bhava-bala-panel">
      <Frame t={t} extra={tx("frame.bhavaMethod", { m: bhavaSystem(t.houseSystem) })} />
      <Note text={tx("note.balaVsShadbala")} testId="astro-bhava-bala-vs-shadbala" />
      <Note text={tx("note.balaSchool")} testId="astro-bhava-bala-school" />
      <div className={`${card} p-3`} data-testid="astro-bhava-bala-bars">
        {t.bhavas.map((x) => (
          <button key={x.house} type="button" onClick={() => setSel(x.house)} className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs ${sel === x.house ? "bg-amber-50" : ""}`} data-bhava-bala-bar={x.house}>
            <span className="w-28 shrink-0 truncate font-medium">
              {x.house}
              {tx("bala.houseSep", { n: x.house })}
              {signName(x.rashi)}
            </span>
            <span className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
              <span className={`absolute inset-y-0 left-0 ${x.rank === 1 ? "bg-amber-600" : "bg-amber-300"}`} style={{ width: `${(Math.max(0, x.totalRupas) / max) * 100}%` }} />
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums">
              {num2(x.totalRupas)} · {x.rank}.
            </span>
          </button>
        ))}
      </div>
      <section className={`${card} overflow-x-auto`} aria-label={tx("bala.tableLabel")}>
        <table className="min-w-full" data-testid="astro-bhava-bala-table">
          <thead>
            <tr>
              <th className={th}>{tx("col.bhava")}</th>
              <th className={th}>{tx("col.lord")}</th>
              <th className={th}>{tx("bala.colBhavadhipati")}</th>
              <th className={th}>{tx("bala.colDig")}</th>
              <th className={th}>{tx("bala.colDrishti")}</th>
              <th className={th}>{tx("bala.colTotal")}</th>
              <th className={th}>{tx("bala.colRupa")}</th>
              <th className={th}>{tx("col.rank")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bhavas.map((x) => (
              <tr key={x.house} className={`cursor-pointer ${sel === x.house ? "bg-amber-50" : ""}`} onClick={() => setSel(x.house)} data-bhava-bala={x.house}>
                <td className={`${td} font-medium`}>
                  {x.house}. <span className="text-xs font-normal text-slate-500">{signName(x.rashi)}</span>
                </td>
                <td className={td}>{graha(x.lord).split(" ")[0]}</td>
                <td className={`${td} text-xs tabular-nums`}>{num2(x.bhavadhipatiBala)}</td>
                <td className={`${td} text-xs tabular-nums`}>{num2(x.digBala)}</td>
                <td className={`${td} text-xs tabular-nums`}>{num2(x.drishtiBala)}</td>
                <td className={`${td} text-xs tabular-nums`}>{num2(x.totalVirupas)}</td>
                <td className={`${td} font-semibold tabular-nums`}>{num2(x.totalRupas)}</td>
                <td className={`${td} tabular-nums`}>{x.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {b && (
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label={tx("bala.selectedLabel")}>
            <h4 className="font-semibold text-amber-900">
              {b.house}
              {tx("bala.selHouseOpen", { n: b.house })}
              {signName(b.rashi)}
              {tx("bala.selRank")}
              {b.rank}/12 · {num2(b.totalRupas)}
              {tx("bala.rupaSuffix")}
            </h4>
            <p className="text-xs text-slate-600">
              {tx("bala.madhyaA")}
              {lon(b.madhya)}
              {tx("bala.madhyaB")}
              {graha(b.lord)}
              {tx("bala.madhyaC")}
            </p>
            {b.rank === 1 || b.rank === 12 ? <KbBox kb={kb} empty={tx("bala.kbEmpty")} /> : null}
          </div>
        )}
      </section>
    </div>
  );
}

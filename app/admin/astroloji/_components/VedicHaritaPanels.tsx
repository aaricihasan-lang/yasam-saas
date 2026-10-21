"use client";

/**
 * 22.10.2026 — Vedik harita görünümleri: Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala. Yalnız teknik katman (sağlayıcı
 * açıklamaları ayrı "Teknik Açıklama" panelinde, yetkiye bağlı). Değerler sağlayıcıdan gelir; burada hesap YAPILMAZ — yalnız
 * tablo / kundli / çubuk olarak düzenlenir. D1 (bütün-burç rashi evi) ile Bhav Chalit bhavası hiçbir yerde aynı etiketi taşımaz.
 */

import { useMemo, useState } from "react";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import {
  ARUDHA_ABBR,
  ARUDHA_METHOD_NOTE,
  ARUDHA_NAMES,
  BHAVA_BALA_VS_SHADBALA_NOTE,
  CHALIT_VS_D1_NOTE,
  CHARA_KARAKA_ABBR,
  CHARA_KARAKA_METHOD_NOTE,
  CHARA_KARAKA_NAMES,
  CHARA_KARAKA_SCHEME_LABELS,
  bhavaSystemLabel,
  type ArudhaPadaId,
  type CharaKarakaId,
  type VedicArudhaTechnical,
  type VedicBhavaBalaTechnical,
  type VedicBhavChalitTechnical,
  type VedicCharaKarakaTechnical,
} from "@/lib/astrology/model/vedicHarita";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";
import { RoxyKundli, type KbLookup } from "./VedicPanels";
import { CHALIT_CENTRE_TEXT, CHALIT_KUNDLI_NOTE, chalitKundliTitles, toChalitKundliData } from "../_lib/chalitKundli";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const AYANAMSA_LABEL: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP Newcomb", "kp-old": "KP (eski)" };
const sign = (s: SignId) => `${SIGN_GLYPHS[s]} ${SIGN_LABELS[s]}`;
const lon = (x: number) => `${sign(SIGN_IDS[Math.floor((((x % 360) + 360) % 360) / 30) % 12])} ${formatDegree(((x % 30) + 30) % 30)}`;
const num2 = (x: number) => x.toFixed(2).replace(".", ",");

function Frame({ t, extra }: { t: { frame: { ayanamsa: string; ayanamsaDegrees: number } }; extra?: string }) {
  return (
    <p className="text-sm text-slate-700">
      Sidereal (nirayana) · ayanamsa <strong>{AYANAMSA_LABEL[t.frame.ayanamsa] ?? t.frame.ayanamsa}</strong> {t.frame.ayanamsaDegrees.toFixed(4)}°{extra ? ` · ${extra}` : ""}
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
  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="astro-vedic-harita-kb">
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

// ─── A · Bhav Chalit ────────────────────────────────────────────────────────
export function VedicBhavChalitPanel({ t, kbLookup }: { t: VedicBhavChalitTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<VedicGrahaId>(t.grahas.find((g) => g.moved)?.id ?? t.grahas[0]?.id ?? "sun");
  const data = useMemo(() => toChalitKundliData(t), [t]);
  const titles = useMemo(() => chalitKundliTitles(t), [t]);
  const g = t.grahas.find((x) => x.id === sel) ?? t.grahas[0];
  const kb = g && kbLookup ? kbLookup([`chalit_graha_in_bhava:${g.id}:${g.bhava}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-bhav-chalit-panel">
      <Frame t={t} extra={`bhava yöntemi: ${bhavaSystemLabel(t.houseSystem)}`} />
      <Note text={CHALIT_VS_D1_NOTE} testId="astro-chalit-method-note" />
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${card} p-2`} aria-label="Bhav Chalit haritası">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1 px-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Bhav Chalit görünümü (Kuzey düzeni)</span>
            <span data-testid="astro-chalit-moved-count">Bhavası değişen graha: {t.movedCount}</span>
          </div>
          <div data-testid="astro-chalit-kundli">
            <RoxyKundli data={data} style="north" titles={titles} centreText={CHALIT_CENTRE_TEXT} />
          </div>
          <p className="mt-1 px-1 text-[11px] leading-snug text-slate-500">{CHALIT_KUNDLI_NOTE}</p>
        </section>
        <section className={`${card} overflow-x-auto`} aria-label="D1 ile Bhav Chalit karşılaştırması">
          <table className="min-w-full" data-testid="astro-chalit-compare-table">
            <thead>
              <tr>
                <th className={th}>Graha</th>
                <th className={th}>Rashi ve derece</th>
                <th className={th}>Rashi evi (D1)</th>
                <th className={th}>Chalit bhavası</th>
                <th className={th}>Değişti mi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {t.grahas.map((x) => (
                <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : x.moved ? "bg-indigo-50/40" : ""}`} onClick={() => setSel(x.id)} data-chalit-graha={x.id} data-moved={x.moved ? "1" : "0"}>
                  <td className={`${td} font-medium`}>{GRAHA_LABELS[x.id]}</td>
                  <td className={`${td} text-xs`}>{lon(x.longitude)}</td>
                  <td className={`${td} tabular-nums`}>{x.rashiHouse}. ev</td>
                  <td className={`${td} tabular-nums font-semibold`}>{x.bhava}. bhava</td>
                  <td className={td}>{x.moved ? <strong className="text-indigo-800">Evet</strong> : "Hayır"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g && (
            <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili graha">
              <h4 className="font-semibold text-amber-900">
                {GRAHA_LABELS[g.id]} · chalit {g.bhava}. bhava · D1 {g.rashiHouse}. ev
              </h4>
              <KbBox kb={kb} empty="Bu chalit yerleşimi için Bilgi Bankası kaydınız yok." />
            </div>
          )}
        </section>
      </div>
      <section className={`${card} overflow-x-auto`} aria-label="Bhava sınırları">
        <table className="min-w-full" data-testid="astro-chalit-bhava-table">
          <thead>
            <tr>
              <th className={th}>Bhava</th>
              <th className={th}>Başlangıç (sandhi)</th>
              <th className={th}>Madhya (cusp)</th>
              <th className={th}>Bitiş (sandhi)</th>
              <th className={th}>Genişlik</th>
              <th className={th}>Madhya rashisi</th>
              <th className={th}>Grahalar</th>
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
                <td className={`${td} text-xs`}>{b.grahas.length ? b.grahas.map((x) => GRAHA_LABELS[x].split(" ")[0]).join(", ") : "—"}</td>
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
  const [sel, setSel] = useState<CharaKarakaId>("atmakaraka");
  const k = t.karakas.find((x) => x.id === sel) ?? t.karakas[0];
  const kb = k && kbLookup ? kbLookup([`chara_karaka:${k.id}:${k.graha}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-chara-karaka-panel">
      <Frame t={t} extra={`şema: ${CHARA_KARAKA_SCHEME_LABELS[t.scheme]}`} />
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className={`${card} p-3`} data-testid="astro-chara-ak">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atmakaraka (AK)</div>
          <div className="text-base font-semibold text-slate-900">{GRAHA_LABELS[t.atmakaraka]}</div>
        </div>
        <div className={`${card} p-3`} data-testid="astro-chara-dk">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Darakaraka (DK)</div>
          <div className="text-base font-semibold text-slate-900">{GRAHA_LABELS[t.darakaraka]}</div>
        </div>
      </div>
      <Note text={CHARA_KARAKA_METHOD_NOTE} testId="astro-chara-method-note" />
      <section className={`${card} overflow-x-auto`} aria-label="Derece sıralaması">
        <table className="min-w-full" data-testid="astro-chara-karaka-table" data-scheme={t.scheme}>
          <thead>
            <tr>
              <th className={th}>Sıra</th>
              <th className={th}>Karaka</th>
              <th className={th}>Graha</th>
              <th className={th}>Rashi ve derece</th>
              <th className={th}>Sıralama derecesi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.karakas.map((x, i) => (
              <tr key={x.id} className={`cursor-pointer ${sel === x.id ? "bg-amber-50" : ""}`} onClick={() => setSel(x.id)} data-karaka={x.id}>
                <td className={`${td} tabular-nums`}>{i + 1}</td>
                <td className={`${td} font-medium`}>
                  {CHARA_KARAKA_NAMES[x.id]} <span className="text-xs text-slate-500">({CHARA_KARAKA_ABBR[x.id]})</span>
                </td>
                <td className={td}>{GRAHA_LABELS[x.graha]}</td>
                <td className={`${td} text-xs`}>
                  {sign(x.rashi)} {formatDegree(x.degreeInRashi)}
                </td>
                <td className={`${td} text-xs tabular-nums`}>
                  {formatDegree(x.rankingDegree)}
                  {x.reversed ? " (ters: 30° − derece)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {k && (
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili karaka">
            <h4 className="font-semibold text-amber-900">
              {CHARA_KARAKA_NAMES[k.id]} · {GRAHA_LABELS[k.graha]}
            </h4>
            <KbBox kb={kb} empty="Bu karaka ataması için Bilgi Bankası kaydınız yok." />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── C · Arudha Pada ────────────────────────────────────────────────────────
export function VedicArudhaPanel({ t, kbLookup }: { t: VedicArudhaTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<ArudhaPadaId>("a1");
  const p = t.padas.find((x) => x.id === sel) ?? t.padas[0];
  const kb = p && kbLookup ? kbLookup([`arudha_pada_in_rashi:${p.id}:${p.rashi}`, `arudha_pada_in_bhava:${p.id}:${p.houseFromLagna}`]) : null;
  const al = t.padas.find((x) => x.id === "a1");
  const ul = t.padas.find((x) => x.id === "a12");
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-arudha-panel">
      <Frame t={t} extra={`Lagna ${sign(t.lagnaRashi)}`} />
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className={`${card} p-3`} data-testid="astro-arudha-al">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Arudha Lagna (AL)</div>
          <div className="text-base font-semibold text-slate-900">
            {sign(t.arudhaLagna)}
            {al ? ` · Lagna'dan ${al.houseFromLagna}. ev` : ""}
          </div>
        </div>
        <div className={`${card} p-3`} data-testid="astro-arudha-ul">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upapada (UL / A12)</div>
          <div className="text-base font-semibold text-slate-900">
            {sign(t.upapada)}
            {ul ? ` · Lagna'dan ${ul.houseFromLagna}. ev` : ""}
          </div>
        </div>
      </div>
      <Note text={ARUDHA_METHOD_NOTE} testId="astro-arudha-method-note" />
      <section className={`${card} overflow-x-auto`} aria-label="Arudha hesap tablosu">
        <table className="min-w-full" data-testid="astro-arudha-table">
          <thead>
            <tr>
              <th className={th}>Pada</th>
              <th className={th}>Bhava</th>
              <th className={th}>Lord</th>
              <th className={th}>Lordun rashisi</th>
              <th className={th}>Sayım</th>
              <th className={th}>İstisna</th>
              <th className={th}>Pada rashisi</th>
              <th className={th}>Lagna&apos;dan</th>
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
                <td className={td}>{GRAHA_LABELS[x.lord].split(" ")[0]}</td>
                <td className={`${td} text-xs`}>{sign(x.lordRashi)}</td>
                <td className={`${td} tabular-nums`}>{x.count}</td>
                <td className={`${td} text-xs`}>{x.exceptionApplied ? <strong className="text-indigo-800">Evet · {sign(x.rawRashi)} → 10.</strong> : "Hayır"}</td>
                <td className={`${td} font-semibold`}>{sign(x.rashi)}</td>
                <td className={`${td} tabular-nums`}>{x.houseFromLagna}. ev</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p && (
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili pada">
            <h4 className="font-semibold text-amber-900">
              {ARUDHA_NAMES[p.id]} ({ARUDHA_ABBR[p.id]}) · {sign(p.rashi)} · Lagna&apos;dan {p.houseFromLagna}. ev
            </h4>
            <KbBox kb={kb} empty="Bu pada yerleşimi için Bilgi Bankası kaydınız yok." />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── D · Bhava Bala ─────────────────────────────────────────────────────────
export function VedicBhavaBalaPanel({ t, kbLookup }: { t: VedicBhavaBalaTechnical; kbLookup?: KbLookup | null }) {
  const [sel, setSel] = useState<number>(t.bhavas.find((b) => b.rank === 1)?.house ?? 1);
  const b = t.bhavas.find((x) => x.house === sel) ?? t.bhavas[0];
  const kb = b && kbLookup ? kbLookup(b.rank === 1 ? [`bhava_bala_strongest:${b.house}`] : b.rank === 12 ? [`bhava_bala_weakest:${b.house}`] : []) : null;
  const max = Math.max(...t.bhavas.map((x) => x.totalRupas), 1);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-vedic-bhava-bala-panel">
      <Frame t={t} extra={`bhava yöntemi: ${bhavaSystemLabel(t.houseSystem)}`} />
      <Note text={BHAVA_BALA_VS_SHADBALA_NOTE} testId="astro-bhava-bala-vs-shadbala" />
      <div className={`${card} p-3`} data-testid="astro-bhava-bala-bars">
        {t.bhavas.map((x) => (
          <button key={x.house} type="button" onClick={() => setSel(x.house)} className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs ${sel === x.house ? "bg-amber-50" : ""}`} data-bhava-bala-bar={x.house}>
            <span className="w-28 shrink-0 truncate font-medium">
              {x.house}. ev · {SIGN_LABELS[x.rashi]}
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
      <section className={`${card} overflow-x-auto`} aria-label="Bhava Bala tablosu">
        <table className="min-w-full" data-testid="astro-bhava-bala-table">
          <thead>
            <tr>
              <th className={th}>Bhava</th>
              <th className={th}>Lord</th>
              <th className={th}>Bhavadhipati</th>
              <th className={th}>Dig</th>
              <th className={th}>Drishti</th>
              <th className={th}>Toplam (virupa)</th>
              <th className={th}>Rupa</th>
              <th className={th}>Sıra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bhavas.map((x) => (
              <tr key={x.house} className={`cursor-pointer ${sel === x.house ? "bg-amber-50" : ""}`} onClick={() => setSel(x.house)} data-bhava-bala={x.house}>
                <td className={`${td} font-medium`}>
                  {x.house}. <span className="text-xs font-normal text-slate-500">{SIGN_LABELS[x.rashi]}</span>
                </td>
                <td className={td}>{GRAHA_LABELS[x.lord].split(" ")[0]}</td>
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
          <div className="border-t border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="Seçili bhava">
            <h4 className="font-semibold text-amber-900">
              {b.house}. ev ({SIGN_LABELS[b.rashi]}) · sıra {b.rank}/12 · {num2(b.totalRupas)} rupa
            </h4>
            <p className="text-xs text-slate-600">Bhava madhyası {lon(b.madhya)} · lord {GRAHA_LABELS[b.lord]} (Bhavadhipati Bala = lordun Shadbala toplamı).</p>
            {b.rank === 1 || b.rank === 12 ? <KbBox kb={kb} empty="Bu ev gücü durumu için Bilgi Bankası kaydınız yok." /> : null}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

/**
 * 2026-10-22 — Vedik eşleştirme (Ashtakoot Gun Milan + Manglik) ve Sade Sati TEKNİK görünümleri. Yalnız kanonik teknik katman
 * (sağlayıcı yanıtının doğrulanmış alanları) gösterilir; sağlayıcının hüküm / öneri / etki / çare metinleri BU panellerde YOK —
 * yalnız yorum yetkisiyle ayrı "Otomatik Yorum" panelinde. Hesap YAPILMAZ: tablo / çubuk / evre şeridi yalnız düzenlemedir.
 * Aynı bileşenler canlı sonuç ve kayıtlı analiz (arşiv) görünümünde kullanılır. Mobil (390) ve tablet (768) için tablolar yatay
 * kaydırılır, kartlar tek sütuna iner.
 */

import { SIGN_IDS } from "@/lib/astrology/model/western";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import {
  AYANAMSA_SHORT,
  DOSHA_LABELS,
  KOOTA_BASIS,
  KOOTA_LABELS,
  MANGLIK_HOUSE_GROUP,
  MANGLIK_SEVERITY_LABELS,
  SADE_SATI_HOUSE_FROM_MOON,
  SADE_SATI_PHASES,
  SADE_SATI_PHASE_LABELS,
  saturnSignOf,
  GUN_MILAN_DIRECTION_TEXT,
  GUN_MILAN_METHOD_TEXT,
  MANGLIK_METHOD_TEXT,
  SADE_SATI_METHOD_TEXT,
  SADE_SATI_SCOPE_TEXT,
  type MatchMoon,
  type VedicGunMilanInterpretation,
  type VedicGunMilanTechnical,
  type VedicSadeSatiInterpretation,
  type VedicSadeSatiTechnical,
} from "@/lib/astrology/model/vedicMatch";
import type { KbLookup } from "./VedicPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const trNum = (n: number, d = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(d).replace(".", ","));
const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function MoonCell({ m }: { m: MatchMoon | null | undefined }) {
  if (!m) return <span className="text-slate-400">—</span>;
  return (
    <span>
      <span className="mr-1">{SIGN_GLYPHS[m.rashi]}</span>
      {SIGN_LABELS[m.rashi]} · {NAKSHATRA_LABELS[m.nakshatra] ?? m.nakshatra} {m.pada}. pada
    </span>
  );
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;
  return (
    <span className="flex min-w-[6rem] items-center gap-2">
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 tabular-nums text-sm text-slate-800">
        {trNum(score)} / {max}
      </span>
    </span>
  );
}

// ─── Gun Milan ───────────────────────────────────────────────────────────────
export function GunMilanPanel({ t, names }: { t: VedicGunMilanTechnical; names: [string, string] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-gun-milan-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Ashtakoot Gun Milan — teknik değerlendirme</h4>
          <span className="text-xs text-slate-500">
            sidereal · {AYANAMSA_SHORT[t.frame.ayanamsa]} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-indigo-950" data-testid="astro-gun-milan-total">
          {trNum(t.total)} <span className="text-base font-normal text-slate-500">/ 36 puan</span>{" "}
          <span className="text-sm font-normal text-slate-500">(%{trNum(t.percentage)})</span>
        </p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, t.percentage))}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-600" data-testid="astro-gun-milan-direction">
          1. kişi: <strong>{names[0]}</strong> · 2. kişi: <strong>{names[1]}</strong>. {GUN_MILAN_DIRECTION_TEXT.replace(/^Yön: /, "")}
        </p>
      </section>

      {t.moons && (
        <section className={`${card} overflow-x-auto`} data-testid="astro-gun-milan-moons">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={th}>Kişi</th>
                <th className={th}>Doğumdaki Ay (Vedik D1 kaydından)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>1. kişi — {names[0]}</td>
                <td className={td}>
                  <MoonCell m={t.moons.person1} />
                </td>
              </tr>
              <tr>
                <td className={td}>2. kişi — {names[1]}</td>
                <td className={td}>
                  <MoonCell m={t.moons.person2} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className={`${card} overflow-x-auto`}>
        <table className="min-w-[40rem] w-full" data-testid="astro-gun-milan-table">
          <thead>
            <tr>
              <th className={th}>Koota</th>
              <th className={th}>Neye bakılır</th>
              <th className={th}>1. kişi</th>
              <th className={th}>2. kişi</th>
              <th className={th}>Puan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.kootas.map((k) => (
              <tr key={k.id} data-testid={`astro-koota-${k.id}`}>
                <td className={`${td} font-medium`}>{KOOTA_LABELS[k.id]}</td>
                <td className={`${td} text-xs text-slate-600`}>{KOOTA_BASIS[k.id]}</td>
                <td className={td}>{k.person1.label}</td>
                <td className={td}>{k.person2.label}</td>
                <td className={td}>
                  <ScoreBar score={k.score} max={k.maxScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} p-3`} data-testid="astro-gun-milan-doshas">
        <h4 className="text-sm font-semibold text-slate-700">Dosha analizi (Nadi / Bhakoot)</h4>
        {t.doshas.length === 0 && t.cancellations.length === 0 && <p className="mt-1 text-sm text-slate-600">Nadi veya Bhakoot doshası tespit edilmedi.</p>}
        {t.doshas.length > 0 && (
          <p className="mt-1 text-sm text-slate-800">
            Etkin (iptal edilmemiş): <strong>{t.doshas.map((d) => DOSHA_LABELS[d]).join(", ")}</strong>
          </p>
        )}
        {t.doshas.length === 0 && t.cancellations.length > 0 && <p className="mt-1 text-sm text-slate-600">Etkin dosha yok; tespit edilen dosha klasik kuralla iptal edilmiş.</p>}
        {t.cancellations.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {t.cancellations.map((c) => (
              <li key={c.dosha} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="font-medium">{DOSHA_LABELS[c.dosha]} — iptal</span>
                <span className="block text-xs text-slate-600">Klasik iptal gerekçesi: {c.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} p-3`} data-testid="astro-gun-milan-manglik">
        <h4 className="text-sm font-semibold text-slate-700">Manglik (Kuja dosha) — iki kişi</h4>
        {t.manglik ? (
          <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
            {([0, 1] as const).map((i) => {
              const m = i === 0 ? t.manglik!.person1 : t.manglik!.person2;
              return (
                <div key={i} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm" data-testid={`astro-manglik-${i + 1}`}>
                  <div className="font-medium text-slate-800">
                    {i + 1}. kişi — {names[i]}
                  </div>
                  <div className="text-slate-700">{m.present ? "Manglik durumu: var" : "Manglik durumu: yok"}</div>
                  {m.present && m.severity && (
                    <div className="text-xs text-slate-600">
                      Mars ev grubu: {MANGLIK_HOUSE_GROUP[m.severity]} · geleneksel derece: {MANGLIK_SEVERITY_LABELS[m.severity]}
                    </div>
                  )}
                  {m.exceptions.length > 0 && (
                    <div className="mt-1 text-xs text-slate-600">
                      Azaltıcı / iptal etkenleri:
                      <ul className="ml-4 list-disc">
                        {m.exceptions.map((x, j) => (
                          <li key={j}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-600">Manglik bu kayıtta yok (kişilerden birinin Manglik hesabı tamamlanamadı).</p>
        )}
        <p className="mt-2 text-xs text-slate-500">{MANGLIK_METHOD_TEXT}</p>
      </section>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-gun-milan-method">
        {GUN_MILAN_METHOD_TEXT}
      </p>
    </div>
  );
}

// ─── Sade Sati ───────────────────────────────────────────────────────────────
export function SadeSatiPanel({ t, kbLookup }: { t: VedicSadeSatiTechnical; kbLookup?: KbLookup | null }) {
  const kb = t.present && t.phase && kbLookup ? kbLookup([`gochara_from_moon:saturn:${SADE_SATI_HOUSE_FROM_MOON[t.phase]}`]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-sade-sati-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Sade Sati — değerlendirme günü {fmtDay(t.asOf)}</h4>
          <span className="text-xs text-slate-500">
            sidereal · {AYANAMSA_SHORT[t.frame.ayanamsa]} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold text-indigo-950" data-testid="astro-sade-sati-status">
          {t.present ? "Sade Sati etkin" : "Sade Sati etkin değil"}
          {t.present && t.phase && <span className="ml-2 text-sm font-normal text-slate-600">· {SADE_SATI_PHASE_LABELS[t.phase]}</span>}
        </p>
        {t.present && t.severity && <p className="text-xs text-slate-600">Geleneksel derece (evre sınıflaması): {MANGLIK_SEVERITY_LABELS[t.severity]}</p>}
        <p className="mt-1 text-xs text-slate-600" data-testid="astro-sade-sati-janma">
          Janma Rashi: {t.janma ? <MoonCell m={t.janma} /> : "Vedik D1 kaydı bu ayanamsa ile hesaplanmamış; Janma Rashi burada gösterilmiyor (yeni istek yapılmadı)."}
        </p>
      </section>

      <section className={`${card} overflow-x-auto p-3`} data-testid="astro-sade-sati-timeline">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Evre şeridi (Janma Rashi&apos;den)</h4>
        <ol className="grid min-w-[20rem] grid-cols-3 gap-2">
          {SADE_SATI_PHASES.map((ph) => {
            const on = t.present && t.phase === ph;
            const sign = t.janma ? saturnSignOf(t.janma.rashi, ph, SIGN_IDS) : null;
            return (
              <li key={ph} className={`rounded-lg border px-2 py-2 text-center ${on ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`} data-testid={`astro-sade-sati-phase-${ph}`} aria-current={on ? "step" : undefined}>
                <div className="text-[11px] font-semibold text-slate-500">{SADE_SATI_HOUSE_FROM_MOON[ph]}. ev</div>
                <div className="text-sm text-slate-800">{SADE_SATI_PHASE_LABELS[ph].split(" (")[0]}</div>
                {sign && (
                  <div className="text-xs text-slate-600">
                    {SIGN_GLYPHS[sign]} {SIGN_LABELS[sign]}
                  </div>
                )}
                {on && <div className="mt-0.5 text-[11px] font-semibold text-amber-800">Satürn burada</div>}
              </li>
            );
          })}
        </ol>
      </section>

      {t.present && t.phase && (
        <div className={`${card} px-3 py-2`}>
          <div className="mt-0 border-t-0 pt-0" data-testid="astro-sade-sati-kb">
            <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
            {kb === null ? (
              <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
            ) : kb.length === 0 ? (
              <p className="text-xs text-slate-500">Satürn&apos;ün Janma Rashi&apos;den {SADE_SATI_HOUSE_FROM_MOON[t.phase]}. ev gocharası için Bilgi Bankası kaydınız yok.</p>
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
        </div>
      )}
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-sade-sati-method">
        {SADE_SATI_METHOD_TEXT}
      </p>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-sade-sati-scope">
        {SADE_SATI_SCOPE_TEXT}
      </p>
    </div>
  );
}

// ─── Yorum katmanı (yalnız yorum yetkisiyle; ProviderInterpretationPanel çağırır) ───
export function GunMilanInterpContent({ c }: { c: VedicGunMilanInterpretation }) {
  return (
    <div className="flex flex-col gap-2" data-testid="astro-gun-milan-interp">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Bu bölüm hesaplama servisinin otomatik değerlendirme cümlesidir ve hüküm dili içerebilir; teknik puanlar ve dosha analizi teknik bölümdedir. Uzman değerlendirmesi değildir.
      </p>
      {c.recommendation && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Otomatik değerlendirme cümlesi</div>
          <p className="mt-0.5 whitespace-pre-line">{c.recommendation}</p>
        </div>
      )}
      {c.thresholdMet !== null && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Geleneksel 18 / 36 eşiği</div>
          <p className="mt-0.5">{c.thresholdMet ? "Toplam puan geleneksel eşiğin üzerinde." : "Toplam puan geleneksel eşiğin altında."}</p>
        </div>
      )}
    </div>
  );
}

export function SadeSatiInterpContent({ c }: { c: VedicSadeSatiInterpretation }) {
  return (
    <div className="flex flex-col gap-2" data-testid="astro-sade-sati-interp">
      {c.description && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Açıklama</div>
          <p className="mt-0.5 whitespace-pre-line">{c.description}</p>
        </div>
      )}
      {c.general && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Dönemin genel teması</div>
          <p className="mt-0.5 whitespace-pre-line">{c.general}</p>
        </div>
      )}
      {c.phaseEffect && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Bu evrenin teması</div>
          <p className="mt-0.5 whitespace-pre-line">{c.phaseEffect}</p>
        </div>
      )}
      {c.remedies.length > 0 && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Geleneksel uygulamalar (servis metni; öneri değildir)</div>
          <ul className="ml-4 mt-0.5 list-disc">
            {c.remedies.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

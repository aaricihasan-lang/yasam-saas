"use client";

/**
 * "Hesaplama / Teknik Veriler" — yalnız kanonik teknik katman. Sağlayıcı metni içermez;
 * tüm etiketler Yaşam Sistemi sözlüğünden (lib/astrology/labels/tr).
 */

import type { ReactNode } from "react";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import {
  ASPECT_GLYPHS,
  ASPECT_LABELS,
  BODY_GLYPHS,
  BODY_LABELS,
  DIGNITY_LABELS,
  ELEMENT_LABELS,
  MODALITY_LABELS,
  NATURE_LABELS,
  PATTERN_LABELS,
  SIGN_GLYPHS,
  SIGN_LABELS,
  formatDegree,
} from "@/lib/astrology/labels/tr";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{title}</h4>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function SignCell({ sign, degree }: { sign: keyof typeof SIGN_LABELS; degree: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {SIGN_LABELS[sign]} {formatDegree(degree)}
    </span>
  );
}

export default function NatalTechnicalPanel({ technical, timeUnknown }: { technical: NatalTechnical; timeUnknown: boolean }) {
  const t = technical;
  return (
    <div className="flex flex-col gap-3">
      {timeUnknown && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Doğum saati bilinmiyor: evler, Yükselen/MC, ev yerleşimleri, Şans Noktası ve Vertex gösterilmez. Ay konumu gün
          içinde ~13° değişebileceğinden Ay açıları yaklaşık kabul edilmelidir (hesap yerel 12:00 için yapılmıştır).
        </p>
      )}

      <Section title="Gezegenler ve noktalar">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>Burç / derece</th>
              {!timeUnknown && <th className={th}>Ev</th>}
              <th className={th}>Hız (°/gün)</th>
              <th className={th}>Konum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5 text-base">{BODY_GLYPHS[b.id]}</span>
                  {BODY_LABELS[b.id]}
                  {b.id === "lilith" && t.variants?.lilith === "mean" && <span className="ml-1 text-xs text-slate-500">(ortalama)</span>}
                  {(b.id === "north_node" || b.id === "south_node") && t.variants && (
                    <span className="ml-1 text-xs text-slate-500">({t.variants.node === "true" ? "gerçek" : "ortalama"})</span>
                  )}
                  {b.retrograde && <span className="ml-1 font-semibold text-rose-600" title="Retro">℞</span>}
                </td>
                <td className={td}>
                  <SignCell sign={b.sign} degree={b.degreeInSign} />
                </td>
                {!timeUnknown && <td className={td}>{b.house ?? "—"}</td>}
                <td className={`${td} tabular-nums`}>{b.speed.toFixed(4)}</td>
                <td className={td}>{b.dignity ? DIGNITY_LABELS[b.dignity] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {!timeUnknown && t.angles && (
        <Section title="Açısal noktalar">
          <table className="min-w-full">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>Yükselen (ASC)</td>
                <td className={td}>
                  <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} />
                </td>
              </tr>
              <tr>
                <td className={td}>Tepe Noktası (MC)</td>
                <td className={td}>
                  <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
                </td>
              </tr>
              {t.points.partOfFortune && (
                <tr>
                  <td className={td}>
                    Şans Noktası{t.points.partOfFortune.sect ? ` (${t.points.partOfFortune.sect === "day" ? "gündüz" : "gece"} haritası)` : ""}
                  </td>
                  <td className={td}>
                    <SignCell sign={t.points.partOfFortune.sign} degree={t.points.partOfFortune.degreeInSign} />
                    {t.points.partOfFortune.house ? ` · ${t.points.partOfFortune.house}. ev` : ""}
                  </td>
                </tr>
              )}
              {t.points.vertex && (
                <tr>
                  <td className={td}>Vertex</td>
                  <td className={td}>
                    <SignCell sign={t.points.vertex.sign} degree={t.points.vertex.degreeInSign} />
                    {t.points.vertex.house ? ` · ${t.points.vertex.house}. ev` : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      )}

      {!timeUnknown && t.houses.length > 0 && (
        <Section title="Ev başlangıçları (cusp)">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-sm sm:grid-cols-3">
            {t.houses.map((h) => (
              <div key={h.number} className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
                <span className="font-medium text-slate-600">{h.number}. ev</span>
                <SignCell sign={h.sign} degree={h.degreeInSign} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Açılar (${t.aspects.length})`}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Açı</th>
              <th className={th}>Tür</th>
              <th className={th}>Orb</th>
              <th className={th}>Hareket</th>
              <th className={th}>Güç</th>
              <th className={th}>Nitelik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.aspects.map((a, i) => (
              <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
                <td className={`${td} whitespace-nowrap`}>
                  {BODY_GLYPHS[a.a]} <span className="mx-1 text-slate-500">{ASPECT_GLYPHS[a.type]}</span> {BODY_GLYPHS[a.b]}
                  <span className="ml-2 text-xs text-slate-500">
                    {BODY_LABELS[a.a]} – {BODY_LABELS[a.b]}
                  </span>
                </td>
                <td className={td}>{ASPECT_LABELS[a.type]}</td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>{a.applying ? "Yaklaşan" : "Ayrılan"}</td>
                <td className={`${td} tabular-nums`}>%{Math.round(a.strength)}</td>
                <td className={td}>{a.nature ? NATURE_LABELS[a.nature] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {t.patterns.length > 0 && (
        <Section title="Açı kalıpları">
          <ul className="divide-y divide-slate-100">
            {t.patterns.map((p, i) => (
              <li key={`${p.kind}-${i}`} className="px-3 py-2 text-sm text-slate-800">
                <span className="font-semibold">{PATTERN_LABELS[p.kind]}</span>
                <span className="ml-2">{p.bodies.map((b) => BODY_GLYPHS[b]).join(" ")}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {p.bodies.map((b) => BODY_LABELS[b]).join(", ")}
                  {p.apex ? ` · tepe: ${BODY_LABELS[p.apex]}` : ""}
                  {p.element ? ` · ${ELEMENT_LABELS[p.element]}` : ""}
                  {p.modality ? ` · ${MODALITY_LABELS[p.modality]}` : ""}
                  {p.tightness !== null ? ` · sıkılık %${Math.round(p.tightness)}` : ""}
                  {p.outOfSign ? " · burç dışı" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Dağılım özeti">
        <div className="grid gap-3 px-3 py-2 text-sm sm:grid-cols-2">
          {t.summary.elementDistribution && (
            <div>
              <div className="mb-1 font-medium text-slate-600">
                Element {t.summary.dominantElement ? `· baskın: ${ELEMENT_LABELS[t.summary.dominantElement]}` : ""}
              </div>
              {(Object.keys(t.summary.elementDistribution) as (keyof typeof ELEMENT_LABELS)[]).map((k) => (
                <div key={k} className="flex justify-between">
                  <span>{ELEMENT_LABELS[k]}</span>
                  <span className="tabular-nums">{t.summary.elementDistribution![k]}</span>
                </div>
              ))}
            </div>
          )}
          {t.summary.modalityDistribution && (
            <div>
              <div className="mb-1 font-medium text-slate-600">
                Nitelik {t.summary.dominantModality ? `· baskın: ${MODALITY_LABELS[t.summary.dominantModality]}` : ""}
              </div>
              {(Object.keys(t.summary.modalityDistribution) as (keyof typeof MODALITY_LABELS)[]).map((k) => (
                <div key={k} className="flex justify-between">
                  <span>{MODALITY_LABELS[k]}</span>
                  <span className="tabular-nums">{t.summary.modalityDistribution![k]}</span>
                </div>
              ))}
            </div>
          )}
          <div className="sm:col-span-2 text-slate-600">
            Açı dengesi: {t.summary.aspectBalance.harmonious ?? "—"} uyumlu · {t.summary.aspectBalance.challenging ?? "—"} zorlayıcı ·{" "}
            {t.summary.aspectBalance.neutral ?? "—"} nötr
            {t.summary.retrograde.length > 0 && <> · Retro: {t.summary.retrograde.map((b) => BODY_LABELS[b]).join(", ")}</>}
          </div>
        </div>
      </Section>
    </div>
  );
}

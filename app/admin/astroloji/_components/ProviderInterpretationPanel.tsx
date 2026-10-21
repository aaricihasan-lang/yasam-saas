"use client";

/**
 * "Roxy Otomatik Yorumu" — teknik verilerden AYRI panel. İçerik yalnız sunucu yanıtta
 * gönderdiyse (yetki + önizleme kapalı) gösterilir; aksi hâlde yalnız durum kartı.
 * Uzmanın kendi yorumu ile KARIŞTIRILMAZ. Tüm teknikler (natal + Aşama 3) şemaya göre çizilir.
 */

import { interpretationKindOfSchema, type InterpretationKind } from "@/lib/astrology/interpretationKind";
import { localSpaceCenterNote, localSpaceText, type LocalSpaceCenter } from "@/lib/astrology/localSpaceCenter";
import { dayKeyInZone, formatInZone, isIanaZone } from "@/lib/astrology/transitDetail";
import type { ReactNode } from "react";
import type { NatalInterpretation } from "@/lib/astrology/model/western";
import type {
  ForecastInterpretation,
  CompositeInterpretation,
  PointId,
  ProgressionInterpretation,
  ReturnInterpretation,
  SolarArcInterpretation,
  SynastryInterpretation,
  TransitInterpretation,
} from "@/lib/astrology/model/westernTiming";
import { ASPECT_GLYPHS, ASPECT_LABELS, BODY_GLYPHS, BODY_LABELS, PATTERN_LABELS } from "@/lib/astrology/labels/tr";
import type { AstrocartographyInterpretation, LocalSpaceInterpretation, RelocationInterpretation } from "@/lib/astrology/model/westernLocation";
import type { VedicD1Interpretation, VedicDashaInterpretation, VedicPanchangaInterpretation, VedicShadbalaInterpretation, VedicTransitInterpretation, VedicVargaInterpretation } from "@/lib/astrology/model/vedic";
import { GRAHA_LABELS, VEDIC_YOGA_NAMES } from "@/lib/astrology/topics/vedic";
import type { FixedStarsInterpretation } from "@/lib/astrology/model/westernFixedStars";
import { fixedStarName, starKeywordTr } from "@/lib/astrology/labels/fixedStars";
import { PROFECTIONS_INTERP_MISSING, PROFECTIONS_INTERP_NOTE, type ProfectionsInterpretation } from "@/lib/astrology/model/westernProfections";
// 22.10.2026 Vedik harita teknik açıklamaları (ayrı satır).
import { ARUDHA_ABBR, ARUDHA_NAMES, CHARA_KARAKA_NAMES, type VedicArudhaInterpretation, type VedicCharaKarakaInterpretation } from "@/lib/astrology/model/vedicHarita";

export type InterpretationLayer =
  | { visible: true; provider: string; lang: string; content: unknown; notice: string }
  | { visible: false; reason: string };

const HIDDEN_TEXT: Record<string, string> = {
  not_entitled: "Bu hesap için sistem yorumu yetkisi kapalı. Hesaplama ve teknik veriler kullanılabilir.",
  owner_preview_hidden:
    "Önizleme: “Yorumu kapalı uzman görünümü” açık. Yorum yetkisi kapalı bir uzman bu alanda yalnız bu notu görür; sunucu yorum içeriğini yanıta hiç koymaz.",
  unavailable: "Bu hesap sonucu için sağlayıcı yorum katmanı bulunmuyor.",
};

const pointLabel = (p: PointId) => (p === "ascendant" ? "Yükselen" : p === "midheaven" ? "MC" : BODY_LABELS[p]);

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((k, i) => (
        <span key={`${k}-${i}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
          {k}
        </span>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 font-semibold text-sky-900">{title}</h4>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}
/** 6.1C: Roxy KP güç etiketleri (İngilizce) → Türkçe; "bağ derecesi", olay olasılığı değil. */
export const KP_STRENGTH_TR: Record<string, string> = { "very-strong": "çok güçlü bağ", strong: "güçlü bağ", moderate: "orta bağ", weak: "zayıf bağ" };
const Item = ({ children }: { children: ReactNode }) => <li className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{children}</li>;
const P = ({ text }: { text: string | null | undefined }) => (text ? <p className="mt-0.5 whitespace-pre-line">{text}</p> : null);
/** 6: Roxy houseThemes (ev anahtar kelimeleri; sağlayıcı anlatısı). */
function HouseThemes({ themes }: { themes: { house: number; keywords: string[] }[] }) {
  return (
    <Block title="Ev anahtar kelimeleri">
      {themes.map((t) => (
        <Item key={t.house}>
          <span className="font-medium">{t.house}. ev:</span> {t.keywords.join(", ")}
        </Item>
      ))}
    </Block>
  );
}

function StrengthsChallenges({ strengths, challenges }: { strengths: string[]; challenges: string[] }) {
  return (
    <>
      {strengths.length > 0 && (
        <Block title="Güçlü yanlar">
          {strengths.map((s, i) => (
            <Item key={i}>{s}</Item>
          ))}
        </Block>
      )}
      {challenges.length > 0 && (
        <Block title="Zorlayıcı yanlar">
          {challenges.map((s, i) => (
            <Item key={i}>{s}</Item>
          ))}
        </Block>
      )}
    </>
  );
}

function Content({ content, displayTz = null }: { content: unknown; displayTz?: string | null }) {
  const schema = (content as { schema?: string }).schema;
  switch (schema) {
    case "astro.western.natal.interp.v1": {
      const c = content as NatalInterpretation;
      return (
        <>
          {c.overall.aspectSummary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.overall.aspectSummary}</p>}
          {c.bodies.length > 0 && (
            <Block title="Gezegen yerleşimleri">
              {c.bodies.map((b) => (
                <Item key={b.id}>
                  <div className="font-medium">
                    {BODY_GLYPHS[b.id]} {BODY_LABELS[b.id]}
                  </div>
                  <P text={b.summary} />
                  {b.detailed && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-sky-700">Ayrıntılı metin</summary>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{b.detailed}</p>
                    </details>
                  )}
                  <Chips items={b.keywords} />
                </Item>
              ))}
            </Block>
          )}
          {c.aspects.length > 0 && (
            <Block title="Açılar">
              {c.aspects.map((a, i) => (
                <Item key={`${a.a}-${a.b}-${a.type}-${i}`}>
                  <div className="font-medium">
                    {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                    <span className="text-xs text-slate-500">
                      {BODY_LABELS[a.a]} – {BODY_LABELS[a.b]} · {ASPECT_LABELS[a.type]}
                    </span>
                  </div>
                  <P text={a.summary} />
                  <Chips items={a.keywords} />
                </Item>
              ))}
            </Block>
          )}
          {c.patterns.length > 0 && (
            <Block title="Açı kalıpları">
              {c.patterns.map((p, i) => (
                <Item key={`${p.kind}-${i}`}>
                  <span className="font-medium">{PATTERN_LABELS[p.kind]}: </span>
                  {p.text}
                </Item>
              ))}
            </Block>
          )}
        </>
      );
    }
    case "astro.western.transit.interp.v1": {
      const c = content as TransitInterpretation;
      return (
        <Block title="Transit açıları">
          {c.aspects.map((a, i) => (
            <Item key={`${a.transit}-${a.type}-${a.natal}-${i}`}>
              <div className="font-medium">
                Transit {BODY_GLYPHS[a.transit]} {BODY_LABELS[a.transit]} {ASPECT_GLYPHS[a.type]} {ASPECT_LABELS[a.type]} natal {pointLabel(a.natal)}
              </div>
              <P text={a.summary} />
              {a.timing && <p className="mt-0.5 text-xs text-slate-500">Zamanlama: {a.timing}</p>}
              <P text={a.impact} />
              {a.guidance && <p className="mt-0.5 italic text-slate-700">{a.guidance}</p>}
              <Chips items={a.keywords} />
            </Item>
          ))}
        </Block>
      );
    }
    case "astro.western.forecast.interp.v1": {
      // Transit takvimi: Roxy olay başına TEK cümle verir (ayrı anlatı / özet yorumu yok). Metin aynen, ay ay.
      const c = content as ForecastInterpretation;
      const months = new Map<string, ForecastInterpretation["events"]>();
      // TRANSİT-01: gösterim saat dilimi seçiliyse (takvim seçeneği) yerel saat + UTC; ay gruplaması da o bölgeye göre.
      const tz = displayTz && displayTz !== "UTC" && isIanaZone(displayTz) ? displayTz : null;
      const monthOf = (dt: string) => (tz ? (dayKeyInZone(dt, tz) ?? dt).slice(0, 7) : dt.slice(0, 7));
      for (const e of c.events) months.set(monthOf(e.datetime), [...(months.get(monthOf(e.datetime)) ?? []), e]);
      return (
        <>
          <p className="mb-2 text-xs text-slate-500">Bu teknikte ayrı bir genel otomatik yorum bulunmuyor; her olayın otomatik açıklama cümlesi aşağıda değiştirilmeden listelenir ({c.events.length} olay).</p>
          {[...months.entries()].map(([m, list]) => (
            <Block key={m} title={`${m.slice(5, 7)}.${m.slice(0, 4)} (${list.length})`}>
              {list.map((e, i) => (
                <Item key={`${e.datetime}-${i}`}>
                  <div className="text-xs tabular-nums text-slate-500">
                    {tz && formatInZone(e.datetime, tz) ? (
                      <>
                        <span className="font-medium text-slate-700" data-testid="astro-forecast-interp-local">
                          {formatInZone(e.datetime, tz)!.text} {formatInZone(e.datetime, tz)!.zone}
                        </span>{" "}
                        · {e.datetime.slice(11, 16)} UTC
                      </>
                    ) : (
                      <>
                        {e.datetime.slice(8, 10)}.{e.datetime.slice(5, 7)}.{e.datetime.slice(0, 4)} {e.datetime.slice(11, 16)} UTC
                      </>
                    )}
                  </div>
                  <P text={e.text} />
                </Item>
              ))}
            </Block>
          ))}
        </>
      );
    }
    case "astro.western.progression.interp.v1":
    case "astro.western.solar_arc.interp.v1": {
      const c = content as ProgressionInterpretation | SolarArcInterpretation;
      const items: { id: PointId; text: string }[] = "bodies" in c ? c.bodies : c.directed;
      return (
        <>
          {c.overall && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.overall}</p>}
          <Block title="Noktalar">
            {items.map((x) => (
              <Item key={x.id}>
                <div className="font-medium">{pointLabel(x.id)}</div>
                <P text={x.text} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.return.interp.v1": {
      const c = content as ReturnInterpretation;
      return (
        <>
          {c.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.summary}</p>}
          {c.purpose && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.purpose}</p>}
          <Chips items={c.keyThemes} />
        </>
      );
    }
    case "astro.western.synastry.interp.v1": {
      const c = content as SynastryInterpretation;
      return (
        <>
          {c.overall.text && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.overall.text}</p>}
          <StrengthsChallenges strengths={c.overall.strengths} challenges={c.overall.challenges} />
          <Block title="Kişiler arası açılar">
            {c.aspects.map((a, i) => (
              <Item key={`${a.a}-${a.type}-${a.b}-${i}`}>
                <div className="font-medium">
                  {BODY_GLYPHS[a.a]} {BODY_LABELS[a.a]} (1) {ASPECT_GLYPHS[a.type]} {ASPECT_LABELS[a.type]} {BODY_GLYPHS[a.b]} {BODY_LABELS[a.b]} (2)
                </div>
                <P text={a.short} />
                {a.long && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-sky-700">Ayrıntılı metin</summary>
                    <p className="mt-1 whitespace-pre-line text-slate-700">{a.long}</p>
                  </details>
                )}
                {a.relationshipContext && <p className="mt-0.5 text-xs text-slate-600">{a.relationshipContext}</p>}
                <Chips items={a.keywords} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.composite.interp.v1": {
      const c = content as CompositeInterpretation;
      return (
        <>
          {c.overall.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.overall.summary}</p>}
          <StrengthsChallenges strengths={c.overall.strengths} challenges={c.overall.challenges} />
          <Block title="Composite gezegenler">
            {c.bodies.map((b) => (
              <Item key={b.id}>
                <div className="font-medium">
                  {BODY_GLYPHS[b.id]} {BODY_LABELS[b.id]}
                </div>
                <P text={b.summary} />
                <P text={b.relationshipMeaning} />
                <Chips items={b.keywords} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.astrocartography.interp.v1": {
      const c = content as AstrocartographyInterpretation;
      const ANG: Record<string, string> = { mc: "MC", ic: "IC", asc: "AC", dsc: "DC" };
      return (
        <>
          {c.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.summary}</p>}
          <Block title="Hatlar">
            {c.lines.map((l) => (
              <Item key={`${l.id}-${l.angle}`}>
                <div className="font-medium">
                  {BODY_GLYPHS[l.id]} {BODY_LABELS[l.id]} — {ANG[l.angle]} hattı
                </div>
                <P text={l.text} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.relocation.interp.v1": {
      const c = content as RelocationInterpretation;
      return (
        <>
          {c.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.summary}</p>}
          <Block title="Yeni evlerdeki gezegenler">
            {c.bodies.map((b) => (
              <Item key={b.id}>
                <div className="font-medium">
                  {BODY_GLYPHS[b.id]} {BODY_LABELS[b.id]}
                </div>
                <P text={b.summary} />
                {b.detailed && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-sky-700">Ayrıntılı metin</summary>
                    <p className="mt-1 whitespace-pre-line text-slate-700">{b.detailed}</p>
                  </details>
                )}
                <Chips items={b.keywords} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.local_space.interp.v1": {
      const c = content as LocalSpaceInterpretation;
      return (
        <>
          {c.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.summary}</p>}
          <Block title="Yön hatları">
            {c.bodies.map((b) => (
              <Item key={b.id}>
                <div className="font-medium">
                  {BODY_GLYPHS[b.id]} {BODY_LABELS[b.id]}
                </div>
                <P text={b.text} />
              </Item>
            ))}
          </Block>
        </>
      );
    }
    case "astro.western.profections.interp.v1": {
      // 2026-10-20 (owner): sağlayıcının kısa açıklaması + özeti AYNEN, düz metin (React kaçışlı; HTML çalıştırılmaz).
      const c = content as ProfectionsInterpretation;
      const summary = c.summary && c.summary !== c.text ? c.summary : null;
      return (
        <div className="flex flex-col gap-2" data-testid="astro-profections-interp">
          <p className="text-xs text-slate-500">{PROFECTIONS_INTERP_NOTE}</p>
          {!c.text && !summary ? (
            <p className="text-slate-600" data-testid="astro-profections-interp-missing">
              {PROFECTIONS_INTERP_MISSING}
            </p>
          ) : (
            <>
              {c.text && (
                <p className="whitespace-pre-line" data-testid="astro-profections-interp-text">
                  {c.text}
                </p>
              )}
              {summary && (
                <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-700 max-sm:px-2" data-testid="astro-profections-interp-summary">
                  {summary}
                </p>
              )}
            </>
          )}
        </div>
      );
    }
    case "astro.western.fixed_stars.interp.v1": {
      const c = content as FixedStarsInterpretation;
      const used = new Set(c.contacts.map((x) => x.star));
      return (
        <>
          <p className="text-xs text-slate-500">Kavuşum metinleri otomatik yorum metinleridir ve sağlayıcı sorgusundaki (3°) tüm temasları kapsar. Anahtar kelimeler kaynak veride İngilizce gelir; Yaşam sözlüğüyle Türkçeleştirilmiştir.</p>
          {c.summary && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">{c.summary}</p>}
          <Block title="Sabit yıldız kavuşumları">
            {c.contacts.map((x) => (
              <Item key={`${x.star}|${x.point}`}>
                <div className="font-medium">
                  {fixedStarName(x.star)} {ASPECT_GLYPHS.conjunction} {ASPECT_LABELS.conjunction} {(x.point as string) in BODY_GLYPHS ? BODY_GLYPHS[x.point as keyof typeof BODY_GLYPHS] : ""} {pointLabel(x.point as PointId)}
                </div>
                <P text={x.text} />
                <Chips items={(c.stars.find((s) => s.id === x.star)?.keywords ?? []).map(starKeywordTr)} />
              </Item>
            ))}
          </Block>
          {c.stars.some((s) => !used.has(s.id) && s.keywords.length > 0) && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-sky-700">Kavuşumu olmayan yıldızların anahtar kelimeleri</summary>
              <Block title="Diğer yıldızlar">
                {c.stars
                  .filter((s) => !used.has(s.id))
                  .map((s) => (
                    <Item key={s.id}>
                      <div className="font-medium">{fixedStarName(s.id)}</div>
                      <Chips items={s.keywords.map(starKeywordTr)} />
                    </Item>
                  ))}
              </Block>
            </details>
          )}
        </>
      );
    }
    case "astro.vedic.d1.interp.v1": {
      const c = content as VedicD1Interpretation;
      return (
        <>
          {c.grahas.length > 0 && (
            <Block title="Graha yorumları (rashi / nakshatra)">
              {c.grahas.map((g) => (
                <Item key={g.id}>
                  <div className="font-medium">{g.id === "lagna" ? "Lagna" : GRAHA_LABELS[g.id]}</div>
                  <P text={g.rashi} />
                  <P text={g.nakshatra} />
                </Item>
              ))}
            </Block>
          )}
          {c.houses.length > 0 && (
            <Block title="Bhava açıklamaları">
              {c.houses.map((h) => (
                <Item key={h.number}>
                  <div className="font-medium">{h.number}. bhava</div>
                  <P text={h.description} />
                  <Chips items={h.themes} />
                </Item>
              ))}
            </Block>
          )}
          {c.yogas.length > 0 && (
            <details className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
              <summary className="cursor-pointer font-semibold text-sky-900">Yoga ansiklopedisi ({c.yogas.length}) — genel otomatik yoga açıklamaları; çoğu bu haritada OLUŞMAMIŞTIR (oluşanlar teknik bölümde işaretli)</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {c.yogas.map((y) => (
                  <li key={y.id}>
                    <div className="font-medium">{VEDIC_YOGA_NAMES[y.id] ? `${VEDIC_YOGA_NAMES[y.id]} Yoga` : y.id}</div>
                    <P text={y.description} />
                    <P text={y.result} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      );
    }
    case "astro.vedic.dasha.interp.v1": {
      const c = content as VedicDashaInterpretation;
      return (
        <>
          {c.parent && <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">Üst dönem: {c.parent}</p>}
          <Block title="Dönem yorumları">
            {c.periods.map((p) => (
              <Item key={`${p.lord}-${p.start}`}>
                <div className="font-medium">
                  {GRAHA_LABELS[p.lord]} · {p.start.slice(0, 10)}
                </div>
                <P text={p.text} />
              </Item>
            ))}
          </Block>
          {c.kpStrength && c.kpStrength.length > 0 && (
            <Block title="KP dönem gücü — lordun gösterdiği evlere bağ derecesi; olay olasılığı veya olumluluk DEĞİLDİR (otomatik değerlendirme)">
              {c.kpStrength.map((k) => (
                <Item key={`kp-${k.lord}-${k.start}`}>
                  <span className="font-medium">{GRAHA_LABELS[k.lord]}</span> · {k.start.slice(0, 10)} · puan {k.score} · derece {k.grade} · {KP_STRENGTH_TR[k.label] ?? k.label}
                </Item>
              ))}
            </Block>
          )}
          {c.houseThemes && c.houseThemes.length > 0 && <HouseThemes themes={c.houseThemes} />}
        </>
      );
    }
    case "astro.kp.chart.interp.v1":
    case "astro.kp.extra.interp.v1": {
      const c = content as { houseThemes: { house: number; keywords: string[] }[] };
      return c.houseThemes.length > 0 ? <HouseThemes themes={c.houseThemes} /> : <p className="text-slate-600">Bu KP sonucu için sağlayıcı açıklaması yok.</p>;
    }
    case "astro.vedic.bhav_chalit.interp.v1":
    case "astro.vedic.bhava_bala.interp.v1": {
      const c = content as { houseThemes: { house: number; keywords: string[] }[] };
      return c.houseThemes.length > 0 ? <HouseThemes themes={c.houseThemes} /> : <p className="text-slate-600">Bu sonuç için ev teması açıklaması yok.</p>;
    }
    case "astro.vedic.chara_karaka.interp.v1": {
      const c = content as VedicCharaKarakaInterpretation;
      return (
        <Block title="Chara karaka açıklamaları">
          {c.karakas.map((x) => (
            <Item key={x.id}>
              <div className="font-medium">
                {CHARA_KARAKA_NAMES[x.id] ?? x.id}
                {x.meaning ? ` — ${x.meaning}` : ""}
              </div>
              <P text={x.significations} />
            </Item>
          ))}
        </Block>
      );
    }
    case "astro.vedic.arudha.interp.v1": {
      const c = content as VedicArudhaInterpretation;
      return (
        <Block title="Arudha pada açıklamaları">
          {c.padas.map((x) => (
            <Item key={x.id}>
              <div className="font-medium">
                {ARUDHA_NAMES[x.id] ?? x.id} ({ARUDHA_ABBR[x.id] ?? x.id}){x.meaning ? ` — ${x.meaning}` : ""}
              </div>
              <P text={x.significations} />
            </Item>
          ))}
        </Block>
      );
    }
    case "astro.vedic.shadbala.interp.v1": {
      const c = content as VedicShadbalaInterpretation;
      return (
        <Block title="Shadbala bileşenleri (sağlayıcı açıklaması)">
          {c.themes.map((x) => (
            <Item key={x.component}>
              <div className="font-medium">{x.name ?? x.component}</div>
              <P text={x.meaning} />
            </Item>
          ))}
        </Block>
      );
    }
    case "astro.vedic.panchanga.interp.v1": {
      const c = content as VedicPanchangaInterpretation;
      return (
        <Block title="Panchanga açıklamaları">
          {c.nakshatra && (
            <Item>
              <div className="font-medium">Nakshatra</div>
              <P text={c.nakshatra} />
            </Item>
          )}
          {c.yoga && (
            <Item>
              <div className="font-medium">Nitya yoga</div>
              <P text={c.yoga} />
            </Item>
          )}
          {c.karana && (
            <Item>
              <div className="font-medium">Karana</div>
              <P text={c.karana} />
            </Item>
          )}
        </Block>
      );
    }
    case "astro.vedic.transit.interp.v1": {
      const c = content as VedicTransitInterpretation;
      return (
        <Block title="Gochara vurguları (sağlayıcı metni)">
          {/* 2026-10-11 canlı doğrulama: Roxy bu uçta Türkçe (lang=tr) istense de metni İngilizce döndürüyor.
              Metin çevrilmez, değiştirilmez; dili açıkça belirtilir. */}
          <p className="text-xs text-slate-500" data-testid="astro-interp-lang-note">
            Not: Sağlayıcı bu bölümü yalnız İngilizce veriyor; metin çevrilmeden, olduğu gibi gösterilir.
          </p>
          {c.keyTransits.map((x) => (
            <Item key={x.id}>
              <div className="font-medium">{GRAHA_LABELS[x.id]}</div>
              <P text={x.text} />
            </Item>
          ))}
        </Block>
      );
    }
    case "astro.vedic.varga.interp.v1": {
      const c = content as VedicVargaInterpretation;
      return c.significance ? <p className="rounded-lg bg-white px-3 py-2 max-sm:px-0">Bölümün anlamı: {c.significance}</p> : <p className="text-slate-600">Bu bölüm için sağlayıcı açıklaması yok.</p>;
    }
    default:
      return <p className="text-slate-600">Bu yorum biçimi tanınmıyor.</p>;
  }
}

/**
 * Görüntüleme koruması: metinlerin içine karışmış sistem anahtarlarını (ör. "[RXN-mars-summary]") YALNIZ ekranda
 * gizler. Kayıtlı veri, API yanıtı ve teknik/denetim kayıtları DEĞİŞMEZ (salt-okunur kopya üzerinde çalışır).
 */
const SYSTEM_KEY_RE = /\[[A-Z]{2,6}-[A-Za-z0-9_.:-]+\]\s?/g;
export function stripSystemKeys<T>(v: T): T {
  if (typeof v === "string") return v.replace(SYSTEM_KEY_RE, "").trim() as T;
  if (Array.isArray(v)) return v.map((x) => stripSystemKeys(x)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = stripSystemKeys(x);
    return out as T;
  }
  return v;
}

/** Sağlayıcı katmanında anlatı değil, teknik bileşen / terim açıklaması taşıyan şemalar (KP, Shadbala, Panchanga, Varga). */
/** Sekme / panel başlığı: anlatı içeriyorsa "Otomatik Yorum", yalnız teknik açıklamaysa "Teknik Açıklama" (karar
 * lib/astrology/interpretationKind.ts'te — Word/PDF aynı kaynağı kullanır). */
export function interpretationTitle(interpretation: InterpretationLayer): InterpretationKind {
  if (!interpretation.visible) return "Otomatik Yorum";
  return interpretationKindOfSchema((interpretation.content as { schema?: string } | null)?.schema ?? "");
}

/** 2026-10-16: Local Space merkezi doğum yerinden farklıysa kalıptaki yer atfı seçilen merkeze bağlanır (rapordakiyle aynı). */
function withLocalSpaceCenter(content: unknown, center: LocalSpaceCenter | null | undefined): { content: unknown; note: string | null } {
  const c = content as { schema?: unknown; bodies?: unknown; summary?: unknown } | null;
  if (!center || !c || c.schema !== "astro.western.local_space.interp.v1") return { content, note: null };
  const bodies = Array.isArray(c.bodies) ? (c.bodies as { text?: unknown }[]).map((b) => (typeof b?.text === "string" ? { ...b, text: localSpaceText(b.text, center) } : b)) : c.bodies;
  return { content: { ...c, bodies, ...(typeof c.summary === "string" ? { summary: localSpaceText(c.summary, center) } : {}) }, note: localSpaceCenterNote(center) };
}

export default function ProviderInterpretationPanel({
  interpretation,
  localSpace,
  displayTz = null,
}: {
  interpretation: InterpretationLayer;
  localSpace?: LocalSpaceCenter | null;
  /** TRANSİT-01: analiz seçeneğindeki gösterim saat dilimi (Transit Takvimi olay açıklamalarında yerel saat). */
  displayTz?: string | null;
}) {
  const title = interpretationTitle(interpretation);
  const ls = interpretation.visible ? withLocalSpaceCenter(stripSystemKeys(interpretation.content), localSpace) : null;
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:px-3" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-2.5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="h-2 w-2 rounded-full bg-[#c9a54e]" aria-hidden="true" />
          {title}
        </h3>
        <span className="text-[11px] text-slate-500" title={interpretation.visible ? interpretation.notice : "Bu bölüm otomatik oluşturulmuştur; uzman yorumu değildir."}>
          Otomatik oluşturulmuştur · uzman yorumu değildir
        </span>
      </div>
      {!interpretation.visible ? (
        <p className="text-sm text-slate-600">{HIDDEN_TEXT[interpretation.reason] ?? HIDDEN_TEXT.unavailable}</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm text-slate-800">
          {ls?.note && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-ls-center-note">
              {ls.note}
            </p>
          )}
          <Content content={ls ? ls.content : stripSystemKeys(interpretation.content)} displayTz={displayTz} />
        </div>
      )}
    </section>
  );
}

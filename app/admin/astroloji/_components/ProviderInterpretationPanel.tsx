"use client";

/**
 * "Roxy Otomatik Yorumu" — teknik verilerden AYRI panel. İçerik yalnız sunucu yanıtta
 * gönderdiyse (yetki + önizleme kapalı) gösterilir; aksi hâlde yalnız durum kartı.
 * Uzmanın kendi yorumu ile KARIŞTIRILMAZ. Tüm teknikler (natal + Aşama 3) şemaya göre çizilir.
 */

import type { ReactNode } from "react";
import type { NatalInterpretation } from "@/lib/astrology/model/western";
import type {
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
const Item = ({ children }: { children: ReactNode }) => <li className="rounded-lg bg-white px-3 py-2">{children}</li>;
const P = ({ text }: { text: string | null | undefined }) => (text ? <p className="mt-0.5 whitespace-pre-line">{text}</p> : null);
/** 6: Roxy houseThemes (ev anahtar kelimeleri; sağlayıcı anlatısı). */
function HouseThemes({ themes }: { themes: { house: number; keywords: string[] }[] }) {
  return (
    <Block title="Ev anahtar kelimeleri (Roxy)">
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

function Content({ content }: { content: unknown }) {
  const schema = (content as { schema?: string }).schema;
  switch (schema) {
    case "astro.western.natal.interp.v1": {
      const c = content as NatalInterpretation;
      return (
        <>
          {c.overall.aspectSummary && <p className="rounded-lg bg-white px-3 py-2">{c.overall.aspectSummary}</p>}
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
                Transit {BODY_LABELS[a.transit]} {ASPECT_LABELS[a.type]} natal {pointLabel(a.natal)}
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
    case "astro.western.progression.interp.v1":
    case "astro.western.solar_arc.interp.v1": {
      const c = content as ProgressionInterpretation | SolarArcInterpretation;
      const items: { id: PointId; text: string }[] = "bodies" in c ? c.bodies : c.directed;
      return (
        <>
          {c.overall && <p className="rounded-lg bg-white px-3 py-2">{c.overall}</p>}
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
          {c.summary && <p className="rounded-lg bg-white px-3 py-2">{c.summary}</p>}
          {c.purpose && <p className="rounded-lg bg-white px-3 py-2">{c.purpose}</p>}
          <Chips items={c.keyThemes} />
        </>
      );
    }
    case "astro.western.synastry.interp.v1": {
      const c = content as SynastryInterpretation;
      return (
        <>
          {c.overall.text && <p className="rounded-lg bg-white px-3 py-2">{c.overall.text}</p>}
          <StrengthsChallenges strengths={c.overall.strengths} challenges={c.overall.challenges} />
          <Block title="Kişiler arası açılar">
            {c.aspects.map((a, i) => (
              <Item key={`${a.a}-${a.type}-${a.b}-${i}`}>
                <div className="font-medium">
                  {BODY_LABELS[a.a]} (1) {ASPECT_LABELS[a.type]} {BODY_LABELS[a.b]} (2)
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
          {c.overall.summary && <p className="rounded-lg bg-white px-3 py-2">{c.overall.summary}</p>}
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
          {c.summary && <p className="rounded-lg bg-white px-3 py-2">{c.summary}</p>}
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
          {c.summary && <p className="rounded-lg bg-white px-3 py-2">{c.summary}</p>}
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
          {c.summary && <p className="rounded-lg bg-white px-3 py-2">{c.summary}</p>}
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
            <details className="rounded-lg bg-white px-3 py-2">
              <summary className="cursor-pointer font-semibold text-sky-900">Yoga açıklamaları ({c.yogas.length}) — oluşan yogalar teknik bölümde</summary>
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
          {c.parent && <p className="rounded-lg bg-white px-3 py-2">Üst dönem: {c.parent}</p>}
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
            <Block title="Roxy KP dönem gücü — lordun gösterdiği evlere bağ derecesi; olay olasılığı veya olumluluk DEĞİLDİR (sağlayıcı yorumu)">
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
      return c.significance ? <p className="rounded-lg bg-white px-3 py-2">Bölümün anlamı: {c.significance}</p> : <p className="text-slate-600">Bu bölüm için sağlayıcı açıklaması yok.</p>;
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
const TECHNICAL_DESCRIPTION_SCHEMAS = new Set(["astro.kp.chart.interp.v1", "astro.kp.extra.interp.v1", "astro.vedic.shadbala.interp.v1", "astro.vedic.panchanga.interp.v1", "astro.vedic.varga.interp.v1"]);

/** Sekme / panel başlığı: anlatı içeriyorsa "Otomatik Yorum", yalnız teknik açıklamaysa "Teknik Açıklama". */
export function interpretationTitle(interpretation: InterpretationLayer): "Otomatik Yorum" | "Teknik Açıklama" {
  if (!interpretation.visible) return "Otomatik Yorum";
  const schema = (interpretation.content as { schema?: string } | null)?.schema ?? "";
  return TECHNICAL_DESCRIPTION_SCHEMAS.has(schema) ? "Teknik Açıklama" : "Otomatik Yorum";
}

export default function ProviderInterpretationPanel({ interpretation }: { interpretation: InterpretationLayer }) {
  const title = interpretationTitle(interpretation);
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-2.5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="h-2 w-2 rounded-full bg-[#c9a54e]" aria-hidden="true" />
          {title}
        </h3>
        <span className="text-[11px] text-slate-500" title={interpretation.visible ? interpretation.notice : "Otomatik katman, hesaplama sağlayıcısı RoxyAPI tarafından üretilir."}>
          Kaynak: RoxyAPI · uzman yorumu değildir
        </span>
      </div>
      {!interpretation.visible ? (
        <p className="text-sm text-slate-600">{HIDDEN_TEXT[interpretation.reason] ?? HIDDEN_TEXT.unavailable}</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm text-slate-800">
          <Content content={stripSystemKeys(interpretation.content)} />
        </div>
      )}
    </section>
  );
}

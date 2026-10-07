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

export type InterpretationLayer =
  | { visible: true; provider: string; lang: string; content: unknown; notice: string }
  | { visible: false; reason: string };

const HIDDEN_TEXT: Record<string, string> = {
  not_entitled: "Bu hesap için Roxy otomatik yorum yetkisi kapalı. Hesaplama ve teknik veriler kullanılabilir.",
  owner_preview_hidden:
    "Önizleme: “Roxy Yorumu Kapalıymış Gibi Gör” açık. Yorum yetkisi kapalı bir uzman bu alanda yalnız bu notu görür; sunucu yorum içeriğini yanıta hiç koymaz.",
  unavailable: "Bu hesap sonucu için sağlayıcı yorum katmanı bulunmuyor.",
};

const pointLabel = (p: PointId) => (p === "ascendant" ? "Yükselen" : p === "midheaven" ? "MC" : BODY_LABELS[p]);

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((k, i) => (
        <span key={`${k}-${i}`} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
          {k}
        </span>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 font-semibold text-violet-900">{title}</h4>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}
const Item = ({ children }: { children: ReactNode }) => <li className="rounded-lg bg-white px-3 py-2">{children}</li>;
const P = ({ text }: { text: string | null | undefined }) => (text ? <p className="mt-0.5 whitespace-pre-line">{text}</p> : null);

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
                      <summary className="cursor-pointer text-xs text-violet-700">Ayrıntılı metin</summary>
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
                    <summary className="cursor-pointer text-xs text-violet-700">Ayrıntılı metin</summary>
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
    default:
      return <p className="text-slate-600">Bu yorum biçimi tanınmıyor.</p>;
  }
}

export default function ProviderInterpretationPanel({ interpretation }: { interpretation: InterpretationLayer }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-4" aria-label="Roxy Otomatik Yorumu">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-violet-900">Roxy Otomatik Yorumu</h3>
        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-medium text-violet-700">
          Sağlayıcı içeriği · uzman yorumu değildir
        </span>
      </div>
      {!interpretation.visible ? (
        <p className="text-sm text-slate-600">{HIDDEN_TEXT[interpretation.reason] ?? HIDDEN_TEXT.unavailable}</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm text-slate-800">
          <p className="text-xs text-violet-800">{interpretation.notice}</p>
          <Content content={interpretation.content} />
        </div>
      )}
    </section>
  );
}

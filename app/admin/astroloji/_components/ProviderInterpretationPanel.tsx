"use client";

/**
 * "Roxy Otomatik Yorumu" — teknik verilerden AYRI panel. İçerik yalnız sunucu yanıtta
 * gönderdiyse (yetki + önizleme kapalı) gösterilir; aksi hâlde yalnız durum kartı.
 * Uzmanın kendi yorumu ile KARIŞTIRILMAZ (Aşama 2'de ayrı panel/tablodur).
 */

import type { NatalView } from "@/lib/astrology/view/natalView";
import { ASPECT_GLYPHS, ASPECT_LABELS, BODY_GLYPHS, BODY_LABELS, PATTERN_LABELS } from "@/lib/astrology/labels/tr";

const HIDDEN_TEXT: Record<string, string> = {
  not_entitled: "Bu hesap için Roxy otomatik yorum yetkisi kapalı. Hesaplama ve teknik veriler kullanılabilir.",
  owner_preview_hidden:
    "Önizleme: “Roxy Yorumu Kapalıymış Gibi Gör” açık. Yorum yetkisi kapalı bir uzman bu alanda yalnız bu notu görür; sunucu yorum içeriğini yanıta hiç koymaz.",
  unavailable: "Bu hesap sonucu için sağlayıcı yorum katmanı bulunmuyor.",
};

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

export default function ProviderInterpretationPanel({ interpretation }: { interpretation: NatalView["interpretation"] }) {
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

          {interpretation.content.overall.aspectSummary && (
            <p className="rounded-lg bg-white px-3 py-2">{interpretation.content.overall.aspectSummary}</p>
          )}

          {interpretation.content.bodies.length > 0 && (
            <div>
              <h4 className="mb-1 font-semibold text-violet-900">Gezegen yerleşimleri</h4>
              <ul className="flex flex-col gap-2">
                {interpretation.content.bodies.map((b) => (
                  <li key={b.id} className="rounded-lg bg-white px-3 py-2">
                    <div className="font-medium">
                      {BODY_GLYPHS[b.id]} {BODY_LABELS[b.id]}
                    </div>
                    {b.summary && <p className="mt-0.5">{b.summary}</p>}
                    {b.detailed && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-violet-700">Ayrıntılı metin</summary>
                        <p className="mt-1 whitespace-pre-line text-slate-700">{b.detailed}</p>
                      </details>
                    )}
                    <Chips items={b.keywords} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {interpretation.content.aspects.length > 0 && (
            <div>
              <h4 className="mb-1 font-semibold text-violet-900">Açılar</h4>
              <ul className="flex flex-col gap-2">
                {interpretation.content.aspects.map((a, i) => (
                  <li key={`${a.a}-${a.b}-${a.type}-${i}`} className="rounded-lg bg-white px-3 py-2">
                    <div className="font-medium">
                      {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                      <span className="text-xs text-slate-500">
                        {BODY_LABELS[a.a]} – {BODY_LABELS[a.b]} · {ASPECT_LABELS[a.type]}
                      </span>
                    </div>
                    {a.summary && <p className="mt-0.5">{a.summary}</p>}
                    <Chips items={a.keywords} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {interpretation.content.patterns.length > 0 && (
            <div>
              <h4 className="mb-1 font-semibold text-violet-900">Açı kalıpları</h4>
              <ul className="flex flex-col gap-2">
                {interpretation.content.patterns.map((p, i) => (
                  <li key={`${p.kind}-${i}`} className="rounded-lg bg-white px-3 py-2">
                    <span className="font-medium">{PATTERN_LABELS[p.kind]}: </span>
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

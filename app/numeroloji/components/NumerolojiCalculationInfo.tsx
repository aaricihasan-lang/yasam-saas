"use client";

// FAZ 6 / UAT PATCH 1 + PATCH 2 — İki katmanlı yardım kontrolü:
//   • "ⓘ Bu ne demek?"      → KAVRAM TANIMI (meaning)  — o hesabın ne olduğunu sade anlatır
//   • "∑ Nasıl hesaplandı?"  → ÖĞRETİCİ HESAP (calculation) — hangi bilgi kullanıldı/kullanılmadı,
//                              neden, adım adım, sadeleştirme, sonuç, geçerlilik/dönem
//
// PATCH 2 (öğretici standart): "Nasıl hesaplandı?" artık yalnız developer-trace dökümü DEĞİL.
// Yapılandırılmış `explanation` (CalculationExplanation) verildiğinde modal 7 öğretici bölümü
// (yalnız DOLU olanları) gösterir. Eski `formula/steps/result` API'si GERİYE UYUMLU korunur.
//
// KRİTİK: Yeni numerolojik yorum/skor/öneri ÜRETMEZ. meaning = kaynak-güvenli kavram tanımı;
// explanation = mevcut engine sonucunun nasıl oluştuğunu kullanıcı diliyle açıklayan sunum
// dökümüdür (final değer engine ile birebirdir). Uzun interpretation metni burada GÖSTERİLMEZ.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Tone = "violet" | "sky" | "amber" | "emerald" | "fuchsia" | "rose" | "white";

/** Öğretici hesap açıklamasının tek girdisi (kullanılan/kullanılmayan bilgi). */
export type ExplanationInput = { label: string; value: string; note?: string };

/** "ADIM ADIM HESAP" içindeki bir adım (başlık + bir veya çok satır). */
export type ExplanationStep = { title?: string; lines: string[] };

/**
 * Öğretici hesap açıklaması — presentation-only UI veri şekli (PATCH 2 §27).
 * Yalnız DOLU alanlar modalda bölüm olarak gösterilir. Motor sonucu ÜRETMEZ.
 */
export type CalculationExplanation = {
  /** KULLANILAN BİLGİLER */
  usedInputs?: ExplanationInput[];
  /** BU HESAPTA KULLANILMAYAN BİLGİLER */
  unusedInputs?: ExplanationInput[];
  /** HESABIN MANTIĞI / NEDEN? */
  rationale?: string;
  /** ADIM ADIM HESAP */
  steps?: ExplanationStep[];
  /** SADELEŞTİRME */
  reduction?: string[];
  /** SONUÇ (bold gösterilir) */
  result?: string;
  /** Kısa sonuç açıklaması (SONUÇ altında) */
  resultNote?: string;
  /** GEÇERLİLİK / DÖNEM */
  period?: string;
};

export type CalculationInfoProps = {
  /** Kart/hesap başlığı (örn. "Aktif Kişisel Yıl"). */
  title: string;
  /** "Bu ne demek?" kavram tanımı (1–3 kısa cümle). */
  meaning?: string;
  /** PATCH 2: Öğretici yapılandırılmış hesap açıklaması (tercih edilen). */
  explanation?: CalculationExplanation;
  /** (Legacy) "Nasıl hesaplandı?" — formülün düz-metin tarifi. */
  formula?: string;
  /** (Legacy) Adım adım hesap satırları. */
  steps?: string[];
  /** (Legacy) Nihai sonuç satırı. */
  result?: string;
  /** İkon/chip rengini kartla uyumlu yapmak için. */
  tone?: Tone;
  /** Ekstra hesap içeriği (nadiren). */
  children?: ReactNode;
};

const TONE_CHIP: Record<Tone, string> = {
  violet: "border-violet-200 bg-white text-violet-700 hover:bg-violet-50",
  sky: "border-sky-200 bg-white text-sky-700 hover:bg-sky-50",
  amber: "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
  emerald: "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
  fuchsia: "border-fuchsia-200 bg-white text-fuchsia-700 hover:bg-fuchsia-50",
  rose: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  white: "border-white/40 bg-white/15 text-white hover:bg-white/25",
};

type Mode = "meaning" | "calc";

function hasExplanationContent(e?: CalculationExplanation): boolean {
  if (!e) return false;
  return Boolean(
    e.usedInputs?.length ||
      e.unusedInputs?.length ||
      e.rationale ||
      e.steps?.length ||
      e.reduction?.length ||
      e.result ||
      e.period,
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-wider text-violet-500">{children}</p>
  );
}

/** Aritmetik satır: 320px'te taşmaması için break-words (nowrap YOK). */
function MathLine({ children }: { children: ReactNode }) {
  return (
    <p className="break-words font-mono text-[12.5px] leading-relaxed text-slate-800">{children}</p>
  );
}

function TeachingBody({ e }: { e: CalculationExplanation }) {
  return (
    <div className="space-y-4">
      {e.usedInputs?.length ? (
        <section>
          <SectionLabel>Kullanılan bilgiler</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {e.usedInputs.map((it, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-500">{it.label}:</span>
                <span className="font-black text-slate-900">{it.value}</span>
                {it.note ? <span className="w-full text-xs text-slate-500">{it.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {e.unusedInputs?.length ? (
        <section className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2">
          <SectionLabel>Bu hesapta kullanılmaz</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {e.unusedInputs.map((it, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-500">{it.label}:</span>
                <span className="font-bold text-slate-700 line-through decoration-amber-400/70">{it.value}</span>
                {it.note ? <span className="w-full text-xs leading-relaxed text-amber-800/90">{it.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {e.rationale ? (
        <section>
          <SectionLabel>Hesabın mantığı</SectionLabel>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{e.rationale}</p>
        </section>
      ) : null}

      {e.steps?.length ? (
        <section>
          <SectionLabel>Adım adım hesap</SectionLabel>
          <ol className="mt-1.5 space-y-2.5">
            {e.steps.map((st, i) => (
              <li key={i} className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                {st.title ? (
                  <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {st.title}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {st.lines.map((ln, j) => (
                    <MathLine key={j}>{ln}</MathLine>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {e.reduction?.length ? (
        <section>
          <SectionLabel>Sadeleştirme</SectionLabel>
          <div className="mt-1.5 space-y-0.5 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
            {e.reduction.map((ln, i) => (
              <MathLine key={i}>{ln}</MathLine>
            ))}
          </div>
        </section>
      ) : null}

      {e.result ? (
        <section>
          <SectionLabel>Sonuç</SectionLabel>
          <p className="mt-1 text-base font-black text-violet-900">{e.result}</p>
          {e.resultNote ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{e.resultNote}</p>
          ) : null}
        </section>
      ) : null}

      {e.period ? (
        <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2">
          <SectionLabel>Geçerlilik / dönem</SectionLabel>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-900">{e.period}</p>
        </section>
      ) : null}
    </div>
  );
}

/** (Legacy) formula/steps/result dökümü — explanation verilmediğinde. */
function LegacyBody({
  formula,
  steps,
  result,
  children,
}: {
  formula?: string;
  steps?: string[];
  result?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {formula ? (
        <section>
          <SectionLabel>Formül</SectionLabel>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{formula}</p>
        </section>
      ) : null}
      {steps && steps.length ? (
        <section>
          <SectionLabel>Hesap</SectionLabel>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-800">
            {steps.join("\n")}
          </pre>
        </section>
      ) : null}
      {result ? (
        <section>
          <SectionLabel>Sonuç</SectionLabel>
          <p className="mt-1 text-base font-black text-violet-900">{result}</p>
        </section>
      ) : null}
      {children}
    </div>
  );
}

export function NumerolojiCalculationInfo({
  title,
  meaning,
  explanation,
  formula,
  steps,
  result,
  tone = "violet",
  children,
}: CalculationInfoProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  const teaching = hasExplanationContent(explanation);
  const hasCalc = teaching || Boolean(formula || (steps && steps.length) || result || children);
  const hasMeaning = Boolean(meaning);

  useEffect(() => {
    if (!mode) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode(null);
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [mode]);

  if (!hasCalc && !hasMeaning) return null;

  const chip = `inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm transition ${TONE_CHIP[tone]}`;
  const headerTitle = mode === "meaning" ? "Bu ne demek?" : "Nasıl hesaplandı?";

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-1">
        {hasMeaning ? (
          <button
            type="button"
            onClick={() => setMode("meaning")}
            aria-haspopup="dialog"
            aria-label={`${title}: Bu ne demek?`}
            title="Bu ne demek?"
            className={chip}
          >
            <span aria-hidden>ⓘ</span> Bu ne demek?
          </button>
        ) : null}
        {hasCalc ? (
          <button
            type="button"
            onClick={() => setMode("calc")}
            aria-haspopup="dialog"
            aria-label={`${title}: Nasıl hesaplandı?`}
            title="Nasıl hesaplandı?"
            className={chip}
          >
            <span aria-hidden>∑</span> Nasıl hesaplandı?
          </button>
        ) : null}
      </span>

      {mode && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMode(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelId}
                className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
              >
                <div className="sticky top-0 flex items-center justify-between gap-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-white">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">{headerTitle}</p>
                    <p id={labelId} className="truncate text-base font-black">{title}</p>
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setMode(null)}
                    aria-label="Kapat"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-lg font-black text-white transition hover:bg-white/25"
                  >
                    ✕
                  </button>
                </div>

                <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
                  {mode === "meaning" ? (
                    <p className="text-sm leading-relaxed text-slate-700">{meaning}</p>
                  ) : teaching && explanation ? (
                    <TeachingBody e={explanation} />
                  ) : (
                    <LegacyBody formula={formula} steps={steps} result={result}>
                      {children}
                    </LegacyBody>
                  )}
                </div>

                <div className="border-t border-slate-100 px-5 py-3">
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {mode === "meaning"
                      ? "Bu, hesabın kısa bir kavram tanımıdır; kişisel yorum içermez."
                      : "Bu döküm yalnız sayının nasıl bulunduğunu gösterir; numerolojik yorum içermez."}
                  </p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

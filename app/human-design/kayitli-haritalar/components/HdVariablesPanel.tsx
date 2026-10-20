"use client";

// "Dört Ok ve PHS" — kayıtlı bireysel analizin Human Design İleri Analiz katmanı (Variables). AYRI bilgi paneli:
// premium BodyGraph çizimine DOKUNMAZ.
//
//   • Hesap YALNIZ "Dört Ok Analizini Hesapla" eylemiyle (harita açılışı / sekme değişimi = 0 ücretli çağrı).
//   • Eski yanıt yeni analize YAZILMAZ: bileşen chartId ile yeniden kurulur (key) + nesil sayacı + AbortController +
//     yanıt chartId eşleşme koruması. Aynı sekmede aynı analiz → oturum belleğinden (yeni istek yok).
//   • Belirsiz ok (confident=false): Color / Tone / yön / Base "olası" olarak işaretlenir ("?", kesikli amber çerçeve,
//     "Olası yön" çipi); Color / Tone / Yön anlamı ve Bilişsel Algı KESİN YORUM olarak gösterilmez; genel uyarıda kesin ↔
//     olası farkı açıklanır. Kesin okların görünümü değişmez. Genel güvenilirlik dört okun tamamına bağlıdır.
//   • Base yalnız bilgilendirici (anlam yorumlanmaz); tarihsel saniyeli ofsette "?" + kesinleştirilemedi. Metinler düz metin.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { fetchChartVariables } from "@/lib/human-design/variables/variablesClient";
import type { VariablesArrowDto, VariablesDto } from "@/lib/human-design/variables/variablesContract";
import {
  ARROW_PLACE_TR,
  ARROW_TITLE_TR,
  COGNITION_TITLE,
  DIRECTION_TR,
  VARIABLES_ALL_UNCERTAIN_NOTE,
  VARIABLES_BASE_NOTE,
  VARIABLES_BASE_UNCERTAIN,
  VARIABLES_CERTAINTY_EXPLAINER,
  VARIABLES_HEALTH_NOTE,
  VARIABLES_HISTORICAL_OFFSET_NOTE,
  VARIABLES_INTRO,
  VARIABLES_PRECISION_NOTE,
  VARIABLES_SOURCE_NOTE,
  VARIABLES_SUBTITLE,
  VARIABLES_TITLE,
  VARIABLES_UNCERTAIN_ADVICE,
  VARIABLES_UNCERTAIN_NOTE,
} from "@/lib/human-design/variables/variablesLabels";

/** Sekme ömrü boyunca aynı kullanıcı + aynı analiz için oturum belleği (yalnız başarılı + eşleşen sonuç). */
const sessionMemo = new Map<string, VariablesDto>();
const memoKey = (chartId: string) => `${readYasamUser()?.id ?? ""}|${chartId.toLowerCase()}`;

function Arrow({ dir, uncertain }: { dir: "left" | "right"; uncertain: boolean }) {
  return (
    <svg viewBox="0 0 48 24" width="44" height="22" role="img" aria-label={uncertain ? `Olası ${DIRECTION_TR[dir].toLocaleLowerCase("tr")} yönlü ok (kesin değil)` : `${DIRECTION_TR[dir]} yönlü ok`} className="shrink-0">
      <g transform={dir === "left" ? "" : "translate(48 0) scale(-1 1)"} fill="none" stroke={uncertain ? "#b45309" : "#4338ca"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={uncertain ? "4 3" : undefined}>
        <path d="M44 12H6" />
        <path d="M14 4 6 12l8 8" />
      </g>
    </svg>
  );
}

function Para({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}

function Fold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group min-w-0 rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 break-words">{summary}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-slate-400 transition group-open:rotate-180">▼</span>
      </summary>
      <div className="space-y-3 border-t border-slate-200/70 px-3 pb-3 pt-2">{children}</div>
    </details>
  );
}

/** Değer kutusu: kesin okta mevcut görünüm; olası okta kesikli amber çerçeve + "olası" ön eki. */
function ValueCell({ sure, title, children }: { sure: boolean; title?: string; children: ReactNode }) {
  return (
    <div
      className={sure ? "rounded-lg bg-slate-50 px-1 py-1.5" : "rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-1 py-1.5"}
      title={title}
      data-hd-var-cell={sure ? "certain" : "possible"}
    >
      {children}
    </div>
  );
}

function ArrowCard({ a }: { a: VariablesArrowDto }) {
  const sure = a.confident;
  // Base, Tone'un alt bölümüdür: Color / Tone kesin değilse Base de kesin olamaz (yalnız gösterim; veri değişmez).
  const baseSure = sure && a.baseCertain;
  const dir = DIRECTION_TR[a.direction];
  const num = sure ? "font-mono text-base font-black text-slate-900" : "font-mono text-base font-black text-amber-800";
  return (
    <section
      className={`min-w-0 rounded-2xl border bg-white px-4 py-4 shadow-sm ${sure ? "border-indigo-100" : "border-amber-200"}`}
      data-hd-var-arrow={a.key}
      data-hd-var-confident={sure ? "1" : "0"}
      data-hd-var-values={`${a.color}.${a.tone}.${a.base}:${a.direction}`}
      aria-label={
        sure
          ? `${ARROW_TITLE_TR[a.key]}: ${dir} yön, Color ${a.color}, Tone ${a.tone}`
          : `${ARROW_TITLE_TR[a.key]}: kesinleştirilemedi — olası ${dir.toLocaleLowerCase("tr")} yön, olası Color ${a.color}, olası Tone ${a.tone}`
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-black text-slate-900">{ARROW_TITLE_TR[a.key]}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{ARROW_PLACE_TR[a.key]}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{a.text.name} · {a.text.layer}</p>
        </div>
        <Arrow dir={a.direction} uncertain={!sure} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${sure ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-100 text-amber-900 ring-1 ring-amber-300"}`} data-hd-var-badge>
          {sure ? "Kesin" : "Kesinleştirilemedi"}
        </span>
        {sure ? (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-800" data-hd-var-direction={a.direction}>
            {dir} · {a.text.directionLabel}
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-amber-400 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-900" data-hd-var-direction={a.direction} data-hd-var-direction-possible>
            Olası yön: {dir}? · {a.text.directionLabel}
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <ValueCell sure={sure}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Color</dt>
          <dd className={num}>{a.color}{sure ? "" : "?"}</dd>
          <dd className={`break-words text-[10px] ${sure ? "text-slate-600" : "text-amber-900"}`}>{sure ? a.text.colorLabel : `olası · ${a.text.colorLabel}`}</dd>
        </ValueCell>
        <ValueCell sure={sure}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tone</dt>
          <dd className={num}>{a.tone}{sure ? "" : "?"}</dd>
          <dd className={`text-[10px] ${sure ? "text-slate-600" : "text-amber-900"}`}>{sure ? (a.tone <= 3 ? "1–3 → sol" : "4–6 → sağ") : `olası · ${a.tone <= 3 ? "1–3 → sol" : "4–6 → sağ"}`}</dd>
        </ValueCell>
        <div className="rounded-lg bg-slate-50 px-1 py-1.5" title={VARIABLES_BASE_NOTE}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Base</dt>
          <dd className="font-mono text-base font-black text-slate-500" data-hd-var-base-certain={baseSure ? "1" : "0"}>{a.base}{baseSure ? "" : "?"}</dd>
          <dd className="break-words text-[10px] text-slate-500">{a.text.baseName} · {baseSure ? "bilgilendirici" : VARIABLES_BASE_UNCERTAIN}</dd>
        </div>
      </dl>
      {sure ? null : (
        <p role="note" className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-900" data-hd-var-uncertain-note>
          {VARIABLES_UNCERTAIN_NOTE}
        </p>
      )}
      {a.cognition ? (
        sure ? (
          <div className="mt-3 rounded-xl bg-violet-50/70 px-3 py-2" data-hd-var-cognition={a.cognition.label}>
            <p className="text-[11px] font-black tracking-wide text-violet-800">{COGNITION_TITLE}: {a.cognition.labelText}</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-slate-700">{a.cognition.description}</p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-amber-900" data-hd-var-cognition-hidden>{COGNITION_TITLE}: Tone kesinleştirilemediği için gösterilmez (olası Tone başka bir Bilişsel Algıya karşılık gelebilir).</p>
        )
      ) : null}
      <div className="mt-3 space-y-2">
        <Fold summary="Bu ok neyi anlatır?">
          <Para label="Ok" text={a.text.description} />
          <Para label="Katman" text={a.text.layerDescription} />
        </Fold>
        {sure ? (
          <Fold summary={`Color, Tone ve yön anlamları (${a.text.colorLabel} · ${a.text.directionLabel})`}>
            <Para label={`Color ${a.color} — ${a.text.colorLabel}`} text={a.text.colorMeaning} />
            <Para label={`Tone ${a.tone}`} text={a.text.toneMeaning} />
            <Para label={`Yön — ${DIRECTION_TR[a.direction]} (${a.text.directionLabel})`} text={a.text.directionMeaning} />
          </Fold>
        ) : null}
      </div>
    </section>
  );
}

export function HdVariablesPanel({ chartId }: { chartId: string }) {
  const [data, setData] = useState<VariablesDto | null>(() => sessionMemo.get(memoKey(chartId)) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const gen = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => {
    gen.current++;
    ctrl.current?.abort();
  }, []);

  const run = async () => {
    if (busy) return;
    const cached = sessionMemo.get(memoKey(chartId));
    if (cached) {
      setData(cached);
      return;
    }
    gen.current++;
    ctrl.current?.abort();
    const id = gen.current;
    const ac = new AbortController();
    ctrl.current = ac;
    setBusy(true);
    setError(null);
    setData(null);
    const r = await fetchChartVariables(chartId, ac.signal);
    if (id !== gen.current) return; // eski / iptal edilmiş yanıt: ekran DEĞİŞMEZ
    ctrl.current = null;
    setBusy(false);
    if (!r.ok) {
      setError({ text: r.error, code: r.code });
      return;
    }
    if (r.chartId.toLowerCase() !== chartId.toLowerCase()) {
      setError({ text: "Sunucu yanıtı bu analizle eşleşmedi; sonuç gösterilmedi. Lütfen tekrar deneyin." });
      return;
    }
    sessionMemo.set(memoKey(chartId), r.data);
    setData(r.data);
  };

  const left = data ? data.arrows.filter((a) => a.side === "design") : [];
  const right = data ? data.arrows.filter((a) => a.side === "personality") : [];
  const uncertainCount = data ? data.arrows.filter((a) => !a.confident).length : 0;

  return (
    <div className="space-y-4" data-hd-variables={chartId}>
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 px-4 py-4">
        <p className="text-[11px] font-black tracking-wide text-indigo-600">{VARIABLES_SUBTITLE}</p>
        <h2 className="text-lg font-black text-slate-900">{VARIABLES_TITLE}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{VARIABLES_INTRO}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-900" data-hd-var-precision>{VARIABLES_PRECISION_NOTE}</p>
        {data ? null : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="mt-3 min-h-[40px] rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-60"
            data-hd-var-run
          >
            {busy ? "Hesaplanıyor…" : "Dört Ok Analizini Hesapla"}
          </button>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-700" data-hd-var-error data-hd-var-error-code={error.code ?? ""}>
            {error.text}
          </p>
        ) : null}
      </header>

      {data ? (
        <>
          {data.confident ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200" data-hd-var-overall="1">
              Dört okun tamamı kesin (her ok Color / Tone sınırından yeterince uzak).
            </p>
          ) : (
            <div role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200" data-hd-var-overall="0">
              <p className="text-xs font-semibold">{VARIABLES_ALL_UNCERTAIN_NOTE} ({uncertainCount}/4 ok)</p>
              <dl className="mt-1.5 space-y-1 text-[11px] leading-relaxed" data-hd-var-certainty-explainer>
                {VARIABLES_CERTAINTY_EXPLAINER.map((e) => (
                  <div key={e.term} className="min-w-0">
                    <dt className="inline font-black">{e.term}: </dt>
                    <dd className="inline break-words">{e.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1.5 text-[11px] leading-relaxed">{VARIABLES_UNCERTAIN_ADVICE}</p>
            </div>
          )}
          {data.historicalOffset ? (
            <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200" data-hd-var-historical-offset>
              {VARIABLES_HISTORICAL_OFFSET_NOTE}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2" data-hd-var-grid>
            <div className="space-y-3" data-hd-var-column="left">
              <p className="text-[11px] font-black tracking-wide text-slate-500">Sol oklar · Tasarım (Design) · Birincil Sağlık Sistemi</p>
              {left.map((a) => <ArrowCard key={a.key} a={a} />)}
            </div>
            <div className="space-y-3" data-hd-var-column="right">
              <p className="text-[11px] font-black tracking-wide text-slate-500">Sağ oklar · Kişilik (Personality) · Rave Psikolojisi</p>
              {right.map((a) => <ArrowCard key={a.key} a={a} />)}
            </div>
          </div>
          <div className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
            <p data-hd-var-base-note>{VARIABLES_BASE_NOTE} {data.baseDescription}</p>
            <p data-hd-var-health>{VARIABLES_HEALTH_NOTE}</p>
            <p data-hd-var-source>{VARIABLES_SOURCE_NOTE}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

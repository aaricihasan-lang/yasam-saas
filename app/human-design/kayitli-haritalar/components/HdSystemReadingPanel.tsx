"use client";

// AŞAMA 2B — "Sistem Yorumu": Human Design hesaplaması sırasında sağlayıcının (RoxyAPI) verdiği ve
// kayıtla birlikte saklanan açıklamalar. SALT-OKUNUR SUNUM.
//
//   • Veri: GET /api/hd/charts/system-reading (sunucu whitelist DTO; ham yanıt istemciye gelmez).
//     Yeni Roxy çağrısı YOK — açma / sekme değiştirme / yenileme = 0 sağlayıcı çağrısı.
//   • Uzmanın Bilgi Bankası ile KARIŞMAZ: ayrı uç, ayrı bileşen; birbirinin yedeği değildir.
//   • Metinler düz metin olarak basılır (React metin düğümü; HTML yorumlanmaz).
//   • Uzun içerik: Genel açık; Merkezler / Kanallar / Kapılar / Aktivasyonlar katlanır (<details>).
//   • Kapılar: aktif her kapı BİR KEZ (1→64), kapı düzeyindeki Roxy açıklamasıyla; çizgi ve gezegen
//     yorumları Aktivasyonlar'da kalır (karıştırılmaz).
//   • BodyGraph 1. API tamamlama: taraf (Personality/Design) açıklamaları, merkez motor/farkındalık/aktif
//     kapıları, kanal merkezleri, I Ching heksagramı, kaynak dili notu (alan yoksa satır gösterilmez).

import { useEffect, useState, type ReactNode } from "react";
import { getChartSystemReading, type SystemReadingFetchResult } from "@/lib/human-design/api/chartsClient";
import { HD_SIGNATURE_HELP, HD_TERM } from "@/lib/human-design/normalize/hdDisplayLabels";
import {
  SYSTEM_READING_ICHING_NOTE,
  type SystemReadingActivation,
  type SystemReadingCenter,
  type SystemReadingChannel,
  type SystemReadingDto,
  type SystemReadingGeneralItem,
} from "@/lib/human-design/providers/roxy/systemReading";
import {
  groupSystemReadingGates,
  SYSTEM_READING_GATE_EMPTY,
  type SystemReadingGate,
} from "@/lib/human-design/providers/roxy/systemReadingGates";

export const SYSTEM_READING_SOURCE_NOTE =
  "Bu bölüm, Human Design hesaplaması sırasında sistem tarafından sağlanan açıklamaları içerir.";
export const SYSTEM_READING_UNAVAILABLE = "Bu kayıt için sistem yorumu bulunmuyor.";
/** Merkez "Biyoloji" ve farkındalık metinleri Human Design kavramlarıdır — tıbbi teşhis gibi sunulmaz. */
export const SYSTEM_READING_HEALTH_NOTE = "Biyoloji ve farkındalık açıklamaları Human Design sistemindeki karşılıklardır; tıbbi teşhis veya tedavi önerisi değildir.";

function Para({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}

function Fold({ summary, children, open = false, level = 1 }: { summary: ReactNode; children: ReactNode; open?: boolean; level?: 1 | 2 }) {
  return (
    <details
      open={open}
      className={`group min-w-0 rounded-xl border ${level === 1 ? "border-indigo-100 bg-white" : "border-slate-200 bg-slate-50/60"}`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 px-4 ${level === 1 ? "py-3" : "py-2.5"} [&::-webkit-details-marker]:hidden`}
      >
        <span className="min-w-0 flex-1 break-words">{summary}</span>
        <span aria-hidden className="shrink-0 text-xs text-slate-400 transition group-open:rotate-180">▼</span>
      </summary>
      <div className={`space-y-3 border-t px-4 pb-4 pt-3 ${level === 1 ? "border-indigo-50" : "border-slate-200/70"}`}>{children}</div>
    </details>
  );
}

function GeneralItem({ item }: { item: SystemReadingGeneralItem }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3" data-hd-sr-general={item.key}>
      {/* Başlık DTO'dan (sunucu: Türkçe + (İngilizce), owner 2026-10-17). */}
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600">{item.title}</p>
      {item.value ? <p className="mt-0.5 break-words text-[15px] font-semibold text-slate-900">{item.value}</p> : null}
      {item.key === "signature" ? (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500" data-hd-sr-signature-help>
          {HD_SIGNATURE_HELP}
        </p>
      ) : null}
      {item.details.length > 0 ? (
        <div className="mt-2 space-y-2">
          {item.details.map((d) => (
            <Para key={d.label} label={d.label} text={d.text} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Tag({ children, field }: { children: ReactNode; field: string }) {
  return (
    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700" data-hd-sr-tag={field}>
      {children}
    </span>
  );
}

function Line({ label, children, field }: { label: string; children: ReactNode; field: string }) {
  return (
    <p className="text-[12px] leading-relaxed text-slate-600" data-hd-sr-line={field}>
      <span className="font-semibold text-slate-700">{label}: </span>
      {children}
    </p>
  );
}

function CenterItem({ c }: { c: SystemReadingCenter }) {
  return (
    <Fold
      level={2}
      summary={
        <span className="flex flex-wrap items-center gap-2" data-hd-sr-center={c.id}>
          <span className="text-sm font-semibold text-slate-800">{c.name}</span>
          {c.defined !== null ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.defined ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
              {c.defined ? "Tanımlı" : "Açık"}
            </span>
          ) : null}
          {c.motor ? <Tag field="motor">Motor merkez</Tag> : null}
          {c.awareness ? <Tag field="awareness">Farkındalık merkezi</Tag> : null}
        </span>
      }
    >
      <Para label="Tema" text={c.theme} />
      <Para label={HD_TERM.notSelfQuestion} text={c.notSelfQuestion} />
      <Para label="Biyoloji" text={c.biology} />
      {c.motor !== undefined && c.motor !== null ? (
        <Line label="Nitelik" field="center-kind">
          {[c.motor ? "Motor (enerji kaynağı) merkez" : "Motor merkez değil", c.awareness ? "farkındalık merkezi" : "farkındalık merkezi değil"].join(" · ")}
        </Line>
      ) : null}
      {c.gates ? (
        <Line label="Aktif kapılar" field="center-gates">
          {c.gates.length ? c.gates.join(", ") : "Bu merkezde aktif kapı yok"}
        </Line>
      ) : null}
    </Fold>
  );
}

function ChannelItem({ c }: { c: SystemReadingChannel }) {
  return (
    <Fold
      level={2}
      summary={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-hd-sr-channel={c.id ?? ""}>
          {c.id ? <span className="text-sm font-bold tabular-nums text-indigo-700">{c.id}</span> : null}
          {c.name ? <span className="text-sm font-semibold text-slate-800">{c.name}</span> : null}
          {c.circuit ? <span className="text-xs text-slate-500">· {c.circuit}</span> : null}
        </span>
      }
    >
      {c.centers && c.centers.length === 2 ? (
        <Line label="Bağladığı merkezler" field="channel-centers">
          {c.centers[0]} ↔ {c.centers[1]}
        </Line>
      ) : null}
      <Para label="Açıklama" text={c.description} />
      <Para label={c.circuit ? `Devre — ${c.circuit}` : "Devre"} text={c.circuitDescription} />
    </Fold>
  );
}

function ActivationItem({ a }: { a: SystemReadingActivation }) {
  return (
    <Fold
      level={2}
      summary={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-hd-sr-activation={`${a.side}:${a.gate}.${a.line}`}>
          {a.planet ? <span className="text-sm font-semibold text-slate-800">{a.planet}</span> : null}
          <span className="text-sm font-bold tabular-nums text-indigo-700">
            {a.gate}.{a.line}
          </span>
          {a.gateName ? <span className="text-xs text-slate-500">· {a.gateName}</span> : null}
        </span>
      }
    >
      <Para label={`Kapı ${a.gate}`} text={a.gateDescription} />
      <Para label={`Çizgi ${a.line}`} text={a.lineMeaning} />
      <Para label={a.planet ? `Gezegen — ${a.planet}` : "Gezegen"} text={a.planetDescription} />
      {a.iching ? (
        <Line label="I Ching" field="iching">
          {a.iching.number}. heksagram — <span lang="en">{a.iching.name}</span> <span className="text-slate-400">({SYSTEM_READING_ICHING_NOTE})</span>
        </Line>
      ) : null}
    </Fold>
  );
}

function GateItem({ g }: { g: SystemReadingGate }) {
  return (
    <Fold
      level={2}
      summary={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-hd-sr-gate={g.gate}>
          <span className="text-sm font-bold tabular-nums text-indigo-700">{g.gate}. Kapı</span>
          {g.name ? <span className="text-sm font-semibold text-slate-800">— {g.name}</span> : null}
          <span className="text-[11px] font-semibold text-slate-400 group-open:hidden">Açıklamayı göster</span>
        </span>
      }
    >
      {g.descriptions.length > 0 ? (
        g.descriptions.map((d, i) => <Para key={i} label="Kapı açıklaması" text={d} />)
      ) : (
        <p className="text-sm text-slate-500" data-hd-sr-gate-empty>{SYSTEM_READING_GATE_EMPTY}</p>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500" data-hd-sr-gate-acts>
        <span className="font-semibold">Aktivasyonlar: </span>
        {g.activations
          .map((a) => `${a.side === "design" ? "Design" : "Personality"}${a.planet ? ` · ${a.planet}` : ""} ${g.gate}.${a.line}`)
          .join(" — ")}
      </p>
    </Fold>
  );
}

/** Saf sunum (fetch yok) — test edilebilir. */
export function HdSystemReadingView({ data }: { data: SystemReadingDto }) {
  const design = data.activations.filter((a) => a.side === "design");
  const personality = data.activations.filter((a) => a.side === "personality");
  const gates = groupSystemReadingGates(data.activations);
  return (
    <div className="space-y-3" data-hd-system-reading>
      {data.languageNote ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-800" data-hd-sr-language-note>
          {data.languageNote}
        </p>
      ) : null}
      {data.general.length > 0 ? (
        <Fold open summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Genel</span>}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.general.map((g) => (
              <GeneralItem key={g.key} item={g} />
            ))}
          </div>
        </Fold>
      ) : null}
      {data.sides && (data.sides.personality || data.sides.design || data.sides.designUtc) ? (
        <Fold summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Personality ve Design Tarafları</span>}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-hd-sr-sides>
            <Para label="Personality · Bilinçli (siyah)" text={data.sides.personality} />
            <Para label="Design · Bilinçdışı (kırmızı)" text={data.sides.design} />
          </div>
          {data.sides.designUtc ? (
            <Line label="Design anı" field="design-utc">
              {data.sides.designUtc} <span className="text-slate-400">(Güneş&apos;in doğumdan 88° önceki konumu; Design aktivasyonları bu ana göre)</span>
            </Line>
          ) : null}
        </Fold>
      ) : null}
      {data.centers.length > 0 ? (
        <Fold summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Merkezler ({data.centers.length})</span>}>
          <div className="space-y-2">
            {data.centers.map((c) => (
              <CenterItem key={c.id} c={c} />
            ))}
          </div>
        </Fold>
      ) : null}
      {data.channels.length > 0 ? (
        <Fold summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Kanallar ({data.channels.length})</span>}>
          <div className="space-y-2">
            {data.channels.map((c, i) => (
              <ChannelItem key={c.id ?? `ch-${i}`} c={c} />
            ))}
          </div>
        </Fold>
      ) : null}
      {gates.length > 0 ? (
        <Fold summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Kapılar ({gates.length})</span>}>
          <div className="space-y-2" data-hd-sr-gates>
            {gates.map((g) => (
              <GateItem key={g.gate} g={g} />
            ))}
          </div>
        </Fold>
      ) : null}
      {data.activations.length > 0 ? (
        <Fold summary={<span className="text-sm font-black uppercase tracking-widest text-indigo-700">Aktivasyonlar ({data.activations.length})</span>}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[
              { key: "design", title: "Design · Bilinçdışı", rows: design, cls: "text-rose-700" },
              { key: "personality", title: "Personality · Bilinçli", rows: personality, cls: "text-slate-900" },
            ].map((grp) =>
              grp.rows.length > 0 ? (
                <div key={grp.key} className="min-w-0 space-y-2" data-hd-sr-side={grp.key}>
                  <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${grp.cls}`}>{grp.title}</p>
                  {grp.rows.map((a) => (
                    <ActivationItem key={`${a.side}-${a.gate}-${a.line}-${a.planet ?? ""}`} a={a} />
                  ))}
                </div>
              ) : null,
            )}
          </div>
        </Fold>
      ) : null}
    </div>
  );
}

export function HdSystemReadingPanel({ chartId }: { chartId: string }) {
  const [state, setState] = useState<SystemReadingFetchResult | null>(null);

  useEffect(() => {
    let alive = true;
    getChartSystemReading(chartId).then((r) => {
      if (alive) setState(r);
    });
    return () => {
      alive = false;
    };
  }, [chartId]);

  return (
    <section aria-label="Sistem Yorumu" className="space-y-3" data-hd-system-reading-panel>
      <p className="text-xs text-slate-500">{SYSTEM_READING_SOURCE_NOTE}</p>
      <p className="text-[11px] text-slate-400" data-hd-sr-health-note>{SYSTEM_READING_HEALTH_NOTE}</p>
      {state === null ? (
        <p className="py-6 text-center text-sm text-slate-500">Yükleniyor...</p>
      ) : state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {state.error}
        </p>
      ) : state.status === "unavailable" ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500" data-hd-system-reading-empty>
          {SYSTEM_READING_UNAVAILABLE}
        </p>
      ) : (
        <HdSystemReadingView data={state.data} />
      )}
    </section>
  );
}

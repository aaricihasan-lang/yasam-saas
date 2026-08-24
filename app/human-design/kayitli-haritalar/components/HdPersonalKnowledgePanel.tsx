"use client";

/**
 * "Kişinin Human Design Bilgileri" — SALT-OKUMA deterministik canonical panel.
 * PAGE-LEVEL (modal değil): geniş responsive grid; kartlar tıklanınca Premium Reader.
 *
 * Chart (manuel/computed) → /api/hd/bilgi-bankasi?resource=chart-knowledge → paket.
 * Yalnız YAYINLANMIŞ canonical prose; taslak → "yayınlanmamış". Chart'ta değer YOK →
 * "bu haritada ... bilgisi bulunmuyor" (unpublished ile KARIŞTIRILMAZ). Asılı kapı
 * bağlamı KANAL içeriğinden (potansiyel kanal başına). AI/synthesis/rewrite YOK.
 * Türkçe kimlik adları codeHelpers'tan (engine İngilizce adı değil).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { hdTypeLabelFromCode, hdAuthorityLabelFromCode, hdChannelLabelFromCode } from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";
import { ReaderModal } from "@/components/common/reader/ReaderModal";
import { formatReaderText } from "@/components/common/reader/formatReaderText";
import { fetchChartKnowledge } from "../helpers/hdChartKnowledge";
import type { CanonicalContent, HdPersonalKnowledge } from "@/lib/human-design/knowledge/personalKnowledge";
// §8: FIELD_LABELS/composeContentText/previewText artık paylaşılan HD rapor kompozisyon
// katmanından gelir (tek kaynak; Reader ve Word AYNI etiket/sırayı kullanır).
import { composeContentText, previewText } from "@/lib/human-design/reporting/reportCompose";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; locked: boolean; notFound: boolean }
  | { phase: "ready"; data: HdPersonalKnowledge };

function gateLabel(gate: number): string {
  return (HUMAN_DESIGN_GATES.find((g) => g.code === gate)?.label as string) ?? `Kapı ${gate}`;
}
const BADGE = "Human Design · Bilgi Bankası";

export function HdPersonalKnowledgePanel({ chartId }: { chartId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [reader, setReader] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChartKnowledge(chartId).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ phase: "ready", data: r.knowledge });
      else setState({ phase: "error", message: r.error, locked: r.locked, notFound: r.notFound });
    });
    return () => { alive = false; };
  }, [chartId]);

  const openReader = useCallback((title: string, text: string) => {
    if (text.trim()) setReader({ title, text });
  }, []);

  if (state.phase === "loading") {
    return <div className="animate-pulse space-y-4"><div className="h-5 w-48 rounded bg-slate-100" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-24 rounded-2xl bg-slate-100" /><div className="h-24 rounded-2xl bg-slate-100" /></div></div>;
  }
  if (state.phase === "error") {
    const msg = state.locked ? "Human Design bilgi bankası erişiminiz henüz aktif değil." : state.notFound ? "Harita bulunamadı." : "Human Design bilgileri yüklenemedi.";
    return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">{msg}</p>;
  }

  const k = state.data;

  return (
    <div className="space-y-8">
      {k.unresolved.length > 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">
          Bazı Human Design verileri bilgi bankasıyla eşleştirilemedi ({k.unresolved.length}).
        </p>
      ) : null}

      {/* A. Temel Kimlik */}
      <Section title="Temel Kimlik">
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityCard
            kind="Tip"
            name={k.identity.type.key ? hdTypeLabelFromCode(k.identity.type.key.replace(/^tip_/, "")) : ""}
            identity={k.identity.type}
            missingLabel="Bu haritada tip bilgisi bulunmuyor."
            onRead={(name, c) => openReader(`Tip: ${name}`, composeContentText(c))}
          />
          <IdentityCard
            kind="Otorite"
            name={k.identity.authority.key ? hdAuthorityLabelFromCode(k.identity.authority.key.replace(/^otorite_/, "")) : ""}
            identity={k.identity.authority}
            missingLabel="Bu haritada otorite bilgisi bulunmuyor."
            onRead={(name, c) => openReader(`Otorite: ${name}`, composeContentText(c))}
          />
        </div>
      </Section>

      {/* B. Tanımlı Kanallar */}
      <Section title={`Tanımlı Kanallar${k.channels.length ? ` (${k.channels.length})` : ""}`}>
        {k.channels.length === 0 ? (
          <Empty text="Bu haritada tamamlanmış kanal bulunmuyor." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {k.channels.map((c) => {
              const title = hdChannelLabelFromCode(c.code);
              return (
                <ClickableCard
                  key={c.key}
                  title={`Kanal ${title}`}
                  meta={`Kapılar ${c.gates[0]} · ${c.gates[1]}`}
                  disabled={!c.content}
                  onClick={c.content ? () => openReader(`Kanal ${title}`, composeContentText(c.content!)) : undefined}
                  preview={c.content ? previewText(c.content) : null}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* C. Aktif / Bağımsız Kapılar (asılı kapı bağlamı içinde) */}
      <Section title={`Aktif / Bağımsız Kapılar${k.gates.length ? ` (${k.gates.length})` : ""}`}>
        {k.gates.length === 0 ? (
          <Empty text="Bu haritada bağımsız kapı bulunmuyor." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {k.gates.map((g) => {
              const hg = k.hangingGates.find((h) => h.gate === g.gate);
              const label = gateLabel(g.gate);
              const hasHangingCtx = (hg?.potentialChannels ?? []).some((p) => p.hangingContext);
              // Reader: gate prose + potansiyel kanal başına asılı bağlam alt bölümleri
              const readerText = () => {
                const parts: string[] = [];
                if (g.content) parts.push(composeContentText(g.content));
                for (const p of hg?.potentialChannels ?? []) {
                  if (p.hangingContext && p.hangingContext.trim()) {
                    parts.push(`## Asılı Kapı Bağlamı — Kanal ${hdChannelLabelFromCode(p.code)}\n\n${p.hangingContext.trim()}`);
                  }
                }
                return parts.join("\n\n");
              };
              const clickable = !!(g.content || hasHangingCtx);
              return (
                <ClickableCard
                  key={g.key}
                  title={label}
                  disabled={!clickable}
                  onClick={clickable ? () => openReader(`Kapı ${g.gate}`, readerText()) : undefined}
                  preview={g.content ? previewText(g.content) : null}
                  footer={
                    hg && hg.potentialChannels.length > 0 ? (
                      <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                        <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-cyan-700">Asılı Kapı · Potansiyel Bağlantılar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {hg.potentialChannels.map((p) => (
                            <span key={p.code} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${p.hangingContext ? "bg-cyan-50 text-cyan-700 ring-cyan-100" : "bg-slate-50 text-slate-400 ring-slate-100"}`}>
                              {p.code}
                            </span>
                          ))}
                        </div>
                        {!hasHangingCtx ? <p className="mt-1.5 text-[11px] italic text-slate-400">Asılı kapı bağlamı henüz yayınlanmamış.</p> : null}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      <ReaderModal
        open={reader !== null}
        title={reader?.title ?? ""}
        badge={BADGE}
        contentSurface
        renderBody={() => formatReaderText(reader?.text ?? "")}
        onClose={() => setReader(null)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">{title}</h3>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-slate-50/70 px-4 py-3 text-sm italic text-slate-400 ring-1 ring-slate-100">{text}</p>;
}

function IdentityCard({
  kind, name, identity, missingLabel, onRead,
}: {
  kind: string;
  name: string;
  identity: { key: string | null; content: CanonicalContent | null; chartValueMissing: boolean };
  missingLabel: string;
  onRead: (name: string, content: CanonicalContent) => void;
}) {
  // Chart'ta değer YOK → "bulunmuyor". Değer VAR ama content null → "yayınlanmamış".
  if (identity.chartValueMissing || !identity.key) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{kind}</p>
        <p className="mt-0.5 text-sm italic text-slate-400">{missingLabel}</p>
      </div>
    );
  }
  const clickable = !!identity.content;
  return (
    <ClickableCard
      title={name}
      kicker={kind}
      disabled={!clickable}
      onClick={clickable ? () => onRead(name, identity.content!) : undefined}
      preview={identity.content ? (identity.content.general_description?.trim() || identity.content.report_text?.trim() || "") : null}
    />
  );
}

/** Tıklanabilir premium kart (buton semantiği + klavye + focus). İçinde başka
 *  interactive element YOK (footer yalnız span'ler) → nested-button riski yok. */
function ClickableCard({
  title, kicker, meta, preview, footer, onClick, disabled,
}: {
  title: string;
  kicker?: string;
  meta?: string;
  preview?: string | null;
  footer?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          {kicker ? <p className="text-[10px] font-black uppercase tracking-wide text-indigo-500">{kicker}</p> : null}
          <p className="truncate text-sm font-black text-slate-900">{title}</p>
        </div>
        {meta ? <span className="shrink-0 text-[11px] font-semibold text-slate-400">{meta}</span> : null}
      </div>
      {preview ? <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">{preview}</p> : null}
      {onClick ? <span className="mt-1.5 inline-block text-xs font-bold text-violet-600">Tam metni oku →</span> : null}
      {disabled && !preview ? <p className="mt-1.5 text-xs italic text-slate-400">Bu bilgi henüz yayınlanmamış.</p> : null}
      {footer}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${title} — tam metni oku`}
        className="block w-full rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 text-left transition hover:border-violet-300 hover:bg-violet-50/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
      >
        {inner}
      </button>
    );
  }
  return <div className="rounded-2xl border border-slate-200/70 bg-white/60 px-5 py-4">{inner}</div>;
}

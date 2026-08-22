"use client";

/**
 * "Kişinin Human Design Bilgileri" — SALT-OKUMA deterministik canonical panel.
 *
 * Chart (manuel/computed) → /api/hd/bilgi-bankasi?resource=chart-knowledge → paket.
 * Yalnız YAYINLANMIŞ canonical prose gösterir (taslak → "yayınlanmamış" state).
 * AI/synthesis/rewrite YOK; canonical metin olduğu gibi. Premium reader reuse
 * (components/common/reader): preview → "Tam metni oku". Düzenleme/publish/silme YOK.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  hdTypeLabelFromCode,
  hdAuthorityLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { ReaderModal } from "@/components/common/reader/ReaderModal";
import { formatReaderText } from "@/components/common/reader/formatReaderText";
import { fetchChartKnowledge } from "../helpers/hdChartKnowledge";
import type { CanonicalContent, HdPersonalKnowledge } from "@/lib/human-design/knowledge/personalKnowledge";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; locked: boolean; notFound: boolean }
  | { phase: "ready"; data: HdPersonalKnowledge };

// Alan → Türkçe başlık (canonical prose'u yeniden yazmaz; yalnız bölüm etiketi).
const FIELD_LABELS: Array<[keyof CanonicalContent, string]> = [
  ["general_description", "Genel Açıklama"],
  ["report_text", "Kaynaklandırılmış Ana Metin"],
  ["strategy_text", "Strateji"],
  ["signature_text", "İmza"],
  ["not_self_text", "Kendinden-Olmayan Tema"],
  ["decision_mechanism", "Karar Mekanizması"],
  ["application_text", "Uygulama"],
  ["caution_notes", "Dikkat Notları"],
  ["general_theme", "Genel Tema"],
  ["full_channel_text", "Tam Kanal Metni"],
  ["hanging_gate_context", "Asılı Kapı Bağlamı"],
];

/** İçerik alanlarını `## Başlık` bölümleri olarak birleştirir (presentation-only). */
function composeContentText(content: CanonicalContent): string {
  const parts: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const v = content[key];
    if (typeof v === "string" && v.trim() !== "") parts.push(`## ${label}\n\n${v.trim()}`);
  }
  return parts.join("\n\n");
}

function previewText(content: CanonicalContent): string {
  const v = content.general_description?.trim() || content.report_text?.trim() || "";
  return v;
}

function Unpublished() {
  return <p className="text-xs italic text-slate-400">Bu bilgi henüz yayınlanmamış.</p>;
}

export function HdPersonalKnowledgePanel({ chartId }: { chartId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [reader, setReader] = useState<{ title: string; badge: string; text: string } | null>(null);

  // chartId panel yaşam süresi boyunca sabittir (her modal açılışı = taze mount).
  // Yükleme durumu başlangıç state'idir; effect yalnız async fetch sonucunu yazar.
  useEffect(() => {
    let alive = true;
    fetchChartKnowledge(chartId).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ phase: "ready", data: r.knowledge });
      else setState({ phase: "error", message: r.error, locked: r.locked, notFound: r.notFound });
    });
    return () => { alive = false; };
  }, [chartId]);

  const openReader = useCallback((title: string, content: CanonicalContent) => {
    setReader({ title, badge: "Human Design · Bilgi Bankası", text: composeContentText(content) });
  }, []);

  if (state.phase === "loading") {
    return <div className="animate-pulse space-y-3"><div className="h-4 w-40 rounded bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /></div>;
  }
  if (state.phase === "error") {
    const msg = state.locked
      ? "Human Design bilgi bankası erişiminiz henüz aktif değil."
      : state.notFound
        ? "Harita bulunamadı."
        : "Human Design bilgileri yüklenemedi.";
    return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">{msg}</p>;
  }

  const k = state.data;
  const hasStructure =
    k.identity.type.key || k.identity.authority.key || k.channels.length || k.gates.length || k.hangingGates.length;

  return (
    <div className="space-y-6">
      {k.allUnpublished && hasStructure ? (
        <p className="rounded-xl bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100">
          Human Design bilgi içeriği henüz yayınlanmamış. Aşağıda haritanın yapısal kimliği gösterilir.
        </p>
      ) : null}
      {k.unresolved.length > 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">
          Bazı Human Design verileri bilgi bankasıyla eşleştirilemedi ({k.unresolved.length}).
        </p>
      ) : null}

      {/* A. Temel Kimlik */}
      <SectionBlock title="Temel Kimlik">
        <div className="grid gap-3 sm:grid-cols-2">
          <IdentityCard
            label="Tip"
            name={hdTypeLabelFromCode(k.identity.type.key?.replace(/^tip_/, "") ?? null) || (k.identity.type.key ?? "—")}
            content={k.identity.type.content}
            onRead={openReader}
          />
          <IdentityCard
            label="Otorite"
            name={hdAuthorityLabelFromCode(k.identity.authority.key?.replace(/^otorite_/, "") ?? null) || (k.identity.authority.key ?? "—")}
            content={k.identity.authority.content}
            onRead={openReader}
          />
        </div>
      </SectionBlock>

      {/* B. Tanımlı Kanallar */}
      {k.channels.length > 0 ? (
        <SectionBlock title={`Tanımlı Kanallar (${k.channels.length})`}>
          <div className="space-y-3">
            {k.channels.map((c) => (
              <ContentCard
                key={c.key}
                title={`Kanal ${c.code} · ${c.name}`}
                meta={`Kapılar ${c.gates[0]} · ${c.gates[1]}`}
                content={c.content}
                onRead={openReader}
              />
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* C. Bağımsız Kapılar */}
      {k.gates.length > 0 ? (
        <SectionBlock title={`Aktif / Bağımsız Kapılar (${k.gates.length})`}>
          <div className="space-y-3">
            {k.gates.map((g) => {
              const hanging = k.hangingGates.find((h) => h.gate === g.gate);
              return (
                <ContentCard
                  key={g.key}
                  title={`Kapı ${g.gate}`}
                  content={g.content}
                  onRead={openReader}
                  footer={
                    hanging ? (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-cyan-700">Asılı Kapı Bağlamı</p>
                        {hanging.hangingContext ? (
                          <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{hanging.hangingContext}</p>
                        ) : (
                          <Unpublished />
                        )}
                        {hanging.potentialChannels.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400">Potansiyel bağlantılar:</span>
                            {hanging.potentialChannels.map((p) => (
                              <span key={p.code} className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 ring-1 ring-cyan-100">
                                {p.code}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </SectionBlock>
      ) : null}

      <ReaderModal
        open={reader !== null}
        title={reader?.title ?? ""}
        badge={reader?.badge ?? ""}
        contentSurface
        renderBody={() => formatReaderText(reader?.text ?? "")}
        onClose={() => setReader(null)}
      />
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-indigo-700">{title}</h3>
      {children}
    </section>
  );
}

function IdentityCard({
  label,
  name,
  content,
  onRead,
}: {
  label: string;
  name: string;
  content: CanonicalContent | null;
  onRead: (title: string, content: CanonicalContent) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-indigo-500">{label}</p>
      <p className="text-base font-black text-slate-900">{name}</p>
      {content ? (
        <button type="button" onClick={() => onRead(`${label}: ${name}`, content)} className="mt-1.5 block w-full text-left">
          <span className="line-clamp-2 text-sm leading-relaxed text-slate-600">{previewText(content)}</span>
          <span className="mt-1 inline-block text-xs font-bold text-violet-600">Tam metni oku →</span>
        </button>
      ) : (
        <div className="mt-1.5"><Unpublished /></div>
      )}
    </div>
  );
}

function ContentCard({
  title,
  meta,
  content,
  onRead,
  footer,
}: {
  title: string;
  meta?: string;
  content: CanonicalContent | null;
  onRead: (title: string, content: CanonicalContent) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{title}</p>
        {meta ? <span className="shrink-0 text-[11px] font-semibold text-slate-400">{meta}</span> : null}
      </div>
      {content ? (
        <button type="button" onClick={() => onRead(title, content)} className="mt-1.5 block w-full text-left">
          <span className="line-clamp-3 text-sm leading-relaxed text-slate-600">{previewText(content)}</span>
          <span className="mt-1 inline-block text-xs font-bold text-violet-600">Tam metni oku →</span>
        </button>
      ) : (
        <div className="mt-1.5"><Unpublished /></div>
      )}
      {footer}
    </div>
  );
}

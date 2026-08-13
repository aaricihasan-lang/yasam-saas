import { Lock } from "lucide-react";
import type { HdKnowledgeEvidence } from "@/lib/human-design/knowledge/expertReadTypes";
import { RELATION_LABELS } from "./knowledgeConstants";
import { KnowledgeEmpty } from "./KnowledgeStates";

/**
 * Salt-okuma Kaynak Bağlantıları (içerik ↔ pasaj kanıtı) görünümü.
 * Bibliyografik/provenance metadata her zaman gösterilir; TAM METİN (özgün/çeviri)
 * yalnız sunucu hak sözleşmesi (expert_delivery) izin verdiğinde payload'da bulunur —
 * aksi halde kilit rozeti gösterilir (fail-closed; metin hiç gelmez).
 */
export function KaynakBaglantilariView({ evidence }: { evidence: HdKnowledgeEvidence[] }) {
  if (evidence.length === 0) {
    return <KnowledgeEmpty title="Henüz kaynak bağlantısı yok" />;
  }

  return (
    <ul className="space-y-2.5">
      {evidence.map((e, i) => (
        <li key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
              {RELATION_LABELS[e.relation_type] ?? e.relation_type}
            </span>
            {e.is_primary && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">birincil</span>
            )}
            {e.is_single_source && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">tek-kaynak</span>
            )}
          </div>

          <p className="mt-1.5 text-sm font-semibold text-slate-800">{e.source.title || "(başlıksız kaynak)"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {e.source.authors.length > 0 && <span>{e.source.authors.join(", ")}</span>}
            {(e.passage.locator_label || e.passage.locator_value) && (
              <span>
                {e.passage.locator_label}
                {e.passage.locator_label && e.passage.locator_value ? ": " : ""}
                {e.passage.locator_value}
              </span>
            )}
          </div>

          {e.editorial_note && (
            <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{e.editorial_note}</p>
          )}
          {e.passage.source_specific_note && (
            <p className="mt-1 text-[11px] italic text-slate-400">{e.passage.source_specific_note}</p>
          )}

          {e.full_text_restricted ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
              <Lock className="h-3 w-3" /> Tam metin telif/kullanım hakkı gereği gösterilmiyor
            </p>
          ) : (
            (e.original_text || e.faithful_translation) && (
              <div className="mt-2 space-y-2 border-l-2 border-indigo-100 pl-3">
                {e.original_text && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Özgün Metin{e.original_language_tag ? ` · ${e.original_language_tag}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{e.original_text}</p>
                  </div>
                )}
                {e.faithful_translation && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sadık Çeviri</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{e.faithful_translation}</p>
                  </div>
                )}
              </div>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

import type { HdKnowledgeSourceRef } from "@/lib/human-design/knowledge/expertReadTypes";
import { KnowledgeEmpty } from "./KnowledgeStates";

/** Salt-okuma Kaynaklar (bibliyografik) görünümü. Yalnız hak-güvenli metadata. */
export function KaynaklarView({ sources }: { sources: HdKnowledgeSourceRef[] }) {
  if (sources.length === 0) {
    return <KnowledgeEmpty title="Bu içeriğe bağlı kaynak yok" />;
  }

  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-bold text-slate-800">{s.title || "(başlıksız kaynak)"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {s.authors.length > 0 && <span>{s.authors.join(", ")}</span>}
            {s.organization && <span>· {s.organization}</span>}
            {s.source_type && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                {s.source_type}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import type { HdKnowledgeEntityDetail } from "@/lib/human-design/knowledge/expertReadTypes";
import { KIND_LABELS } from "./knowledgeConstants";
import { AnaMetinView } from "./AnaMetinView";
import { KaynaklarView } from "./KaynaklarView";
import { KaynakBaglantilariView } from "./KaynakBaglantilariView";

type Tab = "content" | "sources" | "evidence";

const TABS: { id: Tab; label: string }[] = [
  { id: "content", label: "Ana Metin" },
  { id: "sources", label: "Kaynaklar" },
  { id: "evidence", label: "Kaynak Bağlantıları" },
];

/**
 * Paylaşılan SALT-OKUMA canonical detay sunumu (3 sekme). Düzenleme kontrolü YOK —
 * normal uzman görünümü. Admin düzenleme AYRI capability yolundan (mevcut admin
 * editörü + /api/admin/hd/*) sağlanır.
 */
export function CanonicalDetail({ detail }: { detail: HdKnowledgeEntityDetail }) {
  const [tab, setTab] = useState<Tab>("content");
  const { entity } = detail;

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-indigo-500">
        {KIND_LABELS[entity.entity_kind]}
      </div>
      <h1 className="text-xl font-black tracking-tight text-slate-900">{entity.name_tr}</h1>
      <p className="mb-4 font-mono text-[11px] text-slate-400">
        {entity.canonical_key}
        {entity.name_original ? ` · ${entity.name_original}` : ""}
      </p>

      <div className="mb-4 flex gap-1.5 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-bold transition ${
              tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "content" && <AnaMetinView content={detail.content} entityKind={entity.entity_kind} />}
      {tab === "sources" && <KaynaklarView sources={detail.sources} />}
      {tab === "evidence" && <KaynakBaglantilariView evidence={detail.evidence} />}
    </div>
  );
}

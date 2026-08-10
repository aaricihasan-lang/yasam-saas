"use client";

import { ListShell } from "../components/ListShell";
import { conceptCard } from "../components/cards";
import { usePreview } from "../components/preview";
import { listConcepts, type ConceptDTO } from "../yebsShowcaseApi";

export default function ConceptsPage() {
  const { preview, withPreview } = usePreview();
  return (
    <ListShell<ConceptDTO>
      title="Kavramlar"
      searchable
      searchPlaceholder="Kavram ara (ad veya özgün etiket)…"
      emptyTitle="Henüz yayınlanmış kavram bulunmuyor."
      emptyHint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış yönetici kayıtlarını inceleyebilirsiniz."}
      load={(q, signal) => listConcepts({ q: q || undefined, preview, signal })}
      renderCard={(c) => conceptCard(c, withPreview)}
    />
  );
}

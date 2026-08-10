"use client";

import { ListShell } from "../components/ListShell";
import { sourceCard } from "../components/cards";
import { usePreview } from "../components/preview";
import { listSources, type SourceDTO } from "../yebsShowcaseApi";

export default function SourcesPage() {
  const { preview, withPreview } = usePreview();
  return (
    <ListShell<SourceDTO>
      title="Kaynaklar"
      searchable
      searchPlaceholder="Kaynak ara…"
      emptyTitle="Henüz yayınlanmış kaynak bulunmuyor."
      emptyHint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış yönetici kayıtlarını inceleyebilirsiniz."}
      load={(q, signal) => listSources({ q: q || undefined, preview, signal })}
      renderCard={(s) => sourceCard(s, withPreview)}
    />
  );
}

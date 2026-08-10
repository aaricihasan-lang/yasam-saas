"use client";

import { ListShell } from "../components/ListShell";
import { relationCard } from "../components/cards";
import { usePreview } from "../components/preview";
import { listRelations, type RelationDTO } from "../yebsShowcaseApi";

export default function RelationsPage() {
  const { preview, withPreview } = usePreview();
  // İlişkiler backend'de metin araması desteklemez → searchable=false (arama uydurulmaz).
  return (
    <ListShell<RelationDTO>
      title="İlişkiler"
      searchable={false}
      emptyTitle="Henüz yayınlanmış ilişki bulunmuyor."
      emptyHint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış yönetici kayıtlarını inceleyebilirsiniz."}
      load={(_q, signal) => listRelations({ preview, signal })}
      renderCard={(r) => relationCard(r, withPreview)}
    />
  );
}

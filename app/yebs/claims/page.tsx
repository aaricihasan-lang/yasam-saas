"use client";

import { ListShell } from "../components/ListShell";
import { claimCard } from "../components/cards";
import { usePreview } from "../components/preview";
import { listClaims, type ClaimDTO } from "../yebsShowcaseApi";

export default function ClaimsPage() {
  const { preview, withPreview } = usePreview();
  return (
    <ListShell<ClaimDTO>
      title="Kaynaklı Bilgiler"
      searchable
      searchPlaceholder="Bilgi ara…"
      emptyTitle="Henüz yayınlanmış kaynaklı bilgi bulunmuyor."
      emptyHint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış yönetici kayıtlarını inceleyebilirsiniz."}
      load={(q, signal) => listClaims({ q: q || undefined, preview, signal })}
      renderCard={(cl) => claimCard(cl, withPreview)}
    />
  );
}

"use client";

import { ListShell } from "../components/ListShell";
import { traditionCard } from "../components/cards";
import { usePreview } from "../components/preview";
import { listTraditions, type TraditionDTO } from "../yebsShowcaseApi";

export default function TraditionsPage() {
  const { preview, withPreview } = usePreview();
  return (
    <ListShell<TraditionDTO>
      title="Gelenekler"
      searchable
      searchPlaceholder="Gelenek ara…"
      emptyTitle="Henüz yayınlanmış gelenek bulunmuyor."
      emptyHint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış yönetici kayıtlarını inceleyebilirsiniz."}
      load={(q, signal) => listTraditions({ q: q || undefined, preview, signal })}
      renderCard={(t) => traditionCard(t, withPreview)}
    />
  );
}

"use client";

// Hazır Eğitim Haritaları — HD girişindeki ek kart (FAZ 2-B3).
// Kart YALNIZ sunucu erişim yoklaması (/api/hd/education/access) 200 dönerse eklenir: owner'ın kişi bazında yetki verdiği
// eğitmen. Yetkisiz uzman / admin / owner / demo / pasif / premium bitmiş → aynı 404 → kart HİÇ çizilmez.
// Kartı gizlemek güvenlik sınırı DEĞİLDİR: katalog sayfası ve API'ler her istekte ayrıca requireEducationViewer'dan geçer.
import { useEffect, useState } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { HdHubModule } from "./HdHubModules";

export const EDUCATION_HUB_HREF = "/human-design/egitim-haritalari";

export function useEducationHubCard(enabled: boolean): HdHubModule | null {
  const [card, setCard] = useState<HdHubModule | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/hd/education/access", {
          headers: { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() },
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { ok?: boolean; visible?: boolean; card?: { title?: unknown; desc?: unknown } } | null;
        if (!live || body?.ok !== true || body.visible !== true) return;
        const title = typeof body.card?.title === "string" ? body.card.title : "Hazır Eğitim Haritaları";
        const desc = typeof body.card?.desc === "string" ? body.card.desc : "";
        // Owner onaylı mevcut kart bileşeni ve görsel varlığı (yeni tasarım varlığı yok).
        setCard({ title, desc, href: EDUCATION_HUB_HREF, badge: "Eğitim", tone: "purple", tile: "map", art: "bilgi-bankasi" });
      } catch {
        /* ağ hatası → kart yok (fail-closed) */
      }
    })();
    return () => { live = false; };
  }, [enabled]);
  return card;
}

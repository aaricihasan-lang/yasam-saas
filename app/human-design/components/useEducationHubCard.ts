"use client";

// Hazır Eğitim Haritaları — HD girişindeki ek kart (FAZ 2-B3).
// Kart YALNIZ sunucu erişim yoklaması (/api/hd/education/access) 200 dönerse eklenir: owner'ın kişi bazında yetki verdiği
// eğitmen. Yetkisiz uzman / admin / owner / demo / pasif / premium bitmiş → aynı 404 → kart HİÇ çizilmez.
// Kartı gizlemek güvenlik sınırı DEĞİLDİR: katalog sayfası ve API'ler her istekte ayrıca requireEducationViewer'dan geçer.
import { useEffect, useState } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import type { HdHubModule } from "./HdHubModules";

export const EDUCATION_HUB_HREF = "/human-design/egitim-haritalari";

/** Platform owner'ın Eğitim Merkezi kartı → owner yönetim ekranı (haritalar, kaynaklar, BodyGraph, biyografiler). */
export const OWNER_EDUCATION_HREF = "/admin/hd-egitim-haritalari";
export const OWNER_EDUCATION_CARD: HdHubModule = {
  title: "Eğitim Merkezi",
  desc: "Eğitim haritaları, kaynaklar, BodyGraph önizlemeleri ve biyografiler — owner yönetimi.",
  href: OWNER_EDUCATION_HREF,
  badge: "Eğitim",
  tone: "purple",
  tile: "map",
  art: "bilgi-bankasi",
};

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

export const EDUCATION_CENTER_HREF = "/human-design/egitim-merkezi";

/**
 * FAZ 7 — Human Design Eğitim Merkezi kartı (Eğitmene Özel Eğitim Haritaları). YALNIZ /api/hd/education/private/access 200 dönerse:
 * owner'ın özel arşiv yetkisi verdiği eğitmen (ve owner'ın kendisi). Bu kart görünürse merkezî kart ayrıca çizilmez (Eğitim Merkezi
 * merkezî kategoriyi, eğitmenin ayrı merkezî yetkisi varsa kendi içinde gösterir). Kartı gizlemek güvenlik sınırı DEĞİLDİR.
 */
export function useEducationCenterCard(enabled: boolean): HdHubModule | null {
  const [card, setCard] = useState<HdHubModule | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/hd/education/private/access", {
          headers: { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() },
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { ok?: boolean; visible?: boolean } | null;
        if (!live || body?.ok !== true || body.visible !== true) return;
        // Owner onaylı mevcut kart bileşeni ve görsel varlığı (yeni tasarım varlığı yok).
        setCard({ title: "Eğitim Merkezi", desc: "Hazır ve size özel eğitim haritaları", href: EDUCATION_CENTER_HREF, badge: "Eğitim", tone: "purple", tile: "map", art: "bilgi-bankasi" });
      } catch {
        /* ağ hatası → kart yok (fail-closed) */
      }
    })();
    return () => { live = false; };
  }, [enabled]);
  return card;
}

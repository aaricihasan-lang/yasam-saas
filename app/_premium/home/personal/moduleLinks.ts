/**
 * KİŞİSEL DİJİTAL OFİS (P4) — Favorilerim / gizleme için modül bağlantıları.
 *
 * YENİ YETKİ KURALI DEĞİLDİR. Bir modülün "erişilebilir" sayılması, ana sayfa sol menüsünün ZATEN ürettiği
 * gruplarda (buildModuleNavGroups: evaluateRouteModuleGuard + canSeeHubChild + sunucu yoklamaları, merkez kilidi)
 * aynı adresin bulunmasına bağlıdır. Yetkisiz modül favoriye eklenemez ve favori alanında gösterilmez.
 */
import { WORKSPACE_CENTERS } from "@/lib/workspace/catalog";
import type { HomeNavGroup } from "../homeModuleNav";

/** Katalogdaki modül anahtarı → sayfa adresi + menü etiketi (home.premium.nav.*). */
export const MODULE_LINKS: Record<string, { href: string; labelKey: string }> = {
  client_journey: { href: "/danisan-yolculugu/liste", labelKey: "dyListe" },
  appointments: { href: "/dashboard/ajanda", labelKey: "dyAjanda" },
  yasam_hafizasi: { href: "/yasam-hafizasi", labelKey: "yasamHafizasi" },
  energy_body: { href: "/dashboard/biyoenerji", labelKey: "energyBody" },
  reflexology: { href: "/refleksoloji", labelKey: "reflexology" },
  cupping: { href: "/kupa", labelKey: "cupping" },
  stones: { href: "/dogaltas", labelKey: "stones" },
  stone_library: { href: "/dogaltas/kutuphane", labelKey: "stoneLibrary" },
  aromatherapy: { href: "/aromaterapi", labelKey: "aromatherapy" },
  sifa_rehberi: { href: "/sifa-rehberi", labelKey: "sifa" },
  beslenme: { href: "/beslenme", labelKey: "beslenme" },
  personal_archive: { href: "/dashboard/kisisel-arsiv", labelKey: "personalArchive" },
  belge_ceviri: { href: "/belge-ceviri", labelKey: "belgeCeviri" },
  video_ceviri: { href: "/video-ceviri", labelKey: "videoCeviri" },
  ders_notu: { href: "/ders-notu", labelKey: "dersNotu" },
  numerology: { href: "/numeroloji-merkezi", labelKey: "numeroloji" },
  human_design: { href: "/human-design", labelKey: "humanDesign" },
  cosmic_calendar: { href: "/cosmic-calendar", labelKey: "cosmic" },
  astrology: { href: "/astroloji", labelKey: "atlas" },
  stok: { href: "/urun-stok/canli-stok", labelKey: "stokAll" },
};

/** Merkez (kart) anahtarı ↔ sol menü grup anahtarı (permissionKey) aynıdır. */
export type ModuleLinkView = { key: string; centerKey: string; href: string; labelKey: string; accessible: boolean };

/**
 * Menünün ürettiği gruplardan erişilebilir modülleri çıkarır. Doğaltaş Kütüphanesi menüde ayrı bağlantı olmadığından
 * Doğaltaş erişimine bağlanır; Yaşam Hafızası ve Ürün & Stok grup başlığına (merkez kartı açık) bağlanır.
 */
export function moduleLinkViews(groups: HomeNavGroup[]): ModuleLinkView[] {
  const hrefs = new Set<string>();
  const openCenters = new Set<string>();
  for (const g of groups) {
    if (g.href) { hrefs.add(g.href); openCenters.add(g.key); }
    for (const i of g.items) hrefs.add(i.href);
  }
  const out: ModuleLinkView[] = [];
  for (const c of WORKSPACE_CENTERS) {
    for (const m of c.modules) {
      const link = MODULE_LINKS[m];
      if (!link) continue;
      let accessible = hrefs.has(link.href);
      if (m === "stone_library") accessible = hrefs.has(MODULE_LINKS.stones.href);
      if (m === "yasam_hafizasi" || m === "client_journey") accessible = openCenters.has(c.key) || hrefs.has(link.href);
      if (m === "stok") accessible = openCenters.has("stok") || hrefs.has(link.href);
      out.push({ key: m, centerKey: c.key, href: link.href, labelKey: link.labelKey, accessible });
    }
  }
  return out;
}

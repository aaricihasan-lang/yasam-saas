"use client";

/**
 * Ana sayfa sol menüsü "Tüm Modüller" listesi (2026-10-18 owner kararı).
 *
 * Bu dosya YENİ BİR YETKİ SİSTEMİ DEĞİLDİR: yalnız menüde gösterilecek bağlantıların adresini ve sırasını
 * tutar. Bir bağlantının görünüp görünmeyeceğine mevcut kurallar karar verir:
 *   - Her adres için sayfayı gerçekten koruyan `evaluateRouteModuleGuard` (ModuleRouteGuard ile aynı karar),
 *   - merkez alt modüllerinde ayrıca `canSeeHubChild` (Beden & Enerji / Dijital İçerik merkezlerinin kendisiyle aynı),
 *   - sunucu yoklamasıyla açılan iki alt modül (Beslenme, Gökyüzü Atlası) için merkezlerinin KULLANDIĞI aynı yoklama
 *     (`checkBeslenmeAccess`, `/api/admin/astroloji/access`) — yalnız liste ilk açıldığında, fail-closed.
 *   - Doğaltaş Kütüphanesi ana menüde AYRI bağlantı değildir (owner kararı 30.10.2026): Doğaltaş modülünün içinden
 *     (Doğaltaş ana ekranı → "Doğaltaş Kütüphanesi" kartı) açılır.
 * Sayfalar ModuleRouteGuard ile, API'ler requireModuleAccess ile ayrıca korunmaya devam eder.
 */
import { useEffect, useState } from "react";
import type { ModulePermissionKey } from "@/lib/auth/modulePermissions";
import type { YasamUser } from "@/lib/auth/yasamUser";
import { evaluateRouteModuleGuard } from "@/lib/auth/routeModuleAccess";
import {
  canSeeHubChild,
  DIGITAL_CONTENT_HUB_CHILDREN,
  ENERGY_BODY_HUB_CHILDREN,
  type HubChild,
  type HubChildId,
} from "@/lib/auth/hubVisibility";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import { astroFetch } from "@/app/admin/astroloji/_lib/api";

export type NavProbe = "beslenme" | "atlas";
export type NavProbeResults = Partial<Record<NavProbe, boolean>>;

type CatalogItem = {
  /** i18n anahtarı: home.premium.nav.<labelKey> */
  labelKey: string;
  href: string;
  hubChild?: HubChild;
  probe?: NavProbe;
};

const HUB_CHILD_LABEL: Record<HubChildId, string> = {
  energy_body: "energyBody",
  reflexology: "reflexology",
  cupping: "cupping",
  personal_archive: "personalArchive",
  belge_ceviri: "belgeCeviri",
  video_ceviri: "videoCeviri",
  ders_notu: "dersNotu",
};

const fromHub = (children: readonly HubChild[]): CatalogItem[] =>
  children.map((child) => ({ labelKey: HUB_CHILD_LABEL[child.id], href: child.href, hubChild: child }));

/**
 * Ana merkez kartı (permissionKey) → merkezin içindeki alt modüller. Sıra, merkez sayfalarındaki kart sırasıyla aynı.
 * Adresler merkez sayfalarındaki mevcut adreslerdir (Danışan "takip" klasörü /dashboard/ajanda'ya yönlendirdiği
 * için doğrudan o adres kullanılır; görünürlüğü de o sayfanın kendi kuralı belirler).
 */
const MODULE_NAV_CHILDREN: Partial<Record<ModulePermissionKey, CatalogItem[]>> = {
  clients: [
    { labelKey: "dyKayit", href: "/danisan-yolculugu/kayit" },
    { labelKey: "dyListe", href: "/danisan-yolculugu/liste" },
    { labelKey: "dyAjanda", href: "/dashboard/ajanda" },
  ],
  energy_body: fromHub(ENERGY_BODY_HUB_CHILDREN),
  sifa_rehberi: [
    { labelKey: "stones", href: "/dogaltas" },
    { labelKey: "aromatherapy", href: "/aromaterapi" },
    { labelKey: "sifa", href: "/sifa-rehberi" },
    { labelKey: "beslenme", href: "/beslenme", probe: "beslenme" },
  ],
  digital_content: fromHub(DIGITAL_CONTENT_HUB_CHILDREN),
  numerology: [
    { labelKey: "numeroloji", href: "/numeroloji-merkezi" },
    { labelKey: "humanDesign", href: "/human-design" },
    { labelKey: "cosmic", href: "/cosmic-calendar" },
    { labelKey: "atlas", href: "/astroloji", probe: "atlas" },
  ],
  stok: [
    { labelKey: "stokAll", href: "/urun-stok/canli-stok" },
    { labelKey: "stokStones", href: "/urun-stok/dogaltas" },
    { labelKey: "stokOil", href: "/urun-stok/yag" },
    { labelKey: "stokSoap", href: "/urun-stok/sabun-krem" },
    { labelKey: "stokAccessory", href: "/urun-stok/aksesuar" },
    { labelKey: "stokPricing", href: "/urun-stok/satis-fiyatlandirma" },
    { labelKey: "stokSales", href: "/urun-stok/satis-gecmisi" },
    { labelKey: "stokOther", href: "/urun-stok/diger" },
  ],
};

export type HomeNavItem = { key: string; label: string; href: string };
export type HomeNavGroup = { key: string; label: string; href: string | null; items: HomeNavItem[] };

type HubInput = { permissionKey: ModulePermissionKey; href: string; open: boolean; label: string };

/**
 * Görünür grupları üretir. `hubs` ana sayfadaki kartlarla AYNI sırada ve AYNI kilit kararıyla (open) gelir.
 * Grup başlığı yalnız kart açıksa bağlantıdır; grup, başlığı ya da en az bir alt modülü erişilebilirse gösterilir.
 */
export function buildModuleNavGroups(
  user: YasamUser,
  hubs: HubInput[],
  probes: NavProbeResults,
  label: (labelKey: string) => string,
): HomeNavGroup[] {
  const groups: HomeNavGroup[] = [];
  for (const hub of hubs) {
    const items = (MODULE_NAV_CHILDREN[hub.permissionKey] ?? [])
      .filter((item) => evaluateRouteModuleGuard(item.href, user) === "allow")
      .filter((item) => (item.hubChild ? canSeeHubChild(user, item.hubChild) : true))
      .filter((item) => (item.probe ? probes[item.probe] === true : true))
      .map((item) => ({ key: item.href, label: label(item.labelKey), href: item.href }));
    const headerOpen = hub.open && evaluateRouteModuleGuard(hub.href, user) === "allow";
    if (!headerOpen && items.length === 0) continue;
    groups.push({ key: hub.permissionKey, label: hub.label, href: headerOpen ? hub.href : null, items });
  }
  return groups;
}

/**
 * Sunucu yoklamalı iki alt modül için mevcut yoklamaları YALNIZ liste ilk açıldığında bir kez çalıştırır
 * (ana sayfa yüklenişine ek istek eklemez). Hata / ağ sorunu → false (fail-closed).
 */
export function useModuleNavProbes(enabled: boolean): NavProbeResults {
  const [results, setResults] = useState<NavProbeResults>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void checkBeslenmeAccess()
      .then((ok) => {
        if (alive) setResults((r) => ({ ...r, beslenme: ok === true }));
      })
      .catch(() => {
        if (alive) setResults((r) => ({ ...r, beslenme: false }));
      });
    void astroFetch<{ ok: true }>("/api/admin/astroloji/access")
      .then((r) => {
        if (alive) setResults((prev) => ({ ...prev, atlas: r.ok }));
      })
      .catch(() => {
        if (alive) setResults((prev) => ({ ...prev, atlas: false }));
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return results;
}

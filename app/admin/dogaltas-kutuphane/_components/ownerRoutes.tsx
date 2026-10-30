"use client";

/**
 * Owner yönetim ekranlarının adres haritası. Aynı bileşenler iki yerde çalışır:
 *   • Yönetim Paneli: /admin/dogaltas-kutuphane/** (varsayılan, mevcut adresler korunur)
 *   • Doğaltaş modülü içi çalışma alanı: /dogaltas/kutuphane/yonetim/** (owner kararı 30.10.2026: /dogaltas/kutuphane herkese,
 *     owner dahil, uzman görünümünü açar; yönetim "Kütüphane Yönetimi" sekmesinden, dönüş "‹ Kütüphaneye Dön" ile)
 * Yetki adreslere bağlı DEĞİLDİR: tüm veri ve işlemler sunucuda owner kapısından geçer (owner olmayan herkese tek tip 404).
 */

import { createContext, useContext, type ReactNode } from "react";

export type OwnerRoutes = {
  list: string;
  stone: (id: string) => string;
  newStone: string;
  translations: string;
  bulk: string;
  experts: string;
  /** Uzman görünümüne ayrı bağlantı (Yönetim Paneli'nde). Doğaltaş içinde dönüş moduleCrumb'dır. */
  preview?: string;
  previewLabel?: string;
  back: string;
  backLabel: string;
  /** Doğaltaş modülü içinde: kütüphaneye (uzman görünümü) dönüş bağlantısı (Yönetim Paneli'nde yok). */
  moduleCrumb?: { href: string; label: string };
};

export const ADMIN_OWNER_ROUTES: OwnerRoutes = {
  list: "/admin/dogaltas-kutuphane",
  stone: (id) => `/admin/dogaltas-kutuphane/tas/${id}`,
  newStone: "/admin/dogaltas-kutuphane/yeni-tas",
  translations: "/admin/dogaltas-kutuphane/ceviri",
  bulk: "/admin/dogaltas-kutuphane/toplu",
  experts: "/admin/dogaltas-kutuphane/uzmanlar",
  preview: "/dogaltas/kutuphane",
  previewLabel: "Kütüphane önizlemesi",
  back: "/admin",
  backLabel: "Yönetim paneline dön",
};

export const WORKSPACE_OWNER_ROUTES: OwnerRoutes = {
  list: "/dogaltas/kutuphane/yonetim",
  stone: (id) => `/dogaltas/kutuphane/yonetim/tas/${id}`,
  newStone: "/dogaltas/kutuphane/yonetim/yeni-tas",
  translations: "/dogaltas/kutuphane/yonetim/ceviri",
  bulk: "/dogaltas/kutuphane/yonetim/toplu",
  experts: "/dogaltas/kutuphane/yonetim/uzmanlar",
  back: "/dogaltas",
  backLabel: "Doğaltaş modülüne dön",
  moduleCrumb: { href: "/dogaltas/kutuphane", label: "‹ Kütüphaneye Dön" },
};

const OwnerRoutesContext = createContext<OwnerRoutes>(ADMIN_OWNER_ROUTES);

export function OwnerRoutesProvider({ routes, children }: { routes: OwnerRoutes; children: ReactNode }) {
  return <OwnerRoutesContext.Provider value={routes}>{children}</OwnerRoutesContext.Provider>;
}

/** Doğaltaş modülü içi çalışma alanı sarmalayıcısı (sunucu sayfalarından kullanılabilir). */
export function WorkspaceRoutes({ children }: { children: ReactNode }) {
  return <OwnerRoutesProvider routes={WORKSPACE_OWNER_ROUTES}>{children}</OwnerRoutesProvider>;
}

export const useOwnerRoutes = (): OwnerRoutes => useContext(OwnerRoutesContext);

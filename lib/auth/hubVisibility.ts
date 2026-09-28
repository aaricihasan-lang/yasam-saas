/**
 * HUB GÖRÜNÜRLÜK — tek kaynak (Dijital İçerik Merkezi + Enerji & Beden).
 *
 * Owner kararı: uzman KENDİSİNE AÇILMAMIŞ modülü arayüzde GÖRMEZ. Hub içindeki her alt kart
 * yalnız kullanıcının o alt modüle GERÇEK erişimi varsa görünür; hub'ın kendisi (dashboard
 * kartı + hub route'u) ise yalnız en az bir erişilebilir alt modül varsa açılır.
 *
 * Karar merkezî `hasAnyModulePermissionFlag` ile verilir → admin her şeyi görür; admin-only
 * AI anahtarları (video_ceviri / ders_notu — moduleAccessCore.ADMIN_ONLY_MODULE_KEYS) uzman
 * için bayraktan bağımsız KAPALI kalır. Anahtarlar sunucu kapısıyla (resolveModuleAccess +
 * moduleRouteRegistry) aynıdır; bu dosya yalnız UI görünürlüğüdür — sunucu yetkisinin YERİNE
 * GEÇMEZ (API'ler requireModuleAccess ile, sayfalar ModuleRouteGuard ile ayrıca korunur).
 */
import type { YasamUser } from "@/lib/auth/yasamUser";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { isAdminOnlyModuleKey } from "@/lib/auth/moduleAccessCore";

export type HubChildId =
  | "personal_archive"
  | "belge_ceviri"
  | "video_ceviri"
  | "ders_notu"
  | "energy_body"
  | "reflexology"
  | "cupping";

export type HubChild = {
  id: HubChildId;
  href: string;
  /** Kanonik anahtar + DB'de saklanabilen TR alias'ları (OR). */
  keys: readonly string[];
};

/** Dijital İçerik Merkezi alt modülleri (sunucu: app/api/kisisel-arsiv, belge-ceviri, video-ceviri, ders-notu). */
export const DIGITAL_CONTENT_HUB_CHILDREN: readonly HubChild[] = [
  { id: "personal_archive", href: "/dashboard/kisisel-arsiv", keys: ["personal_archive", "kisisel_arsiv"] },
  { id: "belge_ceviri", href: "/belge-ceviri", keys: ["belge_ceviri"] },
  { id: "video_ceviri", href: "/video-ceviri", keys: ["video_ceviri"] },
  { id: "ders_notu", href: "/ders-notu", keys: ["ders_notu"] },
];

/** Enerji & Beden alt modülleri (sunucu: app/api/biyoenerji, refleksoloji, kupa). */
export const ENERGY_BODY_HUB_CHILDREN: readonly HubChild[] = [
  { id: "energy_body", href: "/dashboard/biyoenerji", keys: ["energy_body", "biyoenerji"] },
  { id: "reflexology", href: "/refleksoloji", keys: ["reflexology", "refleksoloji"] },
  { id: "cupping", href: "/kupa", keys: ["cupping", "kupa", "hacamat_terapi"] },
];

/**
 * Hub'ı UZMAN için açan anahtarlar: admin-only alt modüllerin anahtarları HARİÇ tüm alt
 * anahtarlar. (Admin zaten hasAnyModulePermissionFlag'de kısa devre ile geçer.)
 */
export function hubAccessKeys(children: readonly HubChild[]): string[] {
  const keys: string[] = [];
  for (const child of children) {
    for (const key of child.keys) {
      if (!isAdminOnlyModuleKey(key) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export const DIGITAL_CONTENT_HUB_KEYS: readonly string[] = hubAccessKeys(DIGITAL_CONTENT_HUB_CHILDREN);
export const ENERGY_BODY_HUB_KEYS: readonly string[] = hubAccessKeys(ENERGY_BODY_HUB_CHILDREN);

export function canSeeHubChild(user: YasamUser | null | undefined, child: HubChild): boolean {
  return hasAnyModulePermissionFlag(user, [...child.keys]);
}

/** Kullanıcının GERÇEKTEN erişebildiği alt modüller (sıra korunur). */
export function visibleHubChildren<T extends HubChild>(
  user: YasamUser | null | undefined,
  children: readonly T[],
): T[] {
  return children.filter((child) => canSeeHubChild(user, child));
}

/** Hub görünür mü = en az bir erişilebilir alt modül var mı. */
export function isHubVisible(user: YasamUser | null | undefined, children: readonly HubChild[]): boolean {
  return children.some((child) => canSeeHubChild(user, child));
}

/**
 * Danışan detay sayfası (app/dashboard/clients/[id]) URL-addressable sekme sözleşmesi (SAF).
 *
 * Yaşam Hafızası arama sonucundan gelen deep-link (/dashboard/clients/{id}?tab=<sekme>)
 * doğru sekmeyi açar. `?tab=` değeri BURADAKİ allowlist ile normalize edilir; bilinmeyen/
 * boş/null değer güvenli şekilde varsayılan sekmeye (Genel Bilgiler) düşer.
 *
 * Not: sekme id'leri page.tsx'teki <Tab id=...> ve clientSources.CLIENT_MODULE_DETAIL_TAB
 * değerleriyle BİREBİR hizalı olmalıdır (harness cross-check ile zorlanır).
 */
export const CLIENT_DETAIL_TABS = [
  "genel",
  "notlar",
  "randevular",
  "taslar",
  "seanslar",
  "odevler",
  "analizler",
  "yolculuk",
  "hafiza",
] as const;

export type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];

export const DEFAULT_CLIENT_DETAIL_TAB: ClientDetailTab = "genel";

const VALID_CLIENT_DETAIL_TABS = new Set<string>(CLIENT_DETAIL_TABS);

/** ?tab= değeri geçerli bir sekme mi? */
export function isClientDetailTab(value: unknown): value is ClientDetailTab {
  return typeof value === "string" && VALID_CLIENT_DETAIL_TABS.has(value);
}

/**
 * URL ?tab= değerini güvenli sekmeye normalize eder.
 *   - Geçerli sekme → o sekme.
 *   - null / undefined / boş / bilinmeyen ("foobar") → DEFAULT (genel).
 */
export function resolveClientDetailTab(raw: string | null | undefined): ClientDetailTab {
  return isClientDetailTab(raw) ? raw : DEFAULT_CLIENT_DETAIL_TAB;
}

/**
 * BF-13 — Kaynak modül → Türkçe etiket + "Kaynağa git" güvenli route eşlemesi.
 *
 * "Kaynağa git" YALNIZ bu merkezî allowlist'ten üretilir. sourceTable/sourceId
 * kullanılarak serbest URL ÜRETİLMEZ; eşleşme yoksa bağlantı gösterilmez (null).
 * Salt sunum verisi; PII/secret yok.
 */
import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";

/** Kullanıcıya gösterilecek Türkçe modül etiketleri. */
export const YH_MODULE_LABELS: Record<YhSourceModule, string> = {
  refleksoloji: "Refleksoloji",
  sifa_rehberi: "Şifa Rehberi",
  biyoenerji: "Biyoenerji",
  dogaltas: "Doğaltaş",
  aromaterapi: "Aromaterapi",
  kisisel_arsiv: "Kişisel Arşiv",
  numeroloji: "Numeroloji",
  yebs: "YEBS Canonical",
  kupa_hacamat: "Kupa & Hacamat",
  // NOT: 'belge_video' ÜRÜN KARARIYLA memory source ailesinden çıkarıldı (NON_SOURCE) →
  //   memory modül etiketi/route'undan da kaldırıldı (Yaşam Hafızası kaynak linki üretmez).
};

/** Modül → uygulama-içi ALLOWLIST route (modül ana sayfası; per-record link değil). */
const YH_MODULE_ROUTES: Record<YhSourceModule, string> = {
  refleksoloji: "/refleksoloji",
  sifa_rehberi: "/sifa-rehberi",
  biyoenerji: "/enerji-beden",
  dogaltas: "/dogaltas",
  aromaterapi: "/aromaterapi",
  kisisel_arsiv: "/dashboard/kisisel-arsiv",
  numeroloji: "/numeroloji",
  yebs: "/yebs",
  kupa_hacamat: "/kupa",
};

export function moduleLabel(module: string): string {
  return Object.prototype.hasOwnProperty.call(YH_MODULE_LABELS, module)
    ? YH_MODULE_LABELS[module as YhSourceModule]
    : module;
}

/** Güvenli kaynak bağlantısı (allowlist); eşleşme yoksa null → UI bağlantı göstermez. */
export function sourceLinkFor(module: string): string | null {
  return Object.prototype.hasOwnProperty.call(YH_MODULE_ROUTES, module)
    ? YH_MODULE_ROUTES[module as YhSourceModule]
    : null;
}

export function isYhSourceModule(value: unknown): value is YhSourceModule {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(YH_MODULE_LABELS, value);
}

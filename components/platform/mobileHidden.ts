/**
 * MOBİLDE GİZLİ / WEB'DE GÖRÜNÜR dosya seçici CTA'ları (owner kararı 2026-10-07: Anamnez "PDF Ekle",
 * Danışan Taşları "Bilgisayardan Foto Seç"). İki katman — Anamnez PDF CTA'sıyla (PR #336) aynı:
 *   (a) tüm Android (uygulama WebView + Chrome) → SSR `.no-android` (html[data-android], globals.css),
 *   (b) telefon genişliği (<768px) → Tailwind `hidden md:*`.
 * Masaüstü / tablet (md+, Android dışı) aynen görünür; özellik KALDIRILMAZ.
 *
 * Not: Tailwind yalnız app/** ve components/** dosyalarını tarar → sınıf dizgileri burada (components)
 * DÜZ METİN olarak durmalıdır.
 */
export const MOBILE_HIDDEN_INLINE_FLEX = "no-android hidden md:inline-flex";
export const MOBILE_HIDDEN_BLOCK = "no-android hidden md:block";

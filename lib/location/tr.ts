/**
 * lib/location/tr.ts — Türkiye 81 il konum dataseti (FAZ 5 / P2a).
 *
 * Salt VERİ katmanı. Hiçbir motoru (lib/cosmic/*), UI'ı veya DB'yi okumaz/etkilemez.
 * `Location` tipine uyar (bkz. ./types).
 *
 * Koordinat kaynağı:
 *   - Her kayıt, ilin merkez ilçesinin (il merkezi) enlem/boylamıdır — GeoNames ile
 *     tutarlı, yaygın kabul gören il-merkezi koordinatları. `source: "manual"` (elle
 *     kürasyon), `verified: true` (koordinat düzeyinde).
 *
 * Rakım (elev):
 *   - ⚠️ Bu aşamada TÜM iller için `elev: 0`. Rakım henüz doldurulmadı; astronomik
 *     etkisi ihmal edilebilir (gündoğumu ~yay-dakika/1000 m; tutulma temas ~saniye).
 *     Gerçek rakımlar sonraki bir veri geçişinde (GeoNames yükseklik alanı) girilecek.
 *
 * Saat dilimi (tz):
 *   - Türkiye tek saat dilimidir (UTC+3, 2016'dan beri DST yok) → tüm iller
 *     `"Europe/Istanbul"`.
 *
 * id şeması: `tr-<plaka:2>-<ascii-slug>` (ör. "tr-45-manisa"). Plaka sırasıyla dizili.
 */
import type { Location } from "./types";

/** Türkiye'nin 81 ili — il merkezi koordinatları. */
export const TR_LOCATIONS: ReadonlyArray<Location> = [
  { id: "tr-01-adana",          name: "Adana",          country: "Türkiye", countryCode: "TR", adminRegion: "Adana",          lat: 37.0000, lon: 35.3213, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-02-adiyaman",       name: "Adıyaman",       country: "Türkiye", countryCode: "TR", adminRegion: "Adıyaman",       lat: 37.7648, lon: 38.2786, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-03-afyonkarahisar", name: "Afyonkarahisar", country: "Türkiye", countryCode: "TR", adminRegion: "Afyonkarahisar", lat: 38.7507, lon: 30.5567, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-04-agri",           name: "Ağrı",           country: "Türkiye", countryCode: "TR", adminRegion: "Ağrı",           lat: 39.7191, lon: 43.0503, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-05-amasya",         name: "Amasya",         country: "Türkiye", countryCode: "TR", adminRegion: "Amasya",         lat: 40.6499, lon: 35.8353, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-06-ankara",         name: "Ankara",         country: "Türkiye", countryCode: "TR", adminRegion: "Ankara",         lat: 39.9334, lon: 32.8597, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-07-antalya",        name: "Antalya",        country: "Türkiye", countryCode: "TR", adminRegion: "Antalya",        lat: 36.8969, lon: 30.7133, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-08-artvin",         name: "Artvin",         country: "Türkiye", countryCode: "TR", adminRegion: "Artvin",         lat: 41.1828, lon: 41.8183, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-09-aydin",          name: "Aydın",          country: "Türkiye", countryCode: "TR", adminRegion: "Aydın",          lat: 37.8560, lon: 27.8416, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-10-balikesir",      name: "Balıkesir",      country: "Türkiye", countryCode: "TR", adminRegion: "Balıkesir",      lat: 39.6484, lon: 27.8826, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-11-bilecik",        name: "Bilecik",        country: "Türkiye", countryCode: "TR", adminRegion: "Bilecik",        lat: 40.1426, lon: 29.9793, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-12-bingol",         name: "Bingöl",         country: "Türkiye", countryCode: "TR", adminRegion: "Bingöl",         lat: 38.8853, lon: 40.4980, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-13-bitlis",         name: "Bitlis",         country: "Türkiye", countryCode: "TR", adminRegion: "Bitlis",         lat: 38.4938, lon: 42.1232, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-14-bolu",           name: "Bolu",           country: "Türkiye", countryCode: "TR", adminRegion: "Bolu",           lat: 40.5760, lon: 31.5788, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-15-burdur",         name: "Burdur",         country: "Türkiye", countryCode: "TR", adminRegion: "Burdur",         lat: 37.7203, lon: 30.2908, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-16-bursa",          name: "Bursa",          country: "Türkiye", countryCode: "TR", adminRegion: "Bursa",          lat: 40.1885, lon: 29.0610, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-17-canakkale",      name: "Çanakkale",      country: "Türkiye", countryCode: "TR", adminRegion: "Çanakkale",      lat: 40.1553, lon: 26.4142, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-18-cankiri",        name: "Çankırı",        country: "Türkiye", countryCode: "TR", adminRegion: "Çankırı",        lat: 40.6013, lon: 33.6134, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-19-corum",          name: "Çorum",          country: "Türkiye", countryCode: "TR", adminRegion: "Çorum",          lat: 40.5506, lon: 34.9556, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-20-denizli",        name: "Denizli",        country: "Türkiye", countryCode: "TR", adminRegion: "Denizli",        lat: 37.7765, lon: 29.0864, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-21-diyarbakir",     name: "Diyarbakır",     country: "Türkiye", countryCode: "TR", adminRegion: "Diyarbakır",     lat: 37.9144, lon: 40.2306, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-22-edirne",         name: "Edirne",         country: "Türkiye", countryCode: "TR", adminRegion: "Edirne",         lat: 41.6771, lon: 26.5557, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-23-elazig",         name: "Elazığ",         country: "Türkiye", countryCode: "TR", adminRegion: "Elazığ",         lat: 38.6810, lon: 39.2264, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-24-erzincan",       name: "Erzincan",       country: "Türkiye", countryCode: "TR", adminRegion: "Erzincan",       lat: 39.7500, lon: 39.5000, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-25-erzurum",        name: "Erzurum",        country: "Türkiye", countryCode: "TR", adminRegion: "Erzurum",        lat: 39.9043, lon: 41.2679, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-26-eskisehir",      name: "Eskişehir",      country: "Türkiye", countryCode: "TR", adminRegion: "Eskişehir",      lat: 39.7767, lon: 30.5206, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-27-gaziantep",      name: "Gaziantep",      country: "Türkiye", countryCode: "TR", adminRegion: "Gaziantep",      lat: 37.0662, lon: 37.3833, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-28-giresun",        name: "Giresun",        country: "Türkiye", countryCode: "TR", adminRegion: "Giresun",        lat: 40.9128, lon: 38.3895, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-29-gumushane",      name: "Gümüşhane",      country: "Türkiye", countryCode: "TR", adminRegion: "Gümüşhane",      lat: 40.4603, lon: 39.5086, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-30-hakkari",        name: "Hakkari",        country: "Türkiye", countryCode: "TR", adminRegion: "Hakkari",        lat: 37.5744, lon: 43.7408, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-31-hatay",          name: "Hatay",          country: "Türkiye", countryCode: "TR", adminRegion: "Hatay",          lat: 36.2025, lon: 36.1606, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-32-isparta",        name: "Isparta",        country: "Türkiye", countryCode: "TR", adminRegion: "Isparta",        lat: 37.7648, lon: 30.5566, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-33-mersin",         name: "Mersin",         country: "Türkiye", countryCode: "TR", adminRegion: "Mersin",         lat: 36.8121, lon: 34.6415, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-34-istanbul",       name: "İstanbul",       country: "Türkiye", countryCode: "TR", adminRegion: "İstanbul",       lat: 41.0082, lon: 28.9784, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-35-izmir",          name: "İzmir",          country: "Türkiye", countryCode: "TR", adminRegion: "İzmir",          lat: 38.4237, lon: 27.1428, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-36-kars",           name: "Kars",           country: "Türkiye", countryCode: "TR", adminRegion: "Kars",           lat: 40.6013, lon: 43.0975, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-37-kastamonu",      name: "Kastamonu",      country: "Türkiye", countryCode: "TR", adminRegion: "Kastamonu",      lat: 41.3887, lon: 33.7827, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-38-kayseri",        name: "Kayseri",        country: "Türkiye", countryCode: "TR", adminRegion: "Kayseri",        lat: 38.7312, lon: 35.4787, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-39-kirklareli",     name: "Kırklareli",     country: "Türkiye", countryCode: "TR", adminRegion: "Kırklareli",     lat: 41.7333, lon: 27.2167, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-40-kirsehir",       name: "Kırşehir",       country: "Türkiye", countryCode: "TR", adminRegion: "Kırşehir",       lat: 39.1425, lon: 34.1709, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-41-kocaeli",        name: "Kocaeli",        country: "Türkiye", countryCode: "TR", adminRegion: "Kocaeli",        lat: 40.8533, lon: 29.8815, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-42-konya",          name: "Konya",          country: "Türkiye", countryCode: "TR", adminRegion: "Konya",          lat: 37.8746, lon: 32.4932, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-43-kutahya",        name: "Kütahya",        country: "Türkiye", countryCode: "TR", adminRegion: "Kütahya",        lat: 39.4242, lon: 29.9833, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-44-malatya",        name: "Malatya",        country: "Türkiye", countryCode: "TR", adminRegion: "Malatya",        lat: 38.3552, lon: 38.3095, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-45-manisa",         name: "Manisa",         country: "Türkiye", countryCode: "TR", adminRegion: "Manisa",         lat: 38.6191, lon: 27.4289, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-46-kahramanmaras",  name: "Kahramanmaraş",  country: "Türkiye", countryCode: "TR", adminRegion: "Kahramanmaraş",  lat: 37.5858, lon: 36.9371, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-47-mardin",         name: "Mardin",         country: "Türkiye", countryCode: "TR", adminRegion: "Mardin",         lat: 37.3212, lon: 40.7245, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-48-mugla",          name: "Muğla",          country: "Türkiye", countryCode: "TR", adminRegion: "Muğla",          lat: 37.2153, lon: 28.3636, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-49-mus",            name: "Muş",            country: "Türkiye", countryCode: "TR", adminRegion: "Muş",            lat: 38.9462, lon: 41.7539, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-50-nevsehir",       name: "Nevşehir",       country: "Türkiye", countryCode: "TR", adminRegion: "Nevşehir",       lat: 38.6939, lon: 34.6857, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-51-nigde",          name: "Niğde",          country: "Türkiye", countryCode: "TR", adminRegion: "Niğde",          lat: 37.9667, lon: 34.6833, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-52-ordu",           name: "Ordu",           country: "Türkiye", countryCode: "TR", adminRegion: "Ordu",           lat: 40.9839, lon: 37.8764, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-53-rize",           name: "Rize",           country: "Türkiye", countryCode: "TR", adminRegion: "Rize",           lat: 41.0201, lon: 40.5234, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-54-sakarya",        name: "Sakarya",        country: "Türkiye", countryCode: "TR", adminRegion: "Sakarya",        lat: 40.7569, lon: 30.3781, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-55-samsun",         name: "Samsun",         country: "Türkiye", countryCode: "TR", adminRegion: "Samsun",         lat: 41.2867, lon: 36.3300, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-56-siirt",          name: "Siirt",          country: "Türkiye", countryCode: "TR", adminRegion: "Siirt",          lat: 37.9333, lon: 41.9500, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-57-sinop",          name: "Sinop",          country: "Türkiye", countryCode: "TR", adminRegion: "Sinop",          lat: 42.0231, lon: 35.1531, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-58-sivas",          name: "Sivas",          country: "Türkiye", countryCode: "TR", adminRegion: "Sivas",          lat: 39.7477, lon: 37.0179, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-59-tekirdag",       name: "Tekirdağ",       country: "Türkiye", countryCode: "TR", adminRegion: "Tekirdağ",       lat: 40.9833, lon: 27.5167, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-60-tokat",          name: "Tokat",          country: "Türkiye", countryCode: "TR", adminRegion: "Tokat",          lat: 40.3167, lon: 36.5500, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-61-trabzon",        name: "Trabzon",        country: "Türkiye", countryCode: "TR", adminRegion: "Trabzon",        lat: 41.0027, lon: 39.7168, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-62-tunceli",        name: "Tunceli",        country: "Türkiye", countryCode: "TR", adminRegion: "Tunceli",        lat: 39.1079, lon: 39.5401, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-63-sanliurfa",      name: "Şanlıurfa",      country: "Türkiye", countryCode: "TR", adminRegion: "Şanlıurfa",      lat: 37.1591, lon: 38.7969, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-64-usak",           name: "Uşak",           country: "Türkiye", countryCode: "TR", adminRegion: "Uşak",           lat: 38.6823, lon: 29.4082, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-65-van",            name: "Van",            country: "Türkiye", countryCode: "TR", adminRegion: "Van",            lat: 38.4942, lon: 43.3800, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-66-yozgat",         name: "Yozgat",         country: "Türkiye", countryCode: "TR", adminRegion: "Yozgat",         lat: 39.8181, lon: 34.8147, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-67-zonguldak",      name: "Zonguldak",      country: "Türkiye", countryCode: "TR", adminRegion: "Zonguldak",      lat: 41.4564, lon: 31.7987, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-68-aksaray",        name: "Aksaray",        country: "Türkiye", countryCode: "TR", adminRegion: "Aksaray",        lat: 38.3687, lon: 34.0370, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-69-bayburt",        name: "Bayburt",        country: "Türkiye", countryCode: "TR", adminRegion: "Bayburt",        lat: 40.2552, lon: 40.2249, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-70-karaman",        name: "Karaman",        country: "Türkiye", countryCode: "TR", adminRegion: "Karaman",        lat: 37.1759, lon: 33.2287, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-71-kirikkale",      name: "Kırıkkale",      country: "Türkiye", countryCode: "TR", adminRegion: "Kırıkkale",      lat: 39.8468, lon: 33.5153, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-72-batman",         name: "Batman",         country: "Türkiye", countryCode: "TR", adminRegion: "Batman",         lat: 37.8812, lon: 41.1351, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-73-sirnak",         name: "Şırnak",         country: "Türkiye", countryCode: "TR", adminRegion: "Şırnak",         lat: 37.5164, lon: 42.4611, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-74-bartin",         name: "Bartın",         country: "Türkiye", countryCode: "TR", adminRegion: "Bartın",         lat: 41.6344, lon: 32.3375, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-75-ardahan",        name: "Ardahan",        country: "Türkiye", countryCode: "TR", adminRegion: "Ardahan",        lat: 41.1105, lon: 42.7022, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-76-igdir",          name: "Iğdır",          country: "Türkiye", countryCode: "TR", adminRegion: "Iğdır",          lat: 39.9237, lon: 44.0450, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-77-yalova",         name: "Yalova",         country: "Türkiye", countryCode: "TR", adminRegion: "Yalova",         lat: 40.6500, lon: 29.2667, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-78-karabuk",        name: "Karabük",        country: "Türkiye", countryCode: "TR", adminRegion: "Karabük",        lat: 41.2061, lon: 32.6204, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-79-kilis",          name: "Kilis",          country: "Türkiye", countryCode: "TR", adminRegion: "Kilis",          lat: 36.7184, lon: 37.1212, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-80-osmaniye",       name: "Osmaniye",       country: "Türkiye", countryCode: "TR", adminRegion: "Osmaniye",       lat: 37.0742, lon: 36.2464, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
  { id: "tr-81-duzce",          name: "Düzce",          country: "Türkiye", countryCode: "TR", adminRegion: "Düzce",          lat: 40.8438, lon: 31.1565, elev: 0, tz: "Europe/Istanbul", source: "manual", verified: true, origin: "bundled" },
];

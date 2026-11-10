/**
 * Akıllı CI F3 — GÖLGE MOD kuralları (yalnız analiz; hiçbir testi atlamaz / seçmez).
 *
 * Modül eşlemesi RAPOR içindir; test önerisinin asıl dayanağı gerçek import grafiğidir (golge-graf.mjs).
 * Sıra: ALTYAPI (her zaman FULL) → BELGE → MODÜL. Hiçbir kurala uymayan dosya SINIFLANDIRILAMAZ → FULL.
 * Kural değişince KURAL_SURUMU değişir (çıktıdaki kuralOzeti dosya içeriğinin SHA-256'sıdır).
 */

export const KURAL_SURUMU = "golge-kurallar-2";

/** Ortak altyapı: herhangi biri değişirse gölge önerisi TAM KAPSAM (FULL). [desen, gerekçe] */
export const ALTYAPI = [
  [/^package(-lock)?\.json$/, "bağımlılık / lockfile"],
  [/^(tsconfig[^/]*\.json|next\.config\.[a-z]+|postcss\.config\.[a-z]+|tailwind\.config\.[a-z]+|eslint\.config\.[a-z]+|prisma\.config\.ts|next-env\.d\.ts|vercel\.(json|ts))$/, "derleme / araç yapılandırması"],
  [/^scripts\/(tsconfig[^/]*\.json|[^/]+\/tsconfig\.json)$/, "test derleme yapılandırması"],
  [/^\.github\//, "CI iş akışı / eylem"],
  [/^scripts\/ci\//, "CI koşucusu / kapı / test listesi"],
  [/^supabase\//, "veritabanı migration / şema"],
  [/^prisma\//, "veritabanı şeması"],
  [/^(proxy|middleware)\.[a-z]+$/, "istek ara katmanı (auth / oturum)"],
  [/^lib\/(auth|security|http|server|api|db|tenancy|platform|usage|admin|i18n|docx|text|time|ui|inngest)\//, "ortak kütüphane (auth / güvenlik / API / tenant / DB / Word)"],
  [/^lib\/(supabase[^/]*|runInEffect|rateLimit|safeStorage)\.[a-z]+$/, "ortak kütüphane (Supabase / oturum / hız sınırı)"],
  [/^scripts\/final-hardening\//, "güvenlik çekirdeği harness'ları"],
  [/^scripts\/(?:[^/]+\/)*(?:_shims|[^/]*stubs?)\/|^scripts\/(?:[^/]+\/)*[^/]*[-_.]stub\.[a-z]+$/i, "test altyapısı (tsconfig paths / server-only stub / shim)"],
  [/^i18n\//, "çeviri altyapısı"],
  [/^messages\//, "ortak çeviri metinleri"],
  [/^app\/(layout\.tsx|globals\.css|mobile-360\.css|favicon\.ico)$/, "kök yerleşim / genel stil"],
  [/^app\/api\/(auth|security|me|internal|inngest|usage|location)\//, "ortak API (auth / oturum / iç)"],
  [/^app\/_premium\/fonts\.ts$/, "ortak yazı tipi"],
  [/^components\/(ui|common|layout|auth|i18n|platform|kvkk|provenance|search|analytics|notifications|settings|trial|usage|media|demo|admin)\//, "ortak bileşen"],
  [/^components\/[^/]+\.[a-z]+$/, "ortak bileşen"],
  [/^(hooks|shared)\//, "ortak hook / paylaşılan kod"],
];

/** Yalnız belge sayılabilecek yollar (ek koşul: hiçbir test bu yolu metin olarak anmamalı). */
export const BELGE = [/^docs\//, /^[^/]+\.md$/, /^scripts\/.+\.md$/, /^\.cursor\//];

/** Modül aileleri. korunan: mevcut CI politikasıyla regresyon testleri ÇALIŞTIRILMAYAN alan (Owner kararı). */
export const MODULLER = [
  { id: "admin-uye", ad: "Admin Paneli / Üye Yönetimi", desen: [/^app\/admin\/(users|deneme-uyeleri|tenant-kontrol|kullanim-takibi|sistem-sagligi|hata-kayitlari|bildirimler|support|veri-paylasimi|toplu-veri|page\.tsx|layout\.tsx)/, /^app\/api\/admin\/(users|users-tenant-ids|tenants|trials|expert-stats|health|metrics|notifications|support|system-health|toplu-veri|veri-paylasimi|workspace-access|me)\//, /^scripts\/(uye-|admin-|expert-usage|faz1|owner-|notifications|tenant)/] },
  { id: "deneme-kayit", ad: "Deneme Üyelik / Kayıt", desen: [/^lib\/trial\//, /^app\/(register|api\/register|api\/trial)\//, /^scripts\/trial7/] },
  { id: "danisan", ad: "Danışan Yolculuğu / Ajanda / Anamnez", desen: [/^app\/(danisan-yolculugu|dashboard)\//, /^app\/_premium\/danisan-yolculugu\//, /^app\/api\/(clients|appointments|ajanda|dashboard)\//, /^lib\/(clients|danisan|calendar)\//, /^lib\/clientNotes\.ts$/, /^components\/danisan\//, /^scripts\/(anamnez|dy|dya07|asama2-d|asama2-dy|clients|ajanda)/] },
  { id: "yasam-hafizasi", ad: "Yaşam Hafızası", desen: [/^app\/(yasam-hafizasi|admin\/yasam-hafizasi|api\/yasam-hafizasi|api\/admin\/yasam-hafizasi)\//, /^lib\/yasam-hafizasi\//, /^components\/yasam-hafizasi\//, /^scripts\/(yh|personal-archive)/] },
  { id: "dogaltas", ad: "Doğal Taş / Taş Kütüphanesi", desen: [/^app\/(dogaltas|admin\/dogaltas-import|admin\/dogaltas-kutuphane|api\/dogaltas|api\/admin\/dogaltas|api\/admin\/dogaltas-kutuphane)\//, /^lib\/(dogaltas|stone-library|stones)\//, /^stones\.json$/, /^public\/premium\/dogaltas\//, /^scripts\/(stone|dogaltas|stk01|tas0)/] },
  { id: "stok-magaza", ad: "Ürün Stok / Mağaza", desen: [/^app\/(urun-stok|magaza|admin\/magaza|admin\/stok-merkezi|api\/urun-stok|api\/admin\/magaza)\//, /^app\/_premium\/urun-stok\//, /^lib\/(urun-stok|store)\//, /^public\/magaza\//, /^scripts\/(urun-stok|store)/] },
  { id: "disa-aktarim", ad: "Dışa Aktarım / Arşiv / Yedek", desen: [/^app\/(settings|api\/settings|api\/kisisel-arsiv|admin\/yedekleme)\//, /^lib\/(archive|backup|kisisel-arsiv)\//, /^scripts\/(settings-export|delete-safety|mobile-files)/] },
  { id: "atlas", ad: "Gökyüzü Atlası (Astroloji)", korunan: true, desen: [/^app\/(astroloji|admin\/astroloji|api\/astroloji|api\/admin\/astroloji)\//, /^lib\/astrology\//, /^lib\/atlasStorage\.ts$/, /^components\/astrology\//, /^data\/ephemeris\//, /^scripts\/(astrology|astroloji)\//] },
  { id: "human-design", ad: "Human Design", korunan: true, desen: [/^app\/(human-design|admin\/human-design|admin\/hd-[^/]+|api\/hd|api\/admin\/hd)\//, /^app\/_premium\/(hd-education|human-design)\//, /^lib\/human-design\//, /^components\/human-design\//, /^human_design_bilgi_bankasi\.json$/, /^scripts\/(hd|human-design)/] },
  { id: "numeroloji", ad: "Numeroloji", korunan: true, desen: [/^app\/(numeroloji[^/]*|api\/numeroloji[^/]*|api\/admin\/numeroloji)\//, /^app\/_premium\/numeroloji\//, /^lib\/numeroloji[^/]*\//, /^components\/numeroloji\//, /^scripts\/(numeroloji|nkb)/] },
  { id: "kozmik", ad: "Kozmik Takvim", korunan: true, desen: [/^app\/(cosmic-calendar|api\/cosmic)\//, /^lib\/cosmic\//, /^scripts\/cosmic/] },
  { id: "kampanya", ad: "Landing / Kampanya Merkezi", desen: [/^app\/(_campaign|ucretsiz-analiz[^/]*|admin\/kampanya-merkezi|api\/kampanya|api\/admin\/kampanya-merkezi)\//, /^app\/page\.tsx$/, /^app\/_premium\/landing\//, /^lib\/campaign\//, /^components\/landing\//, /^public\/premium\/landing\//, /^scripts\/campaign\//] },
  { id: "kisisel-ofis", ad: "Kişisel Ofis / Ana Panel / Workspace", desen: [/^app\/_premium\/home\//, /^lib\/workspace\//, /^app\/api\/admin\/workspace-access\//, /^public\/premium\/home\//, /^scripts\/(workspace|wt[0-9])/] },
  { id: "beslenme", ad: "Beslenme", desen: [/^app\/(beslenme|api\/beslenme)\//, /^app\/_premium\/beslenme\//, /^lib\/beslenme\//, /^data\/nutrition\//, /^scripts\/(beslenme|asama2-bes)/] },
  { id: "aromaterapi", ad: "Aromaterapi", desen: [/^app\/(aromaterapi|api\/aromaterapi|api\/admin\/aromaterapi)\//, /^lib\/aromaterapi\//, /^scripts\/aromaterapi/] },
  { id: "biyoenerji", ad: "Biyoenerji / Enerji Beden", desen: [/^app\/(enerji-beden|api\/biyoenerji|api\/admin\/biyoenerji)\//, /^app\/_premium\/(biyoenerji|enerji-beden)\//, /^lib\/(bioenergy|biyoenerji)\//, /^scripts\/(bioenergy|bug016)/] },
  { id: "refleksoloji", ad: "Refleksoloji", desen: [/^app\/(refleksoloji|api\/refleksoloji|api\/admin\/refleksoloji)\//, /^app\/_premium\/refleksoloji\//, /^lib\/(refleksoloji|bodymap)\//, /^lib\/refleksolojiAtlasSync\.ts$/, /^public\/refleksoloji\//, /^scripts\/(reflexology|refleksoloji|ref0)/] },
  { id: "kupa", ad: "Kupa / Hacamat", desen: [/^app\/(kupa|api\/kupa|api\/hacamat)\//, /^app\/_premium\/kupa\//, /^lib\/cupping\//, /^scripts\/(cupping|kup0)/] },
  { id: "sifa-rehberi", ad: "Şifa Rehberi", desen: [/^app\/(sifa-rehberi|api\/sifa-rehberi|api\/admin\/sifa-rehberi)\//, /^app\/_premium\/sifa-rehberi\//, /^lib\/sifa-rehberi\//, /^components\/sifa-rehberi\//, /^scripts\/(sifa|sif0)/] },
  { id: "dogal-destek", ad: "Doğal Destek", desen: [/^app\/dogal-destek\//, /^scripts\/dogal-destek/] },
  { id: "yebs", ad: "YEBS (admin bilgi sistemi)", desen: [/^app\/api\/admin\/yebs\//, /^scripts\/yebs/] },
  { id: "ceviri-medya", ad: "Video / Belge Çeviri / Ders Notu", desen: [/^app\/(video-ceviri|belge-ceviri|ders-notu|digital-content|api\/video-ceviri|api\/belge-ceviri|api\/ders-notu)\//, /^lib\/(video-ceviri|media)\//] },
  { id: "yasam-analizi", ad: "Yaşam Analizi", desen: [/^app\/life-analysis\//] },
  { id: "hukuki", ad: "Hukuki Sayfalar", desen: [/^app\/(gizlilik-politikasi|kullanim-sartlari|kvkk-aydinlatma|veri-isleme-sozlesmesi|iletisim|api\/contact)\//, /^lib\/(legal|contact)\//, /^scripts\/legal/] },
  { id: "demo", ad: "Demo / Vitrin", desen: [/^app\/demo\//, /^lib\/demo\//, /^scripts\/demo/] },
  { id: "alt-isleyiciler", ad: "Alt İşleyiciler", desen: [/^app\/alt-isleyiciler\//] },
  { id: "konum", ad: "Konum", desen: [/^lib\/location\//, /^scripts\/location/] },
  { id: "arama", ad: "Arama", desen: [/^lib\/search\//] },
];

/** Gerçek import grafiğiyle "ortak bağımlılık" eşiği: bu kadar testin / test modülünün kullandığı dosya → FULL. */
export const ORTAK_TEST_ESIGI = 20;
export const ORTAK_MODUL_ESIGI = 3;

/** Hiçbir koşulda önerilerden çıkarılmayan işler (güvenlik / derleme / kapı). */
export const HER_ZAMAN_ISLER = ["typescript", "build", "guvenlik", "ci-kapisi"];

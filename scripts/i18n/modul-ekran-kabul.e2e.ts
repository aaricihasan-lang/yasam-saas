/**
 * I18N-F1-R3 — MODÜL EKRAN KABUL TESTİ (gerçek Chromium; PRODUCTION'A SIFIR TEMAS; yalnız sentetik veri).
 *
 * Amaç: kapsam içi TÜM uzman modül ekranlarını Türkçe / İngilizce × 1280 / 768 / 390 / 360 px genişlikte açıp
 *   - ekran görüntüsü           → <out>/<dil>-<genişlik>-<rota-adı>.png
 *   - yatay taşma               → scrollWidth ≤ genişlik + 1 (aşan öğeler tanı için listelenir) = FAIL
 *   - sayfa çökmesi             → yakalanmamış hata (pageerror) / Next hata ekranı / belge-RSC 5xx
 *   - konsol error              → uygulama konsol hatası = FAIL (R4, Owner §18). Ayrım: "Failed to load resource" satırları
 *                                 HTTP ölçümüyle zaten sayıldığı için kaynak-yükleme sınıfında; aynı ekranda /api 5xx varsa
 *                                 (test ortamında olmayan modül tablosu) uygulama hatası UYARI sayılır (strict'te FAIL)
 *   - ham anahtar / MISSING_MESSAGE → konsolda next-intl hata kodu (MISSING_MESSAGE/INVALID_KEY/FORMATTING_ERROR…) ya da
 *                                 görünen metinde "<namespace>.<anahtar>" / "⟦…⟧" = FAIL
 *   - <html lang>               → beklenen dil (kapı açık: istenen dil; kapı kapalı: daima tr) değilse = FAIL
 *   - HTTP 5xx                  → belge / RSC / statik = FAIL; /api/* = UYARI (test ortamında olmayan modül tabloları
 *                                 yüzünden beklenir; `--strict-api` ya da MODUL_EKRAN_STRICT_API=1 ile FAIL)
 *   - EN'de Türkçe karakter     → görünen metin düğümleri + placeholder/title/aria-label; marka (scope.json
 *                                 brandAllowlist), sentetik veri ve lang="tr" işaretli öğeler hariç → "TR-aday" (BİLGİ, FAIL değil)
 * ve şu senaryoları koşar:
 *   S1 (tr işi) Dil değişiminde veri korunması: Danışan Kayıt formunda girilen metin TR→EN geçişinde (çerez + router.refresh —
 *      LanguageSelector'ın yaptığı ile aynı) kaybolmuyor mu
 *   S2 (en işi) EN'de Danışan oluşturma (sentetik) → POST /api/clients 2xx + DB satırı
 *   S3 (en işi) EN'de Danışan düzenleme (Genel Bilgi → telefon) → PATCH /api/clients/<id> 2xx + DB
 *   S4 (her dil) Word raporu: danışan detayında "Tam Word raporu" → POST …/word-report yanıtı 200
 *      (rapor DİLİ kapsam dışı — çıktılar henüz çevrilmedi; yalnız yanıt durumu)
 *   M  (her dil, 1280) Silme onayı modalı: aç → Vazgeç/Cancel ile kapat (silme ASLA onaylanmaz) + kaydın durduğu doğrulanır
 *   S5 (tr işi) Dil değiştir → sayfa yenile → dil kalıcı (Ayarlar › Dil; çerez + hesap tercihi) → sonra TR'ye geri alınır
 *   S6 (en işi) Hesap değiştir → dil izolasyonu: aynı tarayıcıda sentetik A (tercih en) ↔ B (tercih yok) hesapları
 *   S7 (her dil, 1280 + 360) Yükleme ekranı (loading.tsx): RSC yanıtı geciktirilerek istemci gezintisinde yakalanır
 *   K1 (--gate-closed) Kapı kapalı: NEXT_LOCALE=en çerezi + hesap tercihi en olsa bile her ekran tr, dil seçimi görünmez
 *
 * Kapsam DIŞI (Owner kararı): Numeroloji, Atlas/Astroloji, Kozmik Ajanda, Şifa Rehberi (ekran görüntüsü + TR-aday sayımı
 * ALINIR ama "KAPSAM-DIŞI" olarak ayrı raporlanır, başarısızlık sayılmaz), HD alt ekranları, admin ekranları.
 * Human Design ana ekranı (/human-design hub, #854) R4'te kapsama girdi.
 *
 * Ön koşul (gizli değer YOK; production adresi YOK) — yayın kapısı AÇIK build:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret NEXT_PUBLIC_I18N_LOCALE_SWITCHING=on npx next build
 * Çalıştır (CI: .github/workflows/i18n-modul-ekran.yml):
 *   npx tsx scripts/i18n/modul-ekran-kabul.e2e.ts --out <klasör> [--locales tr,en] [--widths 1280,768,390,360]
 *       [--only <rota-id-virgüllü>] [--budget-min 42] [--strict-api] [--full-page] [--gate-closed]
 *   --gate-closed: build NEXT_PUBLIC_I18N_LOCALE_SWITCHING=off ile yapılmış olmalı; yalnız tr turu koşar, çerez/tercih en verilir.
 *
 * Ortam: scripts/dy-presale-closeout/env (anamnez test ortamı = embedded PostgreSQL + PostgREST şimi + DY tabloları
 * + YH outbox) + Word raporu için asgari tablolar (scripts/asama2-dy005 ile aynı DDL) + user_locale_prefs migration'ı.
 * Doğaltaş / aromaterapi / kupa / biyoenerji / refleksoloji / stok / beslenme kataloğu / kişisel arşiv / Yaşam Hafızası
 * tabloları bu ortamda YOKTUR → bu ekranlar liste / boş durum olarak çekilir (API 5xx'leri uyarı olarak raporlanır).
 *
 * Çıktı: <out>/ozet.json + <out>/ozet.md + PNG'ler + <out>/next-sunucu.log. Çıkış kodu: çökme / belge 5xx / taşma /
 * senaryo hatası = 1; TR-aday ve API 5xx (strict değilse) = bilgi.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { startDyEnv } from "../dy-presale-closeout/env";

// ─── Parametreler ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (flag: string, def: string): string => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? String(argv[i + 1]) : def;
};
type Lang = "tr" | "en";
const OUT = path.resolve(arg("--out", path.join(os.tmpdir(), "i18n-modul-ekran")));
const LOCALES = arg("--locales", "tr,en").split(",").map((s) => s.trim()).filter((s): s is Lang => s === "tr" || s === "en");
const WIDTHS = arg("--widths", "1280,768,390,360").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 320);
const ONLY = new Set(arg("--only", "").split(",").map((s) => s.trim()).filter(Boolean));
const BUDGET_MS = Number(arg("--budget-min", "42")) * 60_000;
const STRICT_API = argv.includes("--strict-api") || process.env.MODUL_EKRAN_STRICT_API === "1";
const FULL_PAGE = argv.includes("--full-page") || process.env.MODUL_EKRAN_FULL_PAGE === "1";
/** Kapı kapalı build'i: ekranlar tr turu olarak gezilir ama tarayıcıya NEXT_LOCALE=en + hesaba en tercihi verilir. */
const GATE_CLOSED = argv.includes("--gate-closed") || process.env.MODUL_EKRAN_GATE_CLOSED === "1";
const APP_PORT = Number(process.env.MODUL_EKRAN_APP_PORT ?? 3997);
const APP = `http://127.0.0.1:${APP_PORT}`;
const SUPA_PORT = Number(process.env.I18N_E2E_SUPA_PORT ?? 54398);
const PG_PORT = Number(process.env.MODUL_EKRAN_PG_PORT ?? 54481);
const ROOT = process.cwd();
const STARTED = Date.now();
mkdirSync(OUT, { recursive: true });

const HEIGHT: Record<number, number> = { 1280: 900, 768: 1024, 390: 844, 360: 780 };
const STABILIZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
const CRASH_TEXT = /This page couldn[’']t load|Application error: a (client|server)-side exception/i;
const NOISE_PAGEERROR = /Failed to fetch|NetworkError|Load failed|AbortError|ResizeObserver loop/i;
/** Tarayıcının kaynak yükleme günlüğü (HTTP durumu ayrıca ölçülür) → uygulama konsol hatası sayılmaz. Ayrıca test ortamı
 *  yapıtı: `next start` Vercel Analytics / Speed Insights betiklerini (/_vercel/…/script.js) sunmaz → "Refused to execute
 *  script … MIME type ('text/plain')" (Vercel'de bu yollar platformca sunulur; ürün hatası değil). */
const RESOURCE_CONSOLE = /^Failed to load resource|Refused to execute script from '[^']*\/_vercel\/(?:speed-)?insights\//i;
/** next-intl hata kodları: eksik / geçersiz anahtar ya da ICU biçim hatası → FAIL. */
const INTL_CONSOLE = /MISSING_MESSAGE|INVALID_KEY|INVALID_MESSAGE|FORMATTING_ERROR|INSUFFICIENT_PATH|ENVIRONMENT_FALLBACK|IntlError/;

// ─── Mesaj kataloğu (etiketler koddan değil kataloğdan → metin değişse de test kırılmaz) ─────────────────

const msgCache = new Map<string, unknown>();
/** M("en", "clients.detail", "general.save") → messages/en/clients.detail.json içindeki clients.detail.general.save */
function M(lang: Lang, file: string, key: string): string {
  const f = path.join(ROOT, "messages", lang, `${file}.json`);
  if (!msgCache.has(f)) msgCache.set(f, JSON.parse(readFileSync(f, "utf8")));
  let cur: unknown = msgCache.get(f);
  for (const part of [...file.split("."), ...key.split(".")]) {
    cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  }
  if (typeof cur !== "string") throw new Error(`katalog anahtarı yok: ${lang}/${file}.${key}`);
  return cur;
}
/** M'nin hata atmayan hali (karşılaştırma tabanında — ör. main — namespace olmayabilir). */
function Mq(lang: Lang, file: string, key: string): string | null {
  try { return M(lang, file, key); } catch { return null; }
}
/** Ham anahtar taraması için kök namespace'ler (messages/<dil>/*.json dosya adlarının ilk parçası). */
function messageRoots(): string[] {
  try {
    return Array.from(new Set(readdirSync(path.join(ROOT, "messages", "en")).filter((f) => f.endsWith(".json")).map((f) => f.split(".")[0]!)));
  } catch {
    return [];
  }
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Baştaki süs karakterini (✎ vb.) at — UI stripLeadingGlyph ile aynı amaç. */
const stripGlyph = (s: string) => s.replace(/^[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/, "").trim();

function brandAllowlist(): string[] {
  try {
    const j = JSON.parse(readFileSync(path.join(ROOT, "scripts/i18n/scope.json"), "utf8")) as { brandAllowlist?: string[] };
    return j.brandAllowlist ?? ["Yaşam Sistemi", "YAŞAM SİSTEMİ"];
  } catch {
    return ["Yaşam Sistemi", "YAŞAM SİSTEMİ"];
  }
}

// ─── Rotalar ─────────────────────────────────────────────────────────────────

type RouteDef = {
  id: string;
  group: string;
  path: string;
  /** Ayarlar sekmesi (data-settings-tab) */
  settingsTab?: string;
  /** Silme onayı modal denemesi: "first" | "last" görünür silme düğmesi */
  modal?: "first" | "last";
  /** Sekme yoksa sessizce atla (ör. Kişisel Dijital Ofis yalnız izinli hesapta) */
  optionalTab?: boolean;
  /** Kapsam dışı modül (Owner): ölçülür + ekran görüntüsü alınır, sonuç "KAPSAM-DIŞI" (FAIL sayılmaz). */
  outOfScope?: boolean;
  /** Oturumsuz ziyaretçi bağlamında aç (kampanya ziyaretçi ekranları). */
  anon?: boolean;
  /** Yüklendikten sonra yapılacak etkileşim: "bell" = bildirim panelini aç; "error-boundary" = API yanıtı bozularak
   *  segment hata sınırı (error.tsx) tetiklenir (ürün koduna dokunmadan, yalnız tarayıcıda yanıt değiştirilir). */
  action?: "bell" | "error-boundary";
  /** Beklenen belge HTTP durumu (ör. 404 sayfası). */
  expectStatus?: number;
  /** Bu rota için tam sayfa ekran görüntüsü (uzun ayar sekmeleri). */
  fullPage?: boolean;
};

const CLIENT_TABS = ["genel", "anamnez", "notlar", "seanslar", "odevler", "analizler", "taslar", "beslenme", "hafiza", "randevular", "yolculuk", "ucretlendirme"] as const;
const SETTINGS_TABS = ["security", "profile", "location", "contact", "export", "backup", "restore", "membership", "workspace", "language"] as const;

const ROUTES: RouteDef[] = [
  { id: "ana-sayfa", group: "Ana sayfa / panel", path: "/" },
  { id: "panel", group: "Ana sayfa / panel", path: "/dashboard" },
  ...SETTINGS_TABS.map((t): RouteDef => ({
    id: t === "membership" ? "ayarlar-uyeligim" : `ayarlar-${t}`, group: "Ayarlar", path: "/settings", settingsTab: t,
    // Kapı kapalı build'de Dil sekmesi bilerek YOK → "beklenen" (K1 senaryosu ayrıca doğrular).
    optionalTab: t === "workspace" || (GATE_CLOSED && t === "language"),
  })),
  // Giriş yöntemleri (MyLoginMethodsPanel) + oturumlar Güvenlik sekmesinin altında → tam sayfa görüntü.
  { id: "ayarlar-giris-yontemleri", group: "Ayarlar", path: "/settings", settingsTab: "security", fullPage: true },
  { id: "bildirimler", group: "Bildirimler", path: "/", action: "bell" },
  { id: "human-design-hub", group: "Human Design", path: "/human-design" },
  { id: "hata-404", group: "Hata / yükleme", path: "/zz-olmayan-sayfa-r4", expectStatus: 404 },
  { id: "hata-siniri-kupa", group: "Hata / yükleme", path: "/kupa/protokoller", action: "error-boundary" },
  { id: "kampanya-ziyaretci-ana-sayfa", group: "Kampanya ziyaretçi", path: "/", anon: true },
  { id: "kampanya-ziyaretci-ucretsiz-analiz", group: "Kampanya ziyaretçi", path: "/ucretsiz-analiz", anon: true },
  { id: "ajanda", group: "Ajanda", path: "/dashboard/ajanda", modal: "first" },
  { id: "kisisel-arsiv", group: "Kişisel Arşiv", path: "/dashboard/kisisel-arsiv" },
  { id: "danisan-yolculugu", group: "Danışan Yolculuğu", path: "/danisan-yolculugu" },
  { id: "danisan-listesi", group: "Danışanlar", path: "/danisan-yolculugu/liste" },
  { id: "danisan-kayit", group: "Danışanlar", path: "/danisan-yolculugu/kayit" },
  { id: "danisan-takip", group: "Danışan Yolculuğu", path: "/danisan-yolculugu/takip" },
  ...CLIENT_TABS.map((t): RouteDef => ({
    id: `danisan-detay-${t}`, group: "Danışanlar", path: `/dashboard/clients/{client}?tab=${t}`,
    modal: t === "genel" ? "first" : t === "seanslar" || t === "odevler" || t === "randevular" ? "last" : undefined,
  })),
  { id: "danisan-anamnez-detay", group: "Danışanlar", path: "/dashboard/clients/{client}/anamnez/{anamnesis}" },
  { id: "yasam-hafizasi", group: "Yaşam Hafızası", path: "/yasam-hafizasi" },
  { id: "dijital-icerik", group: "Dijital İçerik", path: "/digital-content" },
  { id: "belge-ceviri", group: "Dijital İçerik", path: "/belge-ceviri" },
  { id: "video-ceviri", group: "Dijital İçerik", path: "/video-ceviri" },
  { id: "ders-notu", group: "Dijital İçerik", path: "/ders-notu" },
  { id: "dogaltas", group: "Doğaltaş", path: "/dogaltas" },
  { id: "dogaltas-listesi", group: "Doğaltaş", path: "/dogaltas/dogaltas-listesi", modal: "first" },
  { id: "dogaltas-kayit", group: "Doğaltaş", path: "/dogaltas/dogaltas-kayit" },
  { id: "dogaltas-kutuphane", group: "Doğaltaş", path: "/dogaltas/kutuphane" },
  { id: "dogaltas-tas-bilgi-kutuphanesi", group: "Doğaltaş", path: "/dogaltas/tas-bilgi-kutuphanesi" },
  { id: "dogaltas-kombinasyonlar", group: "Doğaltaş", path: "/dogaltas/kombinasyonlar", modal: "first" },
  { id: "dogaltas-kombinasyon-olustur", group: "Doğaltaş", path: "/dogaltas/kombinasyon-olustur" },
  { id: "dogaltas-mineral-listesi", group: "Doğaltaş", path: "/dogaltas/mineral-listesi", modal: "first" },
  { id: "dogaltas-mineral-bankasi", group: "Doğaltaş", path: "/dogaltas/mineral-bankasi" },
  { id: "dogal-destek", group: "Doğal Destek", path: "/dogal-destek" },
  { id: "beslenme", group: "Beslenme", path: "/beslenme" },
  { id: "beslenme-besinler", group: "Beslenme", path: "/beslenme/besinler" },
  { id: "beslenme-kan-grubu", group: "Beslenme", path: "/beslenme/kan-grubu" },
  { id: "beslenme-mizac", group: "Beslenme", path: "/beslenme/mizac" },
  { id: "beslenme-planlar", group: "Beslenme", path: "/beslenme/planlar", modal: "first" },
  { id: "beslenme-rehber", group: "Beslenme", path: "/beslenme/rehber" },
  { id: "beslenme-sablonlar", group: "Beslenme", path: "/beslenme/sablonlar" },
  { id: "kupa", group: "Kupa & Hacamat", path: "/kupa" },
  { id: "kupa-takvim", group: "Kupa & Hacamat", path: "/kupa/takvim" },
  { id: "kupa-amac-rehberi", group: "Kupa & Hacamat", path: "/kupa/amac-rehberi" },
  { id: "kupa-amac-rehberi-yeni", group: "Kupa & Hacamat", path: "/kupa/amac-rehberi/yeni" },
  { id: "kupa-bilgi-kutuphanesi", group: "Kupa & Hacamat", path: "/kupa/bilgi-kutuphanesi" },
  { id: "kupa-guvenlik", group: "Kupa & Hacamat", path: "/kupa/guvenlik" },
  { id: "kupa-kaynaklar", group: "Kupa & Hacamat", path: "/kupa/kaynaklar" },
  { id: "kupa-noktalar", group: "Kupa & Hacamat", path: "/kupa/noktalar" },
  { id: "kupa-protokoller", group: "Kupa & Hacamat", path: "/kupa/protokoller", modal: "first" },
  { id: "kupa-protokoller-yeni", group: "Kupa & Hacamat", path: "/kupa/protokoller/yeni" },
  { id: "kupa-teknikler", group: "Kupa & Hacamat", path: "/kupa/teknikler", modal: "first" },
  { id: "kupa-teknikler-yeni", group: "Kupa & Hacamat", path: "/kupa/teknikler/yeni" },
  { id: "enerji-beden", group: "Biyoenerji / Çakra", path: "/enerji-beden" },
  { id: "biyoenerji", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji" },
  { id: "biyoenerji-cakralar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/cakralar" },
  { id: "biyoenerji-bilincalti-sebepleri", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/bilincalti-sebepleri" },
  { id: "biyoenerji-enerji-bedenleri", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/enerji-bedenleri" },
  { id: "biyoenerji-imajinasyonlar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/imajinasyonlar" },
  { id: "biyoenerji-seanslar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/seanslar", modal: "first" },
  { id: "biyoenerji-sembol-dili", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/sembol-dili" },
  { id: "refleksoloji", group: "Refleksoloji", path: "/refleksoloji" },
  { id: "refleksoloji-bolge-haritasi", group: "Refleksoloji", path: "/refleksoloji/bolge-haritasi" },
  { id: "refleksoloji-protokol-haritasi", group: "Refleksoloji", path: "/refleksoloji/protokol-haritasi" },
  { id: "refleksoloji-kayitli-atlas", group: "Refleksoloji", path: "/refleksoloji/kayitli-atlas", modal: "first" },
  { id: "refleksoloji-kayitli-protokoller", group: "Refleksoloji", path: "/refleksoloji/kayitli-protokoller", modal: "first" },
  { id: "refleksoloji-notlar", group: "Refleksoloji", path: "/refleksoloji/notlar", modal: "first" },
  { id: "aromaterapi", group: "Aromaterapi", path: "/aromaterapi" },
  { id: "aromaterapi-bilgi-bankasi", group: "Aromaterapi", path: "/aromaterapi/bilgi-bankasi" },
  { id: "aromaterapi-sozluk", group: "Aromaterapi", path: "/aromaterapi/bilgi-bankasi/sozluk" },
  { id: "aromaterapi-bilgi-kayitlari", group: "Aromaterapi", path: "/aromaterapi/bilgi-kayitlari", modal: "first" },
  { id: "aromaterapi-bilgi-kayitlari-yeni", group: "Aromaterapi", path: "/aromaterapi/bilgi-kayitlari/yeni" },
  { id: "aromaterapi-karisim-olusturucu", group: "Aromaterapi", path: "/aromaterapi/karisim-olusturucu" },
  { id: "aromaterapi-katalog", group: "Aromaterapi", path: "/aromaterapi/katalog" },
  { id: "aromaterapi-kaynaklar", group: "Aromaterapi", path: "/aromaterapi/kaynaklar" },
  { id: "aromaterapi-maserasyon-yaglari", group: "Aromaterapi", path: "/aromaterapi/maserasyon-yaglari" },
  { id: "aromaterapi-sabit-yaglar", group: "Aromaterapi", path: "/aromaterapi/sabit-yaglar" },
  { id: "aromaterapi-ucucu-yaglar", group: "Aromaterapi", path: "/aromaterapi/ucucu-yaglar" },
  { id: "aromaterapi-yaglar", group: "Aromaterapi", path: "/aromaterapi/yaglar" },
  { id: "urun-stok", group: "Ürün & Stok", path: "/urun-stok" },
  { id: "urun-stok-canli-stok", group: "Ürün & Stok", path: "/urun-stok/canli-stok" },
  { id: "urun-stok-dogaltas", group: "Ürün & Stok", path: "/urun-stok/dogaltas", modal: "first" },
  { id: "urun-stok-yag", group: "Ürün & Stok", path: "/urun-stok/yag" },
  { id: "urun-stok-sabun-krem", group: "Ürün & Stok", path: "/urun-stok/sabun-krem" },
  { id: "urun-stok-aksesuar", group: "Ürün & Stok", path: "/urun-stok/aksesuar" },
  { id: "urun-stok-diger", group: "Ürün & Stok", path: "/urun-stok/diger" },
  { id: "urun-stok-satis-fiyatlandirma", group: "Ürün & Stok", path: "/urun-stok/satis-fiyatlandirma" },
  { id: "urun-stok-satis-gecmisi", group: "Ürün & Stok", path: "/urun-stok/satis-gecmisi" },
  { id: "urun-stok-stok-hareketleri", group: "Ürün & Stok", path: "/urun-stok/stok-hareketleri" },
  // ── Kapsam DIŞI / bekliyor (Owner): ölçülür, ayrı raporlanır, FAIL sayılmaz ──
  { id: "kd-kozmik-ajanda", group: "KAPSAM DIŞI", path: "/cosmic-calendar", outOfScope: true },
  { id: "kd-sifa-rehberi", group: "KAPSAM DIŞI", path: "/sifa-rehberi", outOfScope: true },
  { id: "kd-numeroloji", group: "KAPSAM DIŞI", path: "/numeroloji", outOfScope: true },
  { id: "kd-atlas", group: "KAPSAM DIŞI", path: "/astroloji", outOfScope: true },
];

// ─── Sentetik veri ───────────────────────────────────────────────────────────

/** Bilinçli olarak ASCII: Türkçe-karakter taramasında sentetik veri gürültü üretmesin. */
const SYN = {
  tenantName: "ZZ_MODUL_EKRAN_TENANT",
  expertName: "ZZ Modul Uzman",
  expertEmail: "zz.modul.uzman@example.test",
  clientAd: "ZZ Modul",
  clientSoyad: "DANISAN",
  createdAd: "ZZ EnForm",
  createdSoyad: "OLUSTUR",
  keepAd: "ZZ Korunan",
  keepSoyad: "VERI",
  expertNameB: "ZZ Modul Uzman B",
  expertEmailB: "zz.modul.uzman.b@example.test",
};
/** Uzman modül yetkilerinin TAMAMI (kapsam dışı modüller de açık: yalnız kapsam içi ekranlar ziyaret edilir). */
const ALL_EXPERT_MODULES: Record<string, boolean> = {
  clients: true, appointments: true, stones: true, stok: true, reflexology: true, energy_body: true, aromatherapy: true,
  personal_archive: true, belge_ceviri: true, digital_content: true, cupping: true, beslenme: true, yasam_hafizasi: true,
  numerology: true, human_design: true, cosmic_calendar: true, sifa_rehberi: true, astrology: true,
};

const EXTRA_DDL = `
do $$ begin
  if not exists (select 1 from pg_constraint where conname='clients_tenant_id_id_key') then
    alter table public.clients add constraint clients_tenant_id_id_key unique (tenant_id, id);
  end if;
end $$;
create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table if not exists public.client_charges (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, charge_date text, category text, detail text, amount numeric, payment_status text, created_at timestamptz default now());
create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text, report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, surname text, birth_date text, analysis_data jsonb, is_demo_seed boolean default false, created_at timestamptz default now());
-- R4: dy-presale-closeout test şeması client_stones / client_combinations'ı asgari kolonla kurar; Word raporu
-- (clientReportData.ts) production şemasındaki kolonlara göre sıralar/seçer → 42703 → "Rapor seçenekleri yüklenemedi" →
-- "Word Oluştur" pasif → S4 tıklama zaman aşımı (R3/R4 kanıtı: next-sunucu.log: column "stone_date" does not exist).
alter table public.client_stones add column if not exists stone_type text;
alter table public.client_stones add column if not exists note text;
alter table public.client_stones add column if not exists usage_area text;
alter table public.client_stones add column if not exists combination_text text;
alter table public.client_stones add column if not exists warning_text text;
alter table public.client_stones add column if not exists other_notes text;
alter table public.client_stones add column if not exists stone_date text;
alter table public.client_combinations add column if not exists description text;
alter table public.client_combinations add column if not exists note text;
alter table public.client_combinations add column if not exists stones_text text;
alter table public.client_combinations add column if not exists notes_text text;
alter table public.client_combinations add column if not exists notes_text_2 text;
grant select, insert, update, delete on all tables in schema public to service_role;
`;

type Fixture = {
  tenant: string; userId: string; token: string; client: string; anamnesis: string | null; userRecord: Record<string, unknown>;
  userB: { tenant: string; userId: string; token: string; userRecord: Record<string, unknown> } | null;
};

async function seed(env: TestEnv): Promise<{ fx: Fixture; seedNotes: string[] }> {
  const q = (sql: string, a: unknown[] = []) => env.su.query(sql, a);
  const notes: string[] = [];
  const tenant = randomUUID();
  const userId = randomUUID();
  const token = `zz-modul-ekran-tok-${userId.slice(0, 8)}`;
  await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, SYN.tenantName]);
  await q(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
    [userId, SYN.expertName, SYN.expertEmail, JSON.stringify(ALL_EXPERT_MODULES), tenant],
  );
  await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userId, token]);
  const client = randomUUID();
  await q(
    `insert into public.clients(id, tenant_id, user_id, ad, soyad, telefon, dogum, kan, mizac) values ($1,$2,$3,$4,$5,'05000000099','1991-04-12','A Rh+','safra')`,
    [client, tenant, userId, SYN.clientAd, SYN.clientSoyad],
  );
  const tryQ = async (label: string, sql: string, a: unknown[]) => {
    try { await q(sql, a); notes.push(`tohum: ${label} ✓`); } catch (e) { notes.push(`tohum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); }
  };
  await tryQ("danışan notu", `insert into public.client_notes(tenant_id, client_id, saglik_notu, adres, oneriler) values ($1,$2,'ZZ saglik notu','ZZ adres','ZZ oneri')`, [tenant, client]);
  await tryQ("seans", `insert into public.client_sessions(tenant_id, client_id, session_date, session_type, session_note) values ($1,$2,'2026-11-20','ZZ seans','ZZ seans notu')`, [tenant, client]);
  await tryQ("ödev", `insert into public.client_homeworks(tenant_id, client_id, title, status, end_date) values ($1,$2,'ZZ odev','active','2026-12-20')`, [tenant, client]);
  await tryQ("randevu", `insert into public.appointments(tenant_id, client_id, user_id, title, appointment_date, status, notes) values ($1,$2,$3,'ZZ randevu', now() + interval '3 days','planned','ZZ randevu notu')`, [tenant, client, userId]);
  await tryQ("danışan taşı", `insert into public.client_stones(tenant_id, client_id, stone_name) values ($1,$2,'ZZ Stone')`, [tenant, client]);
  await tryQ("ücret", `insert into public.client_charges(tenant_id, client_id, charge_date, category, detail, amount, payment_status) values ($1,$2,'2026-11-20','session','ZZ ucret',100,'paid')`, [tenant, client]);
  await tryQ("rıza", `insert into public.client_consents(tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id) values ($1,$2,'acik_riza_ozel_nitelikli','granted','v1','islak_imza',$3)`, [tenant, client, userId]);
  let anamnesis: string | null = null;
  try {
    const r = await q(
      // API'nin (POST /api/clients/[id]/anamnez) yazdığı TAM şekil: form_custom 4 anahtarlı, client_snapshot dolu.
      // DB varsayılanı '{}' API'nin hiç yazmadığı bir şekildir → editör (effectiveSections: custom.labels[...]) çöker.
      `insert into public.client_anamneses(tenant_id, client_id, kind, title, assessment_date, status, template_key, template_version, form_custom, answers, source_links, client_snapshot, created_by_user_id, completed_by_user_id, completed_at)
       values ($1,$2,'initial','ZZ anamnez formu','2026-11-10','completed','standard','std-v1',$3,$4,'{}'::jsonb,$5,$6,$6,'2026-11-10T10:00:00Z') returning id`,
      [
        tenant,
        client,
        JSON.stringify({ hidden: [], labels: {}, enabledSections: [], custom: [] }),
        JSON.stringify({ "A.reason": "ZZ basvuru nedeni" }),
        JSON.stringify({ ad: SYN.clientAd, soyad: SYN.clientSoyad, dogum: "1991-04-12" }),
        userId,
      ],
    );
    anamnesis = String(r.rows[0]?.id ?? "") || null;
    notes.push("tohum: anamnez ✓");
  } catch (e) {
    notes.push(`tohum: anamnez ATLANDI (${(e as Error).message.slice(0, 160)})`);
  }
  const userRecord = {
    id: userId, tenant_id: tenant, full_name: SYN.expertName, email: SYN.expertEmail, role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: ALL_EXPERT_MODULES, is_demo_account: false,
  };
  // S6 için ikinci sentetik uzman (AYRI tenant; dil tercihi yok) — hesap değişiminde dil izolasyonu.
  const tenantB = randomUUID();
  const userIdB = randomUUID();
  const tokenB = `zz-modul-ekran-tokB-${userIdB.slice(0, 8)}`;
  let userB: Fixture["userB"] = null;
  try {
    await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenantB, `${SYN.tenantName}_B`]);
    await q(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
      [userIdB, SYN.expertNameB, SYN.expertEmailB, JSON.stringify(ALL_EXPERT_MODULES), tenantB],
    );
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userIdB, tokenB]);
    userB = {
      tenant: tenantB, userId: userIdB, token: tokenB,
      userRecord: { ...userRecord, id: userIdB, tenant_id: tenantB, full_name: SYN.expertNameB, email: SYN.expertEmailB },
    };
    notes.push("tohum: ikinci hesap (B) ✓");
  } catch (e) {
    notes.push(`tohum: ikinci hesap (B) ATLANDI (${(e as Error).message.slice(0, 160)})`);
  }
  return { fx: { tenant, userId, token, client, anamnesis, userRecord, userB }, seedNotes: notes };
}

// ─── Sonuç tipleri ───────────────────────────────────────────────────────────

type TrHit = { text: string; where: string };
type RouteResult = {
  route: string; group: string; lang: Lang; width: number; url: string; finalPath: string; status: number | null;
  screenshot: string | null; overflowPx: number; overflowOffenders: string[]; crash: boolean; crashReason: string | null;
  pageErrors: string[]; consoleErrors: number; consoleSamples: string[]; api5xx: string[]; other5xx: string[];
  trCandidates: number; trSamples: TrHit[]; note: string | null; ms: number; verdict: "PASS" | "FAIL" | "ATLANDI" | "KAPSAM-DIŞI";
  /** R4: <html lang>, uygulama konsol hataları (kaynak-yükleme hariç), next-intl hataları, ham anahtarlar, FAIL nedenleri. */
  htmlLang: string; consoleApp: number; consoleAppSamples: string[]; consoleResource: number; consoleWarnOnly: boolean;
  intlErrors: string[]; rawKeys: string[]; failReasons: string[]; outOfScope: boolean;
};
type ScenarioResult = { id: string; lang: Lang; title: string; ok: boolean; detail: string; screenshot?: string };

const results: RouteResult[] = [];
const scenarios: ScenarioResult[] = [];

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`zaman aşımı: ${url}`);
}
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`zaman aşımı (${label})`)), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const htmlLang = (page: Page) => page.evaluate(() => document.documentElement.lang).catch(() => "");
async function waitLang(page: Page, lang: string, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await htmlLang(page)) === lang) return true; await sleep(400); }
  return false;
}
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => undefined);
  // Yükleniyor göstergeleri (animate-spin) en çok 4 sn beklenir.
  const until = Date.now() + 4_000;
  while (Date.now() < until) {
    const spinning = await page.locator(".animate-spin").filter({ visible: true }).count().catch(() => 0);
    if (spinning === 0) break;
    await sleep(300);
  }
  await sleep(600);
}
const shotName = (lang: Lang, width: number, id: string) => `${GATE_CLOSED ? "kapali-" : ""}${lang}-${width}-${id}.png`;

async function setAccountLocale(env: TestEnv, fx: Fixture, lang: Lang) {
  if (lang === "en") {
    await env.su.query(
      `insert into public.user_locale_prefs(tenant_id, user_id, preferred_locale) values ($1,$2,'en')
       on conflict (tenant_id, user_id) do update set preferred_locale = 'en'`,
      [fx.tenant, fx.userId],
    ).catch(() => undefined);
  } else {
    await env.su.query(`delete from public.user_locale_prefs where user_id = $1`, [fx.userId]).catch(() => undefined);
  }
}

async function newCtx(
  browser: Browser, fx: Fixture, lang: Lang, width: number,
  opts: { anon?: boolean; cookie?: Lang | null; noAuthInit?: boolean } = {},
): Promise<BrowserContext> {
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT[width] ?? 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: lang === "en" ? "en-GB" : "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
  });
  // tsx/esbuild keepNames: page.evaluate'e giden işlevler __name(...) yardımcısını çağırır; tarayıcıda tanımlı olmalı.
  await ctx.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });
  // Kapı kapalı turunda çerez bilerek "en" (eski EN çerezi kalmış kullanıcı) — render yine tr olmalı.
  const cookie = opts.cookie === undefined ? (GATE_CLOSED ? "en" : lang) : opts.cookie;
  if (cookie) await ctx.addCookies([{ name: "NEXT_LOCALE", value: cookie, url: APP }]);
  if (opts.anon || opts.noAuthInit) return ctx;
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(fx.userRecord), fx.token]);
  return ctx;
}

/** Sayfa başına olay toplayıcı (rota değişiminde reset). */
type Bucket = { pageErrors: string[]; console: string[]; api5xx: string[]; other5xx: string[]; docStatus: number | null };
function track(page: Page): { bucket: () => Bucket; reset: () => void } {
  let b: Bucket = { pageErrors: [], console: [], api5xx: [], other5xx: [], docStatus: null };
  page.on("pageerror", (e) => { if (!NOISE_PAGEERROR.test(e.message)) b.pageErrors.push(e.message.slice(0, 300)); });
  page.on("console", (m) => { if (m.type() === "error") b.console.push(m.text().slice(0, 300)); });
  page.on("response", (r: Response) => {
    const u = r.url();
    if (!u.startsWith(APP)) return;
    const s = r.status();
    const p = u.slice(APP.length);
    try {
      if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) b.docStatus = s;
    } catch { /* service worker isteğinde frame() atar */ }
    if (s < 500) return;
    if (p.startsWith("/api/")) b.api5xx.push(`${s} ${r.request().method()} ${p.split("?")[0]}`);
    else b.other5xx.push(`${s} ${r.request().method()} ${p.slice(0, 160)}`);
  });
  return { bucket: () => b, reset: () => { b = { pageErrors: [], console: [], api5xx: [], other5xx: [], docStatus: null }; } };
}

async function selectSettingsTab(page: Page, tab: string): Promise<boolean> {
  const sel = `[data-settings-tab="${tab}"]`;
  const visible = async () => (await page.locator(sel).filter({ visible: true }).count()) > 0;
  if (!(await visible())) {
    const menus = page.locator("[data-settings-menu-key]");
    const n = await menus.count();
    for (let i = 0; i < n && !(await visible()); i++) {
      const toggle = menus.nth(i).locator("button").first();
      if (await toggle.isVisible().catch(() => false)) { await toggle.click().catch(() => undefined); await sleep(300); }
    }
  }
  if (!(await visible())) return false;
  await page.locator(sel).filter({ visible: true }).first().click();
  await sleep(500);
  return true;
}

/** Yatay taşma + tanı için taşmanın başladığı öğeler. */
async function measureOverflow(page: Page, width: number): Promise<{ px: number; offenders: string[] }> {
  return page.evaluate((W) => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const px = Math.max(0, sw - W);
    const offenders: string[] = [];
    if (px > 1) {
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const el of all) {
        if (offenders.length >= 6) break;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= W + 1) continue;
        const parent = el.parentElement;
        if (parent && parent !== document.body && parent.getBoundingClientRect().right > W + 1) continue;
        const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 3).join(".");
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""} → sağ ${Math.round(r.right)}px`);
      }
    }
    return { px, offenders };
  }, width);
}

/** EN ekranında Türkçe karakter içeren görünür metin düğümleri + öznitelikler (aday listesi). */
async function scanTurkish(page: Page, exclude: string[]): Promise<{ count: number; samples: TrHit[] }> {
  return page.evaluate((ex) => {
    const RE = /[çğıöşüÇĞİÖŞÜ]/;
    const clean = (s: string) => {
      let t = s.replace(/\s+/g, " ").trim();
      for (const e of ex) t = t.split(e).join(" ");
      return t;
    };
    const skip = (el: Element | null): boolean => {
      if (!el) return true;
      if (el.closest("script,style,noscript,template,[translate='no'],[data-i18n-ignore]")) return true;
      const langEl = el.closest("[lang]");
      if (langEl && langEl !== document.documentElement && (langEl.getAttribute("lang") ?? "").toLowerCase().startsWith("tr")) return true;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return true;
      return el.getClientRects().length === 0;
    };
    const desc = (el: Element) => {
      const cls = (typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "").trim().split(/\s+/).slice(0, 2).join(".");
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    };
    let count = 0;
    const samples: { text: string; where: string }[] = [];
    const seen = new Set<string>();
    const add = (raw: string, where: string) => {
      count++;
      const key = raw.slice(0, 120);
      if (samples.length < 25 && !seen.has(key)) { seen.add(key); samples.push({ text: key, where }); }
    };
    if (document.body) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        const raw = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!raw || !RE.test(clean(raw))) continue;
        const el = n.parentElement;
        if (skip(el)) continue;
        add(raw, desc(el as Element));
      }
      for (const el of Array.from(document.querySelectorAll("[placeholder],[title],[aria-label]"))) {
        if (skip(el)) continue;
        for (const a of ["placeholder", "title", "aria-label"]) {
          const v = el.getAttribute(a);
          if (v && RE.test(clean(v))) add(v.replace(/\s+/g, " ").trim(), `${desc(el)}@${a}`);
        }
      }
      if (RE.test(clean(document.title))) add(document.title, "title");
    }
    return { count, samples };
  }, exclude);
}

/** Görünen metinde/özniteliklerde ham çeviri anahtarı: "<kök-namespace>.<a>.<b>" (boşluksuz, tüm düğüm) ya da DEV işareti ⟦…⟧. */
async function scanRawKeys(page: Page, roots: string[]): Promise<string[]> {
  return page.evaluate((rs) => {
    const RE = rs.length ? new RegExp(`^(?:${rs.join("|")})(?:\\.[A-Za-z0-9_-]+)+$`) : null;
    const hits: string[] = [];
    const test = (v: string) => {
      const t = v.replace(/\s+/g, " ").trim();
      if (!t) return;
      if (t.includes("⟦") || (RE && RE.test(t))) { if (hits.length < 15 && !hits.includes(t.slice(0, 120))) hits.push(t.slice(0, 120)); }
    };
    if (!document.body) return hits;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest("script,style,noscript,template")) continue;
      test(n.textContent ?? "");
    }
    for (const el of Array.from(document.querySelectorAll("[placeholder],[title],[aria-label]"))) {
      for (const a of ["placeholder", "title", "aria-label"]) { const v = el.getAttribute(a); if (v) test(v); }
    }
    test(document.title);
    return hits;
  }, roots);
}

// ─── Ekran turu ──────────────────────────────────────────────────────────────

/** Ham anahtar taramasının kök namespace listesi (main()'de doldurulur). */
let ROOTS: string[] = [];

function resolvePath(p: string, fx: Fixture): string | null {
  if (p.includes("{anamnesis}") && !fx.anamnesis) return null;
  return p.replace("{client}", fx.client).replace("{anamnesis}", fx.anamnesis ?? "");
}

async function visitRoute(page: Page, t: ReturnType<typeof track>, r: RouteDef, lang: Lang, width: number, fx: Fixture, exclude: string[]): Promise<RouteResult> {
  const started = Date.now();
  const base: RouteResult = {
    route: r.id, group: r.group, lang, width, url: r.path, finalPath: "", status: null, screenshot: null, overflowPx: 0, overflowOffenders: [],
    crash: false, crashReason: null, pageErrors: [], consoleErrors: 0, consoleSamples: [], api5xx: [], other5xx: [], trCandidates: 0, trSamples: [],
    note: null, ms: 0, verdict: "PASS",
    htmlLang: "", consoleApp: 0, consoleAppSamples: [], consoleResource: 0, consoleWarnOnly: false, intlErrors: [], rawKeys: [], failReasons: [],
    outOfScope: !!r.outOfScope,
  };
  if (Date.now() - STARTED > BUDGET_MS) return { ...base, note: "süre bütçesi aşıldı — atlandı", verdict: "ATLANDI" };
  const p = resolvePath(r.path, fx);
  if (!p) return { ...base, note: "tohum kaydı yok (anamnez) — atlandı", verdict: "ATLANDI" };
  base.url = p;
  t.reset();
  // Hata sınırı denemesi: liste API'si 200 + bozuk şekil ({protocols: nesne}) döner → bileşen render'da patlar →
  // app/kupa/error.tsx devreye girmeli. Yalnız bu sekmenin tarayıcı isteği değiştirilir; sunucu/DB'ye dokunulmaz.
  const ebPattern = "**/api/kupa/protocols**";
  if (r.action === "error-boundary") {
    await page.route(ebPattern, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, protocols: { zzBozukSekil: true } }) }));
  }
  let boundaryShown = null as boolean | null;
  try {
    await withTimeout((async () => {
      await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(page);
      if (r.settingsTab) {
        const okTab = await selectSettingsTab(page, r.settingsTab);
        if (!okTab) {
          base.note = GATE_CLOSED && r.settingsTab === "language"
            ? "kapı kapalı: Dil sekmesi beklendiği gibi YOK"
            : r.optionalTab ? "sekme bu hesapta yok (isteğe bağlı) — atlandı" : "sekme bulunamadı";
          if (r.optionalTab) base.verdict = "ATLANDI";
        }
        await settle(page);
      }
      if (r.action === "bell") {
        const titles = [Mq(lang, "notifications", "bell.title"), "Bildirimler", "Notifications"].filter((x): x is string => !!x);
        const bell = page.locator(titles.map((x) => `button[title="${x}"]`).join(",")).filter({ visible: true }).first();
        if ((await bell.count()) > 0) { await bell.click().catch(() => undefined); await sleep(800); await settle(page); }
        else base.note = "bildirim zili bulunamadı";
      }
      if (r.action === "error-boundary") {
        boundaryShown = await page.locator("[role=alert]").filter({ visible: true }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
      }
    })(), 90_000, r.id);
  } catch (e) {
    base.crash = true;
    base.crashReason = `yüklenemedi: ${(e as Error).message.slice(0, 200)}`;
  }
  if (r.action === "error-boundary") await page.unroute(ebPattern).catch(() => undefined);
  const b = t.bucket();
  base.status = b.docStatus;
  base.finalPath = page.url().startsWith(APP) ? page.url().slice(APP.length) : page.url();
  if (base.verdict === "ATLANDI") { base.ms = Date.now() - started; return base; }
  base.htmlLang = await htmlLang(page);
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
  if (CRASH_TEXT.test(bodyText)) { base.crash = true; base.crashReason = base.crashReason ?? "Next hata ekranı (This page couldn’t load / Application error)"; }
  if (b.pageErrors.length && r.action !== "error-boundary") { base.crash = true; base.crashReason = base.crashReason ?? `yakalanmamış hata: ${b.pageErrors[0]}`; }
  if (r.action === "error-boundary") {
    base.note = boundaryShown ? "hata sınırı (error.tsx) göründü — beklenen" : "hata sınırı GÖRÜNMEDİ";
    if (!boundaryShown && !base.crash) { base.crash = true; base.crashReason = "enjekte edilen hata modül hata sınırında yakalanmadı"; }
  }
  if (r.expectStatus && base.status !== r.expectStatus) base.note = `${base.note ? `${base.note}; ` : ""}beklenen HTTP ${r.expectStatus}, gelen ${base.status ?? "-"}`;
  const finalNoQuery = base.finalPath.split("?")[0];
  const wantedNoQuery = p.split("?")[0];
  if (finalNoQuery !== wantedNoQuery && !base.note) base.note = `yönlendirme → ${base.finalPath.slice(0, 120)}`;
  try {
    await page.addStyleTag({ content: STABILIZE_CSS }).catch(() => undefined);
    const ov = await measureOverflow(page, width);
    base.overflowPx = Math.round(ov.px);
    base.overflowOffenders = ov.offenders;
    if (lang === "en") {
      const tr = await scanTurkish(page, exclude);
      base.trCandidates = tr.count;
      base.trSamples = tr.samples;
    }
    base.rawKeys = await scanRawKeys(page, ROOTS).catch(() => []);
    const file = shotName(lang, width, r.id);
    await page.screenshot({ path: path.join(OUT, file), fullPage: FULL_PAGE || !!r.fullPage, timeout: 30_000 });
    base.screenshot = file;
  } catch (e) {
    base.note = `${base.note ? `${base.note}; ` : ""}ölçüm/ekran görüntüsü hatası: ${(e as Error).message.slice(0, 160)}`;
  }
  const after = t.bucket();
  base.pageErrors = after.pageErrors.slice(0, 5);
  base.consoleErrors = after.console.length;
  base.consoleSamples = Array.from(new Set(after.console)).slice(0, 4);
  base.api5xx = Array.from(new Set(after.api5xx)).slice(0, 10);
  base.other5xx = Array.from(new Set(after.other5xx)).slice(0, 10);
  // Konsol sınıflandırma (R4): next-intl hataları → FAIL; kaynak yükleme → HTTP ölçümünde; geri kalan = uygulama hatası.
  base.intlErrors = Array.from(new Set(after.console.filter((m) => INTL_CONSOLE.test(m)))).slice(0, 5);
  const appConsole = after.console.filter((m) => !RESOURCE_CONSOLE.test(m) && !INTL_CONSOLE.test(m) && !NOISE_PAGEERROR.test(m));
  base.consoleResource = after.console.filter((m) => RESOURCE_CONSOLE.test(m)).length;
  // Hata sınırı denemesinde enjekte edilen hatanın günlüğü beklenir → sayılmaz.
  base.consoleApp = r.action === "error-boundary" ? 0 : appConsole.length;
  base.consoleAppSamples = Array.from(new Set(appConsole)).slice(0, 4);
  // Aynı ekranda /api 5xx varsa (test ortamında modül tablosu yok) uygulama konsol hatası çoğunlukla onun yankısıdır → UYARI.
  base.consoleWarnOnly = base.consoleApp > 0 && base.api5xx.length > 0 && !STRICT_API;
  const docFail = (base.status ?? 0) >= 500 || base.other5xx.length > 0;
  const expectedLang = GATE_CLOSED ? "tr" : lang;
  const reasons: string[] = [];
  if (base.crash) reasons.push("çökme");
  if (docFail) reasons.push("belge/RSC 5xx");
  if (base.overflowPx > 1) reasons.push(`taşma ${base.overflowPx}px`);
  if (STRICT_API && base.api5xx.length > 0) reasons.push("api 5xx (strict)");
  if (base.consoleApp > 0 && !base.consoleWarnOnly) reasons.push(`konsol ${base.consoleApp}`);
  if (base.intlErrors.length) reasons.push("next-intl hata kodu");
  if (base.rawKeys.length) reasons.push("ham anahtar");
  if (base.htmlLang && base.htmlLang !== expectedLang) reasons.push(`html lang=${base.htmlLang} (beklenen ${expectedLang})`);
  if (r.expectStatus && base.status !== r.expectStatus) reasons.push(`HTTP ${base.status ?? "-"}≠${r.expectStatus}`);
  base.failReasons = reasons;
  base.verdict = r.outOfScope ? "KAPSAM-DIŞI" : reasons.length ? "FAIL" : "PASS";
  base.ms = Date.now() - started;
  return base;
}

async function screenTour(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang, exclude: string[]) {
  // Kapı kapalı turu: hesaba bilerek "en" tercihi yazılır (render yine tr olmalı).
  await setAccountLocale(env, fx, GATE_CLOSED ? "en" : lang);
  const routes = ROUTES.filter((r) => ONLY.size === 0 || ONLY.has(r.id));
  // Genişlikler paralel (her biri kendi bağlamında); rotalar her genişlikte sıralı.
  await Promise.all(WIDTHS.map(async (width) => {
    const ctx = await newCtx(browser, fx, lang, width);
    let anonCtx: BrowserContext | null = null;
    let page = await ctx.newPage();
    let t = track(page);
    for (const r of routes) {
      let res: RouteResult;
      if (r.anon) {
        // Ziyaretçi ekranı: oturumsuz ayrı bağlam (uzman localStorage'ı yok).
        anonCtx = anonCtx ?? await newCtx(browser, fx, lang, width, { anon: true });
        const ap = await anonCtx.newPage();
        const at = track(ap);
        res = await visitRoute(ap, at, r, lang, width, fx, exclude);
        await ap.close().catch(() => undefined);
      } else {
        res = await visitRoute(page, t, r, lang, width, fx, exclude);
      }
      results.push(res);
      const flag = res.verdict === "PASS" ? "PASS" : res.verdict === "FAIL" ? "FAIL" : res.verdict === "KAPSAM-DIŞI" ? "KDIS" : "ATLA";
      console.log(`  ${flag} [${GATE_CLOSED ? "kapalı-" : ""}${lang} ${width}] ${r.id} http=${res.status ?? "-"} lang=${res.htmlLang || "-"} taşma=${res.overflowPx} çökme=${res.crash ? "E" : "H"} konsol=${res.consoleErrors} (uyg=${res.consoleApp}${res.consoleWarnOnly ? " uyarı" : ""}, kaynak=${res.consoleResource}) api5xx=${res.api5xx.length}${lang === "en" ? ` tr-aday=${res.trCandidates}` : ""}${res.rawKeys.length ? ` ham-anahtar=${res.rawKeys.length}` : ""}${res.intlErrors.length ? ` intl-hata=${res.intlErrors.length}` : ""}${res.failReasons.length ? ` neden=[${res.failReasons.join(", ")}]` : ""}${res.note ? ` (${res.note})` : ""}`);
      // Tanı: ozet.md yazılamasa da (süreç erken düşerse) taşan öğe + çökme nedeni CI günlüğünde kalsın.
      if (res.overflowPx > 1) console.log(`      taşan öğeler: ${res.overflowOffenders.join(" · ") || "(saptanamadı)"}`);
      if (res.crash) console.log(`      çökme: ${res.crashReason ?? "-"}${res.pageErrors.length ? ` | pageerror: ${res.pageErrors[0]!.slice(0, 300)}` : ""}${res.consoleSamples.length ? ` | konsol: ${res.consoleSamples.join(" ‖ ").slice(0, 400)}` : ""}`);
      if (res.consoleApp > 0 && width === WIDTHS[0]) console.log(`      konsol (uygulama): ${res.consoleAppSamples.join(" ‖ ").slice(0, 500)}`);
      if (res.intlErrors.length) console.log(`      next-intl: ${res.intlErrors.join(" ‖ ").slice(0, 500)}`);
      if (res.rawKeys.length) console.log(`      ham anahtar: ${res.rawKeys.join(" · ").slice(0, 400)}`);
      if (res.crash && !r.anon) {
        // Çöken sayfa sonraki rotayı etkilemesin: yeni sekme.
        await page.close().catch(() => undefined);
        page = await ctx.newPage();
        t = track(page);
      }
    }
    await anonCtx?.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);
  }));
}

// ─── Senaryolar ──────────────────────────────────────────────────────────────

function scenario(id: string, lang: Lang, title: string, ok: boolean, detail: string, screenshot?: string) {
  scenarios.push({ id, lang, title, ok, detail, screenshot });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${lang}] ${id} ${title}${detail ? ` → ${detail.slice(0, 300)}` : ""}`);
}

async function runScenario(id: string, lang: Lang, title: string, fn: () => Promise<{ ok: boolean; detail: string; shot?: string }>) {
  try {
    const r = await withTimeout(fn(), 150_000, id);
    scenario(id, lang, title, r.ok, r.detail, r.shot);
  } catch (e) {
    scenario(id, lang, title, false, `hata: ${(e as Error).message.slice(0, 300)}`);
  }
}

/** S1: TR→EN geçişinde form verisi korunuyor mu (LanguageSelector ile aynı mekanizma: çerez + router.refresh). */
async function scenarioKeepData(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("S1-dil-gecisi-veri-korunmasi", "tr", "Danışan Kayıt formu: TR→EN geçişinde girilen metin korunur", async () => {
    await setAccountLocale(env, fx, "tr");
    const ctx = await newCtx(browser, fx, "tr", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const adTr = page.getByPlaceholder(M("tr", "clients", "form.placeholders.ad"), { exact: true });
      const soyadTr = page.getByPlaceholder(M("tr", "clients", "form.placeholders.soyad"), { exact: true });
      await adTr.waitFor({ timeout: 30_000 });
      await adTr.fill(SYN.keepAd);
      await soyadTr.fill(SYN.keepSoyad);
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: APP }]);
      const refreshed = await page.evaluate(() => {
        const n = (window as unknown as { next?: { router?: { refresh?: () => void } } }).next;
        if (!n?.router?.refresh) return false;
        n.router.refresh();
        return true;
      });
      if (!refreshed) return { ok: false, detail: "window.next.router.refresh bulunamadı (Next sürümü?) — senaryo uygulanamadı" };
      const switched = await waitLang(page, "en", 30_000);
      await settle(page);
      const adEn = page.getByPlaceholder(M("en", "clients", "form.placeholders.ad"), { exact: true });
      const soyadEn = page.getByPlaceholder(M("en", "clients", "form.placeholders.soyad"), { exact: true });
      const labelsEn = (await adEn.count()) > 0;
      const adVal = labelsEn ? await adEn.inputValue() : await adTr.inputValue().catch(() => "");
      const soyadVal = labelsEn ? await soyadEn.inputValue() : await soyadTr.inputValue().catch(() => "");
      const shot = "senaryo-S1-dil-gecisi-en.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const ok = switched && labelsEn && adVal === SYN.keepAd && soyadVal === SYN.keepSoyad;
      return { ok, shot, detail: `html lang=en: ${switched ? "evet" : "HAYIR"}; EN etiketler: ${labelsEn ? "evet" : "HAYIR"}; ad="${adVal}" soyad="${soyadVal}"` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** S2 + S3: EN'de danışan oluşturma ve düzenleme. */
async function scenarioCreateEdit(browser: Browser, env: TestEnv, fx: Fixture) {
  await setAccountLocale(env, fx, "en");
  await runScenario("S2-en-danisan-olusturma", "en", "EN: Danışan Kayıt formundan sentetik danışan oluşturma", async () => {
    const ctx = await newCtx(browser, fx, "en", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const lang = await htmlLang(page);
      await page.getByPlaceholder(M("en", "clients", "form.placeholders.ad"), { exact: true }).fill(SYN.createdAd);
      await page.getByPlaceholder(M("en", "clients", "form.placeholders.soyad"), { exact: true }).fill(SYN.createdSoyad);
      const respP = page.waitForResponse((r) => r.url().startsWith(`${APP}/api/clients`) && r.request().method() === "POST", { timeout: 60_000 });
      await page.getByRole("button", { name: new RegExp(escRe(M("en", "clients", "form.submit.default"))) }).click();
      const resp = await respP;
      await settle(page);
      const shot = "senaryo-S2-en-danisan-olusturuldu.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const row = await env.su.query(`select id from public.clients where tenant_id=$1 and ad=$2 and soyad=$3`, [fx.tenant, SYN.createdAd, SYN.createdSoyad]);
      const ok = lang === "en" && resp.status() >= 200 && resp.status() < 300 && row.rowCount === 1;
      return { ok, shot, detail: `html lang=${lang}; POST /api/clients ${resp.status()}; DB satırı: ${row.rowCount}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  await runScenario("S3-en-danisan-duzenleme", "en", "EN: Danışan detayı › Genel Bilgi düzenleme (telefon)", async () => {
    const ctx = await newCtx(browser, fx, "en", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${fx.client}?tab=genel`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const editBtn = page.getByRole("button", { name: new RegExp(escRe(stripGlyph(M("en", "clients.detail", "general.editButton")))) }).first();
      await editBtn.waitFor({ timeout: 60_000 });
      for (let i = 0; i < 40 && !(await editBtn.isEnabled()); i++) await sleep(500);
      await editBtn.click();
      const phone = page.getByPlaceholder(M("en", "clients.detail", "form.telefonPlaceholder"), { exact: true }).first();
      await phone.waitFor({ timeout: 20_000 });
      const NEW_PHONE = "05001112233";
      await phone.fill(NEW_PHONE);
      const respP = page.waitForResponse((r) => r.url().startsWith(`${APP}/api/clients/${fx.client}`) && r.request().method() === "PATCH", { timeout: 60_000 });
      await page.getByRole("button", { name: M("en", "clients.detail", "general.save"), exact: true }).click();
      const resp = await respP;
      await settle(page);
      const shot = "senaryo-S3-en-danisan-duzenlendi.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const row = await env.su.query(`select telefon from public.clients where id=$1`, [fx.client]);
      const ok = resp.status() >= 200 && resp.status() < 300 && row.rows[0]?.telefon === NEW_PHONE;
      return { ok, shot, detail: `PATCH /api/clients/<id> ${resp.status()}; DB telefon=${String(row.rows[0]?.telefon)}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** S4: Word raporu indirme yanıtı 200 (rapor dili kapsam dışı). */
async function scenarioWord(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, lang);
  await runScenario(`S4-word-indirme-${lang}`, lang, "Danışan detayı › Tam Word raporu → indirme yanıtı 200 (rapor dili: kapsam dışı)", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${fx.client}?tab=genel`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const wordBtn = page.getByRole("button", { name: M(lang, "clients.detail", "a11y.fullWordReport") }).first();
      await wordBtn.waitFor({ timeout: 60_000 });
      await wordBtn.click();
      await sleep(800);
      const gen = page.getByRole("button", { name: M(lang, "clients.detail", "wordDialog.generate"), exact: true }).last();
      await gen.waitFor({ timeout: 30_000 });
      const shot = `senaryo-S4-word-pencere-${lang}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      const respP = page.waitForResponse((r) => r.url().includes("/word-report") && r.request().method() === "POST", { timeout: 90_000 });
      // gen.click() hata verirse respP hiç beklenmez; finally'de ctx kapanınca reddedilir → işlenmemiş ret
      // tüm süreci düşürür (45570872612: "page.waitForResponse: Target page ... closed") ve ozet.md yazılmaz.
      respP.catch(() => undefined);
      await gen.click();
      const resp = await respP;
      const ct = resp.headers()["content-type"] ?? "";
      const len = (await resp.body().catch(() => Buffer.alloc(0))).length;
      return { ok: resp.status() === 200, shot, detail: `POST ${resp.url().slice(APP.length).split("?")[0]} → ${resp.status()} (${ct.split(";")[0]}, ${len} bayt); rapor dili: kapsam dışı` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** M: silme onayı modalı aç → Vazgeç/Cancel → kapandı (silme ONAYLANMAZ). */
async function modalProbes(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, lang);
  const DELETE_RE = lang === "en" ? /\b(Delete|Remove)\b/i : /(^|[\s(])(Sil|Kaldır)([\s)]|$)|Sil$/;
  const CANCEL_RE = /^(Vazgeç|İptal|İptal Et|Kapat|Hayır|Cancel|Close|Keep|No|Back)$/i;
  const routes = ROUTES.filter((r) => r.modal && (ONLY.size === 0 || ONLY.has(r.id)));
  const ctx = await newCtx(browser, fx, lang, 1280);
  try {
    for (const r of routes) {
      if (Date.now() - STARTED > BUDGET_MS) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, "süre bütçesi aşıldı — atlandı (bilgi)"); continue; }
      const p = resolvePath(r.path, fx);
      if (!p) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        const btns = page.getByRole("button", { name: DELETE_RE }).filter({ visible: true });
        const n = await btns.count();
        if (n === 0) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, "silme düğmesi yok (kayıt yok / bu ortamda tablo yok) — atlandı (bilgi)"); continue; }
        // R4: pasif (disabled) silme düğmesi tıklanamaz (ör. Refleksoloji › Notlar'da seçili not yokken "Sil") → zaman aşımı
        // yerine bilgi olarak atlanır.
        const enabledIdx: number[] = [];
        for (let i = 0; i < n; i++) if (await btns.nth(i).isEnabled().catch(() => false)) enabledIdx.push(i);
        if (enabledIdx.length === 0) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, `silme düğmesi pasif (${n} adet; seçili kayıt yok) — atlandı (bilgi)`); continue; }
        const btn = btns.nth(r.modal === "last" ? enabledIdx[enabledIdx.length - 1]! : enabledIdx[0]!);
        const label = ((await btn.getAttribute("aria-label")) ?? (await btn.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
        const clientsBefore = (await env.su.query(`select count(*)::int as n from public.clients where tenant_id=$1`, [fx.tenant])).rows[0]?.n as number;
        await btn.click();
        const dlg = page.locator("[role=alertdialog],[role=dialog],dialog[open]").filter({ visible: true }).last();
        const opened = await dlg.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
        if (!opened) {
          scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, `"${label}" tıklandı, diyalog algılanmadı (satır içi onay olabilir) — bilgi; incelenmeli`);
          await page.keyboard.press("Escape").catch(() => undefined);
          continue;
        }
        await sleep(500);
        const shot = `modal-${lang}-${r.id}.png`;
        await page.screenshot({ path: path.join(OUT, shot) });
        const dlgText = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        const cancel = dlg.getByRole("button", { name: CANCEL_RE }).first();
        if ((await cancel.count()) > 0) await cancel.click(); else await page.keyboard.press("Escape");
        const closed = await dlg.waitFor({ state: "hidden", timeout: 8_000 }).then(() => true).catch(() => false);
        const clientsAfter = (await env.su.query(`select count(*)::int as n from public.clients where tenant_id=$1`, [fx.tenant])).rows[0]?.n as number;
        const kept = clientsAfter === clientsBefore;
        const trInEn = lang === "en" && /[çğıöşüÇĞİÖŞÜ]/.test(dlgText.replace(/Yaşam Sistemi/g, ""));
        scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, closed && kept,
          `düğme "${label}" → diyalog açıldı; kapatıldı: ${closed ? "evet" : "HAYIR"}; danışan sayısı korundu: ${kept ? "evet" : "HAYIR"}${trInEn ? "; EN diyalogda TR-aday metin var (bilgi)" : ""}; metin: "${dlgText}"`, shot);
      } catch (e) {
        scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, false, `hata: ${(e as Error).message.slice(0, 200)}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function prefOf(env: TestEnv, userId: string): Promise<string | null> {
  const r = await env.su.query(`select preferred_locale from public.user_locale_prefs where user_id=$1`, [userId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (r.rows[0]?.preferred_locale as string | undefined) ?? null;
}

/** S5: Ayarlar › Dil'den EN seç → sayfa yenile → başka sayfa → dil kalıcı mı (çerez + hesap tercihi); sonra TR'ye geri al. */
async function scenarioPersist(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("S5-dil-degistir-yenile-kalici", "tr", "Ayarlar › Dil: TR→EN seç → yenile → başka ekran: EN kalıcı (çerez + hesap tercihi); sonra TR'ye geri", async () => {
    await setAccountLocale(env, fx, "tr");
    const ctx = await newCtx(browser, fx, "tr", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (!(await selectSettingsTab(page, "language"))) return { ok: false, detail: "Ayarlar › Dil sekmesi bulunamadı" };
      const before = await htmlLang(page);
      await page.getByRole("radio", { name: /English/ }).first().click();
      const switched = await waitLang(page, "en", 30_000);
      await settle(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await settle(page);
      const afterReload = await htmlLang(page);
      await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const other = await htmlLang(page);
      const shot = "senaryo-S5-yenileme-sonrasi-en.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      // Not: çerez production build'de Secure → ctx.cookies(http-URL) onu süzer; tüm çerezler okunur.
      const cookie = (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value ?? "-";
      const pref = await prefOf(env, fx.userId);
      // Geri al (sonraki senaryolar TR varsayar).
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      let reverted = false;
      if (await selectSettingsTab(page, "language")) {
        await page.getByRole("radio", { name: /Türkçe/ }).first().click().catch(() => undefined);
        reverted = await waitLang(page, "tr", 30_000);
      }
      await setAccountLocale(env, fx, "tr");
      const ok = before === "tr" && switched && afterReload === "en" && other === "en" && cookie === "en" && pref === "en";
      return { ok, shot, detail: `önce lang=${before}; seçim sonrası en: ${switched ? "evet" : "HAYIR"}; yenileme sonrası lang=${afterReload}; /dashboard lang=${other}; çerez NEXT_LOCALE=${cookie}; hesap tercihi(DB)=${pref ?? "yok"}; TR'ye geri: ${reverted ? "evet" : "HAYIR"}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** S6: aynı tarayıcıda hesap değişimi → dil izolasyonu (A: tercih en, B: tercih yok → tr). Cihaz çerezi NEXT_LOCALE çıkışta KALIR. */
async function scenarioAccountIsolation(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("S6-hesap-degistir-dil-izolasyonu", "en", "Aynı tarayıcı: A (tercih en) → çıkış → B (tercih yok) → A; her hesap kendi dilinde", async () => {
    const B = fx.userB;
    if (!B) return { ok: false, detail: "ikinci sentetik hesap (B) tohumlanamadı" };
    await setAccountLocale(env, fx, "en");
    await env.su.query(`delete from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => undefined);
    const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: null, noAuthInit: true });
    try {
      const page = await ctx.newPage();
      const steps: string[] = [];
      // Oturum değişimi: oturum çerezleri + localStorage temizlenir (çıkış), cihazın NEXT_LOCALE çerezi KALIR → yeni hesap.
      // Her girişte YENİ oturum anahtarı (gerçek giriş gibi): eski anahtar çerez geçişinde (HttpOnly) tüketilmiş olabilir —
      // aynı anahtarla ikinci "giriş" hesap tercihini okuyamıyordu (koşu 45599816800: A tekrar → tr).
      const switchTo = async (u: { userId: string; userRecord: Record<string, unknown> }) => {
        const tok = `zz-modul-ekran-s6-${randomUUID().slice(0, 12)}`;
        await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u.userId, tok]);
        const keep = (await ctx.cookies()).filter((c) => c.name === "NEXT_LOCALE"); // Secure çerez: URL süzgeçsiz oku
        await ctx.clearCookies();
        if (keep.length) await ctx.addCookies(keep);
        await page.goto(`${APP}/zz-olmayan-sayfa-r4`, { waitUntil: "domcontentloaded" });
        await page.evaluate(([uu, tk]) => {
          localStorage.clear();
          localStorage.setItem("yasam_user", uu as string);
          localStorage.setItem("yasam_session_token", tk as string);
        }, [JSON.stringify(u.userRecord), tok]);
      };
      // Tanı: hesap tercihi okuması (/api/me/locale GET) adım başına durum + tercih (koşular arası tutarsızlık 957f0fa06).
      let prefLog: string[] = [];
      page.on("response", (r) => {
        if (!r.url().startsWith(`${APP}/api/me/locale`) || r.request().method() !== "GET") return;
        void r.json().then((j: { preference?: { status?: string; locale?: string; reason?: string } }) => {
          prefLog.push(`${r.status()}:${j?.preference?.status ?? "?"}${j?.preference?.locale ? `=${j.preference.locale}` : ""}${j?.preference?.reason ? `(${j.preference.reason})` : ""}`);
        }).catch(() => prefLog.push(`${r.status()}:gövde-yok`));
      });
      const visit = async (p: string, want: string | null) => {
        prefLog = [];
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (want) await waitLang(page, want, 20_000);
        const l = await htmlLang(page);
        return prefLog.length ? `${l} [me/locale ${prefLog.join(",")}]` : l;
      };
      await switchTo({ userId: fx.userId, userRecord: fx.userRecord });
      const a1 = await visit("/", "en"); steps.push(`A ana sayfa → ${a1}`);
      const a2 = await visit("/dashboard", null); steps.push(`A panel → ${a2}`);
      await page.screenshot({ path: path.join(OUT, "senaryo-S6-A-en.png") });
      await switchTo(B);
      const b0 = await visit("/dashboard", null); steps.push(`B panel (ana sayfaya uğramadan; bilgi) → ${b0}`);
      const b1 = await visit("/", "tr"); steps.push(`B ana sayfa → ${b1}`);
      const b2 = await visit("/dashboard", null); steps.push(`B panel → ${b2}`);
      const shot = "senaryo-S6-B-tr.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      await switchTo({ userId: fx.userId, userRecord: fx.userRecord });
      const a3 = await visit("/", "en"); steps.push(`A tekrar ana sayfa → ${a3}`);
      const prefA = await prefOf(env, fx.userId);
      const prefB = await prefOf(env, B.userId);
      const is = (v: string, l: string) => v === l || v.startsWith(`${l} `);
      const ok = is(a1, "en") && is(a2, "en") && is(b1, "tr") && is(b2, "tr") && is(a3, "en") && prefA === "en" && prefB === null;
      const finding = !is(b0, "tr") ? "; BULGU: hesap değişiminden hemen sonra ana sayfaya uğramadan açılan ekran önceki hesabın dilinde (hesap→çerez eşitlemesi yalnız LanguageSelector'ın bulunduğu ana sayfada)" : "";
      return { ok, shot, detail: `${steps.join("; ")}; DB tercih A=${prefA ?? "yok"} B=${prefB ?? "yok"}${finding}` };
    } finally {
      await ctx.close().catch(() => undefined);
      await setAccountLocale(env, fx, "en");
    }
  });
}

/** S7: yükleme ekranı (loading.tsx) — sayfa RSC yanıtı geciktirilip istemci gezintisi yapılır; dil, taşma, ham anahtar. */
async function scenarioLoading(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, GATE_CLOSED ? "en" : lang);
  for (const width of [1280, 360]) {
    await runScenario(`S7-yukleme-ekrani-${lang}-${width}`, lang, `Yükleme ekranı (Refleksoloji › notlar loading.tsx) ${width}px: dil + taşma + ham anahtar`, async () => {
      const ctx = await newCtx(browser, fx, lang, width);
      const pat = "**/refleksoloji/notlar**";
      try {
        const page = await ctx.newPage();
        await page.goto(`${APP}/refleksoloji`, { waitUntil: "domcontentloaded" });
        await settle(page);
        // Yalnız sayfanın tam (dinamik) RSC isteği 8 sn bekletilir; prefetch (yükleme sınırını getiren) istekler serbest →
        // önce prefetch, sonra push: Next yükleme sınırını (loading.tsx) anında gösterir, sayfa verisi gecikir.
        await page.route(pat, async (route) => {
          const h = route.request().headers();
          if (h["rsc"] && !h["next-router-prefetch"] && !h["next-router-segment-prefetch"]) await sleep(8_000);
          await route.continue().catch(() => undefined);
        });
        await page.evaluate(() => {
          const n = (window as unknown as { next?: { router?: { prefetch?: (u: string) => void } } }).next;
          try { n?.router?.prefetch?.("/refleksoloji/notlar"); } catch { /* yok */ }
        });
        await sleep(2_500);
        const pushed = await page.evaluate(() => {
          const n = (window as unknown as { next?: { router?: { push?: (u: string) => void } } }).next;
          if (!n?.router?.push) return false;
          n.router.push("/refleksoloji/notlar");
          return true;
        });
        const want = Mq(lang, "system", "loading.refleksoloji.clinicalNotes");
        // İskelet metni yalnız ekran okuyucu içindir (`<p class="sr-only">{badge} · {title}</p>`) → görünürlük değil, DOM'da
        // varlık aranır (koşu 45599816800: iskelet ekranda, "exact + visible" arama yakalayamadı).
        const seenText = want ? await page.getByText(want).first().waitFor({ state: "attached", timeout: 5_000 }).then(() => true).catch(() => false) : false;
        const skeleton = (await page.locator(".animate-pulse").filter({ visible: true }).count().catch(() => 0)) > 0;
        const seen = seenText && skeleton;
        const lng = await htmlLang(page);
        const ov = await measureOverflow(page, width);
        const raw = await scanRawKeys(page, ROOTS).catch(() => []);
        const tr = lang === "en" ? await scanTurkish(page, []) : { count: 0, samples: [] };
        const shot = `senaryo-S7-yukleme-${GATE_CLOSED ? "kapali-" : ""}${lang}-${width}.png`;
        await page.screenshot({ path: path.join(OUT, shot) });
        await page.unroute(pat).catch(() => undefined);
        const expected = GATE_CLOSED ? "tr" : lang;
        if (!pushed || !seen) {
          return { ok: true, shot, detail: `yükleme ekranı YAKALANAMADI (bilgi) — router.push: ${pushed ? "var" : "yok"}; katalog metni ${want ? `"${want}"` : "YOK (bu tabanda system.loading yok)"} görünür: ${seenText ? "evet" : "hayır"}; iskelet: ${skeleton ? "evet" : "hayır"}` };
        }
        const ok = ov.px <= 1 && raw.length === 0 && lng === expected;
        return { ok, shot, detail: `yükleme ekranı yakalandı ("${want}"); lang=${lng}; taşma=${Math.round(ov.px)}px${ov.offenders.length ? ` (${ov.offenders.join(" · ")})` : ""}; ham anahtar=${raw.length}; TR-aday=${tr.count}${tr.samples.length ? ` (${tr.samples.slice(0, 3).map((s) => s.text).join(" · ")})` : ""}` };
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });
  }
}

/** K1: kapı kapalı build — NEXT_LOCALE=en + hesap tercihi en iken: tr render, dil seçici ve Dil sekmesi yok. */
async function scenarioGateClosed(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("K1-kapi-kapali-yalniz-tr", "tr", "Kapı kapalı: çerez en + hesap tercihi en → ana sayfa/panel/ayarlar tr; dil seçici ve Dil sekmesi görünmez", async () => {
    await setAccountLocale(env, fx, "en");
    const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: "en" });
    try {
      const page = await ctx.newPage();
      const langs: string[] = [];
      for (const p of ["/", "/dashboard", "/settings"]) {
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        langs.push(`${p}=${await htmlLang(page)}`);
      }
      await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const selLabels = [Mq("tr", "common", "language.select"), Mq("en", "common", "language.select")].filter((x): x is string => !!x);
      const selectors = selLabels.length ? await page.locator(selLabels.map((l) => `button[aria-label="${l}"]`).join(",")).count() : 0;
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const langTab = await selectSettingsTab(page, "language");
      const shot = "senaryo-K1-kapi-kapali-ayarlar.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const allTr = langs.every((x) => x.endsWith("=tr"));
      const ok = allTr && selectors === 0 && !langTab;
      return { ok, shot, detail: `lang: ${langs.join(", ")}; dil seçici sayısı=${selectors}; Ayarlar › Dil sekmesi: ${langTab ? "VAR" : "yok"}` };
    } finally {
      await ctx.close().catch(() => undefined);
      await setAccountLocale(env, fx, "tr");
    }
  });
}

// ─── Özet ────────────────────────────────────────────────────────────────────

function mdEsc(s: string) { return s.replace(/\|/g, "\\|").replace(/\n/g, " "); }

function writeSummary(meta: Record<string, unknown>, missingMessages: string[]) {
  const screenFail = results.filter((r) => r.verdict === "FAIL");
  const scenFail = scenarios.filter((s) => !s.ok);
  const enTr = results.filter((r) => r.lang === "en" && r.trCandidates > 0);
  const totals = {
    ekran: results.length,
    ekranPass: results.filter((r) => r.verdict === "PASS").length,
    ekranFail: screenFail.length,
    ekranAtlandi: results.filter((r) => r.verdict === "ATLANDI").length,
    tasma: results.filter((r) => r.overflowPx > 1).length,
    cokme: results.filter((r) => r.crash).length,
    belge5xx: results.filter((r) => (r.status ?? 0) >= 500 || r.other5xx.length > 0).length,
    api5xxEkran: results.filter((r) => r.api5xx.length > 0).length,
    konsolHataToplam: results.reduce((a, r) => a + r.consoleErrors, 0),
    konsolUygulamaFailEkran: results.filter((r) => r.consoleApp > 0 && !r.consoleWarnOnly && !r.outOfScope).length,
    konsolUygulamaUyariEkran: results.filter((r) => r.consoleWarnOnly && !r.outOfScope).length,
    hamAnahtarEkran: results.filter((r) => r.rawKeys.length > 0 || r.intlErrors.length > 0).length,
    dilUyusmazEkran: results.filter((r) => r.failReasons.some((x) => x.startsWith("html lang"))).length,
    kapsamDisiEkran: results.filter((r) => r.outOfScope).length,
    trAdayEkran: enTr.filter((r) => !r.outOfScope).length,
    trAdayToplam: enTr.filter((r) => !r.outOfScope).reduce((a, r) => a + r.trCandidates, 0),
    trAdayKapsamDisiToplam: enTr.filter((r) => r.outOfScope).reduce((a, r) => a + r.trCandidates, 0),
    senaryo: scenarios.length,
    senaryoFail: scenFail.length,
    eksikKatalogAnahtari: missingMessages.length,
  };
  const verdict = screenFail.length === 0 && scenFail.length === 0 ? "PASS" : "FAIL";
  writeFileSync(path.join(OUT, "ozet.json"), JSON.stringify({ meta, verdict, totals, results, scenarios, missingMessages }, null, 2));

  const L: string[] = [];
  L.push(`# I18N-R4 — Modül ekran kabul testi (${GATE_CLOSED ? "KAPI KAPALI · çerez/tercih en → " : ""}${LOCALES.join(", ")} × ${WIDTHS.join(" / ")} px)`);
  L.push("");
  L.push(`Sonuç: **${verdict}** — ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı / ${totals.kapsamDisiEkran} kapsam dışı; senaryo ${totals.senaryo - totals.senaryoFail}/${totals.senaryo}.`);
  L.push("");
  L.push(`- Yatay taşma: ${totals.tasma} ekran · Çökme: ${totals.cokme} · Belge/RSC 5xx: ${totals.belge5xx} · API 5xx olan ekran: ${totals.api5xxEkran} (${STRICT_API ? "FAIL sayıldı" : "uyarı — test ortamında olmayan modül tabloları"}) · Konsol error toplamı: ${totals.konsolHataToplam}`);
  L.push(`- Uygulama konsol hatası: FAIL ${totals.konsolUygulamaFailEkran} ekran · UYARI (aynı ekranda api 5xx) ${totals.konsolUygulamaUyariEkran} ekran · Ham anahtar / next-intl hata: ${totals.hamAnahtarEkran} ekran · <html lang> uyuşmazlığı: ${totals.dilUyusmazEkran} ekran`);
  L.push(`- EN TR-aday (BİLGİ, FAIL değil): ${totals.trAdayEkran} ekranda ${totals.trAdayToplam} düğüm/öznitelik (kapsam dışı ekranlar ayrıca: ${totals.trAdayKapsamDisiToplam}) · Sunucu eksik katalog anahtarı günlüğü: ${totals.eksikKatalogAnahtari}`);
  L.push(`- Rapor dili: KAPSAM DIŞI (Word/PDF çıktıları henüz çevrilmedi; yalnız indirme yanıtı denetlendi).`);
  L.push(`- Veri: tamamen sentetik (ZZ_*), gömülü PostgreSQL + PostgREST şimi; production'a temas yok.`);
  L.push("");
  L.push("## Rota × dil × genişlik");
  L.push("");
  L.push("| Grup | Rota | Dil | px | HTTP | lang | Taşma px | Çökme | Konsol (top/uyg/kaynak) | API 5xx | Diğer 5xx | Ham anahtar | TR-aday | Sonuç | FAIL nedeni / Not |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const order = new Map(ROUTES.map((r, i) => [r.id, i]));
  const sorted = [...results].sort((a, b) => (order.get(a.route) ?? 0) - (order.get(b.route) ?? 0) || a.lang.localeCompare(b.lang) || b.width - a.width);
  for (const r of sorted) {
    L.push(`| ${mdEsc(r.group)} | ${r.route} | ${r.lang} | ${r.width} | ${r.status ?? "-"} | ${r.htmlLang || "-"} | ${r.overflowPx} | ${r.crash ? "EVET" : "-"} | ${r.consoleErrors}/${r.consoleApp}${r.consoleWarnOnly ? "(uyarı)" : ""}/${r.consoleResource} | ${r.api5xx.length} | ${r.other5xx.length} | ${r.rawKeys.length + r.intlErrors.length} | ${r.lang === "en" ? r.trCandidates : "n/a"} | ${r.verdict} | ${mdEsc([r.failReasons.join(", "), r.crashReason ?? "", r.note ?? ""].filter(Boolean).join("; "))} |`);
  }
  const consoleRows = sorted.filter((r) => r.consoleApp > 0 || r.intlErrors.length > 0 || r.rawKeys.length > 0);
  if (consoleRows.length) {
    L.push("");
    L.push("## Uygulama konsol hataları / ham anahtar (rota başına ilk genişlik)");
    const seenRoute = new Set<string>();
    for (const r of consoleRows) {
      const k = `${r.route}|${r.lang}`;
      if (seenRoute.has(k)) continue;
      seenRoute.add(k);
      L.push(`- ${r.lang}-${r.width}-${r.route}${r.consoleWarnOnly ? " (UYARI: aynı ekranda api 5xx)" : ""}: ${mdEsc([...r.intlErrors, ...r.rawKeys.map((x) => `ham: ${x}`), ...r.consoleAppSamples].join(" ‖ ").slice(0, 600))}`);
    }
  }
  L.push("");
  L.push("## Senaryolar");
  L.push("");
  L.push("| Kimlik | Dil | Başlık | Sonuç | Ayrıntı |");
  L.push("|---|---|---|---|---|");
  for (const s of scenarios) L.push(`| ${s.id} | ${s.lang} | ${mdEsc(s.title)} | ${s.ok ? "PASS" : "FAIL"} | ${mdEsc(s.detail)}${s.screenshot ? ` (${s.screenshot})` : ""} |`);
  const ovs = sorted.filter((r) => r.overflowPx > 1);
  if (ovs.length) {
    L.push("");
    L.push("## Yatay taşma ayrıntısı");
    for (const r of ovs) L.push(`- ${r.lang}-${r.width}-${r.route}: +${r.overflowPx}px — ${r.overflowOffenders.map(mdEsc).join(" · ") || "(öğe saptanamadı)"}`);
  }
  const crashes = sorted.filter((r) => r.crash || r.other5xx.length);
  if (crashes.length) {
    L.push("");
    L.push("## Çökme / 5xx ayrıntısı");
    for (const r of crashes) L.push(`- ${r.lang}-${r.width}-${r.route}: ${mdEsc(r.crashReason ?? "")} ${r.other5xx.map(mdEsc).join(", ")} ${r.pageErrors.map(mdEsc).join(" · ")}`);
  }
  const apis = new Map<string, Set<string>>();
  for (const r of results) for (const a of r.api5xx) { if (!apis.has(a)) apis.set(a, new Set()); apis.get(a)!.add(r.route); }
  if (apis.size) {
    L.push("");
    L.push(`## API 5xx (uyarı${STRICT_API ? " — strict: FAIL" : ""}; çoğu test ortamında modül tablosu olmamasından)`);
    for (const [a, rs] of apis) L.push(`- \`${mdEsc(a)}\` ← ${Array.from(rs).join(", ")}`);
  }
  if (enTr.length) {
    L.push("");
    L.push("## EN ekranlarında TR-aday metinler (BİLGİ — marka/sentetik veri hariç tutuldu; kanonik değer olabilir)");
    const byRoute = new Map<string, TrHit[]>();
    for (const r of enTr) {
      const cur = byRoute.get(r.route) ?? [];
      for (const s of r.trSamples) if (!cur.some((x) => x.text === s.text)) cur.push(s);
      byRoute.set(r.route, cur);
    }
    for (const [route, hits] of byRoute) {
      const maxCount = Math.max(...enTr.filter((r) => r.route === route).map((r) => r.trCandidates));
      L.push(`- **${route}** (en çok ${maxCount}): ${hits.slice(0, 12).map((h) => `“${mdEsc(h.text.slice(0, 80))}” [${mdEsc(h.where)}]`).join(" · ")}`);
    }
  }
  if (missingMessages.length) {
    L.push("");
    L.push("## Sunucu günlüğünde eksik katalog anahtarı ([i18n])");
    for (const m of missingMessages.slice(0, 80)) L.push(`- ${mdEsc(m)}`);
  }
  L.push("");
  L.push(`Meta: ${mdEsc(JSON.stringify(meta))}`);
  writeFileSync(path.join(OUT, "ozet.md"), `${L.join("\n")}\n`);
  return { verdict, totals };
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main() {
  if (LOCALES.length === 0 || WIDTHS.length === 0) { console.error("geçerli --locales / --widths yok"); process.exit(2); }
  if (GATE_CLOSED && LOCALES.some((l) => l !== "tr")) { console.error("--gate-closed yalnız --locales tr ile koşar"); process.exit(2); }
  ROOTS = messageRoots();
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) { console.error("önce yayın kapısı AÇIK build gerekli (.next/BUILD_ID yok)"); process.exit(2); }

  const { env } = await startDyEnv({ port: PG_PORT, dirName: "i18n-modul-ekran-pgdata", httpPort: SUPA_PORT });
  const setupNotes: string[] = [];
  for (const [label, sql] of [
    ["user_locale_prefs migration", readFileSync(path.join(ROOT, "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8")],
    ["Word raporu asgari tabloları", EXTRA_DDL],
    ["numerology_records client bağı migration", readFileSync(path.join(ROOT, "supabase/migrations/20271120000300_numerology_records_client_link.sql"), "utf8")],
  ] as const) {
    try { await env.su.query(sql); setupNotes.push(`kurulum: ${label} ✓`); } catch (e) { setupNotes.push(`kurulum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); }
  }
  const { fx, seedNotes } = await seed(env);
  for (const n of [...setupNotes, ...seedNotes]) console.log(`  ${n}`);
  const exclude = [
    ...brandAllowlist(), SYN.tenantName, SYN.expertName, SYN.expertEmail,
    SYN.clientAd, SYN.clientSoyad, SYN.createdAd, SYN.createdSoyad, SYN.keepAd, SYN.keepSoyad, SYN.expertNameB, SYN.expertEmailB,
  ].sort((a, b) => b.length - a.length);

  const logPath = path.join(OUT, "next-sunucu.log");
  const log = createWriteStream(logPath);
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let crashed: Error | null = null;
  try {
    app = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout?.pipe(log, { end: false });
    app.stderr?.pipe(log, { end: false });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    for (const lang of LOCALES) {
      console.log(`\n[ekran turu: ${lang} × ${WIDTHS.join("/")} px — ${ROUTES.length} rota]`);
      await screenTour(browser, env, fx, lang, exclude);
    }
    console.log("\n[senaryolar]");
    if (GATE_CLOSED) {
      // Kapı kapalı build: yalnız K1 + yükleme ekranı (tr render beklenir); dil değişimi senaryoları anlamsız.
      await scenarioGateClosed(browser, env, fx);
      await scenarioLoading(browser, env, fx, "tr");
    } else {
      if (LOCALES.includes("tr")) await scenarioKeepData(browser, env, fx);
      if (LOCALES.includes("tr")) await scenarioPersist(browser, env, fx);
      if (LOCALES.includes("en")) await scenarioCreateEdit(browser, env, fx);
      if (LOCALES.includes("en")) await scenarioAccountIsolation(browser, env, fx);
      for (const lang of LOCALES) await scenarioWord(browser, env, fx, lang);
      for (const lang of LOCALES) await scenarioLoading(browser, env, fx, lang);
      console.log("\n[silme onayı modalları (1280 px)]");
      for (const lang of LOCALES) await modalProbes(browser, env, fx, lang);
    }
  } catch (e) {
    crashed = e as Error;
    console.error(e);
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
    }
    await sleep(500);
    log.end();
    await env.stop().catch(() => undefined);
  }

  let missing: string[] = [];
  try {
    missing = Array.from(new Set(readFileSync(logPath, "utf8").split("\n").filter((l) => l.includes("[i18n]")).map((l) => l.trim().slice(0, 300))));
  } catch { /* günlük yok */ }
  const meta = {
    tarih: new Date().toISOString(), locales: LOCALES, widths: WIDTHS, rotaSayisi: ROUTES.length, strictApi: STRICT_API, fullPage: FULL_PAGE, gateClosed: GATE_CLOSED,
    sureSn: Math.round((Date.now() - STARTED) / 1000), kurulum: [...setupNotes, ...seedNotes], genelHata: crashed ? crashed.message.slice(0, 300) : null,
  };
  const { verdict, totals } = writeSummary(meta, missing);
  console.log(`\nÇıktılar: ${OUT} (ozet.md, ozet.json, PNG)`);
  console.log(`=== modül ekran kabulü: ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı; senaryo FAIL ${totals.senaryoFail}; TR-aday ${totals.trAdayToplam} (bilgi) → ${crashed ? "FAIL (genel hata)" : verdict} ===`);
  process.exit(verdict === "PASS" && !crashed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

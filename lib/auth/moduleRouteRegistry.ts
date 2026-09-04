/**
 * Faz 1 / P3 (Commit 2) — MODÜL ROUTE REGISTRY (tek kaynak).
 *
 * Bu registry, envanter harness'inin gate kapsamını EKSİKSİZ kanıtlaması için
 * kullanılır: app/api altındaki her route.ts ya (a) bir modül prefix'i altındadır
 * ve server-side modül kapısı (requireModuleAccess / assertUserModuleAccess) taşır,
 * ya da (b) gerekçeli EXCLUDE listesindedir. Sınıflandırılamayan route → harness FAIL.
 */
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";

/** Modül route prefix'i → kanonik modül anahtarı (per-user gate uygulanır). */
export const MODULE_ROUTE_PREFIXES: { prefix: string; key: ModuleGateKey }[] = [
  { prefix: "app/api/dogaltas", key: "stones" },
  { prefix: "app/api/clients", key: "clients" },
  { prefix: "app/api/numeroloji", key: "numerology" },
  { prefix: "app/api/hd", key: "human_design" },
  { prefix: "app/api/biyoenerji", key: "energy_body" },
  { prefix: "app/api/video-ceviri", key: "video_ceviri" },
  { prefix: "app/api/refleksoloji", key: "reflexology" },
  { prefix: "app/api/belge-ceviri", key: "belge_ceviri" },
  { prefix: "app/api/urun-stok", key: "stok" },
  { prefix: "app/api/sifa-rehberi", key: "sifa_rehberi" },
  { prefix: "app/api/kisisel-arsiv", key: "personal_archive" },
  { prefix: "app/api/ders-notu", key: "ders_notu" },
  { prefix: "app/api/appointments", key: "appointments" },
  { prefix: "app/api/ajanda", key: "appointments" },
  { prefix: "app/api/kupa", key: "cupping" },
  // Beslenme (owner-only faz): requireModuleAccess("beslenme") + requireMainAdmin (ownerGuard).
  { prefix: "app/api/beslenme", key: "beslenme" },
];

/**
 * ERTELENMİŞ modül gate'i — genuine exclude DEĞİL, "gate henüz uygulanmadı".
 *
 * Aromaterapi modülü AYRI bir worktree/branch üzerinde AKTİF geliştiriliyor. P3'ün
 * bu route'lara dokunması paralel çalışmayla çakışacağından, server-side modül gate'i
 * BİLİNÇLİ olarak izole bir FOLLOW-UP PR'a ERTELENDİ (parallel Aromatherapy workstream;
 * server module gate intentionally deferred to isolated follow-up PR). Bu route'lar şu an
 * verifyUserRequest ile korunuyor (kimlik/tenant) ama kişiye-özel modül izni ZORLANMIYOR.
 *
 * Envanter harness bunu AYRI bir sınıf olarak sayar ve görünür raporlar — gate varmış gibi
 * SAHTE PASS üretmez. Follow-up: güncel aromaterapi route'larına gate + bu kaydın kaldırılması.
 */
export const DEFERRED_MODULE_PREFIXES: { prefix: string; key: ModuleGateKey; reason: string }[] = [
  {
    prefix: "app/api/aromaterapi",
    key: "aromatherapy",
    reason: "parallel Aromatherapy workstream; server module gate intentionally deferred to isolated follow-up PR",
  },
];

/**
 * Modül-gate DIŞI prefix'ler (gerekçeli). Bunlar kişiye-özel modül verisi değildir;
 * kendi auth modelleri vardır ve modül izniyle kapılanmaz.
 */
export const EXCLUDED_API_PREFIXES: { prefix: string; reason: string }[] = [
  { prefix: "app/api/admin", reason: "admin yönetim (verifyAdminRequest / requireMainAdmin) — modül-gate dışı" },
  { prefix: "app/api/auth", reason: "kimlik doğrulama / oturum (login/session/admin-session)" },
  { prefix: "app/api/settings", reason: "kullanıcının KENDİ ayarları (verifyUserRequest; modül değil)" },
  { prefix: "app/api/register", reason: "public kayıt ucu" },
  { prefix: "app/api/location", reason: "paylaşımlı coğrafi yardımcı (geo)" },
  { prefix: "app/api/inngest", reason: "sistem webhook (kuyruk)" },
  { prefix: "app/api/yasam-hafizasi", reason: "merkezî Yaşam Hafızası motoru (BF-11 CDC; kendi auth'u)" },
  { prefix: "app/api/cosmic", reason: "yalnız cosmic/audit dev-diagnostic; cosmic_calendar always-on (kullanıcı verisi yok)" },
  { prefix: "app/api/hacamat", reason: "stateless PDF/Word renderer (auth/DB yok, PII yok) + admin-managed global hacamat_rules; cosmic_calendar always-on modülüne bitişik" },
];

/**
 * Modül prefix'i altında OLUP gerekçeyle gate DIŞI bırakılan tekil route'lar.
 * (Kural: her istisna açık ve gerekçeli olmalı.)
 */
export const EXPLICIT_EXCLUDED_ROUTES: { path: string; reason: string }[] = [
  {
    path: "app/api/numeroloji/demo-analiz/route.ts",
    reason: "demo IP-kota yardımcısı; gerçek kullanıcı PII'si yok, session token yok, demo-olmayan çağrı kısa-devre",
  },
  {
    path: "app/api/ajanda/word-report/route.ts",
    reason: "tenant-only (body tenantId + demo kontrolü); kullanıcı kimliği/session token YOK — modül gate auth refactor gerektirir (canlı kilitleme riski nedeniyle explicit-exclude, follow-up)",
  },
  {
    path: "app/api/clients/[id]/analyses/upload-image/route.ts",
    reason: "tenant-only (formData tenantId + demo kontrolü); kullanıcı kimliği/session token YOK — modül gate auth refactor gerektirir (canlı kilitleme riski nedeniyle explicit-exclude, follow-up)",
  },
];

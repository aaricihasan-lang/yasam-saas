"use client";

import {
  PENDING_LOGIN_STORAGE_KEY,
  cancelPendingLogin,
  checkPendingLogin,
  clearPendingLoginToken,
  loginWithCredentials,
  readPendingLogin,
} from "@/lib/auth/loginUser";
import PasswordInput from "@/components/ui/PasswordInput";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  canLoginYasamUser,
  clearYasamUser,
  syncYasamUserFromDb,
  getYasamUserDisplayName,
  hasFullPanelAccess,
  isAdminUser,
  LOCKED_SUBSCRIPTION_TOAST,
  normalizeApprovalStatus,
  parseLoginUserRecord,
  readYasamUser,
  readSessionToken,
  hasSessionCredential,
  hasWebSession,
  sessionTokenHeader,
  saveYasamUser,
  saveSessionToken,
  type YasamUser,
} from "@/lib/auth/yasamUser";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { confirmSessionInvalid, consumeSessionEnded, type SessionEndReason } from "@/lib/auth/sessionExpiry";
import {
  LOCKED_PERMISSION_TOAST,
  type ModuleLockReason,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { fetchYhHealth } from "@/lib/yasam-hafizasi/ui/searchApiClient";
import { deriveYhCardStatus, type YhHealthPayload } from "@/lib/yasam-hafizasi/ui/healthStatus";
import {
  WHATSAPP_CONTACT_ENABLED,
  buildWhatsAppUrl,
} from "@/lib/contact/whatsapp";
import {
  CONTACT_EMAIL,
  CUSTOMER_SERVICE_DISPLAY,
  buildMailtoHref,
  buildTelHref,
} from "@/lib/contact/info";
import SupportRequestForm from "@/components/auth/SupportRequestForm";
import DemoIntroModal from "@/components/demo/DemoIntroModal";
import FreeTrialInvite from "@/components/landing/FreeTrialInvite";
import DemoAccessCard, {
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_PASSWORD,
} from "@/components/demo/DemoAccessCard";
import { getPlanetaryHour } from "@/lib/cosmic/planetary-hours";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getSunSignInfo } from "@/lib/cosmic/planets";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useTranslations, useLocale, useMessages } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import LanguageSelector from "@/components/i18n/LanguageSelector";

// Public ana sayfa dil seçimi geçici olarak gizli (owner kararı); yeniden göstermek için true yapın.
// i18n altyapısı ve panel içi LanguageSelector etkilenmez.
const SHOW_LANDING_LANGUAGE_SELECTOR = false;
import NotificationBell from "@/components/notifications/NotificationBell";
import HomeShell from "@/app/_premium/home/HomeShell";
import { buildModuleNavGroups, useModuleNavProbes } from "@/app/_premium/home/homeModuleNav";
import {
  buildCenterNavHubs,
  expertHasAnyGrantedModule,
  getCenterLock,
  getVisibleDashboardModules,
  isExpertMembershipExpired,
  type ModuleCard,
} from "@/app/_premium/home/homeCenters";
import premium from "@/app/_premium/home/home.module.css";
import lp from "@/app/_premium/landing/landing.module.css";
import { LANDING_FEATURE_ART, LANDING_MODULE_THEME } from "@/app/_premium/landing/landingTheme";
import { ClientJourneyScreen, HeroScene, MobilePhone, ScatterToHub } from "@/app/_premium/landing/LandingVisuals";
import { premiumFontVars } from "@/app/_premium/fonts";
import CookiePreferencesButton from "@/components/analytics/CookiePreferencesButton";
import { GOOGLE_PLAY_APP_URL } from "@/lib/platform/stores";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CreditCard,
  EyeOff,
  FileText,
  FolderOpen,
  Gem,
  Gift,
  LayoutGrid,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Play,
  Settings,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

/**
 * Üyelik & fiyat iletişim seçenekleri paneli — login modalı içinde tek, net
 * bir "üyelik iletişimi" görünümü olarak açılır (ayrı sayfa/route YOK).
 *
 * Üç ana iletişim seçeneği sunar:
 *   1) Yöneticiye Mesaj Gönder — `onManagerMessage` ile aynı modal içindeki
 *      membership_contact formunu açar (kullanıcı başka sayfaya gönderilmez).
 *   2) WhatsApp'tan Görüş — yalnızca gate açıkken (WHATSAPP_CONTACT_ENABLED)
 *      render edilir; kapalıyken kırık wa.me linki GÖSTERİLMEZ. Yeni sekmede
 *      açılır; panel state'i açık kalır (modal kapanmaz).
 *   3) Müşteri Hizmetleri — canonical telefon (tel: deep-link).
 * Altında sakin bir e-posta iletişim satırı (mailto) yer alır.
 *
 * Telefon/e-posta bilgileri kişisel GSM DEĞİL; yalnız `lib/contact/info.ts`
 * canonical kurumsal kaynağından gelir. WhatsApp numarası `lib/contact/whatsapp.ts`.
 */
function MembershipOptionsPanel({
  onManagerMessage,
  onBack,
}: {
  onManagerMessage: () => void;
  onBack: () => void;
}) {
  const whatsappUrl = buildWhatsAppUrl();

  return (
    <div className="relative z-10 mt-5 space-y-3">
      {/* 1) Yöneticiye Mesaj Gönder — ana sistem violet/gradient kimliği */}
      <button
        type="button"
        onClick={onManagerMessage}
        className="flex w-full items-start gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 p-4 text-left transition hover:border-violet-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-sm">
          <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-black text-slate-900">
            Yöneticiye Mesaj Gönder
          </span>
          <span className="mt-0.5 block text-[13px] leading-5 text-slate-600">
            Üyelik ve fiyatlandırma hakkında sorunuzu bize iletin. Size en kısa
            sürede geri dönüş yapalım.
          </span>
        </span>
      </button>

      {/* 2) WhatsApp'tan Görüş — yalnız gate açıkken */}
      {WHATSAPP_CONTACT_ENABLED && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left no-underline transition hover:border-emerald-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-black text-emerald-900">
              WhatsApp&apos;tan Görüş
            </span>
            <span className="mt-0.5 block text-[13px] leading-5 text-emerald-700/90">
              Üyelik ve fiyatlandırma hakkında hızlıca WhatsApp üzerinden bilgi
              alabilirsiniz.
            </span>
          </span>
        </a>
      )}

      {/* 3) Müşteri Hizmetleri — canonical telefon */}
      <a
        href={buildTelHref()}
        className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left no-underline transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <Phone className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-black text-slate-900">
            Müşteri Hizmetleri
          </span>
          <span className="mt-0.5 block text-lg font-black tracking-tight text-violet-800">
            {CUSTOMER_SERVICE_DISPLAY}
          </span>
          <span className="mt-0.5 block text-[13px] leading-5 text-slate-600">
            Dilerseniz müşteri hizmetlerimizi arayarak üyelik ve fiyatlandırma
            hakkında doğrudan bilgi alabilirsiniz.
          </span>
        </span>
      </a>

      {/* E-posta — 4. büyük CTA değil; sakin iletişim satırı */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-xl bg-slate-50 px-4 py-3 text-center text-[13px] text-slate-500">
        <Mail className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} />
        <span>E-posta ile ulaşmak isterseniz bize doğrudan yazabilirsiniz.</span>
        <a
          href={buildMailtoHref()}
          className="font-semibold text-violet-700 no-underline hover:text-violet-900 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {CONTACT_EMAIL}
        </a>
      </div>

      {/* Giriş ekranına dön */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        Giriş ekranına dön
      </button>
    </div>
  );
}

type RecentItem = {
  icon: string;
  label: string;
  rawDate: string;
  relDate: string;
};

const MODULE_STAT_TABLES: Partial<Record<ModulePermissionKey, string>> = {
  clients: "clients",
  stones: "stones",
  stok: "dogaltas_inventory",
  sifa_rehberi: "healing_guides",
  digital_content: "personal_archives",
  numerology: "numerology_analyses",
};

// slug = branch/dallanma anahtarı (canonical; render koşulları buna bağlı).
// titleKey/descKey = i18n anahtarları (görünen metin).
type LandingModule = {
  slug: string;
  titleKey: string;
  descKey: string;
  icon: string;
};

type FeatureItem = {
  slug: string;
  titleKey: string;
  descKey: string;
  icon: string;
};

const landingModules: LandingModule[] = [
  { slug: "danisanYonetimi", titleKey: "landing.danisanYonetimi.title", descKey: "landing.danisanYonetimi.desc", icon: "👥" },
  { slug: "dogaltas",        titleKey: "landing.dogaltas.title",        descKey: "landing.dogaltas.desc",        icon: "💎" },
  { slug: "urunStok",        titleKey: "landing.urunStok.title",        descKey: "landing.urunStok.desc",        icon: "📦" },
  { slug: "biyoenerji",      titleKey: "landing.biyoenerji.title",      descKey: "landing.biyoenerji.desc",      icon: "✨" },
  { slug: "refleksoloji",    titleKey: "landing.refleksoloji.title",    descKey: "landing.refleksoloji.desc",    icon: "🦶" },
  { slug: "kupaHacamat",     titleKey: "landing.kupaHacamat.title",     descKey: "landing.kupaHacamat.desc",     icon: "🫙" },
  { slug: "aromaterapi",     titleKey: "landing.aromaterapi.title",     descKey: "landing.aromaterapi.desc",     icon: "🌸" },
  { slug: "sifaRehberi",     titleKey: "landing.sifaRehberi.title",     descKey: "landing.sifaRehberi.desc",     icon: "🌿" },
  { slug: "beslenme",        titleKey: "landing.beslenme.title",        descKey: "landing.beslenme.desc",        icon: "🥗" },
  { slug: "numeroloji",      titleKey: "landing.numeroloji.title",      descKey: "landing.numeroloji.desc",      icon: "🔢" },
  { slug: "kisiselArsiv",    titleKey: "landing.kisiselArsiv.title",    descKey: "landing.kisiselArsiv.desc",    icon: "🗂️" },
  { slug: "humanDesign",     titleKey: "landing.humanDesign.title",     descKey: "landing.humanDesign.desc",     icon: "🔮" },
  { slug: "gokyuzuAtlasi",   titleKey: "landing.gokyuzuAtlasi.title",   descKey: "landing.gokyuzuAtlasi.desc",   icon: "🪐" },
  { slug: "kozmikAjanda",    titleKey: "landing.kozmikAjanda.title",    descKey: "landing.kozmikAjanda.desc",    icon: "🌙" },
];

// Modül kartlarının görsel teması (vurgu rengi, ikon, href, rozet/davranış türü): app/_premium/landing/landingTheme.ts.
// Özellik listeleri i18n `feats.<slug>`; modül sırası/adı/açıklaması yukarıdaki landingModules.

// i18n anahtarları (görünen metin t ile çözülür).
const trustPrincipleKeys: string[] = [
  "trust.principle1",
  "trust.principle2",
  "trust.principle3",
  "trust.principle4",
];

const featureItems: FeatureItem[] = [
  { slug: "guvenli",   titleKey: "featureItems.guvenli.title",   descKey: "featureItems.guvenli.desc",   icon: "🔒" },
  { slug: "analiz",    titleKey: "featureItems.analiz.title",    descKey: "featureItems.analiz.desc",    icon: "📈" },
  { slug: "webMobil",  titleKey: "featureItems.webMobil.title",  descKey: "featureItems.webMobil.desc",  icon: "📱" },
  { slug: "yedekleme", titleKey: "featureItems.yedekleme.title", descKey: "featureItems.yedekleme.desc", icon: "☁️" },
  { slug: "moduler",   titleKey: "featureItems.moduler.title",   descKey: "featureItems.moduler.desc",   icon: "🧩" },
];

// label = görünen etiketin i18n anahtarı (home.gallery.<mod>.<n> dizisine index).
// src/cover DEĞİŞMEZ (asset yolu / kapak bayrağı).
const danisanYonetimiGallerySlides = [
  { label: "gallery.danisanYonetimi.0", src: "/assets/danisan-yolculugu.png",    cover: true },
  { label: "gallery.danisanYonetimi.1", src: "/assets/danisan-yeni-kayit.png",   cover: false },
  { label: "gallery.danisanYonetimi.2", src: "/assets/danisan-listesi.png",      cover: false },
  { label: "gallery.danisanYonetimi.3", src: "/assets/danisan-ajanda.png",       cover: false },
  { label: "gallery.danisanYonetimi.4", src: "/assets/danisan-yeni-randevu.png", cover: false },
];

const sifaRehberiGallerySlides = [
  { label: "gallery.sifaRehberi.0", src: "/assets/sifa-rehberi-tanitim.png" },
  { label: "gallery.sifaRehberi.1", src: "/assets/sifa-rehberi-ana-menu.png" },
  { label: "gallery.sifaRehberi.2", src: "/assets/sifa-rehberi-yeni-kayit.png" },
  { label: "gallery.sifaRehberi.3", src: "/assets/sifa-rehberi-destekleyici.png" },
  { label: "gallery.sifaRehberi.4", src: "/assets/sifa-rehberi-liste.png" },
  { label: "gallery.sifaRehberi.5", src: "/assets/sifa-rehberi-detay.png" },
];

const refleksolojiGallerySlides = [
  { label: "gallery.refleksoloji.0", src: "/assets/refleksoloji-tanitim.png" },
  { label: "gallery.refleksoloji.1", src: "/assets/refleksoloji-anamenu.png" },
  { label: "gallery.refleksoloji.2", src: "/assets/refleksoloji-bolge-haritasi.png" },
  { label: "gallery.refleksoloji.3", src: "/assets/refleksoloji-kayitli-atlas.png" },
  { label: "gallery.refleksoloji.4", src: "/assets/refleksoloji-protokol-haritasi.png" },
  { label: "gallery.refleksoloji.5", src: "/assets/refleksoloji-kayitli-protokoller.png" },
  { label: "gallery.refleksoloji.6", src: "/assets/refleksoloji-klinik-notlar.png" },
];

const biyoenerjiGallerySlides = [
  { label: "gallery.biyoenerji.0", src: "/assets/biyoenerji-tanitim.png" },
  { label: "gallery.biyoenerji.1", src: "/assets/biyoenerji-anasayfa.png" },
  { label: "gallery.biyoenerji.2", src: "/assets/biyoenerji-seanslar.png" },
  { label: "gallery.biyoenerji.3", src: "/assets/biyoenerji-enerji-bedenleri.png" },
  { label: "gallery.biyoenerji.4", src: "/assets/biyoenerji-bilincoltu.png" },
  { label: "gallery.biyoenerji.5", src: "/assets/biyoenerji-imajinasyon.png" },
  { label: "gallery.biyoenerji.6", src: "/assets/biyoenerji-sembol.png" },
  { label: "gallery.biyoenerji.7", src: "/assets/biyoenerji-cakra.png" },
];

const numerologiFeatures = [
  { icon: "📊", title: "Detaylı Hesaplamalar", desc: "Doğum tarihinden kişisel sayılarınızı çıkarın ve anlamlandırın." },
  { icon: "🧘", title: "Çakra Analizi", desc: "Çakra omurgası ve enerji dengesini görüntüleyin." },
  { icon: "💎", title: "Taş Önerileri", desc: "Size özel doğaltaş önerilerini keşfedin." },
  { icon: "📋", title: "Görsel Rapor", desc: "Premium raporunuzu indirin ve paylaşın." },
  { icon: "📚", title: "Bilgi Bankası", desc: "Numeroloji yorumları ve açıklamalara tek merkezden ulaşın." },
  { icon: "💾", title: "Kayıtlı Analizler", desc: "Tüm analizlerinizi kaydedin, zamanla karşılaştırın." },
  { icon: "📄", title: "PDF & PNG Çıktı", desc: "Raporlarınızı PDF ve PNG olarak dışa aktarın." },
  { icon: "🔒", title: "Güvenli Altyapı", desc: "Verileriniz güvenle saklanır, sadece size özeldir." },
];

// ─── Cosmic helpers ────────────────────────────────────────────────────────────

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`
    .split("").map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}



// i18n translator tipi — modül-seviyesi saf fonksiyonlara/bileşenlere t geçirmek için.
type T = ReturnType<typeof useTranslations>;

function fmtRelDate(iso: string, t: T, bcp47: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return t("rel.justNow");
  if (mins < 60) return t("rel.minsAgo", { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("rel.hrsAgo", { hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t("rel.daysAgo", { days });
  // >30 gün: locale-aware kısa tarih (ay adı locale'e göre; TR "24 Ağu", EN "24 Aug").
  return new Date(iso).toLocaleDateString(bcp47, { day: "numeric", month: "short" });
}

function getDayGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "İyi Geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi Günler";
  return "İyi Akşamlar";
}

// ─── Dashboard components ──────────────────────────────────────────────────────

function LivePanel({ date }: { date: Date | null }) {
  const t = useTranslations("home");
  const locale = localeTag(useLocale() as ActiveLocale);
  const messages = useMessages() as {
    home?: { livePanel?: { display?: Record<string, Record<string, string>> } };
  };
  // Canonical (persisted/computed) TR adlar → locale'e uygun görüntü etiketi.
  // Harita yalnız DISPLAY katmanıdır; motor/canonical değerler DEĞİŞMEZ.
  // Eksik/bilinmeyen ad → ham canonical'a düşer (güvenli fallback).
  const displayMaps = messages?.home?.livePanel?.display ?? {};
  const dispName = (kind: "zodiac" | "moonPhase" | "planet", name: string): string =>
    displayMaps?.[kind]?.[name] ?? name;
  date = date ?? new Date();
  const phase = getMoonPhase(date);
  const sun = getSunSignInfo(date);
  const moon = getMoonSign(date);
  const planetary = getPlanetaryHour(date);
  const numDay = numerologicalDay(date);
  const numDesc = t(`numDesc.${numDay}`);

  function fmtTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const rows = [
    { label: t("livePanel.sunSign"),    value: `${sun.emoji} ${dispName("zodiac", sun.name)}` },
    { label: t("livePanel.moonSign"),   value: `${moon.emoji} ${dispName("zodiac", moon.name)}` },
    { label: t("livePanel.moonPhase"),  value: `${phase.emoji} ${dispName("moonPhase", phase.name)}` },
    { label: t("livePanel.numerology"), value: `🔢 ${numDay} · ${numDesc}` },
    {
      label: t("livePanel.planetaryHour"),
      value: `${planetary.aktifGezegen.symbol} ${dispName("planet", planetary.aktifGezegen.name)}`,
      sub: t("livePanel.planetarySub", { start: fmtTime(planetary.hourStart), end: fmtTime(planetary.hourEnd), mins: planetary.kalanDakika }),
    },
  ];

  // Premium görünüm (owner onaylı ana sayfa prototipi): başlık + burç rozeti + tarih + satırlar. Değerler yukarıdaki
  // yerel hesaplamalardan gelir; sabit / örnek değer YOK.
  return (
    <section className={premium.panel} aria-labelledby="home-live-panel-title">
      <div className={premium.enHead}>
        <span className={premium.enSun} aria-hidden>☀️</span>
        <h2 id="home-live-panel-title" className={premium.enTitle}>{t("livePanel.title")}</h2>
        <span className={premium.enSign}>{sun.emoji} {dispName("zodiac", sun.name)}</span>
      </div>
      <p className={premium.enDate}>
        {date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <p className={premium.enDay}>{date.toLocaleDateString(locale, { weekday: "long" })}</p>
      <dl className={premium.enRows}>
        {rows.map(({ label, value, sub }) => (
          <div key={label} className={premium.enRow}>
            <dt>{label}</dt>
            <dd>
              {value}
              {sub ? <small className="tabular-nums">{sub}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AuthBootScreen() {
  const t = useTranslations("home");
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl" />
      <div
        className="relative z-10 flex flex-col items-center gap-5 rounded-[28px] border-2 border-white/80 bg-white/90 px-10 py-12 shadow-lg"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-violet-200/90" />
          <Loader2
            className="relative h-8 w-8 animate-spin text-violet-600"
            aria-hidden
          />
        </div>
        <p className="text-lg font-black text-slate-900">{t("boot.preparing")}</p>
        <p className="text-sm font-medium text-slate-600">{t("boot.checkingSession")}</p>
      </div>
    </main>
  );
}

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale() as ActiveLocale;
  const bcp47 = localeTag(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<YasamUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Modül izinleri (package_type / module_permissions) login_user RPC'de DÖNMEZ;
  // yalnızca token'lı /api/auth/profile sync'inden gelir. profileSynced true olana
  // kadar modül kartları render EDİLMEZ (skeleton gösterilir) — aksi halde eksik
  // veri ile yanlışlıkla yalnızca 2 kart basılır. profileError sync başarısızsa true.
  const [profileSynced, setProfileSynced] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [loading, setLoading] = useState(false);
  // OTURUM MODELİ v2: admin ikinci/riskli web girişi onay bekliyor (token yalnız durum sorgusu içindir).
  const [pendingLogin, setPendingLogin] = useState<{ token: string; expiresAt: string | null } | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState<
    "login" | "support" | "membership" | "membershipOptions"
  >("login");
  const [now, setNow] = useState<Date | null>(null);
  const [moduleStats, setModuleStats] = useState<Partial<Record<ModulePermissionKey, number | null>>>({});
  // Yaşam Hafızası kartı: /api/yasam-hafizasi/health'ten DÜRÜST durum (undefined = yükleniyor).
  const [yhHealth, setYhHealth] = useState<YhHealthPayload | null | undefined>(undefined);
  const [recentActivity, setRecentActivity] = useState<RecentItem[] | null>(null);
  const [numerologiPreviewOpen, setNumerologiPreviewOpen] = useState(false);
  const [dogaltasPreviewOpen, setDogaltasPreviewOpen] = useState(false);
  const [biyoenerjiPreviewOpen, setBiyoenerjiPreviewOpen] = useState(false);
  const [biyoenerjiSlide, setBiyoenerjiSlide] = useState(0);
  const [refleksolojiPreviewOpen, setRefleksolojiPreviewOpen] = useState(false);
  const [refleksolojiSlide, setRefleksolojiSlide] = useState(0);
  const [sifaRehberiPreviewOpen, setSifaRehberiPreviewOpen] = useState(false);
  const [sifaRehberiSlide, setSifaRehberiSlide] = useState(0);
  const [danisanYonetimiPreviewOpen, setDanisanYonetimiPreviewOpen] = useState(false);
  const [danisanYonetimiSlide, setDanisanYonetimiSlide] = useState(0);
  const [kisiselArsivPreviewOpen, setKisiselArsivPreviewOpen] = useState(false);
  const [adminNavLoading, setAdminNavLoading] = useState(false);
  // Sol menü "Tüm Modüller" ilk açıldığında Beslenme / Gökyüzü Atlası erişim yoklamaları (mevcut yoklamalar) bir kez çalışır.
  const [modulesNavRequested, setModulesNavRequested] = useState(false);
  const moduleNavProbes = useModuleNavProbes(modulesNavRequested);
  // NOT: Beslenme girişi "Doğal Destek & Rehber" hub'ına taşındı (DogalDestekCards, kendi
  // checkBeslenmeAccess probe'uyla). Ayrı "Besinlerim"/manuel-besin yeteneği ÜRÜNDEN KALDIRILDI →
  // ana dashboard'da beslenme/food probe state'i tutulmaz.
  const loginBackdropPressed = useRef(false);
  const loginModalRef = useRef<HTMLDivElement>(null);
  // Admin cookie tazeleme sonucu: HTTP status (ağ hatası → null). Başarısızsa /admin'e körlemesine gidilmez.
  const adminCookiePromiseRef = useRef<Promise<number | null> | null>(null);

  // WEB P1: oturum sunucuda sona erdiyse (süre dolumu / iptal) bayat durumda takılma — temizle,
  // giriş modalını aç, nedene göre doğru mesajı göster. Sunucu süreleri DEĞİŞMEZ.
  const endSessionForReason = (reason: SessionEndReason) => {
    clearYasamUser();
    setUser(null);
    setAuthModalView("login");
    setLoginModalOpen(true);
    setMessage(reason === "expired" ? t("auth.sessionExpired") : t("auth.sessionInvalid"));
  };

  useSessionGuard({
    user,
    onSessionInvalid: endSessionForReason,
  });
  // Mount effect'lerinden güncel kapanış fonksiyonuna erişim (deps zincirine girmeden).
  const endSessionRef = useRef(endSessionForReason);
  useEffect(() => {
    endSessionRef.current = endSessionForReason;
  });

  // Modül/admin sayfasında oturum sona erip ana sayfaya yönlendirildiyse nedeni göster.
  useEffect(() => {
    const ended = consumeSessionEnded();
    if (!ended) return;
    // Mount sonrası (senkron setState zinciri yok) giriş modalını nedenle aç.
    const id = window.setTimeout(() => {
      setAuthModalView("login");
      setLoginModalOpen(true);
      setMessage(ended === "expired" ? t("auth.sessionExpired") : t("auth.sessionInvalid"));
    }, 0);
    return () => window.clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeLoginModal = () => {
    setLoginModalOpen(false);
    setAuthModalView("login");
  };

  // Test hesabı CTA'sı: mevcut login modalını bilgiler ön-dolu açar (otomatik giriş yok).
  const openDemoLogin = () => {
    setMessage("");
    setEmail(DEMO_ACCOUNT_EMAIL);
    setPassword(DEMO_ACCOUNT_PASSWORD);
    setAuthModalView("login");
    setLoginModalOpen(true);
  };

  // Landing modül kartı "Örnek Ekranları Gör / Örnek Analizi Gör": mevcut önizleme modallarını açar (galeri ilk ekrandan başlar).
  const openLandingPreview = (slug: string) => {
    switch (slug) {
      case "numeroloji":
        setNumerologiPreviewOpen(true);
        break;
      case "dogaltas":
        setDogaltasPreviewOpen(true);
        break;
      case "biyoenerji":
        setBiyoenerjiSlide(0);
        setBiyoenerjiPreviewOpen(true);
        break;
      case "kisiselArsiv":
        setKisiselArsivPreviewOpen(true);
        break;
      case "danisanYonetimi":
        setDanisanYonetimiSlide(0);
        setDanisanYonetimiPreviewOpen(true);
        break;
      case "sifaRehberi":
        setSifaRehberiSlide(0);
        setSifaRehberiPreviewOpen(true);
        break;
      case "refleksoloji":
        setRefleksolojiSlide(0);
        setRefleksolojiPreviewOpen(true);
        break;
    }
  };

  const handleLoginBackdropMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget) {
      loginBackdropPressed.current = true;
    }
  };

  const handleLoginBackdropMouseUp = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (
      loginBackdropPressed.current &&
      event.target === event.currentTarget
    ) {
      closeLoginModal();
    }
    loginBackdropPressed.current = false;
  };

  const handleLoginBackdropMouseLeave = () => {
    loginBackdropPressed.current = false;
  };

  const handleLoginModalPointerEvent = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation();
    loginBackdropPressed.current = false;
  };

  useEffect(() => {
    const stored = readYasamUser();
    if (!stored) {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    setUser(stored);
    setAuthLoading(false);

    // ── ADMIN ── gating'e tabi değil; hızlı render + arka planda tazele.
    if (isAdminUser(stored)) {
      setProfileSynced(true);
      // Cookie refresh DB sync'ten önce (paralel) başlatılıyor.
      // P0-1: sayfa yüklemesinde admin cookie tazelemesi yalnız GEÇERLİ oturum
      // token'ı (credential-gated login'de üretilmiş) varsa yapılır. Token yoksa
      // sessizce atlanır; erişim /admin nav veya yeniden login'de doğrulanır.
      const adminRefreshToken = readSessionToken();
      adminCookiePromiseRef.current = adminRefreshToken
        ? fetch("/api/auth/admin-session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-session-token": adminRefreshToken,
            },
          }).then((r) => r.status).catch(() => null)
        : Promise.resolve(null);
      // WEB P1: admin oturumu sunucuda sona ermişse (401) bayat "Admin Paneli" kartında
      // bekletme — oturumu sunucudan doğrula; geçersizse giriş akışına dön.
      void adminCookiePromiseRef.current.then(async (status) => {
        if (status !== 401) return;
        // WT4: iki kesin "geçersiz" yanıt gerekir; geçici hata/5xx çıkış yaptırmaz.
        const s = await confirmSessionInvalid();
        if (s) endSessionRef.current(s.reason);
      });
      void syncYasamUserFromDb(stored).then((fresh) => {
        if (fresh) setUser(fresh);
      });
      return;
    }

    // ── EXPERT ── Erişim kararı yalnızca geçerli oturum token'ıyla
    // /api/auth/profile üzerinden alınmış GÜNCEL profile dayanmalı.
    // Bayat localStorage kaydı tek başına "doğrulanmış" sayılmaz:
    // profileSynced yalnız gerçek fetch başarılıysa true olur.
    // HTTPONLY H5: web'de token yoksa HttpOnly cookie ile doğrulanır (hasSessionCredential);
    // Android'de bugünkü gibi yalnız token.
    if (!hasSessionCredential()) {
      // Oturum kimlik bilgisi yok → eski kullanıcı verisi doğrulanmış kabul edilemez.
      // Erişim reddi (eski membership snapshot'ı) ÜRETME; güvenli
      // "yeniden dene" ekranını göster. Logout/yönlendirme döngüsü yok.
      setProfileError(true);
      return;
    }
    void syncYasamUserFromDb(stored, { force: true }).then((fresh) => {
      if (fresh) {
        setUser(fresh);
        setProfileSynced(true);
      } else {
        // Profil doğrulanamadı (fetch başarısız / oturum geçersiz).
        // Eski veriyle erişim kararı verme; güvenli hata/yeniden-dene ekranı.
        setProfileError(true);
      }
    });
  }, []);

  useEffect(() => {
    if (authLoading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "1") {
      setLoginModalOpen(true);
      setMessage("");
      window.history.replaceState({}, "", "/");
    }
  }, [authLoading]);

  useEffect(() => {
    if (!loginModalOpen) return;

    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLoginModal();
        return;
      }
      if (event.key === "Tab" && loginModalRef.current) {
        const els = Array.from(
          loginModalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginModalOpen]);

  useEffect(() => {
    if (!numerologiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNumerologiPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numerologiPreviewOpen]);

  useEffect(() => {
    if (!dogaltasPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDogaltasPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dogaltasPreviewOpen]);

  useEffect(() => {
    if (!biyoenerjiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBiyoenerjiPreviewOpen(false);
      if (e.key === "ArrowLeft") setBiyoenerjiSlide(s => (s - 1 + biyoenerjiGallerySlides.length) % biyoenerjiGallerySlides.length);
      if (e.key === "ArrowRight") setBiyoenerjiSlide(s => (s + 1) % biyoenerjiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [biyoenerjiPreviewOpen]);

  useEffect(() => {
    if (!refleksolojiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRefleksolojiPreviewOpen(false);
      if (e.key === "ArrowLeft") setRefleksolojiSlide(s => (s - 1 + refleksolojiGallerySlides.length) % refleksolojiGallerySlides.length);
      if (e.key === "ArrowRight") setRefleksolojiSlide(s => (s + 1) % refleksolojiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refleksolojiPreviewOpen]);

  useEffect(() => {
    if (!sifaRehberiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSifaRehberiPreviewOpen(false);
      if (e.key === "ArrowLeft") setSifaRehberiSlide(s => (s - 1 + sifaRehberiGallerySlides.length) % sifaRehberiGallerySlides.length);
      if (e.key === "ArrowRight") setSifaRehberiSlide(s => (s + 1) % sifaRehberiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sifaRehberiPreviewOpen]);

  useEffect(() => {
    if (!danisanYonetimiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDanisanYonetimiPreviewOpen(false);
      if (e.key === "ArrowLeft") setDanisanYonetimiSlide(s => (s - 1 + danisanYonetimiGallerySlides.length) % danisanYonetimiGallerySlides.length);
      if (e.key === "ArrowRight") setDanisanYonetimiSlide(s => (s + 1) % danisanYonetimiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [danisanYonetimiPreviewOpen]);

  useEffect(() => {
    if (!kisiselArsivPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setKisiselArsivPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kisiselArsivPreviewOpen]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setModuleStats({});
      return;
    }
    const tenantId = user.tenant_id;
    if (!tenantId) return;

    let cancelled = false;
    const entries = Object.entries(MODULE_STAT_TABLES) as Array<[ModulePermissionKey, string]>;
    // Tüm modül tabloları anon'a KAPALI (RLS + grant revoke) → sayımlar yalnız güvenli sunucu
    // kapılarından: clients → /api/clients, numeroloji → /api/numeroloji/analyses,
    // diğerleri → /api/dashboard/summary (tek istek, modül izni sunucuda).
    const token = readSessionToken();
    const authHeaders: Record<string, string> = {
      "x-user-id": user.id ?? "",
      ...(token ? { "x-session-token": token } : {}),
    };
    let summaryPromise: Promise<Partial<Record<string, number | null>> | null> | null = null;
    const loadSummaryCounts = () =>
      (summaryPromise ??= fetch("/api/dashboard/summary", { headers: authHeaders })
        .then(async (res) => {
          if (!res.ok) return null;
          const json = (await res.json()) as { counts?: Partial<Record<string, number | null>> };
          return json.counts ?? null;
        })
        .catch(() => null));

    void Promise.allSettled(
      entries.map(async ([key, table]) => {
        if (table === "clients") {
          const res = await fetch("/api/clients", { headers: authHeaders });
          if (!res.ok) return { key, count: null };
          const json = (await res.json()) as { clients?: unknown[] };
          return { key, count: json.clients?.length ?? null };
        }
        // numerology_analyses anon ile sayılmaz → güvenli sunucu kapısı.
        if (table === "numerology_analyses") {
          const res = await fetch("/api/numeroloji/analyses?count=1", { headers: authHeaders });
          if (!res.ok) return { key, count: null };
          const json = (await res.json()) as { count?: number };
          return { key, count: typeof json.count === "number" ? json.count : null };
        }
        const counts = await loadSummaryCounts();
        const value = counts?.[key];
        return { key, count: typeof value === "number" ? value : null };
      }),
    ).then((results) => {
      if (cancelled) return;
      const stats: Partial<Record<ModulePermissionKey, number | null>> = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") stats[r.value.key] = r.value.count;
      });
      setModuleStats(stats);
    });

    return () => { cancelled = true; };
  }, [user?.id, user?.tenant_id]);

  // Yaşam Hafızası kartı durumu (yalnız aggregate health; ham içerik yok). Hata → "—".
  useEffect(() => {
    // Oturum yokken kart zaten görünmez; senkron setState yapılmaz (kart yalnız oturumla render edilir).
    if (!user?.id) return;
    const ctrl = new AbortController();
    void fetchYhHealth(ctrl.signal).then((payload) => {
      if (!ctrl.signal.aborted) setYhHealth(payload);
    });
    // Kullanıcı/tenant değişince önceki hesabın durumu gösterilmez.
    return () => { ctrl.abort(); setYhHealth(undefined); };
  }, [user?.id, user?.tenant_id]);

  useEffect(() => {
    if (!user) { setRecentActivity(null); return; }
    const tenantId = user.tenant_id;
    if (!tenantId) { setRecentActivity([]); return; }

    let cancelled = false;
    type RawItem = { icon: string; label: string; rawDate: string };
    // Tüm kaynaklar anon'a KAPALI → yalnız güvenli sunucu kapıları: clients → /api/clients,
    // numeroloji → /api/numeroloji/analyses, Doğaltaş + Kişisel Arşiv → /api/dashboard/summary.
    const token = readSessionToken();
    const authHeaders: Record<string, string> = {
      "x-user-id": user.id ?? "",
      ...(token ? { "x-session-token": token } : {}),
    };
    const summarySources: { key: string; icon: string }[] = [
      { key: "stones",            icon: "💎" },
      { key: "personal_archives", icon: "📚" },
    ];

    const clientsSource = (async (): Promise<RawItem[]> => {
      const res = await fetch("/api/clients", { headers: authHeaders });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        clients?: { ad?: string | null; soyad?: string | null; created_at?: string | null }[];
      };
      return (json.clients ?? []).slice(0, 3).map((c) => ({
        icon: "👥",
        label: `${c.ad ?? ""} ${c.soyad ?? ""}`.trim() || t("dashboard.newRecord"),
        rawDate: String(c.created_at ?? ""),
      }));
    })();

    // numerology_analyses anon ile okunmaz → güvenli sunucu kapısı.
    const numerologySource = (async (): Promise<RawItem[]> => {
      const res = await fetch("/api/numeroloji/analyses?recent=3", { headers: authHeaders });
      if (!res.ok) return [];
      // Sunucu `name, surname` döner (numerology_records); eski `full_name` okuması hep boştu.
      const json = (await res.json()) as {
        rows?: { name?: string | null; surname?: string | null; created_at?: string | null }[];
      };
      return (json.rows ?? []).map((r) => ({
        icon: "🧠",
        label: `${r.name ?? ""} ${r.surname ?? ""}`.trim() || t("dashboard.newRecord"),
        rawDate: String(r.created_at ?? ""),
      }));
    })();

    const summarySource = (async (): Promise<RawItem[]> => {
      const res = await fetch("/api/dashboard/summary", { headers: authHeaders });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        recent?: Record<string, Array<{ label?: string | null; created_at?: string | null }>>;
      };
      return summarySources.flatMap(({ key, icon }) =>
        (json.recent?.[key] ?? []).map((r) => ({
          icon,
          label: String(r.label ?? "").trim() || t("dashboard.newRecord"),
          rawDate: String(r.created_at ?? ""),
        })),
      );
    })();

    void Promise.allSettled([
      clientsSource,
      numerologySource,
      summarySource,
    ]).then((results) => {
      if (cancelled) return;
      const all: RawItem[] = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => (r as PromiseFulfilledResult<RawItem[]>).value);
      all.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
      setRecentActivity(
        all.slice(0, 5).map((item) => ({ ...item, relDate: fmtRelDate(item.rawDate, t, bcp47) })),
      );
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenant_id, t]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = document.querySelectorAll<HTMLElement>("[data-fade]");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "none";
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    els.forEach((el) => {
      if (el.getBoundingClientRect().top >= window.innerHeight - 80) {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      }
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Başarılı kimlik doğrulama sonrası ORTAK tamamlama: doğrudan giriş + onaylanan bekleyen giriş.
  const completeLogin = async (
    row: Record<string, unknown>,
    sessionToken: string | null,
    isSuspiciousLogin: boolean,
  ) => {
    let loggedUser = parseLoginUserRecord(row);

    if (!loggedUser) {
      clearYasamUser();
      setMessage(t("auth.noValidRole"));
      setLoading(false);
      return;
    }

    // Oturum kuruldu → güncel profil (module_permissions/paket) güvenli API'den yüklenir.
    // HTTPONLY H6b: web + cookie taşımasında token yok (HttpOnly cookie); saveSessionToken zaten yazmaz.
    if (sessionToken) saveSessionToken(sessionToken);
    const freshUser = await syncYasamUserFromDb(loggedUser, { force: true });
    if (!freshUser) {
      // Profil doğrulanamadı → oturumu sunucuda da kapat (clearYasamUser DELETE gönderir).
      clearYasamUser();
      setMessage(t("auth.userVerifyFailed"));
      setLoading(false);
      return;
    }
    loggedUser = freshUser;

    const loginCheck = canLoginYasamUser(loggedUser);
    if (!loginCheck.allowed) {
      clearYasamUser();
      setMessage(loginCheck.message);
      setLoading(false);
      return;
    }

    setUser(loggedUser);
    setProfileSynced(true);
    setProfileError(false);
    setLoginModalOpen(false);
    setEmail("");
    setPassword("");
    setMessage("");
    setLoading(false);

    if (isSuspiciousLogin) {
      showToast({
        title: t("auth.securityWarningTitle"),
        message: t("auth.securityWarningMsg"),
        type: "warning",
      });
    }

    if (isAdminUser(loggedUser)) {
      // Admin httpOnly session cookie set et (server-side doğrulama ile)
      const cookieRes = await fetch("/api/auth/admin-session", {
        method: "POST",
        // P0-1: admin cookie yalnız GEÇERLİ (credential-gated) oturum token'ıyla verilir.
        headers: {
          "Content-Type": "application/json",
          ...sessionTokenHeader(),
        },
      });
      if (!cookieRes.ok) {
        setMessage(t("auth.adminSessionFailed"));
        setLoading(false);
        return;
      }
      router.push("/admin");
    }
  };

  const handleLogin = async () => {
    // Aynı tarayıcıda bekleyen onay varken yeni giriş başlatılmaz (form zaten kilitli; savunma).
    if (pendingLogin || readPendingLogin()) return;
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setMessage(t("auth.emailPasswordRequired"));
      return;
    }

    setLoading(true);
    setPendingLogin(null);
    setMessage(t("auth.loggingIn"));

    // FAZ1 FINAL HARDENING — TEK LOGIN YOLU: kimlik doğrulama + kısıtlama (throttle) + gating +
    // oturum token'ı tek istekte SUNUCUDA (POST /api/auth/session). Tarayıcı login_user RPC'si
    // ÇAĞRILMAZ. Oturum kurulamazsa giriş BAŞARISIZDIR (fail-closed; token'sız giriş yok).
    const attempt = await loginWithCredentials(trimmedEmail, trimmedPassword);

    if (!attempt.ok) {
      if (attempt.code === "PENDING_APPROVAL" && attempt.pendingToken) {
        setPendingLogin({ token: attempt.pendingToken, expiresAt: attempt.pendingExpiresAt ?? null });
        setMessage("");
        setLoading(false);
        return;
      }
      if (attempt.code === "INVALID_CREDENTIALS") {
        setMessage(t("auth.emailPasswordWrong"));
      } else if (attempt.code === "ADMIN_MOBILE_ACTIVE") {
        setMessage(t("auth.adminMobileActive"));
      } else if (attempt.code === "ADMIN_WEB_LIMIT") {
        setMessage(t("auth.adminWebLimit"));
      } else if (attempt.code === "SESSION_LIMIT") {
        setMessage(attempt.message ?? t("auth.sessionLimit"));
      } else if (attempt.code === "NO_ROLE") {
        setMessage(t("auth.noValidRole"));
      } else if (
        attempt.code === "LOCKED" ||
        attempt.code === "INACTIVE" ||
        attempt.code === "PENDING"
      ) {
        setMessage(attempt.message ?? t("auth.systemError"));
      } else {
        setMessage(t("auth.systemError"));
      }
      setLoading(false);
      return;
    }

    await completeLogin(attempt.row, attempt.sessionToken, attempt.suspiciousLogin);
  };

  // Bekleyen admin web girişi: 5 sn'de bir YALNIZ kendi durumunu sorgular (onay/ret/süre dolumu).
  const completeLoginRef = useRef(completeLogin);
  useEffect(() => {
    completeLoginRef.current = completeLogin;
  });
  useEffect(() => {
    if (!pendingLogin) return;
    let cancelled = false;
    const tick = async () => {
      // 10 dk dolduysa (veya başka sekme iptal/tamamladıysa) yerel bekleme biter.
      const stored = readPendingLogin();
      if (!stored || stored.token !== pendingLogin.token) {
        setPendingLogin(null);
        if (!stored && !hasWebSession()) setMessage(t("auth.pendingExpired")); // H6b: oturum token'dan değil kimlik bilgisinden
        return;
      }
      const st = await checkPendingLogin(pendingLogin.token);
      if (cancelled || !st || st.state === "pending") return;
      setPendingLogin(null);
      if (st.state === "approved") {
        // Onaylandı → bu sekme girişi tamamlar; bekleyen token ancak SONRA silinir (açık diğer
        // giriş sekmeleri de onayı görüp kendi başına tamamlar).
        setLoading(true);
        await completeLoginRef.current(st.row, pendingLogin.token, false);
        clearPendingLoginToken();
      } else {
        clearPendingLoginToken();
        setMessage(st.state === "denied" ? t("auth.pendingDenied") : t("auth.pendingExpired"));
      }
    };
    const first = window.setTimeout(() => void tick(), 2000);
    const iv = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, [pendingLogin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yenileme / yeni sekme: geçerli bekleyen token varsa bekleme otomatik sürer. Başka sekme girişi
  // tamamlarsa (oturum token'ı yazılır) bu sekme yenilenip aynı oturumla açılır.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  });
  useEffect(() => {
    const restore = () => {
      if (userRef.current || readSessionToken()) return;
      const p = readPendingLogin();
      if (!p) {
        setPendingLogin(null);
        return;
      }
      setAuthModalView("login");
      setLoginModalOpen(true);
      setPendingLogin((cur) => (cur && cur.token === p.token ? cur : { token: p.token, expiresAt: p.expiresAt }));
    };
    const id = window.setTimeout(restore, 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PENDING_LOGIN_STORAGE_KEY) restore();
      if (e.key === "yasam_user" && e.newValue && !userRef.current) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const logout = () => {
    clearYasamUser();
    setUser(null);
    setEmail("");
    setPassword("");
    setMessage("");
  };

  // WT4: mobilde yalnız ikon olan çıkış düğmesi zil/dil seçicinin hemen yanında; yanlış dokunuş
  // anında oturumu (sunucuda da) kapatıyordu. Çıkış artık YALNIZ açık onayla yapılır.
  const requestLogout = async () => {
    const ok = await confirm({
      title: t("dashboard.logoutConfirmTitle"),
      message: t("dashboard.logoutConfirmMessage"),
      confirmText: t("dashboard.logout"),
      cancelText: t("dashboard.logoutConfirmCancel"),
      tone: "warning",
    });
    if (ok) logout();
  };

  if (authLoading) {
    return <AuthBootScreen />;
  }

  if (user) {
    const displayName = getYasamUserDisplayName(user);
    const ICON_TO_PERM: Record<string, string> = {
      "👥": "clients", "💎": "stones", "📚": "digital_content", "🧠": "numerology",
    };
    const lastDateByKey: Record<string, string> = {};
    if (recentActivity) {
      for (const act of recentActivity) {
        const k = ICON_TO_PERM[act.icon];
        if (k && !lastDateByKey[k]) lastDateByKey[k] = act.relDate;
      }
    }
    const firstName = displayName ? displayName.split(" ")[0] : "";
    const panelAccess = hasFullPanelAccess(user);
    // Modül kartları + erişim kararı yalnızca token'lı /api/auth/profile sync'i
    // (profileSynced) sonrası deterministik. localStorage package_type'ına GÜVENİLMEZ
    // — bayat kayıt yanlış erişim kararı üretmesin. Admin gating'e tabi değil.
    const permissionsReady = isAdminUser(user) || profileSynced;
    const visibleDashboardModules = getVisibleDashboardModules(user);
    const membershipExpired = isExpertMembershipExpired(user);
    // Erişim yoksa doğru sebep: onay bekliyor mu, yoksa (genel) aktif değil mi?
    const membershipDenyReason: "pending" | "inactive" =
      !isAdminUser(user) &&
      normalizeApprovalStatus(user.approval_status) === "pending"
        ? "pending"
        : "inactive";
    const expertModulesEmpty =
      !isAdminUser(user) &&
      !membershipExpired &&
      !expertHasAnyGrantedModule(user);

    async function handleAdminNav() {
      if (adminNavLoading) return;
      setAdminNavLoading(true);
      let status: number | null = null;
      if (adminCookiePromiseRef.current) {
        // Sayfa yüklenirken başlatılan refresh'in bitmesini bekle (yarış yok).
        await adminCookiePromiseRef.current;
      }
      // WEB P1: tıklama ANINDAKİ oturum durumu esas alınır (sayfa açıkken süre dolmuş olabilir) →
      // geçersiz oturumla /admin'e gidip sunucudan sessizce "/"e geri düşme olmaz.
      try {
        const r = await fetch("/api/auth/admin-session", {
          method: "POST",
          // P0-1: admin cookie yalnız geçerli (credential-gated) oturum token'ıyla verilir.
          headers: {
            "Content-Type": "application/json",
            ...sessionTokenHeader(),
          },
        });
        status = r.status;
      } catch {
        status = null;
      }
      adminCookiePromiseRef.current = Promise.resolve(status);
      if (status === 200) {
        router.push("/admin");
        return;
      }
      setAdminNavLoading(false);
      if (status === 401) {
        // WEB P1: geçersiz/süresi dolmuş oturumla /admin'e körlemesine gidilmez (sessiz "/" dönüşü yok).
        // WT4: 401 tek başına oturum sonu SAYILMAZ (geçici doğrulama hatası da 401 döner);
        // yalnız sunucu iki kez kesin "geçersiz" derse giriş akışına dönülür.
        const s = await confirmSessionInvalid();
        if (s) {
          endSessionForReason(s.reason);
          return;
        }
      }
      showToast({ message: t("auth.adminSessionFailed"), type: "error" });
    }

    async function retryProfileSync() {
      if (!user) return;
      setProfileError(false);
      // Oturum kimlik bilgisi yoksa canlı doğrulama yapılamaz — bayat kaydı "synced" sayma.
      if (!hasSessionCredential()) {
        setProfileError(true);
        return;
      }
      const fresh = await syncYasamUserFromDb(user, { force: true });
      if (fresh) {
        setUser(fresh);
        setProfileSynced(true);
      } else {
        setProfileError(true);
      }
    }

    function handleLockedModuleClick(reason: ModuleLockReason) {
      if (reason === "coming_soon") return;
      showToast({
        message:
          reason === "permission"
            ? LOCKED_PERMISSION_TOAST
            : LOCKED_SUBSCRIPTION_TOAST,
        type: "warning",
      });
    }

    const effectiveNow = now ?? new Date();

    // Kart kilit kararı — önceki ana sayfayla AYNI kural (getAnyPermissionLockReason / getModuleLockReason + extra anahtarlar).
    const cardLock = (item: ModuleCard): ModuleLockReason | null => getCenterLock(user, item, panelAccess);
    const isCardOpen = (key: ModulePermissionKey) => {
      const item = visibleDashboardModules.find((m) => m.permissionKey === key);
      return !!item && item.href !== "#" && cardLock(item) === null;
    };
    const menuReady = permissionsReady && !membershipExpired;
    // 2026-10-18 owner kararı: Ürün & Stok Merkezi kartı yedi merkezin EN SONUNDA (yalnız gösterim sırası; diğer altı kartın
    // kendi sırası, kart içeriği ve yetki kararı aynen).
    const orderedDashboardModules = [
      ...visibleDashboardModules.filter((m) => m.permissionKey !== "stok"),
      ...visibleDashboardModules.filter((m) => m.permissionKey === "stok"),
    ];
    // Sol menü "Tüm Modüller": kartlarla aynı sıra + aynı kilit kararı; alt modül görünürlüğü mevcut route kapısı ile.
    const moduleNavGroups = menuReady
      ? buildModuleNavGroups(
          user,
          buildCenterNavHubs(user, panelAccess, (key) => t(`modules.${key}.title`)),
          moduleNavProbes,
          (key) => t(`premium.nav.${key}`),
        )
      : [];
    // Owner onaylı premium kart görselleri / tonları (yalnız görünüm; href / yetki ModuleCard'dan).
    const CARD_VISUAL: Partial<Record<string, { img: string; tone: string }>> = {
      clients: { img: "ic-danisan", tone: premium.tViolet },
      yasam_hafizasi: { img: "ic-hafiza", tone: premium.tPink },
      stok: { img: "ic-urun", tone: premium.tAmber },
      energy_body: { img: "ic-beden", tone: premium.tRose },
      sifa_rehberi: { img: "ic-dogal", tone: premium.tGreen },
      digital_content: { img: "ic-dijital", tone: premium.tBlue },
      numerology: { img: "ic-analiz", tone: premium.tLilac },
    };
    const heroDate = t("dashboard.heroDate", {
      day: effectiveNow.getDate(),
      month: effectiveNow.toLocaleDateString(bcp47, { month: "long" }),
      year: effectiveNow.getFullYear(),
      weekday: effectiveNow.toLocaleDateString(bcp47, { weekday: "long" }),
    });

    return (
      <main className={`${premium.page} ${premiumFontVars}`}>
        <HomeShell
          showClients={menuReady && isCardOpen("clients")}
          moduleGroups={moduleNavGroups}
          onModulesOpen={() => setModulesNavRequested(true)}
          isAdmin={isAdminUser(user)}
          adminNavLoading={adminNavLoading}
          onAdminNav={() => { void handleAdminNav(); }}
          tools={
            <>
              <LanguageSelector compact />
              <NotificationBell compact />
              <Link
                href="/settings"
                aria-label={t("settingsGear.label")}
                title={t("settingsGear.label")}
                data-testid="home-settings-gear"
                className={`${premium.toolBtn} ${premium.gearBtn}`}
              >
                <Settings className={`${premium.gearIcon} h-[18px] w-[18px]`} strokeWidth={2} aria-hidden />
                <span aria-hidden className={premium.gearTip}>
                  {t("settingsGear.label")}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void requestLogout()}
                aria-label={t("dashboard.logout")}
                className={premium.toolBtn}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                <span className={premium.toolBtnLabel}>{t("dashboard.logout")}</span>
              </button>
            </>
          }
        >
          {/* Demo / test hesabı açılış bilgilendirmesi — canonical is_demo_account,
              yalnız DB profil sync'i doğrulandıktan sonra; admin'de asla. */}
          <DemoIntroModal
            enabled={user.is_demo_account === true && !isAdminUser(user) && profileSynced}
          />

          {/* Demo Hesap Banneri */}
          {user.is_demo_account ? (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-yellow-50/80 px-5 py-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>⚠️</span>
                <div className="min-w-0 space-y-2.5">
                  {/* Başlık + açıklama tek satır */}
                  <p className="text-sm font-black leading-snug text-amber-900">
                    {t("demo.titleBadge")}{" "}
                    <span className="font-medium text-amber-800">
                      {t("demo.subtitle")}
                    </span>
                  </p>

                  {/* Madde listesi */}
                  <ul className="space-y-0.5">
                    {[
                      t("demo.item1"),
                      t("demo.item2"),
                      t("demo.item3"),
                      t("demo.item4"),
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
                        <span className="mt-px shrink-0 text-amber-500" aria-hidden>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Uyarı */}
                  <p className="text-xs font-medium leading-relaxed text-amber-700">
                    {t("demo.warning")}
                  </p>

                  {/* Çağrı */}
                  <p className="pt-0.5 text-xs font-black text-amber-900">
                    {t("demo.cta")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}


          <div className={premium.content}>
            <div className={premium.center}>
              {/* HERO — owner onaylı premium karşılama (gerçek kullanıcı adı + gerçek tarih) */}
              <section className={premium.hero} aria-labelledby="home-hero-title">
                <div className={premium.heroArt}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/premium/ana-sayfa/hero-manzara.webp" width={738} height={259} alt="" aria-hidden data-testid="home-hero-glow" />
                </div>
                <div className={premium.heroText}>
                  <p className={premium.eyebrow}>{t("premium.eyebrow")}</p>
                  <h1 id="home-hero-title" className={premium.heroTitle}>
                    {firstName ? (
                      <>
                        <span>{t("dashboard.welcomePrefix")}</span>
                        <span className={premium.heroName}>{firstName} ✨</span>
                      </>
                    ) : (
                      <span>{t("dashboard.welcomePlain")}</span>
                    )}
                  </h1>
                  <p className={premium.heroDate}>{heroDate}</p>
                  <p className={premium.heroSub}>{t("premium.heroSub")}</p>
                </div>
              </section>

              <section aria-labelledby="yasam-modulleri-title">
                <div className={premium.secHead} id="yasam-modulleri">
                  <h2 id="yasam-modulleri-title" className={premium.secTitle}>
                    <span className={premium.secBar} aria-hidden />
                    {t("premium.modulesTitle")}
                  </h2>
                </div>

              {!permissionsReady ? (
                profileError ? (
                  <div role="alert" className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                    <p className="text-base font-black text-rose-700">{t("dashboard.profileErrorTitle")}</p>
                    <p className="mt-2 max-w-md text-sm text-rose-500">
                      {t("dashboard.profileErrorDesc")}
                    </p>
                    <button
                      type="button"
                      onClick={retryProfileSync}
                      className="mt-4 rounded-full border border-rose-300 bg-white px-4 py-1.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      {t("dashboard.retry")}
                    </button>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3"
                    aria-busy="true"
                    aria-label={t("dashboard.modulesBusy")}
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex min-h-[150px] flex-col rounded-[18px] border border-slate-200/70 bg-white/60 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                      >
                        <div className="h-8 w-8 animate-pulse rounded-xl bg-slate-200/80" />
                        <div className="mt-3 h-4 w-3/5 animate-pulse rounded bg-slate-200/80" />
                        <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                        <div className="mt-auto flex items-center justify-between pt-4">
                          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200/80" />
                          <div className="h-6 w-6 animate-pulse rounded-full bg-slate-200/80" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : membershipExpired ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                  {membershipDenyReason === "pending" ? (
                    <p className="text-base font-black text-rose-700">
                      {t("dashboard.membershipPending")}
                    </p>
                  ) : (
                    <>
                      <p className="text-base font-black text-rose-700">
                        {t("dashboard.membershipInactiveTitle")}
                      </p>
                      <p className="mt-2 max-w-md text-sm text-rose-500">
                        {t("dashboard.membershipInactiveDesc")}
                      </p>
                    </>
                  )}
                  <p className="mt-4 max-w-md text-sm font-semibold text-rose-600">
                    Üyelik ve fiyatlandırma hakkında iletişime geçebilirsiniz.
                  </p>
                  <div className="mt-3 w-full max-w-xs">
                    {/* Aynı 3 seçenekli iletişim panelini reuse eder (paralel
                        sistem yok): modal membershipOptions görünümünde açılır. */}
                    <button
                      type="button"
                      onClick={() => {
                        setMessage("");
                        setAuthModalView("membershipOptions");
                        setLoginModalOpen(true);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(109,40,217,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(109,40,217,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                    >
                      Üyelik ve Fiyat Bilgisi Al
                    </button>
                  </div>
                </div>
              ) : expertModulesEmpty ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-slate-200 bg-white/60 px-6 py-8 text-center backdrop-blur-sm">
                  <p className="text-base font-black text-slate-700">{t("dashboard.noModulesTitle")}</p>
                  <p className="mt-2 max-w-md text-sm text-slate-400">
                    {t("dashboard.noModulesDesc")}
                  </p>
                </div>
              ) : (
                <div className={premium.grid} data-testid="home-hub-grid">
                  {orderedDashboardModules.map((item, index) => {
                    const total = orderedDashboardModules.length;
                    // Son kart 3 sütunlu düzende tek kalıyorsa (ör. 7 kart): geniş "analiz" görünümü yalnız Yaşam Analiz
                    // kartına aittir; başka bir merkez (2026-10-18: Ürün & Stok en sonda) kendi kart görünümünü korur ve
                    // son satırda ortalanır.
                    const isLastSolo = index === total - 1 && total % 3 === 1;
                    const isWide = isLastSolo && item.permissionKey === "numerology";
                    const soloClass = isLastSolo && !isWide ? premium.soloCenter : "";
                    const hasHref = item.href !== "#";
                    const lockReason = cardLock(item);
                    const isLocked = lockReason !== null;
                    const isOpen = hasHref && !isLocked;
                    const isComingSoon = lockReason === "coming_soon";
                    const visual = CARD_VISUAL[item.permissionKey] ?? { img: "ic-analiz", tone: premium.tLilac };
                    const statText = item.hasStat
                      ? moduleStats[item.permissionKey] === undefined
                        ? t("moduleCard.loading")
                        : moduleStats[item.permissionKey] === null
                          ? "—"
                          : moduleStats[item.permissionKey] === 0
                            ? t("moduleCard.noRecords")
                            : t(`modules.${item.permissionKey}.stat`, { n: moduleStats[item.permissionKey] as number })
                      : item.permissionKey === "yasam_hafizasi"
                        ? deriveYhCardStatus(yhHealth).text
                        : t("common.contentReady");
                    const body = (
                      <>
                        <h3 className={premium.cardTitle}>{t(`modules.${item.permissionKey}.title`)}</h3>
                        <p className={premium.cardDesc}>{t(`modules.${item.permissionKey}.desc`)}</p>
                        <p className={premium.cardMeta}>
                          <span>{statText}</span>
                          {lastDateByKey[item.permissionKey] ? (
                            <span>{t("moduleCard.lastPrefix", { date: lastDateByKey[item.permissionKey] })}</span>
                          ) : null}
                        </p>
                      </>
                    );
                    const card = (
                      <div className={`${premium.card} ${visual.tone} ${isOpen ? premium.cardOpen : ""}`}>
                        {isLocked ? (
                          <span className={`${premium.badge} ${isComingSoon ? premium.badgeSoon : premium.badgeLock}`}>
                            {isComingSoon
                              ? t("common.comingSoon")
                              : lockReason === "permission" ? t("moduleCard.lockNoPermission") : t("moduleCard.lockMembership")}
                          </span>
                        ) : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={premium.icon} src={`/premium/ana-sayfa/${visual.img}.webp`} alt="" aria-hidden />
                        {isWide ? <div className={premium.wideBody}>{body}</div> : body}
                        {isWide ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={premium.decor} src="/premium/ana-sayfa/analiz-dekor.webp" alt="" aria-hidden />
                        ) : null}
                        <span className={premium.arrow} aria-hidden>
                          <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                        </span>
                      </div>
                    );

                    if (isOpen) {
                      return (
                        <Link key={item.permissionKey} href={item.href} className={`${premium.cardLink} ${isWide ? premium.wide : ""} ${soloClass}`}>
                          {card}
                        </Link>
                      );
                    }
                    return (
                      <div
                        key={item.permissionKey}
                        className={`${isWide ? premium.wide : ""} ${soloClass} ${isComingSoon ? premium.cardSoon : premium.cardLocked}`}
                        role={isLocked ? "button" : undefined}
                        tabIndex={isLocked ? 0 : undefined}
                        onClick={isLocked && lockReason ? () => handleLockedModuleClick(lockReason) : undefined}
                        onKeyDown={isLocked && lockReason ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleLockedModuleClick(lockReason); } } : undefined}
                      >
                        {card}
                      </div>
                    );
                  })}

                  {/* Beslenme girişi "Doğal Destek & Rehber" hub'ındadır (app/dogal-destek/DogalDestekCards.tsx);
                      ana panelde bağımsız Beslenme kartı ve Doğal Pazar vitrin kartı YOK (owner kararları). */}
                </div>
              )}
              </section>
            </div>

            {/* Sağ sütun: Bugünün Enerjisi (yerel hesap) + Son Aktiviteler (gerçek veri; yalnız veri varsa) */}
            <aside className={premium.right}>
              <LivePanel date={effectiveNow} />
              {recentActivity !== null && recentActivity.length > 0 ? (
                <section className={premium.panel} aria-labelledby="home-recent-title">
                  <h2 id="home-recent-title" className={premium.panelTitle}>{t("dashboard.recentActivity")}</h2>
                  <ul className={premium.actList}>
                    {recentActivity.map((act, i) => (
                      <li key={i} className={premium.act}>
                        <span className={premium.actIcon} aria-hidden>{act.icon}</span>
                        <span className={premium.actWho}>
                          <strong>{act.label}</strong>
                          <small>{act.relDate}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          </div>
        </HomeShell>
      </main>
    );
  }

  return (
    <main className={`${lp.page} ${premiumFontVars}`}>
      <BfcacheRefreshHandler />

      <div className={lp.wrap}>
        <div className={lp.heroBand}>
        {/* — Üst çubuk: onaylı logo (ana sayfaya döner) · bölüm bağlantıları · Giriş Yap · 3 gün deneme — */}
        <header className={lp.header}>
          <Link href="/" className={lp.brand}>
            {/* Owner onaylı logo olduğu gibi kullanılır (renk/şekil/kompozisyon değişmez); seramik plaka yalnız çerçevedir. */}
            <span className={lp.brandPlate}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={lp.brandLogo}
                src="/premium/brand/yasam-sistemi-logo.webp"
                width={600}
                height={501}
                alt={t("landingPremium.logoAlt")}
                decoding="async"
                draggable={false}
                data-testid="landing-brand-logo"
              />
            </span>
            {/* Logodaki alt yazı küçük ölçekte okunmadığı için okunur metin olarak yanında tekrarlanır (logo değişmez). */}
            <span className={lp.brandTagline} aria-hidden>
              {t("landingPremium.eyebrow")}
            </span>
          </Link>

          <nav className={lp.navLinks} aria-label={t("landingPremium.navAria")}>
            <a href="#calisma-alanlari" className={lp.navLink}>{t("landingPremium.navModules")}</a>
            <a href="#mobil" className={lp.navLink}>{t("landingPremium.navMobile")}</a>
            <a href="#guvenlik" className={lp.navLink}>{t("landingPremium.navSecurity")}</a>
          </nav>

          <div className={lp.headerActions}>
            {SHOW_LANDING_LANGUAGE_SELECTOR && <LanguageSelector compact />}
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setAuthModalView("login");
                setLoginModalOpen(true);
              }}
              className={lp.btnLogin}
            >
              {t("nav.login")}
            </button>
            <Link href="/register" className={lp.btnGoldSm}>
              <Gift className="h-4 w-4 shrink-0" aria-hidden />
              {t("landingPremium.trialCta")}
            </Link>
          </div>
        </header>

        {/* — 01 · Giriş: satış mesajı + laptop/telefon (gerçek ana panel temsili) + test hesabı şeridi — */}
        <section className={lp.hero} aria-labelledby="landing-hero-title">
          <div className={lp.heroText}>
            <p className={lp.eyebrow}>{t("landingPremium.heroEyebrow")}</p>
            <h1 id="landing-hero-title" className={lp.h1}>
              {t("hero.titlePart1")}{" "}
              <span className={lp.h1Hl}>
                {t("hero.titleHighlight")}
                {t("hero.titlePart2") ? <> {t("hero.titlePart2")}</> : null}
              </span>
            </h1>
            <p className={lp.heroSub}>{t("landingPremium.heroSub")}</p>

            <div className={lp.ctaRow}>
              {/* Ana çağrı: mevcut /register kayıt akışı (aktivasyon yönetici onayıyla). */}
              <Link href="/register" className={lp.btnPrimary}>
                <Sparkles className={`h-5 w-5 shrink-0 ${lp.goldIcon}`} aria-hidden />
                {t("landingPremium.trialCta")}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
              <a href="#test-hesabi" className={lp.btnGlass}>
                <Play className={`h-4 w-4 shrink-0 ${lp.playIcon}`} aria-hidden />
                {t("landingPremium.demoCta")}
              </a>
            </div>

            {/* Doğrulanmış koşullar: kayıtta ödeme adımı yok · hesap yönetici onayıyla açılır · 3 günlük keşif (yönetici yönetir). */}
            <ul className={lp.trustRow}>
              <li>
                <span className={lp.trustIcon} aria-hidden><CreditCard /></span>
                {t("landingPremium.trustNoCard")}
              </li>
              <li>
                <span className={lp.trustIcon} aria-hidden><ShieldCheck /></span>
                {t("landingPremium.trustApproval")}
              </li>
              <li>
                <span className={lp.trustIcon} aria-hidden><Gift /></span>
                {t("landingPremium.trustDays")}
              </li>
            </ul>

            <div className={lp.heroMeta}>
              <button
                type="button"
                onClick={() => {
                  document.getElementById("calisma-alanlari")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={lp.linkBtn}
              >
                {t("hero.discoverModules")}
              </button>
              {/* <lg: platform durumu çipi → #mobil bölümüne iner. */}
              <a href="#mobil" className={`${lp.chip} ${lp.chipMobileOnly}`}>
                <span className={lp.chipDot} aria-hidden />
                {t("mobile.platformsShort")}
              </a>
            </div>
          </div>

          <HeroScene />
        </section>
        </div>

        {/* Test hesabı: hero'nun parçası (01 · giriş ekranı ve test hesabı) */}
        <div className={lp.demoWrap} id="test-hesabi">
          <DemoAccessCard onTryDemo={openDemoLogin} />
        </div>

        {/* — 02 · 3 günlük ücretsiz keşif (hero çağrısıyla aynı teklif; mevcut /register akışı) — */}
        <section id="ucretsiz-deneme" className={lp.section}>
          <FreeTrialInvite />
        </section>

        {/* — 03 · Yaşam Sistemi İçinde Bir Danışan — owner onaylı Danışan Yolculuğu tanıtımı (temsili veri) — */}
        <section className={lp.section} aria-labelledby="landing-mockup-title">
          <div className={lp.clientHead}>
            <div className={lp.clientText}>
              <p className={lp.eyebrowLine}>{t("landingPremium.mockupTag")}</p>
              <h2 id="landing-mockup-title" className={lp.secTitle}>
                {t("mockup.heading")}
              </h2>
              <p className={lp.secSub}>{t("mockup.subtitle")}</p>
            </div>
            <ul className={`${lp.benefits} ${lp.benefitsRow}`}>
              {[
                { Icon: FileText, k: "client1" },
                { Icon: Layers, k: "client2" },
                { Icon: UserRound, k: "client3" },
              ].map(({ Icon, k }) => (
                <li key={k}>
                  <span className={lp.benefitIcon} aria-hidden><Icon /></span>
                  <span>
                    <strong>{t(`landingPremium.${k}Title`)}</strong>
                    <small>{t(`landingPremium.${k}Desc`)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className={lp.clientStage}>
            <ClientJourneyScreen />
            <p className={lp.mockNote}>
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("landingPremium.cjNote")}
            </p>
          </div>
        </section>

        {/* — 04 · Bilgileriniz farklı dosyalarda mı dağınık duruyor? (yalnız açıklayıcı görsel) — */}
        <section className={lp.section} aria-labelledby="landing-problem-title">
          <div className={lp.problem}>
            <div className={lp.secHeadCenter}>
              <h2 id="landing-problem-title" className={lp.secTitle}>
                {t("problem.heading")}
              </h2>
              <p className={lp.secSub}>{t("problem.desc")}</p>
            </div>
            <ScatterToHub />
            <ul className={lp.probList}>
              {[
                { Icon: FileText, k: "item1" },
                { Icon: Search, k: "item2" },
                { Icon: FolderOpen, k: "item3" },
                { Icon: CalendarDays, k: "item4" },
                { Icon: Gem, k: "item5" },
              ].map(({ Icon, k }) => (
                <li key={k} className={lp.probItem}>
                  <span className={lp.probIcon} aria-hidden><Icon /></span>
                  {t(`problem.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* — 05 · Çalışma Alanları: gerçek modül kartları (ad, açıklama, özellik, durum, örnek ekran, Modüle Git) — */}
        <section id="calisma-alanlari" className={lp.section} aria-labelledby="landing-workspaces-title">
          <div className={lp.modStage}>
          {/* Vitrin zemini: hero sahnesinin yumuşatılmış ışığı (dekoratif, statik) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={lp.modStageBg} src="/premium/landing/hero-sahne.webp" width={1672} height={941} alt="" aria-hidden loading="lazy" decoding="async" />
          <div className={lp.secHeadCenter}>
            <p className={lp.eyebrowCenter}>{t("landingPremium.modulesEyebrow")}</p>
            <h2 id="landing-workspaces-title" className={lp.secTitle}>
              {t("workspaces.heading")}
            </h2>
            <p className={lp.secSub}>{t("workspaces.subtitle")}</p>
          </div>

          <div className={lp.modGrid}>
            {landingModules.map((item) => {
              const theme = LANDING_MODULE_THEME[item.slug];
              if (!theme) return null;
              const badgeKey =
                theme.kind === "sampleAnalysis"
                  ? "landing.sampleAnalysisBadge"
                  : theme.kind === "sampleScreens"
                    ? "common.sampleScreensBadge"
                    : theme.kind === "active"
                      ? "landing.activeModuleBadge"
                      : null;
              const hasPreview = theme.kind === "sampleAnalysis" || theme.kind === "sampleScreens";
              return (
                <article
                  key={item.slug}
                  className={`${lp.modCard} ${theme.wide ? lp.modWide : ""}`}
                  style={{ "--acc": theme.acc } as React.CSSProperties}
                  data-landing-module={item.slug}
                  data-kind={theme.kind}
                >
                  {theme.wide ? (
                    <div className={lp.modScene} aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={theme.wide.scene} alt="" decoding="async" />
                    </div>
                  ) : null}
                  <div className={lp.modTop}>
                    {badgeKey ? <span className={lp.badge}>{t(badgeKey)}</span> : <span />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={lp.modArt} src={theme.art} alt="" aria-hidden loading="lazy" decoding="async" />
                  </div>

                  <h3 className={lp.modTitle}>{t(item.titleKey)}</h3>
                  <p className={`${lp.modDesc} ${theme.feats ? "" : lp.modGrow}`}>{t(item.descKey)}</p>

                  {theme.feats ? (
                    <ul className={`${lp.feats} ${lp.modGrow}`}>
                      {(t.raw(`feats.${item.slug}`) as string[]).map((feat) => (
                        <li key={feat} className={lp.feat}>
                          <Check className={lp.featIcon} strokeWidth={3} aria-hidden />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className={lp.modActions}>
                    {hasPreview ? (
                      <>
                        <button type="button" onClick={() => openLandingPreview(item.slug)} className={lp.btnOutline}>
                          {theme.kind === "sampleAnalysis" ? t("landing.seeSampleAnalysis") : t("common.seeSampleScreens")}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        </button>
                        <Link href={theme.href} className={lp.linkAcc}>
                          {t("common.moduleGo")}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        </Link>
                      </>
                    ) : (
                      <Link href={theme.href} className={lp.btnSolid}>
                        {t("common.moduleGo")}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          </div>
        </section>

        {/* — 06 · Mobil Uygulama (Android mevcut · iOS yakında) — */}
        <section id="mobil" className={lp.section} aria-labelledby="landing-mobile-title">
          <div className={lp.mobile}>
            <div className={lp.mobileText}>
              <p className={lp.eyebrowLine}>{t("landingPremium.mobileEyebrow")}</p>
              <h2 id="landing-mobile-title" className={lp.secTitle}>
                {t("mobile.heading1")} <span className={lp.h1Hl}>{t("mobile.heading2")}</span>
              </h2>
              <p className={lp.secSub}>{t("mobile.desc")}</p>

              <ul className={lp.benefits}>
                {[
                  { Icon: UsersRound, text: t("mobile.item1") },
                  { Icon: LayoutGrid, text: t("mobile.item2") },
                  { Icon: ShieldCheck, text: t("mobile.item3") },
                ].map(({ Icon, text }) => (
                  <li key={text}>
                    <span className={lp.benefitIcon} aria-hidden><Icon /></span>
                    <span><strong>{text}</strong></span>
                  </li>
                ))}
              </ul>

              <a href={GOOGLE_PLAY_APP_URL} target="_blank" rel="noopener noreferrer" className={lp.btnPrimary}>
                <Smartphone className="h-5 w-5 shrink-0" aria-hidden />
                {t("mobile.openApp")}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </a>

              {/* Platform kartları: Android mevcut (Play linki) · iOS yakında (tıklanamaz). */}
              <div className={lp.platforms}>
                <a href={GOOGLE_PLAY_APP_URL} target="_blank" rel="noopener noreferrer" className={lp.platOn}>
                  <Smartphone aria-hidden />
                  <span>
                    <small>{t("mobile.androidLabel")}</small>
                    <b>{t("mobile.statusAvailable")}</b>
                  </span>
                  <i aria-hidden />
                </a>
                <span role="link" aria-disabled="true" className={lp.platSoon}>
                  <Smartphone aria-hidden />
                  <span>
                    <small>{t("mobile.iosLabel")}</small>
                    <b>{t("mobile.statusSoon")}</b>
                  </span>
                  <i aria-hidden />
                </span>
              </div>
            </div>

            <MobilePhone />
          </div>
        </section>

        {/* — 07 · Beş özellik kartı (mevcut metinler) — */}
        <section className={lp.section}>
          <div className={lp.features}>
            {featureItems.map((item) => (
              <div key={item.slug} className={lp.featCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={lp.featArt} src={LANDING_FEATURE_ART[item.slug]} alt="" aria-hidden loading="lazy" decoding="async" />
                <h3 className={lp.featTitle}>{t(item.titleKey)}</h3>
                <span className={lp.featRule} aria-hidden />
                <p className={lp.featDesc}>{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* — 08 · Güvenlik ve Gizlilik (mevcut metinler; yeni/güçlendirilmiş iddia yok) — */}
        <section id="guvenlik" className={lp.section} aria-labelledby="trust-principles-heading">
          <div className={lp.trust}>
            <div className={lp.trustText}>
              <p className={lp.eyebrowLine}>{t("landingPremium.securityEyebrow")}</p>
              <h2 id="trust-principles-heading" className={lp.secTitle}>
                {t("landingPremium.securityTitle")}
              </h2>
              <p className={lp.trustLead}>{t("trust.heading")}</p>

              <ul className={lp.trustList}>
                {trustPrincipleKeys.map((key, i) => {
                  const Icon = [Lock, EyeOff, Settings, ShieldCheck][i] ?? ShieldCheck;
                  return (
                    <li key={key} className={lp.trustItem}>
                      <span className={lp.benefitIcon} aria-hidden><Icon /></span>
                      <span>{t(key)}</span>
                    </li>
                  );
                })}
              </ul>

              <p className={lp.trustQuote}>{t("trust.quote")}</p>
            </div>

            <div className={lp.shieldStage}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={lp.shieldImg} src="/premium/landing/kalkan-buyuk.webp" width={680} height={690} alt="" aria-hidden loading="lazy" decoding="async" />
              <p className={lp.shieldLabel}>{t("trust.shieldLabel")}</p>
              <p className={lp.shieldSub}>{t("trust.shieldSub")}</p>
            </div>
          </div>
        </section>

        {/* — 09 · Footer: yasal bağlantılar + çerez tercihleri — */}
        <footer className={lp.footer}>
          <div className={lp.footerBrand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={lp.footerLogo}
              src="/premium/brand/yasam-sistemi-logo.webp"
              width={600}
              height={501}
              alt=""
              aria-hidden
              decoding="async"
              loading="lazy"
            />
            <p className={lp.footerCopy}>{t("footer.copyright")}</p>
          </div>
          <nav className={lp.footerNav} aria-label={t("footer.nav")}>
            <Link href="/gizlilik-politikasi" className={lp.footerLink}>
              {t("footer.privacy")}
            </Link>
            <Link href="/kullanim-sartlari" className={lp.footerLink}>
              {t("footer.terms")}
            </Link>
            <Link href="/kvkk-aydinlatma" className={lp.footerLink}>
              {t("footer.kvkk")}
            </Link>
            <Link href="/veri-isleme-sozlesmesi" className={lp.footerLink}>
              {t("footer.dpa")}
            </Link>
            <Link href="/alt-isleyiciler" className={lp.footerLink}>
              {t("footer.subprocessors")}
            </Link>
            <Link href="/iletisim" className={lp.footerLink}>
              {t("footer.contact")}
            </Link>
          </nav>
          {/* Çerez tercihleri: onay bandını yeniden açar (GA yalnız onayla yüklenir). */}
          <CookiePreferencesButton className={lp.cookieBtn} />
        </footer>
      </div>

      {numerologiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setNumerologiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.numeroloji.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setNumerologiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>
            {/* Modal header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                {t("preview.numeroloji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.numeroloji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">{t("preview.numeroloji.subtitle")}</p>
            </div>
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/numeroloji-preview.png"
                alt={t("preview.numeroloji.alt")}
                className="w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {dogaltasPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setDogaltasPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.dogaltas.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDogaltasPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">
                {t("preview.dogaltas.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.dogaltas.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.dogaltas.subtitle")}
              </p>
            </div>

            {/* Preview image */}
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/dogaltas-preview.png"
                alt={t("preview.dogaltas.alt")}
                className="w-full rounded-xl"
              />
            </div>

            {/* Description + feature badges */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.dogaltas.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.dogaltas.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(t.raw("feats.dogaltas") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {kisiselArsivPreviewOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setKisiselArsivPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.kisiselArsiv.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setKisiselArsivPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                {t("preview.kisiselArsiv.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.kisiselArsiv.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.kisiselArsiv.subtitle")}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/kisisel-arsiv-preview.png"
                alt={t("preview.kisiselArsiv.alt")}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.kisiselArsiv.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.kisiselArsiv.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.kisiselArsiv") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-amber-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {danisanYonetimiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setDanisanYonetimiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.danisanYonetimi.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDanisanYonetimiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-300">
                {t("preview.danisanYonetimi.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.danisanYonetimi.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.danisanYonetimi.subtitle")}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-indigo-300">
                  {t(danisanYonetimiGallerySlides[danisanYonetimiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {danisanYonetimiSlide + 1} / {danisanYonetimiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s - 1 + danisanYonetimiGallerySlides.length) % danisanYonetimiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s + 1) % danisanYonetimiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <div className="relative">
                <img
                  key={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  src={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  alt={t("preview.danisanYonetimi.altPrefix") + t(danisanYonetimiGallerySlides[danisanYonetimiSlide].label)}
                  className="w-full"
                />
                {danisanYonetimiGallerySlides[danisanYonetimiSlide].cover && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent px-5 py-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">
                      {t("preview.danisanYonetimi.coverBadge")}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-white">
                      {t("preview.danisanYonetimi.coverTitle")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {danisanYonetimiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setDanisanYonetimiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === danisanYonetimiSlide ? "h-1.5 w-5 bg-indigo-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.danisanYonetimi.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.danisanYonetimi.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.danisanYonetimi") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-indigo-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {sifaRehberiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setSifaRehberiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.sifaRehberi.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSifaRehberiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
                {t("preview.sifaRehberi.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.sifaRehberi.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.sifaRehberi.subtitle")}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-emerald-300">
                  {t(sifaRehberiGallerySlides[sifaRehberiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {sifaRehberiSlide + 1} / {sifaRehberiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s - 1 + sifaRehberiGallerySlides.length) % sifaRehberiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s + 1) % sifaRehberiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <img
                key={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                src={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                alt={t("preview.sifaRehberi.altPrefix") + t(sifaRehberiGallerySlides[sifaRehberiSlide].label)}
                className="w-full"
              />
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {sifaRehberiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setSifaRehberiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === sifaRehberiSlide ? "h-1.5 w-5 bg-emerald-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.sifaRehberi.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.sifaRehberi.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.sifaRehberi") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {refleksolojiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setRefleksolojiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.refleksoloji.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kapat */}
            <button
              type="button"
              onClick={() => setRefleksolojiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
                {t("preview.refleksoloji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.refleksoloji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.refleksoloji.subtitle")}
              </p>
            </div>

            {/* Galeri */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide etiketi */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-violet-300">
                  {t(refleksolojiGallerySlides[refleksolojiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {refleksolojiSlide + 1} / {refleksolojiGallerySlides.length}
                </span>
              </div>

              {/* Önceki */}
              <button
                type="button"
                onClick={() => setRefleksolojiSlide((s) => (s - 1 + refleksolojiGallerySlides.length) % refleksolojiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-violet-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>

              {/* Sonraki */}
              <button
                type="button"
                onClick={() => setRefleksolojiSlide((s) => (s + 1) % refleksolojiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-violet-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              {/* Görsel */}
              <img
                key={refleksolojiGallerySlides[refleksolojiSlide].src}
                src={refleksolojiGallerySlides[refleksolojiSlide].src}
                alt={t("preview.refleksoloji.altPrefix") + t(refleksolojiGallerySlides[refleksolojiSlide].label)}
                className="w-full"
              />
            </div>

            {/* Nokta göstergeler */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {refleksolojiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setRefleksolojiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === refleksolojiSlide ? "h-1.5 w-5 bg-violet-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            {/* Özellik paneli */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.refleksoloji.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.refleksoloji.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.refleksoloji") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-violet-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {biyoenerjiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/82 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setBiyoenerjiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.biyoenerji.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setBiyoenerjiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                {t("preview.biyoenerji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.biyoenerji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.biyoenerji.subtitle")}
              </p>
            </div>

            {/* Gallery */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide label + counter */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-cyan-300">
                  {t(biyoenerjiGallerySlides[biyoenerjiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {biyoenerjiSlide + 1}&thinsp;/&thinsp;{biyoenerjiGallerySlides.length}
                </span>
              </div>

              {/* Prev */}
              <button
                type="button"
                onClick={() => setBiyoenerjiSlide(s => (s - 1 + biyoenerjiGallerySlides.length) % biyoenerjiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white hover:bg-slate-800/80"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => setBiyoenerjiSlide(s => (s + 1) % biyoenerjiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white hover:bg-slate-800/80"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <img
                key={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                src={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                alt={t("preview.biyoenerji.altPrefix") + t(biyoenerjiGallerySlides[biyoenerjiSlide].label)}
                className="w-full"
              />
            </div>

            {/* Dot indicators */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {biyoenerjiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setBiyoenerjiSlide(idx)}
                  className={`rounded-full transition-all duration-200 ${idx === biyoenerjiSlide ? "h-1.5 w-5 bg-cyan-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400"}`}
                  aria-label={t(slide.label)}
                  aria-current={idx === biyoenerjiSlide ? "true" : undefined}
                />
              ))}
            </div>

            {/* Feature panel */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.biyoenerji.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.biyoenerji.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.biyoenerji") as string[]).map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-cyan-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loginModalOpen && (
        <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
            aria-hidden
            onMouseDown={handleLoginBackdropMouseDown}
            onMouseUp={handleLoginBackdropMouseUp}
            onMouseLeave={handleLoginBackdropMouseLeave}
          />
          <div
            ref={loginModalRef}
            className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[26px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_72px_rgba(15,23,42,0.26)] backdrop-blur-2xl sm:p-7 md:max-w-[520px] md:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            onClick={handleLoginModalPointerEvent}
            onMouseDown={handleLoginModalPointerEvent}
            onMouseUp={handleLoginModalPointerEvent}
          >
            <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[180px] w-[180px] rounded-full bg-violet-200/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] h-[180px] w-[180px] rounded-full bg-cyan-200/50 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                  {authModalView === "support"
                    ? "Şifre Desteği"
                    : authModalView === "membership" ||
                        authModalView === "membershipOptions"
                      ? "Üyelik İletişimi"
                      : t("login.badge")}
                </div>

                <h3
                  id="login-modal-title"
                  className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl"
                >
                  {authModalView === "support"
                    ? "Giriş Sorunu Bildir"
                    : authModalView === "membership" ||
                        authModalView === "membershipOptions"
                      ? "Üyelik ve Fiyat Bilgisi"
                      : t("login.title")}
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  {authModalView === "support"
                    ? "Giriş yapamıyorsanız yöneticimize doğrudan mesaj bırakın; en kısa sürede size dönüş yapılır."
                    : authModalView === "membershipOptions"
                      ? "Size en uygun iletişim yöntemini seçin; en kısa sürede dönüş yapalım."
                      : authModalView === "membership"
                        ? "Üyelik seçenekleri ve fiyatlandırma hakkında yöneticimize mesaj bırakabilirsiniz."
                        : t("login.subtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={closeLoginModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-black text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            {authModalView === "support" ? (
              <SupportRequestForm
                mode="password_support"
                onBack={() => {
                  setMessage("");
                  setAuthModalView("login");
                }}
              />
            ) : authModalView === "membershipOptions" ? (
              <MembershipOptionsPanel
                onManagerMessage={() => {
                  setMessage("");
                  setAuthModalView("membership");
                }}
                onBack={() => {
                  setMessage("");
                  setAuthModalView("login");
                }}
              />
            ) : authModalView === "membership" ? (
              <SupportRequestForm
                mode="membership_contact"
                // Formdan geri → doğrudan 3 seçenekli iletişim paneli (login'e
                // dönüp CTA'yı tekrar açmaya gerek yok; dolaşma/loop kalkar).
                onBack={() => {
                  setMessage("");
                  setAuthModalView("membershipOptions");
                }}
              />
            ) : (
              <>
            {!pendingLogin && (
            <>
            <div className="relative z-10 mt-5 space-y-3.5">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {t("login.emailLabel")}
                </label>

                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {t("login.passwordLabel")}
                </label>

                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />

                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setAuthModalView("support");
                    }}
                    className="rounded bg-transparent p-0 text-[13px] font-semibold tracking-wide text-violet-700 no-underline underline-offset-2 transition hover:text-violet-900 hover:underline focus-visible:text-violet-900 focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                  >
                    {t("login.forgot")}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="relative z-10 mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
            </>
            )}

            {pendingLogin && (
              <div
                role="status"
                aria-live="polite"
                className="relative z-10 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
              >
                <p>{t("auth.pendingApproval")}</p>
                <button
                  type="button"
                  onClick={() => {
                    const tok = pendingLogin.token;
                    setPendingLogin(null);
                    void cancelPendingLogin(tok);
                  }}
                  className="mt-2 text-xs font-bold text-amber-800 underline underline-offset-2"
                >
                  {t("auth.pendingCancel")}
                </button>
              </div>
            )}

            {message && (
              <div className="relative z-10 mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {message}
              </div>
            )}

            <div className="relative z-10 mt-6 border-t border-slate-200/70 pt-5">
              <p className="text-center text-[15px] font-semibold text-slate-700">
                Henüz Yaşam Sistemi üyesi değil misiniz?
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setAuthModalView("membershipOptions");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(109,40,217,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(109,40,217,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                >
                  Üyelik ve Fiyat Bilgisi Al
                </button>
              </div>
              <div className="mt-4 text-center">
                <Link
                  href="/register"
                  onClick={closeLoginModal}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 no-underline transition hover:text-violet-800 hover:underline focus-visible:text-violet-800 focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                >
                  Üyelik sürecimi tamamla
                </Link>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Satış ana sayfası — modül kartı, özellik kartı ve dekor görsel teması (yalnız sunum).
 * Modül listesi, sırası, adları ve bağlantı hedefleri app/page.tsx `landingModules` + i18n'den gelir;
 * burada yalnız vurgu rengi, ikon ve mevcut kart davranış türü eşlenir (href'ler önceki landing ile birebir).
 */
import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  Brain,
  CalendarDays,
  ChartLine,
  ClipboardList,
  DatabaseBackup,
  Droplets,
  FileText,
  Flower2,
  FolderArchive,
  Footprints,
  Gem,
  Hash,
  Hexagon,
  Leaf,
  MonitorSmartphone,
  Moon,
  Package,
  Salad,
  ShieldCheck,
  StickyNote,
  UsersRound,
  Zap,
} from "lucide-react";

/**
 * sampleAnalysis → "Örnek Analiz Var" rozeti + örnek analiz önizlemesi + Modüle Git bağlantısı
 * sampleScreens  → "Örnek Ekranlar Var" rozeti + örnek ekran galerisi + Modüle Git bağlantısı
 * active         → "Aktif Modül" rozeti + Modüle Git
 * plain          → rozetsiz + Modüle Git (Human Design kartı önceki landing'de rozetsizdi)
 */
export type LandingCardKind = "sampleAnalysis" | "sampleScreens" | "active" | "plain";

export type LandingModuleTheme = {
  acc: string;
  Icon: LucideIcon;
  href: string;
  kind: LandingCardKind;
  /** i18n `feats.<slug>` listesi önceki kartta gösteriliyorsa true. */
  feats: boolean;
};

export const LANDING_MODULE_THEME: Record<string, LandingModuleTheme> = {
  danisanYonetimi: { acc: "#5b54c4", Icon: UsersRound, href: "/danisan-yolculugu", kind: "sampleScreens", feats: true },
  dogaltas: { acc: "#1f9a7a", Icon: Gem, href: "/dogaltas", kind: "sampleScreens", feats: false },
  urunStok: { acc: "#c9811a", Icon: Package, href: "/urun-stok", kind: "active", feats: true },
  biyoenerji: { acc: "#1d8fc4", Icon: Zap, href: "/enerji-beden", kind: "sampleScreens", feats: true },
  refleksoloji: { acc: "#c8507f", Icon: Footprints, href: "/refleksoloji", kind: "sampleScreens", feats: true },
  kupaHacamat: { acc: "#c94a57", Icon: Droplets, href: "/kupa", kind: "active", feats: true },
  aromaterapi: { acc: "#a552b8", Icon: Flower2, href: "/aromaterapi", kind: "active", feats: false },
  sifaRehberi: { acc: "#3d9447", Icon: Leaf, href: "/sifa-rehberi", kind: "sampleScreens", feats: true },
  beslenme: { acc: "#6f9a22", Icon: Salad, href: "/beslenme", kind: "active", feats: true },
  numeroloji: { acc: "#4a63d0", Icon: Hash, href: "/numeroloji", kind: "sampleAnalysis", feats: false },
  kisiselArsiv: { acc: "#b8862b", Icon: FolderArchive, href: "/dashboard/kisisel-arsiv", kind: "sampleScreens", feats: true },
  humanDesign: { acc: "#7e4fc8", Icon: Hexagon, href: "/human-design", kind: "plain", feats: true },
  kozmikAjanda: { acc: "#1f6f86", Icon: Moon, href: "/cosmic-calendar", kind: "active", feats: true },
};

/** 07 · beş özellik kartı (featureItems slug → ikon/vurgu). */
export const LANDING_FEATURE_THEME: Record<string, { acc: string; Icon: LucideIcon }> = {
  guvenli: { acc: "#1f6b4a", Icon: ShieldCheck },
  analiz: { acc: "#1f5f6b", Icon: ChartLine },
  webMobil: { acc: "#5b54c4", Icon: MonitorSmartphone },
  yedekleme: { acc: "#b8862b", Icon: DatabaseBackup },
  moduler: { acc: "#3d9447", Icon: Blocks },
};

/** 04 · dağınık dosya karoları (yalnız dekoratif anlatım; dosya aktarımı vaadi yok). */
export const LANDING_PROBLEM_FILES: { acc: string; Icon: LucideIcon; tilt: string }[] = [
  { acc: "#2f5fb8", Icon: FileText, tilt: "-6deg" },
  { acc: "#c94a57", Icon: FileText, tilt: "4deg" },
  { acc: "#b8862b", Icon: StickyNote, tilt: "-3deg" },
  { acc: "#1f5f6b", Icon: CalendarDays, tilt: "5deg" },
  { acc: "#3d9447", Icon: ClipboardList, tilt: "-4deg" },
];

/** 06 · telefon görseli: giriş sonrası ana paneldeki gerçek merkezler (home.modules.<key>.title). */
export const LANDING_PHONE_CENTERS: { key: string; acc: string; Icon: LucideIcon }[] = [
  { key: "clients", acc: "#5b54c4", Icon: UsersRound },
  { key: "numerology", acc: "#4a63d0", Icon: Brain },
  { key: "energy_body", acc: "#1d8fc4", Icon: Zap },
  { key: "sifa_rehberi", acc: "#3d9447", Icon: Leaf },
  { key: "stok", acc: "#c9811a", Icon: Package },
  { key: "digital_content", acc: "#b8862b", Icon: FolderArchive },
];

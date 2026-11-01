"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — kişisel ana sayfa kök öğesi yardımcıları.
 *
 * `personalRootProps` YALNIZ kişiselleştirme açıkken (pw.status === "on") ana sayfanın <main> öğesine yayılır.
 * Kapalıyken hiçbir sınıf / data-* / stil eklenmez → ana sayfa bugünkü hâliyle birebir aynı kalır.
 * İç modül sayfaları bu kökü taşımaz; bütün kişisel stiller (personal.module.css) bu köke bağlıdır.
 *
 * `filterHiddenCards` yalnız SUNUM filtresidir: yetki / kilit / abonelik kararına girmez, kilidi açmaz.
 */
import { useSyncExternalStore, type CSSProperties } from "react";
import { WORKSPACE_CENTERS } from "@/lib/workspace/catalog";
import type { HomeView } from "@/lib/workspace/homeView";
import { UUID_RE, type UiPrefs, type WorkspaceDesign } from "@/lib/workspace/schema";
import { readPrefersDark, readingVars, resolveViewMode, subscribePrefersDark, type EffectiveViewMode } from "@/lib/workspace/viewMode";
import type { ModuleCard } from "../homeCenters";
import styles from "./personal.module.css";

const DARK_THEMES = new Set(["gece", "murdum"]);

/** Tasarımdan türetilen sunum gerçekleri (prototip office.js: effectiveTone / photoScope / usesPageBg ile aynı kurallar). */
export type PwFacts = {
  layout: WorkspaceDesign["layout"];
  bgMode: WorkspaceDesign["bg"]["mode"];
  theme: WorkspaceDesign["bg"]["theme"];
  /** Varsayılan canlı görünümden farklı zemin (tema ≠ manzara veya fotoğraf). */
  custom: boolean;
  hasPhoto: boolean;
  /** Fotoğrafın kullanım alanı; fotoğraf yoksa null. Seçilmemişse A/C → hero, B → page. */
  photoScope: "hero" | "page" | null;
  /** Zemin tüm sayfada mı (B teması veya "Tüm ana sayfa" fotoğrafı). */
  page: boolean;
  /** Fotoğraf tüm sayfada (tam yükseklik, maskesiz). */
  photoPage: boolean;
  tone: "light" | "dark";
  shade: "fromLeft" | "fromRight" | "fromCenter";
  branded: boolean;
  attach: WorkspaceDesign["bg"]["pageAttach"];
  cards: WorkspaceDesign["bg"]["pageCards"];
};

type FactInput = {
  layout: WorkspaceDesign["layout"];
  bg: Pick<WorkspaceDesign["bg"], "mode" | "theme" | "tone" | "scope" | "pageAttach" | "pageCards">;
  align: WorkspaceDesign["text"]["align"];
  brand: WorkspaceDesign["brand"];
  hasPhoto: boolean;
};

function facts(i: FactInput): PwFacts {
  const b = i.bg;
  const hasPhoto = b.mode === "photo" && i.hasPhoto;
  const themeUsable = b.mode === "theme" && !(b.theme === "marka" && !i.brand);
  const custom = hasPhoto || (themeUsable && b.theme !== "manzara");
  const photoScope = hasPhoto ? b.scope ?? (i.layout === "B" ? "page" : "hero") : null;
  const page = photoScope ? photoScope === "page" : i.layout === "B" && custom;
  const tone: PwFacts["tone"] = hasPhoto ? b.tone : themeUsable && DARK_THEMES.has(b.theme) ? "dark" : "light";
  return {
    layout: i.layout,
    bgMode: b.mode,
    theme: b.theme,
    custom,
    hasPhoto,
    photoScope,
    page,
    photoPage: page && photoScope === "page",
    tone,
    shade: i.align === "right" ? "fromRight" : i.align === "center" ? "fromCenter" : "fromLeft",
    branded: i.brand !== null,
    attach: b.pageAttach,
    cards: b.pageCards,
  };
}

/** Tasarım (taslak / uygulanan) → sunum gerçekleri. */
export function designFacts(d: WorkspaceDesign): PwFacts {
  return facts({ layout: d.layout, bg: d.bg, align: d.text.align, brand: d.brand, hasPhoto: typeof d.bg.photoAssetId === "string" && UUID_RE.test(d.bg.photoAssetId) });
}

/** Ana sayfa görünüm nesnesi → sunum gerçekleri (kişiselleştirilmemişse null). */
export function viewFacts(v: HomeView): PwFacts | null {
  if (!v.personalized || !v.layout || !v.background || !v.hero) return null;
  return facts({ layout: v.layout, bg: v.background, align: v.hero.align, brand: v.brand, hasPhoto: v.background.photo !== null });
}

type Focus = { x: number; y: number };
/** Fotoğraf odak / yakınlaştırma / katman değişkenleri (hero ve sayfa katmanı aynı değerleri kullanır). */
export function photoVars(bg: { focus: Focus; mobileFocus: Focus; separateMobile: boolean; zoom: number; overlay: number; pageOverlay: number | null; pageBlur: number }): Record<string, string> {
  const fm = bg.separateMobile ? bg.mobileFocus : bg.focus;
  const n = (v: number, d: number) => (Number.isFinite(v) ? v : d);
  return {
    "--pw-fx": `${n(bg.focus.x, 50)}%`,
    "--pw-fy": `${n(bg.focus.y, 50)}%`,
    "--pw-mfx": `${n(fm.x, 50)}%`,
    "--pw-mfy": `${n(fm.y, 50)}%`,
    "--pw-zoom": String(n(bg.zoom, 1)),
    "--pw-ov": String(n(bg.overlay, 0.45)),
    "--pw-pov": String(n(bg.pageOverlay ?? bg.overlay, 0.45)),
    "--pw-pblur": `${n(bg.pageBlur, 0)}px`,
  };
}

/** Marka paleti değişkenleri (yalnız uzman alanı; sol menü ve Yaşam Sistemi logosu bunları kullanmaz). */
export function brandVars(brand: WorkspaceDesign["brand"]): Record<string, string> {
  if (!brand) return {};
  return { "--pw-b-accent": brand.accent, "--pw-b-soft": brand.soft, "--pw-b-ink": brand.ink, "--pw-b-accent2": brand.accent2 };
}

export type PersonalRootProps = {
  className: string;
  style: CSSProperties;
} & { [K in `data-pw-${string}`]?: string };

/**
 * <main> kök öğesine yayılacak sınıf + CSS değişkenleri + data-* (görünüm modu, düzen, ton, zemin kapsamı...).
 * Kişiselleştirilmemiş görünümde (view.personalized=false) bile görünüm modu / okuma / Favorilerim çalışır; tasarım
 * değerleri varsayılan A düzeniyle aynı kalır.
 */
export function personalRootProps(view: HomeView, prefs: UiPrefs, prefersDark: boolean): PersonalRootProps {
  const mode: EffectiveViewMode = resolveViewMode(prefs.viewMode, prefersDark);
  const f = viewFacts(view);
  const style: Record<string, string> = { ...readingVars(prefs.reading), ...brandVars(view.brand) };
  if (view.background) Object.assign(style, photoVars(view.background));
  const props: PersonalRootProps = {
    className: styles.pw,
    style: style as CSSProperties,
    "data-pw-mode": mode,
    "data-pw-choice": prefs.viewMode,
    "data-pw-layout": f?.layout ?? "A",
    "data-pw-tone": f?.tone ?? "light",
    "data-pw-bg": f?.bgMode ?? "default",
    "data-pw-shade": f?.shade ?? "fromLeft",
  };
  if (f?.custom) props["data-pw-custom"] = "1";
  if (f?.branded) props["data-pw-branded"] = "1";
  if (f?.page) {
    props["data-pw-page"] = "1";
    props["data-pw-cards"] = f.cards;
  }
  if (f?.photoPage) {
    props["data-pw-photopage"] = "1";
    props["data-pw-attach"] = f.attach;
  }
  return props;
}

/** Cihazın koyu tercihi (Otomatik görünüm modu için); SSR'de false. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribePrefersDark, readPrefersDark, () => false);
}

/**
 * Gizlenen merkezleri ana sayfa ızgarasından çıkarır (yalnız görünüm). Merkez "center:<anahtar>" ile gizlenmişse ya da
 * kataloğa göre bütün alt modülleri "module:<anahtar>" ile gizlenmişse kart gösterilmez. Katalog dışı kart DOKUNULMADAN
 * kalır. Kilit / yetki / sıra değişmez.
 */
export function filterHiddenCards<T extends Pick<ModuleCard, "permissionKey">>(cards: readonly T[], prefs: Pick<UiPrefs, "hiddenModules">): T[] {
  const hidden = new Set(prefs.hiddenModules);
  return cards.filter((c) => {
    const key = String(c.permissionKey);
    if (hidden.has(`center:${key}`)) return false;
    const center = WORKSPACE_CENTERS.find((w) => w.key === key);
    if (center && center.modules.every((m) => hidden.has(`module:${m}`))) return false;
    return true;
  });
}

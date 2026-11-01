"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronRight, FileText, Flower2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { runInEffect } from "@/lib/runInEffect";
import { formatDate } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { fetchCombinationsCount, fetchCombinationsViaApi, type CombinationApiRow } from "@/lib/dogaltas/combinationsApi";
import { STONES_WORKSPACE_UNAVAILABLE } from "@/lib/dogaltas/sessionError";
import { fetchStonesListCount } from "@/lib/dogaltas/stonesListFetch";
import { fetchMineralsListCount, fetchMineralsListPage, type MineralListItem } from "@/lib/dogaltas/mineralsListFetch";
import { dogaltasApiGet } from "@/lib/dogaltas/dogaltasApi";
import { fetchStonesByConditions } from "@/lib/dogaltas/conditionSearchApi";
import { normalizeTrSearch } from "@/lib/dogaltas/searchHighlight";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
import { DOGALTAS_PRIMARY_MODULES, type DogaltasModule } from "@/lib/dogaltas/dogaltasModules";
import { useStoneLibraryAccess } from "./StoneLibraryAccess";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { reportErrorKind } from "@/lib/dogaltas/reportErrorKind";
import { browserSessionStorage, markChecked, readCheckedIds, searchContextKey } from "@/lib/search/searchChecked";
import { SearchCheckedBadge, SEARCH_CHECKED_CARD_ACCENT } from "@/components/search/SearchCheckedBadge";
import styles from "./dogaltasHub.module.css";

/** WT8: eski bağlamsız, hiç silinmeyen localStorage "Bakıldı" listesi — yalnız temizlik için. */
const LEGACY_VIEWED_STORAGE_KEY = "yasam-dogaltas-viewed-search-results";

type StoneSearchRecord = {
  id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  chakras: string[] | null;
  assignments: Record<string, unknown> | null;
};

type StoneSearchFieldHit = {
  label: string;
  text: string;
};

type StoneSearchResult = {
  id: string;
  stone_name: string;
  short_description: string;
  matchedField: string;
  snippet: string;
  /** M05: kayıt türü (taş sonuçlarında yok → "stone"). */
  kind?: HubSearchKind;
  /** M05: mineral / kombinasyon sonucunun mevcut detay ekranı. */
  href?: string;
};

/** M05 (owner 30.10): ana arama Doğaltaşlar + Mineraller + Kombinasyonlar kayıtlarını kapsar. */
type HubSearchKind = "stone" | "mineral" | "combination" | "knowledge";

/** Tür rozeti etiketi = mevcut modül kartı başlığı (stones.modules; yeni metin yok). */
const HUB_KIND_MODULE_SLUG: Record<HubSearchKind, string> = {
  stone: "dogaltas-listesi",
  mineral: "mineral-listesi",
  combination: "kombinasyonlar",
  knowledge: "tas-bilgi-kutuphanesi",
};

/** Taş aramasıyla aynı üst sınır (P2-07 cappedNote "ilk 500"). Mineral ucu sayfa başına en çok 100 döner. */
const HUB_SEARCH_CAP = 500;
const HUB_MINERAL_PAGE = 100;

/**
 * Mineraller — Mineraller listesinin kullandığı aynı sunucu araması (`/api/dogaltas/minerals?q=`;
 * tenant oturumdan, ad/açıklama/kategori/kaynak). Sayfalı, en çok HUB_SEARCH_CAP satır.
 */
async function searchHubMinerals(query: string): Promise<{ rows: MineralListItem[]; error: string | null; capped: boolean }> {
  const rows: MineralListItem[] = [];
  while (rows.length < HUB_SEARCH_CAP) {
    const r = await fetchMineralsListPage("", { search: query, offset: rows.length, limit: HUB_MINERAL_PAGE });
    if (r.error) return { rows, error: r.error, capped: false };
    rows.push(...r.rows);
    if (r.rows.length < HUB_MINERAL_PAGE) return { rows, error: null, capped: false };
  }
  return { rows: rows.slice(0, HUB_SEARCH_CAP), error: null, capped: true };
}

function mineralHubResults(rows: MineralListItem[], query: string, t: HubLabelResolver): StoneSearchResult[] {
  return rows
    .filter((m) => m.id)
    .map((m) => {
      const hitText = [m.name, m.aciklama ?? "", m.kategori ?? ""].find((x) =>
        normalizeTrSearch(x).includes(normalizeTrSearch(query)),
      );
      return {
        id: m.id,
        stone_name: m.name?.trim() || "—",
        short_description: m.aciklama?.trim() || t("results.noDescription"),
        matchedField: "",
        snippet: hitText ? extractSnippet(hitText, query) : "",
        kind: "mineral" as const,
        href: `/dogaltas/mineral-listesi/${encodeURIComponent(m.id)}?q=${encodeURIComponent(query)}`,
      };
    })
    .sort((a, b) => a.stone_name.localeCompare(b.stone_name, "tr-TR"));
}

/** Kombinasyonlar listesindeki eşleşme ile aynı: satırın tüm metin alanları (Türkçe normalize). */
function combinationRowText(row: CombinationApiRow): string {
  const parts: string[] = [String(row.variant_index ?? "")];
  for (const value of Object.values(row as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) parts.push(value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === "string" && item.trim()) parts.push(item);
  }
  return parts.filter(Boolean).join(" ");
}

/** Kombinasyon detayı başlık (issue) bazlıdır → başlık başına tek sonuç; adres Kombinasyonlar listesiyle aynı. */
function combinationHubResults(rows: CombinationApiRow[], query: string, t: HubLabelResolver): StoneSearchResult[] {
  const qNorm = normalizeTrSearch(query.trim());
  if (!qNorm) return [];
  const byIssue = new Map<string, StoneSearchResult>();
  for (const row of rows) {
    const issue = row.issue?.trim();
    if (!issue || byIssue.has(issue)) continue;
    const text = combinationRowText(row);
    if (!normalizeTrSearch(text).includes(qNorm)) continue;
    const hitText = [row.issue, row.description, row.stones_text, row.notes_text, row.notes_text_2, row.notes_text_3, row.source]
      .find((x) => typeof x === "string" && normalizeTrSearch(x).includes(qNorm));
    byIssue.set(issue, {
      id: row.id,
      stone_name: issue,
      short_description: row.description?.trim() || t("results.noDescription"),
      matchedField: "",
      snippet: hitText ? extractSnippet(hitText, query) : "",
      kind: "combination",
      href: `/dogaltas/kombinasyonlar/${encodeURIComponent(issue)}?q=${encodeURIComponent(query)}`,
    });
  }
  return [...byIssue.values()].sort((a, b) => a.stone_name.localeCompare(b.stone_name, "tr-TR"));
}

/**
 * G2-01 (owner): Mineral BÖLÜM metinleri yalnız ana aramada. Mineral Listesi araması (çekirdek alanlar) aynen;
 * burada mevcut `?mode=all` ucu (tenant oturumdan) okunur ve yalnız bölüm metninde eşleşen, çekirdek
 * sonuçlarda OLMAYAN mineraller eklenir.
 */
const MINERAL_SECTION_COLUMNS = [
  "fiziksel", "zihinsel", "fizyoloji", "eksiklik_belirtileri", "fazlalik_belirtileri",
  "doz_asimi", "iceren_taslar", "organ_etkileri", "cakralar",
] as const;

function mineralSectionText(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(" ");
  return typeof value === "string" ? value : "";
}

function mineralSectionHubResults(
  rows: Record<string, unknown>[],
  query: string,
  coreIds: ReadonlySet<string>,
  t: HubLabelResolver,
): StoneSearchResult[] {
  const qNorm = normalizeTrSearch(query.trim());
  if (!qNorm) return [];
  const out: StoneSearchResult[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id || coreIds.has(id)) continue;
    const hitText = MINERAL_SECTION_COLUMNS.map((c) => mineralSectionText(row[c]))
      .find((x) => x && normalizeTrSearch(x).includes(qNorm));
    if (!hitText) continue;
    const name = typeof row.name === "string" ? row.name : "";
    const aciklama = typeof row.aciklama === "string" ? row.aciklama : "";
    out.push({
      id,
      stone_name: name.trim() || "—",
      short_description: aciklama.trim() || t("results.noDescription"),
      matchedField: "",
      snippet: extractSnippet(hitText, query),
      kind: "mineral",
      href: `/dogaltas/mineral-listesi/${encodeURIComponent(id)}?q=${encodeURIComponent(query)}`,
    });
  }
  return out;
}

/** G2-01 (owner): Taş Makaleleri — ekranın kendi kuralı: her kelime, makalenin tüm metin alanlarında (Türkçe normalize). */
type HubKnowledgeArticle = {
  id: string; title: string; content: string | null; category: string | null; sub_category: string | null;
  source: string | null; source_section: string | null; keyword: string | null; notes: string | null;
  tags: string[] | null; related_stones: string[] | null; related_minerals: string[] | null;
};

function knowledgeHubResults(articles: HubKnowledgeArticle[], query: string, t: HubLabelResolver): StoneSearchResult[] {
  const terms = query.trim().split(/\s+/).map((x) => normalizeTr(x)).filter(Boolean);
  if (!terms.length) return [];
  const out: StoneSearchResult[] = [];
  for (const a of articles) {
    if (!a?.id) continue;
    const fields = [
      a.title, a.content, a.category, a.sub_category, a.source, a.source_section, a.keyword, a.notes,
      ...(a.tags ?? []), ...(a.related_stones ?? []), ...(a.related_minerals ?? []),
    ].map((f) => (typeof f === "string" ? f : ""));
    const allText = normalizeTr(fields.join(" "));
    if (!terms.every((term) => allText.includes(term))) continue;
    const hitText = fields.find((f) => f && normalizeTr(f).includes(terms[0]!));
    out.push({
      id: a.id,
      stone_name: a.title?.trim() || "—",
      short_description: a.content?.trim() || t("results.noDescription"),
      matchedField: "",
      snippet: hitText ? extractSnippet(hitText, query) : "",
      kind: "knowledge",
      href: `/dogaltas/tas-bilgi-kutuphanesi?q=${encodeURIComponent(query)}&makale=${encodeURIComponent(a.id)}`,
    });
  }
  return out.sort((x, y) => x.stone_name.localeCompare(y.stone_name, "tr-TR"));
}


function assignmentsToSearchText(assignments: Record<string, unknown> | null): string {
  if (!assignments || typeof assignments !== "object") return "";

  const parts: string[] = [];
  for (const value of Object.values(assignments)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (Array.isArray(row)) {
          parts.push(row.map((cell) => String(cell ?? "")).join(" "));
        } else if (typeof row === "string") {
          parts.push(row);
        }
      }
    } else if (typeof value === "string") {
      parts.push(value);
    }
  }
  return parts.filter(Boolean).join(" ");
}

/** Görünen alan etiketi çözümleyicisi (i18n `stones.hub` grubu). */
type HubLabelResolver = (key: string) => string;

function buildStoneSearchFields(
  stone: StoneSearchRecord,
  t: HubLabelResolver,
): StoneSearchFieldHit[] {
  const fields: StoneSearchFieldHit[] = [
    { label: t("field.stoneName"), text: stone.stone_name },
    { label: t("field.shortDescription"), text: stone.short_description ?? "" },
    { label: t("field.generalInfo"), text: stone.general_info ?? "" },
    { label: t("field.physicalEffects"), text: stone.physical_effects ?? "" },
    { label: t("field.spiritualEffects"), text: stone.spiritual_effects ?? "" },
    { label: t("field.otherEffects"), text: stone.other_effects ?? "" },
    { label: t("field.warning"), text: stone.warning_text ?? "" },
  ];

  if (stone.chakras?.length) {
    fields.push({ label: t("field.chakra"), text: stone.chakras.join(", ") });
  }
  if (stone.warning_tags?.length) {
    fields.push({ label: t("field.tag"), text: stone.warning_tags.join(", ") });
  }

  const assignmentText = assignmentsToSearchText(stone.assignments);
  if (assignmentText) {
    fields.push({ label: t("field.assignments"), text: assignmentText });
  }

  return fields;
}

function extractSnippet(text: string, query: string, maxLen = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const norm = normalizeTrSearch(clean);
  const qNorm = normalizeTrSearch(query);
  const idx = norm.indexOf(qNorm);
  if (idx < 0) return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;

  const start = Math.max(0, idx - 36);
  const end = Math.min(clean.length, idx + query.length + 56);
  let snippet = clean.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < clean.length) snippet = `${snippet}…`;
  return snippet;
}

function searchStones(
  records: StoneSearchRecord[],
  query: string,
  t: HubLabelResolver,
): StoneSearchResult[] {
  const qNorm = normalizeTrSearch(query.trim());
  if (!qNorm) return [];

  const results: StoneSearchResult[] = [];

  for (const stone of records) {
    const fields = buildStoneSearchFields(stone, t);
    const hit = fields.find((field) => normalizeTrSearch(field.text).includes(qNorm));
    if (!hit) continue;

    results.push({
      id: stone.id,
      stone_name: stone.stone_name?.trim() || "İsimsiz taş",
      short_description:
        stone.short_description?.trim() || t("results.noDescription"),
      matchedField: hit.label,
      snippet: extractSnippet(hit.text, query) || hit.text.slice(0, 140),
    });
  }

  return results.sort((a, b) =>
    a.stone_name.localeCompare(b.stone_name, "tr-TR"),
  );
}

function mapStoneSearchRecord(row: Record<string, unknown>): StoneSearchRecord {
  return {
    id: String(row.id ?? ""),
    stone_name: String(row.stone_name ?? ""),
    short_description:
      row.short_description != null ? String(row.short_description) : null,
    general_info: row.general_info != null ? String(row.general_info) : null,
    physical_effects:
      row.physical_effects != null ? String(row.physical_effects) : null,
    spiritual_effects:
      row.spiritual_effects != null ? String(row.spiritual_effects) : null,
    other_effects: row.other_effects != null ? String(row.other_effects) : null,
    warning_text: row.warning_text != null ? String(row.warning_text) : null,
    warning_tags: Array.isArray(row.warning_tags)
      ? row.warning_tags.map((tag) => String(tag))
      : null,
    chakras: Array.isArray(row.chakras) ? row.chakras.map((c) => String(c)) : null,
    assignments:
      row.assignments && typeof row.assignments === "object"
        ? (row.assignments as Record<string, unknown>)
        : null,
  };
}


type MonthTrendBucket = {
  label: string;
  count: number;
  heightPct: number;
};

// F-013: "Stok Değeri" ölü widget'ı kaldırıldı — Doğaltaş'ta fiyat/stok kolonu yok,
// widget her müşteride kalıcı boş placeholder gösteriyordu. Fatura/POS/stok sistemi
// EKLENMEDİ (ürün kararı). İlgili tespit/hesap makinesi (parseNumeric/detectStockValueFields/
// computeStockValue/formatTry) de kaldırıldı.

function buildLast6MonthTrend(
  createdAts: string[],
  locale: ActiveLocale,
): MonthTrendBucket[] {
  const now = new Date();
  const buckets: { label: string; year: number; month: number; count: number }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      // Ay kısaltması locale-aware: EN → "Apr/Jun/Aug", TR → "Nis/Haz/Ağu" (byte-aynı).
      // Merkezî helper localeTag (en→en-GB, tr→tr-TR) kullanır; absolute-date sözleşmesi ayrı.
      label: formatDate(date, { month: "short" }, locale),
      year: date.getFullYear(),
      month: date.getMonth(),
      count: 0,
    });
  }

  for (const iso of createdAts) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = buckets.find(
      (item) => item.year === date.getFullYear() && item.month === date.getMonth(),
    );
    if (bucket) bucket.count += 1;
  }

  const maxCount = Math.max(...buckets.map((item) => item.count), 1);

  return buckets.map((item) => ({
    label: item.label,
    count: item.count,
    heightPct:
      item.count === 0 ? 0 : Math.max(8, Math.round((item.count / maxCount) * 100)),
  }));
}

function formatCount(
  value: number | null,
  loading: boolean,
  loadingLabel: string,
): string {
  if (loading) return loadingLabel;
  if (value === null) return "—";
  return value.toLocaleString("tr-TR");
}

// ─── 2026-10-18 premium görünüm (owner onaylı prototip ee64597) — yalnız görsel yardımcılar ───────────
const PREMIUM_ASSET = "/premium/dogaltas";

/** Sol menü 3D ikon karoları (slug → görsel). Eşleşmeyen modül mevcut emoji ikonuyla çizilir. */
const MENU_ART: Record<string, string> = {
  "dogaltas-listesi": "ic-dogaltas",
  "mineral-listesi": "ic-mineral",
  kombinasyonlar: "ic-kombinasyon",
  "tas-bilgi-kutuphanesi": "ic-kutuphane",
  kutuphane: "ic-hero",
};

/**
 * Doğaltaş Kütüphanesi kartı (owner kararı 30.10.2026): Taş Makaleleri'nin hemen altında 5. kart. Ana sol menüde ayrı
 * bağlantı yoktur. Kart YALNIZ kütüphanenin kendi okuma ucu 200 dönerse gösterilir (owner veya owner'ın kişi bazında
 * yetki verdiği uzman); bayrak kapalı / yetki yok → sunucu tek tip 404 → kart gizli (fail-closed). Sayfa ve API'ler
 * kendi korumalarını ayrıca uygular.
 */
const STONE_LIBRARY_CARD: DogaltasModule = {
  slug: "kutuphane",
  title: "Doğaltaş Kütüphanesi",
  subtitle: "Doğrulanmış taş bilgileri ve görseller.",
  icon: "💠",
  href: "/dogaltas/kutuphane",
  accent: "emerald",
  primaryNav: true,
};

const TILT_MAX = 2;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py"];

/** Hover'da en fazla ~2° eğim + küçük parallax (dokunmatik / "hareketi azalt" açıkken yok). */
function onTiltMove(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const strength = Number(el.dataset.tiltStrength || 1);
  const px = Math.min(Math.max((e.clientX - r.left) / r.width - 0.5, -0.5), 0.5);
  const py = Math.min(Math.max((e.clientY - r.top) / r.height - 0.5, -0.5), 0.5);
  el.dataset.tilting = "true";
  el.style.setProperty("--rx", `${(-py * 2 * TILT_MAX * strength).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${(px * 2 * TILT_MAX * strength).toFixed(2)}deg`);
  el.style.setProperty("--px", px.toFixed(3));
  el.style.setProperty("--py", py.toFixed(3));
}

function onTiltLeave(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  delete el.dataset.tilting;
  for (const prop of TILT_PROPS) el.style.removeProperty(prop);
}

/** Grafik ekseni: gerçek en yüksek aylık sayıya göre 4 eşit aralık (tam sayı). */
function trendAxisMax(buckets: MonthTrendBucket[]): number {
  const max = Math.max(0, ...buckets.map((b) => b.count));
  return max <= 4 ? 4 : Math.ceil(max / 4) * 4;
}


/**
 * Aylık trend için taş created_at değerleri (server API, kullanıcı tenant'ı).
 * Yalnız son 6 ay penceresi ve yalnız created_at istenir — tüm taş satırları
 * (uzun metin kolonlarıyla) panoya indirilmez.
 */
async function fetchStonesRaw(): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(
    `/api/dogaltas/stones?mode=raw&since=${encodeURIComponent(since)}`,
  );
  return { data: r.data?.rows ?? [], error: r.ok ? null : (r.error ?? "Okuma hatası") };
}

/**
 * Doğaltaş modül menüsü (sol kart listesi). İçerikte ve Suspense yedeğinde AYNI bileşen → sunucunun ilk HTML'inde kart
 * listesi hazırdır ve içerik yüklenince yerinden oynamaz. Kütüphane kartı: erişim İLK SUNUCU ÇİZİMİNDE belirlenir
 * (layout → StoneLibraryAccessProvider; mevcut kütüphane kapısı) — istemcide sonradan yoklama / ekleme yok.
 */
function DogaltasSideNav() {
  const t = useTranslations("stones.hub");
  // Modül kartı etiketleri: DOGALTAS_MODULES registry KANONİK Türkçe kalır; görünen title/subtitle slug ile localize edilir.
  const tm = useTranslations("stones.modules");
  const stoneLibraryAllowed = useStoneLibraryAccess();
  const menuModules = stoneLibraryAllowed ? [...DOGALTAS_PRIMARY_MODULES, STONE_LIBRARY_CARD] : DOGALTAS_PRIMARY_MODULES;
  return (
    <nav className={styles.side} aria-label={t("sidebar.moduleName")}>
      <div className={styles.sideBrand}>
        <span className={styles.sideBrandIcon} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${PREMIUM_ASSET}/ic-baslik.webp`} width={60} height={62} alt="" decoding="async" draggable={false} />
        </span>
        <div>
          <h2 className={styles.sideEyebrow}>{t("sidebar.brand")}</h2>
          <p className={styles.sideModule}>{t("sidebar.moduleName")}</p>
        </div>
      </div>

      <p className={styles.sideLabel}>{t("sidebar.modulesHeading")}</p>

      <ul className={styles.menu} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {menuModules.map((item, index) => {
          const isFeatured = index === 0;
          const art = MENU_ART[item.slug];
          const cls = `${styles.menuItem} ${isFeatured ? styles.menuActive : ""}`;
          const body = (<>
                <span className={styles.menuIcon} aria-hidden>
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${PREMIUM_ASSET}/${art}.webp`} width={54} height={56} alt="" decoding="async" draggable={false} />
                  ) : (
                    <span className={styles.menuEmoji}>{item.icon}</span>
                  )}
                </span>
                <span className={styles.menuText}>
                  <strong>{tm.has(`${item.slug}.title`) ? tm(`${item.slug}.title`) : item.title}</strong>
                  <small>{tm.has(`${item.slug}.subtitle`) ? tm(`${item.slug}.subtitle`) : item.subtitle}</small>
                </span>
                <span className={styles.menuChevron} aria-hidden>
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </span>
              </>);
          return (
            <li key={item.href}>
              <Link href={item.href} className={cls}>{body}</Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.sideDecor} aria-hidden>
        <span className={styles.sideCrystal}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${PREMIUM_ASSET}/yan-kristal.webp`} width={196} height={295} alt="" decoding="async" draggable={false} />
        </span>
        <p className={styles.sideQuote}>
          {t("premium.sideQuote")
            .split("|")
            .map((line) => (
              <span key={line}>{line}</span>
            ))}
          <span className={styles.sideQuoteLine} />
        </p>
      </div>
    </nav>
  );
}

function DogaltasPageContent() {
  const t = useTranslations("stones.hub");
  const tre = useTranslations("stones.reportErrors");
  const locale = useLocale() as ActiveLocale;
  // Modül kartı etiketleri: DOGALTAS_MODULES registry KANONİK Türkçe kalır (slug/href/canonical);
  // görünen title/subtitle slug ile localize edilir.
  const tm = useTranslations("stones.modules");
  const tc = useTranslations("stones.common");
  const router = useRouter();
  const searchParams = useSearchParams();
  useBfcacheRefresh();
  const urlQuery = searchParams.get("q")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);
  // Mobilde daha kısa placeholder göstermek için (masaüstü metni değişmez).
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // F-01/§7: hızlı arama artık SERVER-SIDE (condition-search, content). Tüm korpus
  // TARAYICIYA inmez; yalnız eşleşen alt küme (extended) döner ve alan-eşleşmesi
  // (matchedField) client'ta bu bounded küme üzerinde hesaplanır.
  const [searchResults, setSearchResults] = useState<StoneSearchResult[]>([]);
  // P2-07: sunucu sonuç üst sınırına ulaşıldıysa (500) kullanıcıya dürüstçe söylenir.
  const [searchCapped, setSearchCapped] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchSeq = useRef(0);
  const [viewedStoneIds, setViewedStoneIds] = useState<Set<string>>(() => new Set());
  const [stonesCount, setStonesCount] = useState<number | null>(null);
  const [mineralsCount, setMineralsCount] = useState<number | null>(null);
  const [combinationsCount, setCombinationsCount] = useState<number | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthTrendBucket[]>([]);
  // P2-09B: trend verisi alınamazsa 6 sıfır çubuk (sahte "kayıt yok") gösterilmez.
  const [trendError, setTrendError] = useState(false);
  // Word raporu modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSections, setReportSections] = useState({
    stones: false, minerals: false, combinations: false, knowledge: false, analytics: false,
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setErrorMessage(tc("workspaceUnavailable"));
      setStonesCount(null);
      setMineralsCount(null);
      setCombinationsCount(null);
      setMonthlyTrend([]);
      return;
    }

    const [stonesCountRes, stonesRowsRes, mineralsCountRes, combinationsRes] =
      await Promise.all([
        // Toplam Taş Kaydı — server API (oturum tenant'ı + demo'da kütüphane).
        fetchStonesListCount(tenantId),
        // Aylık trend + stok değeri için ham satırlar (server API, kullanıcı tenant'ı).
        fetchStonesRaw(),
        // Mineral Bankası sayacı — server API (tenant-only).
        fetchMineralsListCount(tenantId),
        // Toplam Kombinasyon — güvenli server API exact count (satır inmez, oturum tenant'ı).
        fetchCombinationsCount(),
      ]);

    setLoading(false);

    // Sessizce 0 YAZMA: hata olan sayaç null (→ "—") + console.error + kullanıcı uyarısı.
    const failed: string[] = [];

    if (stonesCountRes.error) {
      console.error("[dogaltas/dashboard] Taş sayımı hatası:", stonesCountRes.error);
      setStonesCount(null);
      failed.push(t("analytics.failedLabel.stones"));
    } else {
      setStonesCount(stonesCountRes.count);
    }

    if (!combinationsRes.ok) {
      console.error("[dogaltas/dashboard] Kombinasyon sayımı hatası:", combinationsRes.error);
      setCombinationsCount(null);
      failed.push(t("analytics.failedLabel.combinations"));
    } else {
      setCombinationsCount(combinationsRes.count);
    }

    // Mineral Bankası — server API (tenant-only). Hata olursa null (→ "—"), 0 yazma yok.
    if (mineralsCountRes.error) {
      console.error("[dogaltas/dashboard] Mineral sayımı hatası:", mineralsCountRes.error);
      setMineralsCount(null);
      failed.push(t("analytics.failedLabel.minerals"));
    } else {
      setMineralsCount(mineralsCountRes.count);
    }

    // Aylık trend — kullanıcı tenant'ı ham satırlarından created_at (mevcut davranış).
    const rows = (stonesRowsRes.data ?? []) as Record<string, unknown>[];
    if (stonesRowsRes.error) {
      console.error("[dogaltas/dashboard] Taş satırları (trend) hatası:", stonesRowsRes.error);
      failed.push(t("analytics.failedLabel.trend"));
    }
    setTrendError(Boolean(stonesRowsRes.error));

    const createdAts = rows
      .map((row) => (row.created_at != null ? String(row.created_at) : ""))
      .filter(Boolean);
    setMonthlyTrend(buildLast6MonthTrend(createdAts, locale));

    if (failed.length > 0) {
      setErrorMessage(t("analytics.failedCounters", { items: failed.join(", ") }));
    }
  }, [t, tc, locale]);

  useEffect(() => {
    runInEffect(() => {
      void loadAnalytics();
    });
  }, [loadAnalytics]);

  useEffect(() => {
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
  }, [urlQuery]);

  // WT8: "Kontrol edildi" — Doğaltaş Detay Arama ile ORTAK mantık (lib/search/searchChecked):
  // arama bağlamına bağlı, sessionStorage; yeni arama temiz başlar, önceki aramaya dönünce geri gelir.
  const checkedContext = searchContextKey({ scope: "hub", query: activeQuery });
  const checkedContextRef = useRef(checkedContext);
  useEffect(() => {
    checkedContextRef.current = checkedContext;
    runInEffect(() => setViewedStoneIds(readCheckedIds(browserSessionStorage(), checkedContext)));
  }, [checkedContext]);
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_VIEWED_STORAGE_KEY); } catch { /* erişim yok */ }
    const refreshViewed = () => setViewedStoneIds(readCheckedIds(browserSessionStorage(), checkedContextRef.current));
    window.addEventListener("focus", refreshViewed);
    return () => window.removeEventListener("focus", refreshViewed);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrowViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // SERVER-SIDE hızlı arama — condition-search (content). Korpus TARAYICIYA inmez;
  // yalnız eşleşen alt küme (extended) döner. Alan-eşleşmesi (matchedField) bu bounded
  // küme üzerinde hesaplanır. Race guard: eski response yeniyi ezmez.
  const performSearch = useCallback(
    async (trimmed: string) => {
      if (!trimmed) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      const seq = ++searchSeq.current;
      setSearchLoading(true);
      setSearchError(null);
      // M05: Mineraller + Kombinasyonlar da aranır (mevcut uçlar; tenant sunucuda oturumdan).
      // G2-01: + mineral bölüm metinleri (mode=all) + Taş Makaleleri (mevcut uçlar; tenant sunucuda oturumdan).
      const [res, mineralsRes, combinationsRes, mineralsAllRes, knowledgeRes] = await Promise.all([
        fetchStonesByConditions({ q: trimmed, searchMode: "content" }),
        searchHubMinerals(trimmed),
        fetchCombinationsViaApi(),
        dogaltasApiGet<{ rows?: Record<string, unknown>[] }>("/api/dogaltas/minerals?mode=all"),
        dogaltasApiGet<{ articles?: HubKnowledgeArticle[] }>("/api/dogaltas/knowledge"),
      ]);
      if (seq !== searchSeq.current) return; // stale — ez me
      setSearchLoading(false);
      if (!res.ok) {
        setSearchResults([]);
        setSearchCapped(false);
        setHasSearched(true);
        // P2-09B: ham teknik metin (HTTP 5xx, İngilizce ağ hatası) gösterilmez; log'a yazılır.
        if (res.error !== STONES_WORKSPACE_UNAVAILABLE) console.error("[dogaltas-pano] arama hatası:", res.error);
        setSearchError(
          res.error === STONES_WORKSPACE_UNAVAILABLE
            ? tc("workspaceUnavailable")
            : t("search.dataError"),
        );
        return;
      }
      setSearchCapped(res.capped || mineralsRes.capped);
      const records = res.rows.map((row) =>
        mapStoneSearchRecord(row as unknown as Record<string, unknown>),
      );
      const coreMinerals = mineralHubResults(mineralsRes.rows, trimmed, t);
      const sectionMinerals = mineralsAllRes.ok
        ? mineralSectionHubResults(mineralsAllRes.data?.rows ?? [], trimmed, new Set(coreMinerals.map((m) => m.id)), t)
        : [];
      setSearchResults([
        ...searchStones(records, trimmed, t),
        ...(sectionMinerals.length
          ? [...coreMinerals, ...sectionMinerals].sort((a, b) => a.stone_name.localeCompare(b.stone_name, "tr-TR"))
          : coreMinerals),
        ...(combinationsRes.ok ? combinationHubResults(combinationsRes.rows, trimmed, t) : []),
        ...(knowledgeRes.ok ? knowledgeHubResults(knowledgeRes.data?.articles ?? [], trimmed, t) : []),
      ]);
      // M05: mineral / kombinasyon okunamazsa taş sonuçları gösterilir, eksik kısım dürüstçe bildirilir.
      if (mineralsRes.error || !combinationsRes.ok) {
        console.error("[dogaltas-pano] arama hatası (mineral/kombinasyon):", mineralsRes.error ?? combinationsRes.error);
        setSearchError(t("search.dataError"));
      }
      // G2-01: bölüm metni / Taş Makaleleri okunamazsa diğer sonuçlar gösterilir, aynı mesajla bildirilir.
      if (!mineralsAllRes.ok || !knowledgeRes.ok) {
        console.error("[dogaltas-pano] arama hatası (mineral bölüm/makale):", !mineralsAllRes.ok ? mineralsAllRes.error : knowledgeRes.error);
        setSearchError(t("search.dataError"));
      }
      setHasSearched(true);
    },
    [t, tc],
  );

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      router.replace(trimmed ? `/dogaltas?${params.toString()}` : "/dogaltas", { scroll: false });
      setActiveQuery(trimmed);
      await performSearch(trimmed);
    },
    [performSearch, router],
  );

  useEffect(() => {
    const q = activeQuery.trim();
    if (!q) return;
    runInEffect(() => { void performSearch(q); });
  }, [activeQuery, performSearch]);

  const handleSearchSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      void runSearch(searchInput);
    },
    [runSearch, searchInput],
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (!value.trim()) {
        setActiveQuery("");
        setSearchError(null);
        setSearchLoading(false);
        router.replace("/dogaltas", { scroll: false });
      }
    },
    [router],
  );

  const handleResultNavigate = useCallback((stoneId: string) => {
    const ctx = checkedContextRef.current;
    if (ctx) setViewedStoneIds(markChecked(browserSessionStorage(), ctx, stoneId));
  }, []);

  // ─── Word raporu ─────────────────────────────────────────────────────────────

  const allReportSelected = Object.values(reportSections).every(Boolean);

  function toggleAllReport() {
    const next = !allReportSelected;
    setReportSections({ stones: next, minerals: next, combinations: next, knowledge: next, analytics: next });
  }

  async function downloadReport() {
    if (!Object.values(reportSections).some(Boolean)) {
      setReportError(t("report.errorEmpty"));
      return;
    }
    const tid = await getSyncedTenantId();
    if (!tid) { setReportError(t("report.errorSession")); return; }
    const uid = readYasamUser()?.id;
    if (!uid) { setReportError(t("report.errorUser")); return; }
    const sessionToken = readSessionToken();
    setReportLoading(true);
    setReportError("");
    setReportSuccess("");
    try {
      // F-018: kimlik doğrulanmış oturum header'ıyla taşınır; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch("/api/dogaltas/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": uid,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ sections: reportSections }),
      });
      if (!res.ok) {
        // P2-02/P2-09A: sunucu boş/eksik rapor üretmez; hata türüne göre anlaşılır mesaj.
        // (Eskiden JSON olmayan yanıtta ham SyntaxError metni gösterilebiliyordu.)
        setReportError(tre(await reportErrorKind(res)));
        return;
      }
      await downloadFileResponse(res, `yasam-sistemi-dogaltas-raporu-${reportFileDate()}.docx`);
      setReportSuccess(t("report.success"));
    } catch (err) {
      console.error("[dogaltas-pano] Profesyonel Rapor hatası:", err);
      setReportError(t("report.errorGeneric"));
    } finally {
      setReportLoading(false);
    }
  }

  const axisMax = trendAxisMax(monthlyTrend);
  const axisTicks = [axisMax, (axisMax * 3) / 4, axisMax / 2, axisMax / 4, 0];
  const reportLabel = t("hero.reportButton").replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
  const stats = [
    { key: "stones", tone: "mint", art: "tas", label: t("analytics.totalStones"), value: stonesCount },
    { key: "minerals", tone: "lilac", art: "mineral", label: t("analytics.mineralBank"), value: mineralsCount },
    { key: "combinations", tone: "amber", art: "kombinasyon", label: t("analytics.activeCombinations"), value: combinationsCount },
  ] as const;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DogaltasSideNav />

        <section className={styles.main}>
          <header className={`${styles.hero} ${styles.tilt}`} data-tilt-strength="0.5" onPointerMove={onTiltMove} onPointerLeave={onTiltLeave}>
            <span className={styles.heroIcon} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${PREMIUM_ASSET}/ic-hero.webp`} width={88} height={90} alt="" decoding="async" draggable={false} />
            </span>
            <div className={styles.heroText}>
              <h1 className={styles.heroTitle}>
                <span className={styles.heroAccent}>{t("hero.titleAccent")}</span> {t("hero.titleSuffix")}
              </h1>
              <p className={styles.heroSub}>{t("hero.subtitle")}</p>
            </div>
            <div className={styles.heroArt} aria-hidden>
              <span className={`${styles.heroCrystals} ${styles.depth}`} style={{ "--d": 5 } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${PREMIUM_ASSET}/hero-kristaller.webp`} width={284} height={206} alt="" decoding="async" draggable={false} />
              </span>
              <span className={styles.crystalGlow} />
            </div>
            <button
              type="button"
              onClick={() => { setShowReportModal(true); setReportError(""); setReportSuccess(""); }}
              className={styles.reportBtn}
            >
              <span className={styles.reportIcon} aria-hidden>
                <FileText className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <span>{reportLabel}</span>
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </header>

          <form className={styles.search} role="search" onSubmit={handleSearchSubmit}>
            <div className={styles.searchField}>
              <span className={styles.searchIcon} aria-hidden>
                <Search className="h-5 w-5" strokeWidth={2} />
              </span>
              <input
                type="search"
                aria-label={t("search.aria")}
                value={searchInput}
                onChange={(event) => handleSearchInputChange(event.target.value)}
                placeholder={
                  isNarrowViewport
                    ? t("search.placeholderNarrow")
                    : t("search.placeholderWide")
                }
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" disabled={searchLoading} className={styles.searchBtn}>
              <Search className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
              <span>{searchLoading ? t("search.submitting") : t("search.submit")}</span>
            </button>
          </form>

          {activeQuery.trim() ? (
            <section className={styles.results}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-black text-slate-900">
                  {t("results.title")}
                  {!searchLoading && hasSearched
                    ? t("results.count", { count: searchResults.length })
                    : ""}
                </h2>
                {activeQuery ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                    "{activeQuery}"
                  </span>
                ) : null}
              </div>

              {searchCapped && !searchError && !searchLoading ? (
                <p role="status" data-testid="dash-search-capped" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  {t("results.cappedNote")}
                </p>
              ) : null}
              {searchError ? (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
                  role="alert"
                >
                  {searchError}
                </p>
              ) : null}

              {searchLoading ? (
                <p className="py-6 text-center text-sm font-semibold text-slate-600">
                  {t("results.loading")}
                </p>
              ) : searchResults.length === 0 && !searchError ? (
                <p className="py-6 text-center text-sm font-semibold text-slate-600">
                  {t("results.empty")}
                </p>
              ) : (
                <div className="max-h-[min(42vh,360px)] space-y-3 overflow-y-auto pr-1">
                  {searchResults.map((result) => {
                    const isViewed = viewedStoneIds.has(result.id);
                    const detailHref = result.href ?? `/dogaltas/dogaltas-listesi/${encodeURIComponent(result.id)}?q=${encodeURIComponent(activeQuery)}`;
                    const kindSlug = HUB_KIND_MODULE_SLUG[result.kind ?? "stone"];

                    return (
                      <article
                        key={`${result.kind ?? "stone"}:${result.id}`}
                        className={`relative overflow-hidden rounded-[22px] border bg-white/95 p-4 shadow-sm transition hover:shadow-md ${
                          isViewed
                            ? `border-emerald-200/90 ${SEARCH_CHECKED_CARD_ACCENT}`
                            : "border-slate-200/80"
                        }`}
                      >
                        {isViewed ? (
                          <span
                            className="absolute bottom-0 left-0 top-0 w-1.5 bg-emerald-500"
                            aria-hidden
                          />
                        ) : null}

                        <div className={isViewed ? "pl-2" : ""}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <h3 className="text-lg font-black text-slate-950">
                                {result.stone_name}
                              </h3>
                              <span data-testid="hub-result-kind" className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black text-violet-700 ring-1 ring-violet-200">
                                {tm(`${kindSlug}.title`)}
                              </span>
                            </div>
                            {isViewed ? <SearchCheckedBadge label={t("results.viewed")} /> : null}
                          </div>

                          <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-600">
                            {result.short_description}
                          </p>

                          {result.matchedField ? (
                            <p className="mt-2 text-xs font-bold text-violet-700">
                              {t("results.matched", { field: result.matchedField })}
                            </p>
                          ) : null}
                          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-700">
                            {result.snippet}
                          </p>

                          <Link
                            href={detailHref}
                            onClick={() => handleResultNavigate(result.id)}
                            className="mt-3 inline-flex rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-100"
                          >
                            {t("results.detail")}
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          <section className={styles.analytics} aria-labelledby="dogaltas-analytics-title">
            <div className={styles.anHead}>
              <span className={styles.miniIcon} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${PREMIUM_ASSET}/ic-analiz.webp`} width={54} height={56} alt="" decoding="async" draggable={false} />
              </span>
              <div className={styles.anTitleWrap}>
                <h2 id="dogaltas-analytics-title" className={styles.anTitle}>{t("analytics.title")}</h2>
                <p className={styles.anSub}>{t("analytics.subtitle")}</p>
              </div>
              <p className={styles.anNote} aria-hidden>
                <span className={styles.anNoteIcon}>
                  <Flower2 className="h-8 w-8" strokeWidth={1} />
                </span>
                <em>
                  {t("premium.analyticsNote")
                    .split("|")
                    .map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                </em>
              </p>
            </div>

            {errorMessage ? (
              <p className={styles.alert} role="alert">
                {errorMessage}
              </p>
            ) : null}

            {/* F-013: Ölü widget'lar ("Stok Değeri", "En Çok Satılan Taşlar") kaldırıldı;
                gerçek veriyle beslenen "Aylık Kayıt Trendi" tam genişlikte. */}
            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <span className={styles.miniIcon} aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${PREMIUM_ASSET}/ic-trend.webp`} width={52} height={52} alt="" decoding="async" draggable={false} />
                </span>
                <div>
                  <h3 className={styles.chartTitle}>{t("analytics.trendTitle")}</h3>
                  <p className={styles.chartSub}>{t("analytics.trendSubtitle")}</p>
                </div>
              </div>
              {loading ? (
                <p className={styles.chartState}>{t("analytics.loading")}</p>
              ) : trendError ? (
                <p role="alert" data-testid="dash-trend-error" className={`${styles.chartState} ${styles.chartStateError}`}>{t("analytics.trendError")}</p>
              ) : (
                <figure className={styles.chart}>
                  <div className={styles.chartAxis} aria-hidden>
                    {axisTicks.map((tick, i) => (
                      <span key={i}>{Number.isInteger(tick) ? tick : ""}</span>
                    ))}
                  </div>
                  <div className={styles.bars}>
                    {monthlyTrend.map((bucket) => {
                      const ratio = bucket.count / axisMax;
                      return (
                        <div
                          key={bucket.label}
                          className={styles.barCol}
                          title={t("analytics.barTitle", { label: bucket.label, count: bucket.count })}
                        >
                          <span
                            className={`${styles.bar} ${bucket.count === 0 ? styles.barEmpty : ratio > 0.3 ? styles.barHigh : ""}`}
                            style={{ height: bucket.count === 0 ? "4px" : `${Math.max(ratio * 100, 2.5).toFixed(1)}%` }}
                          />
                          <span className={styles.barDot} aria-hidden />
                          <span className={styles.barLabel}>{bucket.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </figure>
              )}
            </div>

            <div className={styles.stats}>
              {stats.map((stat) => (
                <div
                  key={stat.key}
                  className={`${styles.stat} ${styles.tilt}`}
                  data-tone={stat.tone}
                  onPointerMove={onTiltMove}
                  onPointerLeave={onTiltLeave}
                >
                  <span className={styles.statDecor} aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${PREMIUM_ASSET}/dek-${stat.art}.webp`} width={186} height={60} alt="" decoding="async" draggable={false} />
                  </span>
                  <span className={`${styles.statCrystal} ${styles.depth}`} style={{ "--d": 4 } as CSSProperties} aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${PREMIUM_ASSET}/st-${stat.art}.webp`} width={86} height={92} alt="" decoding="async" draggable={false} />
                  </span>
                  <span className={styles.statText}>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <span className={`${styles.statValue} ${loading ? styles.statValueText : ""}`}>
                      {formatCount(stat.value, loading, t("analytics.loading"))}
                    </span>
                  </span>
                  <span className={styles.sheen} aria-hidden />
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>

      {/* Word raporu modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-sm sm:p-4">
          <div role="dialog" aria-modal="true" data-testid="word-modal" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200/50 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">{t("report.title")}</h2>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">{t("report.subtitle")}</p>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allReportSelected}
                  onChange={toggleAllReport}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                <span className="text-sm font-black text-violet-800">{t("report.selectAll")}</span>
              </label>

              <div className="my-1 border-t border-slate-100" />

              {([
                ["stones",       "💎"],
                ["minerals",     "🧪"],
                ["combinations", "🧩"],
                ["knowledge",    "📚"],
                ["analytics",    "📊"],
              ] as const).map(([key, icon]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={reportSections[key]}
                    onChange={() => setReportSections(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="h-4 w-4 rounded accent-emerald-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">{icon} {t(`report.section.${key}`)}</span>
                </label>
              ))}
            </div>

            {reportError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {reportError}
              </p>
            )}
            {reportSuccess && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                ✓ {reportSuccess}
              </p>
            )}
            {reportLoading && (
              <p className="mt-4 text-center text-sm font-semibold text-violet-700">
                {t("report.preparing")}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setReportSections({ stones: false, minerals: false, combinations: false, knowledge: false, analytics: false })}
                disabled={reportLoading}
                className="btn-soft flex-1 !px-4 !py-2.5"
              >
                {t("report.clear")}
              </button>
              <button
                type="button"
                onClick={() => void downloadReport()}
                disabled={reportLoading}
                className="btn-primary flex-1 !px-4 !py-2.5"
              >
                {reportLoading ? t("report.submitting") : t("report.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DogaltasPageFallback() {
  const t = useTranslations("stones.hub");
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DogaltasSideNav />
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-base font-semibold text-violet-900">{t("fallbackLoading")}</p>
        </div>
      </div>
    </main>
  );
}

export default function DogaltasPage() {
  return (
    <Suspense fallback={<DogaltasPageFallback />}>
      <DogaltasPageContent />
    </Suspense>
  );
}

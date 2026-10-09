"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ChangeEvent,
  Fragment,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import {
  getSessionTenantId,
  getSyncedTenantId,
} from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { StoneReaderModal } from "@/app/dogaltas/components/StoneReaderModal";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { getDemoReferenceStoneId } from "@/lib/dogaltas/stonesListFetch";
import { getStone, updateStone, deleteStone as apiDeleteStone } from "@/lib/dogaltas/dogaltasApi";
import {
  STONE_CHAKRA_OPTIONS,
  STONE_WARNING_OPTIONS,
  isTaxonomyOptionSelected,
  legacyTaxonomyValues,
  toggleLegacyTaxonomyValue,
  toggleTaxonomyOption,
} from "@/lib/dogaltas/stoneTaxonomy";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import {
  mergeMatchCardClass,
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";
import { useOverlay } from "@/lib/dogaltas/useOverlay";
import { useSearchHighlight } from "@/lib/search/useSearchHighlight";
import { needsDiscardConfirm } from "@/lib/dogaltas/longTextEditor";
import { useSignedStoneImageUrls, imageFilePath } from "@/lib/dogaltas/stoneImageClient";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { reportErrorKind } from "@/lib/dogaltas/reportErrorKind";
import { useToast } from "@/components/ui/ToastProvider";
import { StoneSourcesBar } from "@/app/dogaltas/components/StoneSourcesBar";
import {
  PRIMARY_SOURCE_ID,
  SOURCE_FIELDS,
  buildStoneSourcesView,
  sourceDisplayName,
  sourceSearchText,
  type SourceField,
  type StoneSourceView,
} from "@/lib/dogaltas/stoneSources";
import {
  createStoneSource,
  deleteStoneSource,
  fetchMySourceNames,
  fetchStoneSources,
  updateStoneSource,
} from "@/lib/dogaltas/stoneSourcesApi";
import { findMatchRanges } from "@/lib/search/useSearchHighlight";


function SearchMatchBadge() {
  const t = useTranslations("stones.detail");
  return <span className={SEARCH_MATCH_BADGE_CLASS}>{t("matchBadge")}</span>;
}


function assignmentsSearchText(assignments: Record<string, string[][]> | null): string {
  if (!assignments) return "";
  return Object.entries(assignments)
    .map(([title, rows]) => `${title} ${rowsToText(rows)}`)
    .join(" ");
}

// P1-01: çakra / uyarı seçenekleri TEK KAYNAKTAN (oluşturma ekranı + sunucu ile aynı).
const CHAKRA_OPTIONS: readonly string[] = STONE_CHAKRA_OPTIONS;

const WARNING_OPTIONS: readonly string[] = STONE_WARNING_OPTIONS;

const ASSIGNMENT_SECTIONS = [
  "Elementler",
  "Mineraller",
  "Etkili Organlar",
  "Astrolojik Atama",
  "Çakra Atama",
  "Burçlar",
  "Mizaçlar",
  "Kan Grupları",
];

type StoneRecord = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
  /** WT9: birincil kaynağın adı (NULL = belirtilmemiş). */
  primary_source_name?: string | null;
};

type EditableTextField =
  | "stone_name"
  | "short_description"
  | "general_info"
  | "source_note"
  | "physical_effects"
  | "spiritual_effects"
  | "other_effects"
  | "warning_text"
  | "feng_shui"
  | "meditation"
  | "care"
  | "application";

type ActiveEditor =
  | {
      mode: "text";
      field: EditableTextField;
      title: string;
      badge: string;
      value: string;
      multiline: boolean;
    }
  | {
      mode: "checkbox";
      field: "chakras" | "warning_tags";
      title: string;
      badge: string;
      selected: string[];
      options: readonly string[];
      /** P1-01: kanonik listede karşılığı olmayan kayıtlı eski değerler (editör açılışında sabitlenir). */
      legacy: string[];
    }
  | {
      mode: "assignments";
      title: string;
      badge: string;
      values: Record<string, string>;
    };

type ActiveReader = {
  title: string;
  badge: string;
  text: string;
};

type StoneImageItem = {
  id: string;
  name: string;
  url?: string;
  file_path?: string;
  displayable: boolean;
};

function isWebImageUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAssignments(raw: unknown): Record<string, string[][]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Record<string, string[][]> = {};

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const rows = value
        .map((row) => {
          if (Array.isArray(row)) {
            return row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
          }
          if (typeof row === "string" && row.trim()) return [row.trim()];
          return [];
        })
        .filter((row) => row.length > 0);
      if (rows.length > 0) result[key] = rows;
      return;
    }

    if (typeof value === "string" && value.trim()) {
      result[key] = [[value.trim()]];
    }
  });

  return result;
}

function normalizeImages(raw: unknown, signed: Record<string, string> = {}): StoneImageItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (typeof item === "string") {
      const path = item.trim();
      // F-016: file_path'i olan string legacy → signed URL ile çözülebilir.
      const resolved = path && signed[path] ? signed[path] : undefined;
      return {
        id: `legacy-${index}`,
        name: path.split(/[/\\]/).pop() || `Görsel ${index + 1}`,
        url: resolved,
        file_path: path || undefined,
        displayable: Boolean(resolved),
      };
    }

    if (!item || typeof item !== "object") {
      return {
        id: `unknown-${index}`,
        name: `Görsel ${index + 1}`,
        displayable: false,
      };
    }

    const record = item as Record<string, unknown>;
    const legacyUrl = typeof record.url === "string" ? record.url.trim() : "";
    const filePath =
      typeof record.file_path === "string" ? record.file_path.trim() : "";
    // F-016: önce private signed URL (file_path), sonra legacy public url (dual-read).
    const resolved =
      (filePath && signed[filePath]) ||
      (isWebImageUrl(legacyUrl) ? legacyUrl : "");
    const displayable = Boolean(resolved);

    return {
      id: String(record.id ?? `img-${index}`),
      name: String(
        record.name ?? filePath.split(/[/\\]/).pop() ?? legacyUrl ?? `Görsel ${index + 1}`,
      ),
      url: displayable ? resolved : undefined,
      file_path: filePath || undefined,
      displayable,
    };
  });
}

function toSafeStone(data: Record<string, unknown> | null | undefined): StoneRecord | null {
  if (!data || data.id == null) return null;

  const stringField = (value: unknown) =>
    typeof value === "string" ? value : value != null ? String(value) : "";

  return {
    id: String(data.id),
    tenant_id: stringField(data.tenant_id),
    stone_name: stringField(data.stone_name) || "İsimsiz Taş",
    short_description: stringField(data.short_description),
    general_info: stringField(data.general_info),
    source_note: stringField(data.source_note),
    physical_effects: stringField(data.physical_effects),
    spiritual_effects: stringField(data.spiritual_effects),
    other_effects: stringField(data.other_effects),
    warning_text: stringField(data.warning_text),
    warning_tags: Array.isArray(data.warning_tags)
      ? data.warning_tags.map((tag) => String(tag)).filter(Boolean)
      : [],
    feng_shui: stringField(data.feng_shui),
    meditation: stringField(data.meditation),
    care: stringField(data.care),
    application: stringField(data.application),
    chakras: Array.isArray(data.chakras)
      ? data.chakras.map((chakra) => String(chakra)).filter(Boolean)
      : [],
    assignments: normalizeAssignments(data.assignments),
    images: normalizeImages(data.images),
    created_at: stringField(data.created_at) || new Date().toISOString(),
    updated_at: data.updated_at != null ? stringField(data.updated_at) : null,
    // WT9: birincil kaynağın adı (boş → NULL = belirtilmemiş).
    primary_source_name:
      typeof data.primary_source_name === "string" && data.primary_source_name.trim() ? data.primary_source_name : null,
  };
}

function safeFileName(fileName: string) {
  return fileName
    .replaceAll("ı", "i")
    .replaceAll("İ", "I")
    .replaceAll("ğ", "g")
    .replaceAll("Ğ", "G")
    .replaceAll("ü", "u")
    .replaceAll("Ü", "U")
    .replaceAll("ş", "s")
    .replaceAll("Ş", "S")
    .replaceAll("ö", "o")
    .replaceAll("Ö", "O")
    .replaceAll("ç", "c")
    .replaceAll("Ç", "C")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  // Legacy/bozuk kayıtlar: created_at/updated_at ISO olmayabilir (ör. epoch string,
  // "0000-00-00", boş sayı). Intl.format(Invalid Date) → RangeError ile TÜM sayfayı
  // çökertir. Geçersiz tarihte "-" döneriz (veri mutasyonu YOK, yalnız güvenli render).
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_42%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-3 px-4 py-4 sm:px-5 xl:px-8 2xl:px-10";
const uiHeaderCard =
  "rounded-2xl border-[2px] border-emerald-300/50 bg-white/80 p-4 shadow-md backdrop-blur-xl";
const uiProfileCard =
  "rounded-2xl border-[2px] border-violet-200/50 bg-gradient-to-br from-white/85 via-emerald-50/60 to-violet-50/60 p-3 shadow-md backdrop-blur-xl";
const uiImageArea =
  "flex min-h-[140px] items-center justify-center rounded-xl border-2 border-dashed border-emerald-200 bg-white/70 shadow-inner";
const uiStatBox =
  "rounded-xl border border-emerald-200 bg-white/85 p-3 text-center shadow-sm";
const uiInfoCard =
  "w-full rounded-xl border border-emerald-200/60 bg-white/80 p-3 text-left shadow-sm transition-colors duration-200 hover:border-violet-300 hover:bg-white";
const uiContentBox =
  "mt-2 min-h-[60px] rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm leading-6 text-slate-700 shadow-inner";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiThumb =
  "overflow-hidden rounded-xl border border-emerald-200 shadow-sm transition-all duration-200 hover:scale-[1.03]";

function toneClass(tone: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky" | "amber") {
  const toneMap = {
    slate:
      "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black tracking-wide text-slate-700",
    cyan: "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black tracking-wide text-emerald-700",
    violet:
      "inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black tracking-wide text-violet-700",
    emerald:
      "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black tracking-wide text-emerald-700",
    rose: "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black tracking-wide text-red-600",
    sky: "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black tracking-wide text-sky-700",
    amber:
      "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black tracking-wide text-amber-700",
  };

  return toneMap[tone];
}

function shortPreview(text: string | null | undefined, limit = 180) {
  // Boş içerik → "" döndürür; locale-aware empty-state metnini (t("noInfoYet"))
  // çağıran render sitesi ekler (sistem fallback'i EN'de Türkçe görünmemeli).
  if (!text || !text.trim()) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function rowsToText(rows: string[][] | unknown) {
  if (!Array.isArray(rows)) return "";

  return rows
    .map((row) => {
      if (Array.isArray(row)) return row.map((cell) => String(cell ?? "")).join(" / ");
      if (typeof row === "string") return row;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function textToRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean)
    );
}

function assignmentsToValues(assignments: Record<string, string[][]> | null | undefined) {
  const safeAssignments = normalizeAssignments(assignments);
  const result: Record<string, string> = {};

  ASSIGNMENT_SECTIONS.forEach((section) => {
    result[section] = rowsToText(safeAssignments[section]);
  });

  Object.entries(safeAssignments).forEach(([key, rows]) => {
    if (!(key in result)) result[key] = rowsToText(rows);
  });

  return result;
}

function valuesToAssignments(values: Record<string, string>) {
  const result: Record<string, string[][]> = {};

  Object.entries(values).forEach(([key, value]) => {
    const rows = textToRows(value);
    if (rows.length > 0) result[key] = rows;
  });

  return result;
}

/** Editörün düzenlenebilir kısmının karşılaştırılabilir anlık görüntüsü (taslak koruması). */
function editorSnapshot(editor: ActiveEditor): string {
  if (editor.mode === "text") return JSON.stringify(editor.value);
  if (editor.mode === "checkbox") return JSON.stringify([...editor.selected].sort());
  return JSON.stringify(editor.values);
}

function TextBlock({
  title,
  badge,
  text,
  tone = "slate",
  editEnabled,
  highlightQuery = "",
  hasSearchMatch = false,
  onOpenEdit,
  onOpenRead,
  isContentProtected = false,
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky" | "amber";
  editEnabled: boolean;
  highlightQuery?: string;
  hasSearchMatch?: boolean;
  onOpenEdit: () => void;
  onOpenRead: () => void;
  isContentProtected?: boolean;
}) {
  const t = useTranslations("stones.detail");
  const showMatchBadge = Boolean(highlightQuery.trim() && hasSearchMatch);
  const cardClass = mergeMatchCardClass(uiInfoCard, showMatchBadge);

  if (isContentProtected) {
    return (
      <button type="button" onClick={onOpenRead} className={cardClass}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={toneClass(tone)}>{badge}</span>
          <h2 className="text-sm font-black text-slate-950">{title}</h2>
        </div>
        <div className={uiContentBox}>
          <div
            className="overflow-hidden pointer-events-none select-none"
            style={{ filter: "blur(4px)", userSelect: "none" }}
            aria-hidden="true"
          >
            <p className={`line-clamp-4 whitespace-pre-wrap text-sm leading-6 ${!text?.trim() ? uiEmptyText : "text-slate-700"}`}>
              {shortPreview(text, 240) || t("noInfoYet")}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] font-black text-amber-600">
          {t("protectedHint")}
        </p>
      </button>
    );
  }

  if (editEnabled) {
    return (
      <button
        type="button"
        onClick={onOpenEdit}
        className={cardClass}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={toneClass(tone)}>{badge}</span>
              <h2 className="truncate text-sm font-black text-slate-950">{title}</h2>
              {showMatchBadge ? <SearchMatchBadge /> : null}
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-slate-500">
              {shortPreview(text, 80) || t("noInfoYet")}
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-700 shadow-sm">
            {t("edit")}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenRead}
      className={cardClass}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={toneClass(tone)}>{badge}</span>
        <h2 className="text-sm font-black text-slate-950">{title}</h2>
        {showMatchBadge ? <SearchMatchBadge /> : null}
      </div>

      <div className={uiContentBox}>
        {/* WT8: aramada eşleşen bölüm KISALTILMADAN gösterilir → metindeki TÜM geçişler görünür ve
            sarı vurgulu (önceden 240 karakterlik önizlemede yalnız ilk kısım görünüyordu). */}
        <p
          className={`${showMatchBadge ? "" : "line-clamp-4"} whitespace-pre-wrap text-sm leading-6 ${!text?.trim() ? uiEmptyText : "text-slate-700"}`}
        >
          {text?.trim()
            ? renderHighlightedText(showMatchBadge ? text.trim() : shortPreview(text, 240), highlightQuery)
            : t("noInfoYet")}
        </p>
      </div>

      <p className="mt-2 text-[11px] font-black text-emerald-700">
        {t("readMore")}
      </p>
    </button>
  );
}

function StoneDetailPage() {
  const t = useTranslations("stones.detail");
  const tl = useTranslations("stones.longText");
  const tre = useTranslations("stones.reportErrors");
  const { showToast } = useToast();
  // Chakra/warning checkbox editör: seçili value KANONİK Türkçe kalır (chakras[]/warning_tags[]
  // yazımı canonical'da); yalnız etiket localize. Anahtar yoksa canonical'a düşer.
  const tf = useTranslations("stones");
  const facet = (v: string) => (tf.has(`facetLabels.${v}`) ? tf(`facetLabels.${v}`) : v);
  // Atama section title display-only localize; KANONİK Türkçe key (`assignments` DB object key,
  // key=/write [section]) DEĞİŞMEZ.
  const asgLabel = (v: string) => (tf.has(`assignmentLabels.${v}`) ? tf(`assignmentLabels.${v}`) : v);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  useBfcacheRefresh();
  const searchParams = useSearchParams();
  const id = params?.id;
  const highlightQuery = searchParams.get("q")?.trim() ?? "";
  const astroFilter = searchParams.get("astro")?.trim() ?? "";
  const chakraFilter = searchParams.get("chakra")?.trim() ?? "";
  const mineralFilter = searchParams.get("mineral")?.trim() ?? "";
  const warnFilter = searchParams.get("warn") === "1";
  const hasFilterContext = Boolean(
    highlightQuery || astroFilter || chakraFilter || mineralFilter || warnFilter,
  );

  // Geri dönünce tüm filter state'i koru
  const listBackHref = (() => {
    const p = new URLSearchParams();
    if (highlightQuery) p.set("q", highlightQuery);
    if (astroFilter) p.set("astro", astroFilter);
    if (chakraFilter) p.set("chakra", chakraFilter);
    if (mineralFilter) p.set("mineral", mineralFilter);
    if (warnFilter) p.set("warn", "1");
    const s = p.toString();
    return s ? `/dogaltas/dogaltas-listesi?${s}` : "/dogaltas/dogaltas-listesi";
  })();
  const deleteConfirm = useDeleteConfirm();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [stone, setStone] = useState<StoneRecord | null>(null);
  const stoneRef = useRef<StoneRecord | null>(null);

  useEffect(() => {
    stoneRef.current = stone;
  }, [stone]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null);
  const [activeReader, setActiveReader] = useState<ActiveReader | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  // Yükleme-fazı hataları TYPED tutulur (control flow ≠ display string). Kullanıcıya
  // gösterilen metin t() ile locale'e göre; `kind` locale-bağımsız sınıflandırma.
  const [loadError, setLoadError] = useState<
    { kind: "notFound" | "loadFailed" | "workspace"; detail: string } | null
  >(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(
    null
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [wasViewed, setWasViewed] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  // WT9 çoklu kaynak: ek kaynaklar (birincil = stones satırı), seçili kaynak, ad önerileri.
  const [extraSources, setExtraSources] = useState<StoneSourceView[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string>(PRIMARY_SOURCE_ID);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const autoSourcePickedRef = useRef(false);

  // WT9: kaynak listesi = [birincil (taş satırı), ...ek kaynaklar]; görünen kayıt = seçili kaynağın
  // alanlarıyla taş (taşa özgü alanlar — ad, görseller, atamalar, uyarı etiketleri — ortak).
  const allSources = useMemo<StoneSourceView[]>(
    () => (stone ? buildStoneSourcesView(stone as unknown as Record<string, unknown>, []).slice(0, 1).concat(extraSources) : []),
    [stone, extraSources],
  );
  const activeExtra = useMemo(
    () => (activeSourceId === PRIMARY_SOURCE_ID ? null : extraSources.find((s) => s.id === activeSourceId) ?? null),
    [activeSourceId, extraSources],
  );
  const displayRecord = useMemo<StoneRecord | null>(() => {
    if (!stone) return null;
    if (!activeExtra) return stone;
    return { ...stone, ...activeExtra.fields, chakras: activeExtra.fields.chakras ?? [] };
  }, [stone, activeExtra]);
  // Aramada her kaynaktaki eşleşme sayısı (sekme rozeti) — mevcut aramayla aynı Türkçe katlama.
  const sourceMatchCounts = useMemo<Record<string, number>>(() => {
    const q = highlightQuery.trim();
    if (!q) return {};
    const out: Record<string, number> = {};
    for (const s of allSources) out[s.id] = findMatchRanges(sourceSearchText({ name: null, fields: s.fields }), [q]).length;
    return out;
  }, [allSources, highlightQuery]);
  // Aramayla gelindiyse ve birincil kaynakta eşleşme yoksa, ilk eşleşen kaynağı aç (bir kez).
  useEffect(() => {
    if (autoSourcePickedRef.current || !highlightQuery.trim() || extraSources.length === 0) return;
    autoSourcePickedRef.current = true;
    if ((sourceMatchCounts[PRIMARY_SOURCE_ID] ?? 0) > 0) return;
    const first = extraSources.find((s) => (sourceMatchCounts[s.id] ?? 0) > 0);
    if (first) runInEffect(() => setActiveSourceId(first.id));
  }, [extraSources, sourceMatchCounts, highlightQuery]);

  async function handleAddSource(name: string): Promise<string | null> {
    if (!stone) return "Taş yüklenmedi.";
    setSourcesBusy(true);
    const r = await createStoneSource(stone.id, name);
    setSourcesBusy(false);
    if (r.demo) return null;
    if (!r.ok) return r.error ?? "Kaynak eklenemedi.";
    if (r.row) {
      const created = buildStoneSourcesView(stone as unknown as Record<string, unknown>, [r.row])[1];
      if (created) {
        setExtraSources((prev) => [...prev, created]);
        setActiveSourceId(created.id);
      }
    }
    setSourceNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setSuccessMessage(`"${name}" kaynağı eklendi. Bu kaynağa ait alanları şimdi doldurabilirsiniz.`);
    return null;
  }

  async function handleRenameSource(sourceId: string, name: string): Promise<string | null> {
    if (!stone) return "Taş yüklenmedi.";
    setSourcesBusy(true);
    const r = await updateStoneSource(stone.id, sourceId, { source_name: name });
    setSourcesBusy(false);
    if (r.demo) return null;
    if (!r.ok) return r.error ?? "Kaynak adı kaydedilemedi.";
    if (sourceId === PRIMARY_SOURCE_ID) {
      if (r.row) commitStoneRecord(r.row);
    } else if (r.row) {
      const updated = buildStoneSourcesView(stone as unknown as Record<string, unknown>, [r.row])[1];
      if (updated) setExtraSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
    return null;
  }

  async function handleDeleteSource(sourceId: string) {
    if (!stone) return;
    const target = allSources.find((s) => s.id === sourceId);
    if (!target || allSources.length <= 1) return;
    const isPrimary = sourceId === PRIMARY_SOURCE_ID;
    const next = isPrimary ? extraSources[0] : null;
    const confirmed = await deleteConfirm({
      title: "Kaynağı sil",
      message: isPrimary
        ? `"${sourceDisplayName(target.name)}" kaynağı ve bu kaynağa ait metinler silinecek. "${sourceDisplayName(next?.name)}" ana kaynak olacak. Taş ve diğer kaynaklar korunur.`
        : `"${sourceDisplayName(target.name)}" kaynağı ve bu kaynağa ait metinler silinecek. Taş ve diğer kaynaklar korunur.`,
      secondMessage: "Bu işlem geri alınamaz. Emin misiniz?",
    });
    if (!confirmed) return;
    setSourcesBusy(true);
    const r = await deleteStoneSource(stone.id, sourceId);
    setSourcesBusy(false);
    if (r.demo) return;
    if (!r.ok) {
      setErrorMessage(r.error ?? "Kaynak silinemedi.");
      return;
    }
    setActiveSourceId(PRIMARY_SOURCE_ID);
    if (isPrimary) {
      await loadStone();
    } else {
      setExtraSources((prev) => prev.filter((s) => s.id !== sourceId));
    }
    setSuccessMessage("Kaynak silindi.");
  }

  const isAndroid = useIsAndroid();
  const [isDemoReference, setIsDemoReference] = useState(false);
  const { isDemo } = useDemoGuard();
  const isContentProtected = isDemo && !isDemoReference;

  // Taslak koruması: editör açılışındaki değer anlık görüntüsü; değişiklik varken
  // Esc / arka plan / Vazgeç sessizce atmaz, önce modal-içi onay ister.
  const editorSnapshotRef = useRef("");
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorInputRef = useRef<HTMLInputElement>(null);

  function closeEditorNow() {
    setDiscardPrompt(false);
    setActiveEditor(null);
  }

  function requestCloseEditor() {
    if (saving || !activeEditor) return;
    if (needsDiscardConfirm(editorSnapshotRef.current, editorSnapshot(activeEditor))) {
      setDiscardPrompt(true);
      return;
    }
    closeEditorNow();
  }

  // Düzenleme modalı: scroll-lock + Esc + focus tuzağı (P0-3/P0-4).
  const editorOverlay = useOverlay<HTMLDivElement>({
    open: Boolean(activeEditor),
    onClose: () => {
      // Onay açıkken Esc = "düzenlemeye dön".
      if (discardPrompt) {
        setDiscardPrompt(false);
        return;
      }
      requestCloseEditor();
    },
    initialFocusRef:
      activeEditor?.mode === "text"
        ? activeEditor.multiline
          ? editorTextareaRef
          : editorInputRef
        : undefined,
  });

  useEffect(() => {
    if (!id) return;
    try {
      const last = localStorage.getItem("yasam-dogaltas-last-viewed-stone-id");
      const raw = localStorage.getItem("yasam-dogaltas-list-viewed-search-results");
      const set: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      setWasViewed(last === id || set.includes(id));
    } catch {
      // localStorage erişim hatası — rozeti gösterme
    }
  }, [id]);

  function handleExitEditMode() {
    setEditEnabled(false);
    setActiveEditor(null);
    setActiveReader(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function commitStoneRecord(raw: Record<string, unknown> | null | undefined) {
    const safe = toSafeStone(raw);
    setStone(safe);
    return safe;
  }

  async function loadStone() {
    if (!id) return;

    setLoading(true);
    setErrorMessage("");
    setLoadError(null);
    setSuccessMessage("");

    try {
      const tenantId = await getSyncedTenantId();
      if (!tenantId) {
        setLoading(false);
        setStone(null);
        setLoadError({ kind: "workspace", detail: "" });
        return;
      }

      // Demo: liste sıralamasındaki ilk görünen taş → referans kayıt, tüm içerikler açık
      // getDemoReferenceStoneId: tenantFilter + updated_at DESC + exclusions + ?q= arama
      if (readYasamUser()?.is_demo_account) {
        const refId = await getDemoReferenceStoneId(tenantId, {
          search: highlightQuery || undefined,
          searchMode: "name",
        });
        setIsDemoReference(refId === id);
      }

      const { ok, row: data, error } = await getStone(id);

      setLoading(false);

      if (!ok) {
        setStone(null);
        setLoadError({ kind: "loadFailed", detail: error ?? "" });
        return;
      }

      if (!data) {
        setStone(null);
        setLoadError({ kind: "notFound", detail: `ID: ${id}` });
        return;
      }

      const safe = commitStoneRecord(data as Record<string, unknown>);
      if (!safe) {
        setLoadError({ kind: "loadFailed", detail: t("error.invalidData") });
      } else {
        void loadSources(id);
      }
    } catch (err) {
      setLoading(false);
      setStone(null);
      const message = err instanceof Error ? err.message : String(err);
      setLoadError({ kind: "loadFailed", detail: message });
    }
  }

  useEffect(() => {
    runInEffect(() => {
      loadStone();
    });
  }, [id]);

  // WT9: başka taşa geçilince kaynak seçimi sıfırlanır (önceki taşın kaynağı taşınmaz).
  useEffect(() => {
    autoSourcePickedRef.current = false;
    runInEffect(() => {
      setExtraSources([]);
      setActiveSourceId(PRIMARY_SOURCE_ID);
    });
  }, [id]);

  // WT9: ek kaynaklar (yalnız bu uzmanın taşı; migration yoksa boş → eski tek-kaynak görünümü).
  async function loadSources(stoneId: string) {
    const r = await fetchStoneSources(stoneId);
    if (r.ok && Array.isArray(r.sources)) setExtraSources(r.sources.filter((s) => !s.isPrimary));
  }

  // Düzenleme moduna girince uzmanın KENDİ kaynak adları (autocomplete).
  useEffect(() => {
    if (!editEnabled || isDemo) return;
    let alive = true;
    void fetchMySourceNames().then((names) => { if (alive) setSourceNames(names); });
    return () => { alive = false; };
  }, [editEnabled, isDemo]);

  function openReader(title: string, badge: string, text: string | null | undefined) {
    if (editEnabled) return;

    setActiveReader({
      title,
      badge,
      text: text && text.trim() ? text : t("noInfoYet"),
    });
  }

  function openTextEditor(
    field: EditableTextField,
    title: string,
    badge: string,
    multiline = true
  ) {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    // WT9: kaynak alanı → SEÇİLİ kaynağın değeri; taş adı → taş.
    const base = (field !== "stone_name" && displayRecord) ? displayRecord : stone;
    openEditor({
      mode: "text",
      field,
      title,
      badge,
      value: String(base[field] || ""),
      multiline,
    });
  }

  function openEditor(next: ActiveEditor) {
    editorSnapshotRef.current = editorSnapshot(next);
    setDiscardPrompt(false);
    setActiveEditor(next);
  }

  function openCheckboxEditor(
    field: "chakras" | "warning_tags",
    title: string,
    badge: string,
    options: readonly string[]
  ) {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    // WT9: çakralar kaynağa özgü (seçili kaynak); uyarı etiketleri taşa özgü.
    const selected = [...(((field === "chakras" && displayRecord) ? displayRecord : stone)[field]) || []];
    openEditor({
      mode: "checkbox",
      field,
      title,
      badge,
      selected,
      options,
      // P1-01: listede olmayan kayıtlı değerler görünür + kaldırılabilir (sessiz kayıp yok).
      legacy: legacyTaxonomyValues(field === "chakras" ? "chakra" : "warning", selected),
    });
  }

  function openAssignmentsEditor() {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    openEditor({
      mode: "assignments",
      title: t("sections.assignments"),
      badge: t("badges.assignment"),
      values: assignmentsToValues(stone.assignments),
    });
  }

  // P1-01: kanonik seçenek kavram bazında aç/kapa (eski yazım "Kalp Çakra" seçiliyse
  // "Kalp Çakrası" işaretli görünür; kapatınca tüm yazımları kalkar; açınca kanonik eklenir).
  function toggleSelected(option: string) {
    if (!activeEditor || activeEditor.mode !== "checkbox") return;
    const kind = activeEditor.field === "chakras" ? "chakra" : "warning";

    setActiveEditor({
      ...activeEditor,
      selected: toggleTaxonomyOption(kind, activeEditor.selected, option),
    });
  }

  // P1-01: listede olmayan eski değer birebir (yazımıyla) aç/kapa.
  function toggleLegacySelected(value: string) {
    if (!activeEditor || activeEditor.mode !== "checkbox") return;

    setActiveEditor({
      ...activeEditor,
      selected: toggleLegacyTaxonomyValue(activeEditor.selected, value),
    });
  }

  async function saveEditor() {
    if (!stone || !activeEditor) return;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(t("error.workspaceUnavailable"));
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (activeEditor.mode === "text") {
      if (activeEditor.field === "stone_name" && !activeEditor.value.trim()) {
        setSaving(false);
        setErrorMessage(t("editor.nameRequired"));
        return;
      }

      payload[activeEditor.field] = activeEditor.value.trim()
        ? activeEditor.value.trim()
        : null;
    }

    if (activeEditor.mode === "checkbox") {
      payload[activeEditor.field] = activeEditor.selected;
    }

    if (activeEditor.mode === "assignments") {
      const nextAssignments = valuesToAssignments(activeEditor.values);
      // Mineral oranı (Mineraller 2. sütun) 0..100 olmalı; boş serbest (DT-P0-4).
      const check = validateMineralAssignments(nextAssignments);
      if (!check.ok) {
        setSaving(false);
        // Yalnız DISPLAY localize; validation davranışı (check.ok) locale-bağımsız.
        setErrorMessage(tf("validation.mineralPercentInvalid"));
        return;
      }
      payload.assignments = check.value;
    }

    // WT9: ek kaynak seçiliyken kaynak alanları (metinler + çakralar) O KAYNAĞA yazılır; taşın
    // kendisi ve diğer kaynaklar değişmez. Taşa özgü alanlar (ad, atamalar, uyarı etiketleri) taşa.
    const sourceKeys = Object.keys(payload).filter((k) => (SOURCE_FIELDS as readonly string[]).includes(k));
    if (activeExtra && sourceKeys.length > 0) {
      const patch: Partial<Record<SourceField, string | string[] | null>> = {};
      for (const k of sourceKeys) patch[k as SourceField] = payload[k] as string | string[] | null;
      const r = await updateStoneSource(stone.id, activeExtra.id, patch);
      setSaving(false);
      if (!r.ok) {
        setErrorMessage(t("editor.updateFailed", { error: r.error ?? t("editor.updateFailedFallback") }));
        return;
      }
      if (r.row) {
        const updated = buildStoneSourcesView(stone as unknown as Record<string, unknown>, [r.row])[1];
        if (updated) setExtraSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      }
      closeEditorNow();
      return;
    }

    // F-03: yüklenen kaydın updated_at'i gönderilir → başka oturum araya yazdıysa 409;
    // son-yazan sessizce ezmez. Taslak editörde KORUNUR, kayıt arka planda tazelenir.
    const { ok, row: data, error, conflict } = await updateStone(stone.id, payload, stone.updated_at);

    setSaving(false);

    if (conflict) {
      setErrorMessage(error ?? t("editor.updateFailedFallback"));
      const fresh = await getStone(stone.id);
      if (fresh.ok && fresh.row) commitStoneRecord(fresh.row as Record<string, unknown>);
      return;
    }

    if (!ok || !data) {
      setErrorMessage(t("editor.updateFailed", { error: error ?? t("editor.updateFailedFallback") }));
      return;
    }

    commitStoneRecord(data as Record<string, unknown>);
    closeEditorNow();
  }

  async function downloadWordReport() {
    if (!safeStone) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) return;
    const sessionToken = readSessionToken();
    setWordBusy(true);
    try {
      // F-018: kimlik header'dan; body'de userId/tenantId GÖNDERİLMEZ.
      const res = await fetch(`/api/dogaltas/stones/${safeStone.id}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        // P2-09A: hata artık sessiz değil — durum koduna göre anlaşılır mesaj (ham metin yok).
        const kind = await reportErrorKind(res);
        showToast({ type: "error", message: tre(kind) });
        return;
      }
      const safeName = safeFileName(safeStone.stone_name);
      const dateSlug = reportFileDate();
      await downloadFileResponse(res, `dogaltas-${safeName}-${dateSlug}.docx`);
    } catch (err) {
      console.error("[dogaltas-detay] Word raporu hatası:", err);
      showToast({ type: "error", message: tre("generic") });
    } finally {
      setWordBusy(false);
    }
  }

  async function handleDeleteStoneTrigger() {
    if (!stone) return;
    const confirmed = await deleteConfirm({
      title: t("deleteConfirm.title"),
      message: t("deleteConfirm.message", { name: stone.stone_name || t("thisStone") }),
      secondMessage: t("deleteConfirm.second"),
    });
    if (!confirmed) return;
    await deleteStone();
  }

  async function deleteStone() {
    if (!stone) return;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(t("error.workspaceUnavailable"));
      return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const { ok, error } = await apiDeleteStone(stone.id);

    setDeleteLoading(false);

    if (!ok) {
      setErrorMessage(t("error.deleteFailed", { error: error ?? t("error.tryAgain") }));
      return;
    }

    router.push("/dogaltas/dogaltas-listesi");
  }

  // P2-05: DB'ye yazılan görsel şekli — yalnız kalıcı alanlar (id/name/file_path; legacy
  // kayıtta file_path yoksa eski url korunur). Görüntüleme alanları (displayable vb.) yazılmaz.
  function toPersistedImages(
    list: { id: string; name: string; url?: string; file_path?: string }[] | null | undefined,
  ) {
    return (list || []).map((img) => ({
      id: img.id,
      name: img.name,
      ...(img.file_path ? { file_path: img.file_path } : img.url ? { url: img.url } : {}),
    }));
  }

  // P2-05: storage temizliği (best-effort). Sunucu dosyayı YALNIZ hiçbir taş kaydı referans
  // etmiyorsa siler; başarısızlık ana kaydı bozmaz (en kötü durum orphan dosya, sunucu loglar).
  async function cleanupPhotoFiles(paths: string[]) {
    if (paths.length === 0) return;
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    for (const filePath of paths) {
      try {
        const res = await fetch("/api/dogaltas/stones/photos", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId ?? "",
            ...(sessionToken ? { "x-session-token": sessionToken } : {}),
          },
          body: JSON.stringify({ file_path: filePath }),
        });
        if (!res.ok) console.warn("[dogaltas-detay] görsel dosyası temizlenemedi:", `HTTP ${res.status}`);
      } catch (err) {
        console.warn("[dogaltas-detay] görsel dosyası temizlenemedi:", err);
      }
    }
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    event.target.value = "";
    const currentStone = stoneRef.current;
    if (!currentStone || files.length === 0) return;

    setImageBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    // F-016: DB source-of-truth = file_path (kalıcı public URL yok). Render sonra signed URL çözer.
    const additions: { id: string; name: string; file_path: string }[] = [];
    const baseImages = toPersistedImages(currentStone.images);

    try {
      for (const file of files) {
        // F-016: SUNUCU-YETKİLİ yükleme — tip/boyut/path server'da doğrulanır, tenant oturumdan.
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", file.name);
        let json: { ok?: boolean; demo?: boolean; image?: { id: string; name: string; file_path: string } } = {};
        let okRes = false;
        try {
          const res = await fetch("/api/dogaltas/stones/photos", {
            method: "POST",
            headers: {
              "x-user-id": userId ?? "",
              ...(sessionToken ? { "x-session-token": sessionToken } : {}),
            },
            body: fd,
          });
          okRes = res.ok;
          json = (await res.json().catch(() => ({}))) as typeof json;
        } catch {
          okRes = false;
        }
        if (json.demo) return;
        if (!okRes || !json.ok || !json.image) {
          // P2-05: yarıda kalan çoklu yüklemede önceki dosyalar orphan kalmaz.
          await cleanupPhotoFiles(additions.map((a) => a.file_path));
          setErrorMessage(t("image.uploadFailed"));
          return;
        }

        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: json.image.name || file.name,
          file_path: json.image.file_path,
        });
      }

      const nextImages = [...baseImages, ...additions];

      // P2-05: görsel listesi de optimistic concurrency ile yazılır → başka sekmenin
      // eklediği/kaldırdığı görsel referansı sessizce ezilmez (409 → güncel kayıt yüklenir).
      const { ok, row: data, error, conflict } = await updateStone(
        currentStone.id,
        { images: nextImages },
        currentStone.updated_at,
      );

      if (conflict || !ok || !data) {
        // Kayda bağlanamayan yeni dosyalar temizlenir (referanssız oldukları sunucuda doğrulanır).
        await cleanupPhotoFiles(additions.map((a) => a.file_path));
        if (conflict) {
          setErrorMessage(error ?? t("editor.updateFailedFallback"));
          const fresh = await getStone(currentStone.id);
          if (fresh.ok && fresh.row) commitStoneRecord(fresh.row as Record<string, unknown>);
          return;
        }
        setErrorMessage(t("editor.updateFailed", { error: error ?? t("editor.updateFailedFallback") }));
        return;
      }

      commitStoneRecord(data as Record<string, unknown>);
    } finally {
      setImageBusy(false);
    }
  }

  async function handleDeleteImage(image: {
    id: string;
    name: string;
    url?: string;
    file_path?: string;
  }) {
    const currentStone = stoneRef.current;
    if (!currentStone) return;

    // FAZ-1: Resim silme ortak güvenli onaya bağlandı (masaüstü tek onay, mobil/PWA 2 adım).
    const confirmed = await deleteConfirm({
      title: t("image.deleteConfirmTitle"),
      message: t("image.deleteConfirmMessage", { name: image.name }),
      secondMessage: t("image.deleteConfirmSecond", { name: image.name }),
    });
    if (!confirmed) return;

    setImageBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      // P2-05: ÖNCE kayıt güncellenir (optimistic concurrency ile); dosya ancak kayıt artık
      // ona bakmıyorsa silinir. Eskiden storage önce siliniyordu → kayıt güncellemesi
      // başarısız olursa kayıt silinmiş dosyaya bakıyordu (kısmi veri kaybı).
      const nextImages = toPersistedImages(
        (currentStone.images || []).filter((img) => img.id !== image.id),
      );

      const { ok, row: data, error, conflict } = await updateStone(
        currentStone.id,
        { images: nextImages },
        currentStone.updated_at,
      );

      if (conflict) {
        // Başka sekme/oturum kaydı değiştirmiş → hiçbir dosya silinmez; güncel kayıt yüklenir.
        setErrorMessage(error ?? t("editor.updateFailedFallback"));
        const fresh = await getStone(currentStone.id);
        if (fresh.ok && fresh.row) commitStoneRecord(fresh.row as Record<string, unknown>);
        return;
      }

      if (!ok || !data) {
        setErrorMessage(t("editor.updateFailed", { error: error ?? t("editor.updateFailedFallback") }));
        return;
      }

      if (previewImage?.url && image.url && previewImage.url === image.url) {
        setPreviewImage(null);
      }

      commitStoneRecord(data as Record<string, unknown>);

      // Kayıt artık bu dosyayı referans etmiyor → best-effort temizlik (sunucu referans kontrolü yapar).
      if (image.file_path) await cleanupPhotoFiles([image.file_path]);
    } catch (err) {
      console.error("[dogaltas-detay] görsel kaldırma hatası:", err);
      setErrorMessage(t("editor.updateFailed", { error: t("editor.updateFailedFallback") }));
    } finally {
      setImageBusy(false);
    }
  }

  const safeStone = useMemo(
    () => (displayRecord ? toSafeStone(displayRecord as unknown as Record<string, unknown>) : null),
    [displayRecord],
  );

  const sectionMatches = useMemo(() => {
    const q = highlightQuery.trim();
    if (!q || !safeStone) return null;

    const matchesText = (value: string | null | undefined) => textMatchesQuery(value, q);
    const matchesList = (items: string[]) => textMatchesQuery(items.join(" "), q);

    const chakras = Array.isArray(safeStone.chakras) ? safeStone.chakras : [];
    const warningTags = Array.isArray(safeStone.warning_tags) ? safeStone.warning_tags : [];
    const assignments: Record<string, string[][]> =
      safeStone.assignments &&
      typeof safeStone.assignments === "object" &&
      !Array.isArray(safeStone.assignments)
        ? safeStone.assignments
        : {};

    return {
      stoneName: matchesText(safeStone.stone_name),
      shortDescription: matchesText(safeStone.short_description),
      generalInfo: matchesText(safeStone.general_info),
      sourceNote: matchesText(safeStone.source_note),
      physicalEffects: matchesText(safeStone.physical_effects),
      spiritualEffects: matchesText(safeStone.spiritual_effects),
      otherEffects: matchesText(safeStone.other_effects),
      warningText: matchesText(safeStone.warning_text),
      fengShui: matchesText(safeStone.feng_shui),
      meditation: matchesText(safeStone.meditation),
      care: matchesText(safeStone.care),
      application: matchesText(safeStone.application),
      chakras: matchesList(chakras),
      warningTags: matchesList(warningTags),
      assignments: textMatchesQuery(assignmentsSearchText(assignments), q),
    };
  }, [highlightQuery, safeStone]);

  // WT8: sayfadaki TÜM görünür eşleşmeler (atamalar, çakralar, kullanım, uyarılar dahil) sarı; ilk
  // eşleşmeye bir kez kaydırılır — sonra kullanıcı serbestçe gezinir.
  const pageContentRef = useRef<HTMLDivElement | null>(null);
  const pageMatchCount = useSearchHighlight(pageContentRef, [highlightQuery], {
    enabled: Boolean(safeStone) && Boolean(highlightQuery.trim()),
    resetKey: `${safeStone?.id ?? ""}:${activeSourceId}`,
  });

  const readerHasMatch = useMemo(
    () =>
      Boolean(activeReader) &&
      Boolean(highlightQuery.trim()) &&
      textMatchesQuery(activeReader?.text, highlightQuery),
    [activeReader, highlightQuery],
  );

  // F-016: bu taşın görsel file_path'leri için batch signed URL (private-read, N+1'siz).
  // React #310 / Rules of Hooks: hook'lar aşağıdaki erken return'lerden (loading / hata /
  // !safeStone) ÖNCE çağrılmalı — aksi halde başarılı yüklemede "Rendered more hooks…" ile
  // sayfa çöker. Path listesi memoization gerektirmez: useSignedStoneImageUrls stabil string
  // "key" ile senkronize olur (dizi kimliği önemsiz). safeStone null iken güvenli boş liste.
  const imageFilePaths = (
    safeStone && Array.isArray(safeStone.images)
      ? safeStone.images.map((im) => imageFilePath(im)).filter(Boolean)
      : []
  ) as string[];
  const signedImageUrls = useSignedStoneImageUrls(imageFilePaths);

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          {t("loading")}
        </div>
      </main>
    );
  }

  if (loadError && !stone) {
    // Sınıflandırma TYPED `kind` üzerinden (locale-bağımsız); görünen metin t() ile.
    const title =
      loadError.kind === "notFound"
        ? t("error.notFound")
        : loadError.kind === "workspace"
          ? t("error.workspaceUnavailable")
          : t("error.loadFailed");
    const desc =
      loadError.kind === "notFound"
        ? t("error.notViewable")
        : loadError.kind === "workspace"
          ? ""
          : t("error.loadFailedHelp");

    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-[48px]">💎</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-950">{title}</h1>
          {desc ? (
            <p className="mt-3 whitespace-pre-line text-[13px] leading-6 text-slate-500">
              {desc}
            </p>
          ) : null}
          {loadError.detail ? (
            <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-slate-400">
              {loadError.detail}
            </p>
          ) : null}

          <Link
            href={listBackHref}
            className="btn-soft mt-6"
          >
            {hasFilterContext ? t("backToSearchShort") : t("backToListShort")}
          </Link>
        </div>
      </main>
    );
  }

  if (!safeStone) return null;

  // Ortak kütüphane YOK: owner'ın kendi taşı normal kayıttır (düzenlenir/silinir/raporlanır).
  const sessionTenant = getSessionTenantId();
  const isLibraryStone = sessionTenant !== null && safeStone.tenant_id !== sessionTenant;

  const safeChakras = Array.isArray(safeStone.chakras) ? safeStone.chakras : [];
  const safeImages = Array.isArray(safeStone.images) ? safeStone.images : [];
  const safeWarningTags = Array.isArray(safeStone.warning_tags) ? safeStone.warning_tags : [];

  const safeAssignments: Record<string, string[][]> =
    safeStone.assignments &&
    typeof safeStone.assignments === "object" &&
    !Array.isArray(safeStone.assignments)
      ? safeStone.assignments
      : {};

  const hasAssignments = Object.keys(safeAssignments).length > 0;

  const images = normalizeImages(safeImages, signedImageUrls);
  const imagesWithUrl = images.filter((img) => img.displayable && img.url);
  const imagesNotWebFormat = images.filter((img) => !img.displayable);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div ref={pageContentRef} className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-emerald-700">
                {t("eyebrow")}
              </span>
              {isLibraryStone && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
                  {t("libraryBadge")}
                </span>
              )}
              {wasViewed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black text-indigo-600">
                  {t("viewedBadge")}
                </span>
              )}
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openTextEditor("stone_name", t("sections.stoneName"), t("badges.title"), false)}
                className="block w-full rounded-xl border border-emerald-200 bg-white/90 px-3 py-1.5 text-left text-xl font-black tracking-tight text-slate-950 shadow-sm transition hover:border-violet-300 sm:text-2xl"
              >
                {safeStone.stone_name}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  {renderHighlightedText(safeStone.stone_name, highlightQuery)}
                </h1>
                {sectionMatches?.stoneName ? <SearchMatchBadge /> : null}
              </div>
            )}

            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {formatDate(safeStone.created_at)}
              {safeStone.updated_at ? t("updatedAt", { date: formatDate(safeStone.updated_at) }) : ""}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={listBackHref}
              className="btn-soft"
            >
              {hasFilterContext ? t("backToSearch") : t("backToList")}
            </Link>

            {!isLibraryStone && !isDemo && (
              <button
                type="button"
                onClick={() => {
                  if (editEnabled) {
                    handleExitEditMode();
                  } else {
                    setEditEnabled(true);
                    setActiveEditor(null);
                    setActiveReader(null);
                    setErrorMessage("");
                    setSuccessMessage("");
                  }
                }}
                className={editEnabled ? "btn-primary" : "btn-soft"}
              >
                {editEnabled ? t("save") : t("edit")}
              </button>
            )}

            {!isDemo && !isAndroid && (
              <button
                type="button"
                onClick={() => void downloadWordReport()}
                disabled={wordBusy}
                className="no-android btn-soft"
              >
                {wordBusy ? t("wordBusy") : t("wordButton")}
              </button>
            )}

            {!isLibraryStone && !isDemo && (
              <button
                type="button"
                onClick={() => void handleDeleteStoneTrigger()}
                className="btn-danger"
              >
                {t("delete")}
              </button>
            )}
          </div>
        </header>

        {hasFilterContext && (
          <div data-no-search-highlight className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-600">{t("matchLabel")}</span>
            {highlightQuery && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">🔍 {highlightQuery}</span>}
            {highlightQuery && pageMatchCount > 0 && (
              <span data-testid="search-match-count" className="rounded-full bg-yellow-200 px-2 py-0.5 text-[11px] font-black text-slate-900">
                {t("matchCount", { n: pageMatchCount })}
              </span>
            )}
            {astroFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">♈ {astroFilter}</span>}
            {chakraFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">🔵 {chakraFilter}</span>}
            {mineralFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">💎 {mineralFilter}</span>}
            {warnFilter && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">{t("filterWarnLabel")}</span>}
          </div>
        )}

        {editEnabled && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 text-xs font-black text-violet-800 shadow-sm">
            {t("editModeHint")}
          </div>
        )}

        {/* WT9: bilgi kaynağı seçici — metinlerin hangi kaynağa ait olduğu açıkça görünür. */}
        <StoneSourcesBar
          sources={allSources}
          activeId={activeSourceId}
          onSelect={(sid) => { if (!activeEditor) setActiveSourceId(sid); }}
          editable={editEnabled && !isDemo}
          busy={sourcesBusy || saving}
          matchCounts={sourceMatchCounts}
          suggestions={sourceNames}
          onAdd={handleAddSource}
          onRename={handleRenameSource}
          onDelete={(sid) => { void handleDeleteSource(sid); }}
        />

        {(errorMessage || successMessage) && (
          <div
            className={`rounded-2xl border-2 px-5 py-3 text-sm font-black ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[260px_1fr]">
          <aside className="space-y-3">
            <div className={`${uiProfileCard} text-center`}>
              {imagesWithUrl.length > 0 ? (
                <>
                  <div className={`relative flex-col overflow-hidden ${uiImageArea}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: imagesWithUrl[0].url!,
                          name: imagesWithUrl[0].name,
                        })
                      }
                      className="flex w-full items-center justify-center p-2"
                    >
                      <img
                        src={imagesWithUrl[0].url}
                        alt={imagesWithUrl[0].name}
                        className="max-h-[150px] w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                    {editEnabled && (
                      <button
                        type="button"
                        disabled={imageBusy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteImage(imagesWithUrl[0]);
                        }}
                        className="btn-danger absolute right-2 top-2 z-10 !px-2.5 !py-1 !text-[10px] !rounded-lg hidden md:inline-flex"
                      >
                        {t("delete")}
                      </button>
                    )}
                    <h2 className="w-full break-words border-t border-emerald-200/80 bg-white/70 px-3 pb-3 pt-3 text-xl font-black text-slate-950">
                      {renderHighlightedText(safeStone.stone_name, highlightQuery)}
                    </h2>
                  </div>

                  {imagesWithUrl.length > 1 && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {imagesWithUrl.slice(1).map((img) => (
                        <div key={img.id} className="relative h-14 w-14 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({ url: img.url!, name: img.name })
                            }
                            className={`flex h-14 w-14 ${uiThumb}`}
                          >
                            <img
                              src={img.url}
                              alt={img.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                          {editEnabled && (
                            <button
                              type="button"
                              disabled={imageBusy}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleDeleteImage(img);
                              }}
                              className="btn-danger absolute -right-1 -top-1 z-10 !px-1.5 !py-0.5 !text-[9px] !rounded-md hidden md:inline-flex"
                            >
                              {t("delete")}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={uiImageArea}>
                  <div className="min-w-0 px-3 py-2 text-center">
                    <div className="text-[34px]">💎</div>
                    <h2 className="mt-1 break-words text-sm font-black text-slate-900">
                      {safeStone.stone_name}
                    </h2>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">
                      {t("image.none")}
                    </p>
                  </div>
                </div>
              )}

              {imagesNotWebFormat.length > 0 && (
                <div className="mt-4 space-y-2 text-left">
                  <p className="text-[12px] font-black text-slate-700">
                    {t("image.notWebTitle")}
                  </p>
                  {imagesNotWebFormat.map((image) => (
                    <div
                      key={image.id}
                      className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100"
                    >
                      <span className="block min-w-0 truncate">{image.name}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                        {t("image.notWebFormat")}
                      </span>
                      {editEnabled && (
                        <button
                          type="button"
                          disabled={imageBusy}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteImage(image);
                          }}
                          className="btn-danger mt-2 shrink-0 !px-2 !py-1 !text-[10px] !rounded-lg hidden md:inline-flex"
                        >
                          {t("delete")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editEnabled && (
                <div className="mt-4 hidden md:block">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={imageBusy}
                  />
                  <button
                    type="button"
                    disabled={imageBusy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      photoInputRef.current?.click();
                    }}
                    className="btn-primary w-full"
                  >
                    {t("image.add")}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
            <button
              type="button"
              onClick={() => openCheckboxEditor("chakras", t("sections.chakras"), t("badges.chakra"), CHAKRA_OPTIONS)}
              className={mergeMatchCardClass(uiInfoCard, Boolean(sectionMatches?.chakras))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-black text-slate-950">{t("sections.chakras")}</h3>
                  {sectionMatches?.chakras ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    {t("select")}
                  </span>
                )}
              </div>

              {isContentProtected ? (
                <div className="pointer-events-none mt-2 select-none overflow-hidden" style={{ filter: "blur(4px)", userSelect: "none" }} aria-hidden="true">
                  <div className="flex flex-wrap gap-1.5">
                    {safeChakras.length === 0 ? (
                      <span className="text-xs text-slate-400">-</span>
                    ) : (
                      safeChakras.map((chakra) => (
                        <span key={chakra} className={toneClass("violet")}>{facet(chakra)}</span>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {safeChakras.length === 0 ? (
                    <span className="text-xs text-slate-400">-</span>
                  ) : (
                    safeChakras.slice(0, editEnabled ? 3 : 99).map((chakra) => (
                      <span key={chakra} className={toneClass("violet")}>{facet(chakra)}</span>
                    ))
                  )}
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => openCheckboxEditor("warning_tags", t("sections.warningTags"), t("badges.warningTags"), WARNING_OPTIONS)}
              className={mergeMatchCardClass(uiInfoCard, Boolean(sectionMatches?.warningTags))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-black text-slate-950">{t("sections.warningTags")}</h3>
                  {sectionMatches?.warningTags ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    {t("select")}
                  </span>
                )}
              </div>

              {isContentProtected ? (
                <div className="pointer-events-none mt-2 select-none overflow-hidden" style={{ filter: "blur(4px)", userSelect: "none" }} aria-hidden="true">
                  <div className="flex flex-wrap gap-1.5">
                    {safeWarningTags.length === 0 ? (
                      <span className="text-xs text-slate-400">-</span>
                    ) : (
                      safeWarningTags.map((tag) => (
                        <span key={tag} className={toneClass("rose")}>{tag}</span>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {safeWarningTags.length === 0 ? (
                    <span className="text-xs text-slate-400">-</span>
                  ) : (
                    safeWarningTags.slice(0, editEnabled ? 3 : 99).map((tag) => (
                      <span key={tag} className={toneClass("rose")}>{tag}</span>
                    ))
                  )}
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={openAssignmentsEditor}
              className={mergeMatchCardClass(uiInfoCard, Boolean(sectionMatches?.assignments))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-black text-slate-950">{t("sections.assignments")}</h3>
                  {sectionMatches?.assignments ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    {t("edit")}
                  </span>
                )}
              </div>

              {isContentProtected ? (
                <div className="pointer-events-none mt-2 select-none overflow-hidden space-y-1.5" style={{ filter: "blur(4px)", userSelect: "none" }} aria-hidden="true">
                  {hasAssignments ? (
                    Object.entries(safeAssignments).slice(0, 3).map(([title, rows]) => {
                      const safeRows = Array.isArray(rows) ? rows : [];
                      if (safeRows.length === 0) return null;
                      return (
                        <div key={title} className="rounded-lg bg-slate-50/80 px-2 py-1.5">
                          <p className="text-[11px] font-black text-slate-600">{asgLabel(title)}</p>
                          <div className="mt-0.5 space-y-0.5">
                            {safeRows.slice(0, 2).map((row, index) => {
                              const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")];
                              return (
                                <p key={`${title}-${index}`} className="text-[11px] leading-4 text-slate-500">
                                  • {cells.filter(Boolean).join(" / ")}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {hasAssignments ? (
                    Object.entries(safeAssignments).map(([title, rows]) => {
                      const safeRows = Array.isArray(rows) ? rows : [];
                      if (safeRows.length === 0) return null;

                      return (
                        <div key={title} className="rounded-lg bg-slate-50/80 px-2 py-1.5">
                          <p className="text-[11px] font-black text-slate-600">{asgLabel(title)}</p>
                          <div className="mt-0.5 space-y-0.5">
                            {safeRows.slice(0, editEnabled ? 2 : 4).map((row, index) => {
                              const cells = Array.isArray(row)
                                ? row.map((cell) => String(cell ?? ""))
                                : [String(row ?? "")];
                              return (
                                <p key={`${title}-${index}`} className="text-[11px] leading-4 text-slate-500">
                                  • {cells.filter(Boolean).join(" / ")}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </div>
              )}
            </button>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TextBlock
              title={t("sections.shortDesc")}
              badge={t("badges.generalInfo")}
              text={safeStone.short_description}
              tone="cyan"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.shortDescription}
              onOpenEdit={() => openTextEditor("short_description", t("sections.shortDesc"), t("badges.generalInfo"))}
              onOpenRead={() => openReader(t("sections.shortDesc"), t("badges.generalInfo"), safeStone.short_description)}
            />

            <TextBlock
              title={t("sections.generalInfo")}
              badge={t("badges.detailedInfo")}
              text={safeStone.general_info}
              tone="cyan"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.generalInfo}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("general_info", t("sections.generalInfo"), t("badges.detailedInfo"))}
              onOpenRead={() => openReader(t("sections.generalInfo"), t("badges.detailedInfo"), safeStone.general_info)}
            />

            <TextBlock
              title={t("sections.sourceNote")}
              badge={t("badges.source")}
              text={safeStone.source_note}
              tone="slate"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.sourceNote}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("source_note", t("sections.sourceNote"), t("badges.source"))}
              onOpenRead={() => openReader(t("sections.sourceNote"), t("badges.source"), safeStone.source_note)}
            />

            <TextBlock
              title={t("sections.physicalEffects")}
              badge={t("badges.physical")}
              text={safeStone.physical_effects}
              tone="emerald"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.physicalEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("physical_effects", t("sections.physicalEffects"), t("badges.physical"))}
              onOpenRead={() => openReader(t("sections.physicalEffects"), t("badges.physical"), safeStone.physical_effects)}
            />

            <TextBlock
              title={t("sections.spiritualEffects")}
              badge={t("badges.spiritual")}
              text={safeStone.spiritual_effects}
              tone="violet"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.spiritualEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("spiritual_effects", t("sections.spiritualEffects"), t("badges.spiritual"))}
              onOpenRead={() => openReader(t("sections.spiritualEffects"), t("badges.spiritual"), safeStone.spiritual_effects)}
            />

            <TextBlock
              title={t("sections.otherEffects")}
              badge={t("badges.complementary")}
              text={safeStone.other_effects}
              tone="amber"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.otherEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("other_effects", t("sections.otherEffects"), t("badges.complementary"))}
              onOpenRead={() => openReader(t("sections.otherEffects"), t("badges.complementary"), safeStone.other_effects)}
            />

            <div className="lg:col-span-2">
              <TextBlock
                title={t("sections.warnings")}
                badge={t("badges.clinical")}
                text={safeStone.warning_text}
                tone="rose"
                editEnabled={editEnabled}
                highlightQuery={highlightQuery}
                hasSearchMatch={sectionMatches?.warningText}
                isContentProtected={isContentProtected}
                onOpenEdit={() => openTextEditor("warning_text", t("sections.warnings"), t("badges.clinical"))}
                onOpenRead={() =>
                  openReader(t("sections.warnings"), t("badges.clinical"), safeStone.warning_text)
                }
              />
            </div>

            <section className={`${uiInfoCard} lg:col-span-2`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={toneClass("cyan")}>{t("badges.usage")}</span>
                <h2 className="text-sm font-black text-slate-950">{t("sections.usageTitle")}</h2>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  [t("sections.fengShui"), "feng_shui", safeStone.feng_shui],
                  [t("sections.meditation"), "meditation", safeStone.meditation],
                  [t("sections.care"), "care", safeStone.care],
                  [t("sections.application"), "application", safeStone.application],
                ].map(([title, key, text]) => {
                  const usageMatchKey =
                    key === "feng_shui"
                      ? "fengShui"
                      : key === "meditation"
                        ? "meditation"
                        : key === "care"
                          ? "care"
                          : "application";
                  const usageHasMatch = Boolean(
                    sectionMatches?.[usageMatchKey as keyof typeof sectionMatches],
                  );

                  return (
                  <button
                    key={title}
                    type="button"
                    onClick={() =>
                      isContentProtected
                        ? undefined
                        : editEnabled
                          ? openTextEditor(key as EditableTextField, String(title), t("badges.usageArea"))
                          : openReader(String(title), t("badges.usageArea"), String(text || ""))
                    }
                    className={mergeMatchCardClass(
                      "rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 text-left shadow-inner transition hover:border-emerald-300 hover:bg-white",
                      usageHasMatch,
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-xs font-black text-slate-950">{title}</h3>
                        {usageHasMatch ? <SearchMatchBadge /> : null}
                      </div>
                      {!isContentProtected && (editEnabled ? (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 ring-1 ring-emerald-100">
                          {t("edit")}
                        </span>
                      ) : (
                        <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-400 ring-1 ring-slate-100">
                          {t("readMode")}
                        </span>
                      ))}
                    </div>

                    {isContentProtected ? (
                      <div className="overflow-hidden">
                        <p
                          className="pointer-events-none mt-1 select-none line-clamp-2 text-xs leading-5 text-slate-600"
                          style={{ filter: "blur(4px)", userSelect: "none" }}
                          aria-hidden="true"
                        >
                          {String(text || "").trim() ? shortPreview(String(text || ""), 80) : "—"}
                        </p>
                      </div>
                    ) : (
                      <p className={`mt-1 line-clamp-2 text-xs leading-5 ${!String(text || "").trim() ? uiEmptyText : "text-slate-600"}`}>
                        {String(text || "").trim()
                          ? renderHighlightedText(shortPreview(String(text || ""), 80), highlightQuery)
                          : t("noInfoYet")}
                      </p>
                    )}
                  </button>
                  );
                })}
              </div>
            </section>
          </section>
        </section>
      </div>

      <StoneReaderModal
        open={Boolean(activeReader)}
        title={activeReader?.title ?? ""}
        badge={activeReader?.badge ?? ""}
        subtitle={t("readerSubtitle", { name: safeStone.stone_name })}
        text={activeReader?.text ?? ""}
        highlightQuery={highlightQuery}
        renderHighlight={(segment, key) => (
          <Fragment key={key}>{renderHighlightedText(segment, highlightQuery)}</Fragment>
        )}
        matchBadge={readerHasMatch ? <SearchMatchBadge /> : null}
        contentBlurred={isContentProtected}
        onClose={() => setActiveReader(null)}
      />

      {activeEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) requestCloseEditor();
          }}
        >
          <div
            ref={editorOverlay.containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dogaltas-editor-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-[920px] overflow-y-auto rounded-[30px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)] ring-1 ring-white"
          >
            <header className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                  {activeEditor.badge}
                </div>

                <h2
                  id="dogaltas-editor-title"
                  className="text-[24px] font-black text-slate-950"
                >
                  {activeEditor.title}
                </h2>

                <p className="mt-1 text-[12px] font-bold text-slate-400">
                  {t("editor.editing", { name: safeStone.stone_name })}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={requestCloseEditor}
                  disabled={saving}
                  className="btn-soft"
                >
                  {t("editor.cancel")}
                </button>

                <button
                  type="button"
                  onClick={saveEditor}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? t("editor.saving") : t("editor.saveUpdate")}
                </button>
              </div>
            </header>

            {errorMessage ? (
              <div
                className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            {discardPrompt ? (
              <div
                className="mb-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                role="alert"
                data-discard-prompt=""
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-amber-800">{tl("discard.title")}</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-amber-700">{tl("discard.message")}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscardPrompt(false)}
                    className="btn-primary"
                    autoFocus
                  >
                    {tl("discard.keepEditing")}
                  </button>
                  <button type="button" onClick={closeEditorNow} className="btn-soft">
                    {tl("discard.discard")}
                  </button>
                </div>
              </div>
            ) : null}

            {activeEditor.mode === "checkbox" && (
              <div className="grid max-h-[56vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {activeEditor.options.map((option) => {
                  const checked = isTaxonomyOptionSelected(
                    activeEditor.field === "chakras" ? "chakra" : "warning",
                    activeEditor.selected,
                    option,
                  );

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleSelected(option)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-[13px] font-black ring-1 transition ${
                        checked
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-slate-50 text-slate-600 ring-slate-100 hover:bg-white"
                      }`}
                    >
                      <span>{facet(option)}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg text-[13px] ${
                          checked
                            ? "bg-emerald-600 text-white"
                            : "bg-white text-slate-300 ring-1 ring-slate-200"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
                {activeEditor.legacy.length > 0 && (
                  <div className="sm:col-span-2 rounded-2xl bg-amber-50/70 p-3 ring-1 ring-amber-200" data-testid="taxonomy-legacy">
                    <p className="text-[12px] font-black text-amber-900">{t("editor.legacyTitle")}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-amber-800">{t("editor.legacyHint")}</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activeEditor.legacy.map((value) => {
                        const checked = activeEditor.selected.includes(value);
                        return (
                          <button
                            key={`legacy-${value}`}
                            type="button"
                            onClick={() => toggleLegacySelected(value)}
                            aria-pressed={checked}
                            className={`flex min-h-11 items-center justify-between rounded-2xl px-4 py-2 text-left text-[13px] font-black ring-1 transition ${
                              checked
                                ? "bg-white text-amber-900 ring-amber-300"
                                : "bg-white/60 text-slate-400 line-through ring-slate-200"
                            }`}
                          >
                            <span className="break-words">{facet(value)}</span>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px] ${
                                checked ? "bg-amber-600 text-white" : "bg-white text-slate-300 ring-1 ring-slate-200"
                              }`}
                            >
                              {checked ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeEditor.mode === "assignments" && (
              <div className="grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {Object.entries(activeEditor.values).map(([section, value]) => (
                  <div key={section} className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <label className="text-[13px] font-black text-slate-800">
                      {asgLabel(section)}
                    </label>

                    <textarea
                      value={value}
                      onChange={(event) =>
                        setActiveEditor({
                          ...activeEditor,
                          values: {
                            ...activeEditor.values,
                            [section]: event.target.value,
                          },
                        })
                      }
                      className="mt-3 h-[105px] w-full resize-none rounded-2xl border border-emerald-100 bg-white p-3 text-[12px] leading-6 text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                      placeholder={t("editor.assignmentPlaceholder")}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeEditor.mode === "text" &&
              (activeEditor.multiline ? (
                <textarea
                  ref={editorTextareaRef}
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-[430px] max-h-[62vh] w-full resize-none rounded-[24px] border border-emerald-100 bg-white p-5 text-[15px] leading-8 text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                  placeholder={t("editor.textPlaceholder", { title: activeEditor.title })}
                />
              ) : (
                <input
                  ref={editorInputRef}
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-16 w-full rounded-2xl border border-emerald-100 bg-white px-5 text-[24px] font-black text-slate-950 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                  placeholder={t("editor.textPlaceholder", { title: activeEditor.title })}
                />
              ))}
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-6"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white transition hover:bg-white/20"
          >
            ×
          </button>

          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-[0_35px_90px_rgba(0,0,0,0.55)]"
            loading="lazy"
            decoding="async"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

function StoneDetailPageFallback() {
  const t = useTranslations("stones.detail");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-500">
      <p className="text-sm font-semibold text-slate-600">{t("loading")}</p>
    </main>
  );
}

export default function StoneDetailRoutePage() {
  return (
    <Suspense fallback={<StoneDetailPageFallback />}>
      <StoneDetailPage />
    </Suspense>
  );
}

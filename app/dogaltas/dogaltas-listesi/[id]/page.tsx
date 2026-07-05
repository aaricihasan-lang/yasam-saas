"use client";

import { runInEffect } from "@/lib/runInEffect";
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
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import {
  ADMIN_LIBRARY_TENANT_ID,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { StoneReaderModal } from "@/app/dogaltas/components/StoneReaderModal";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { getDemoReferenceStoneId } from "@/lib/dogaltas/stonesListFetch";
import { getStone, updateStone, deleteStone as apiDeleteStone } from "@/lib/dogaltas/dogaltasApi";
import { validateMineralAssignments, MINERAL_PERCENT_ERROR } from "@/lib/dogaltas/mineralPercent";
import {
  mergeMatchCardClass,
  renderHighlightedText,
  SEARCH_MATCH_BADGE_CLASS,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";
import { useOverlay } from "@/lib/dogaltas/useOverlay";

const STONE_BUCKET = "stone-photos";


function SearchMatchBadge() {
  return <span className={SEARCH_MATCH_BADGE_CLASS}>🔎 Eşleşme Var</span>;
}


function assignmentsSearchText(assignments: Record<string, string[][]> | null): string {
  if (!assignments) return "";
  return Object.entries(assignments)
    .map(([title, rows]) => `${title} ${rowsToText(rows)}`)
    .join(" ");
}

const CHAKRA_OPTIONS = [
  "Kök Çakra",
  "Sakral Çakra",
  "Solar Pleksus",
  "Kalp Çakrası",
  "Boğaz Çakrası",
  "Üçüncü Göz",
  "Taç Çakra",
];

const WARNING_OPTIONS = [
  "Çocuklar",
  "Hamileler",
  "Tansiyon",
  "Kalp Rahatsızlığı",
  "Epilepsi",
  "Alerji",
  "Böbrek",
  "Uyku",
  "Psikolojik Hassasiyet",
  "Uzman Kontrolü",
];

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
      options: string[];
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

function normalizeImages(raw: unknown): StoneImageItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (typeof item === "string") {
      const path = item.trim();
      return {
        id: `legacy-${index}`,
        name: path.split(/[/\\]/).pop() || `Görsel ${index + 1}`,
        file_path: path || undefined,
        displayable: false,
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
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const filePath =
      typeof record.file_path === "string" ? record.file_path.trim() : "";
    const displayable = isWebImageUrl(url);

    return {
      id: String(record.id ?? `img-${index}`),
      name: String(
        record.name ?? filePath.split(/[/\\]/).pop() ?? url ?? `Görsel ${index + 1}`,
      ),
      url: displayable ? url : undefined,
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

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  if (!text || !text.trim()) return "Henüz bilgi girilmedi.";
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
              {shortPreview(text, 240) || "Henüz bilgi girilmedi."}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] font-black text-amber-600">
          🔒 Demo hesabında korumalı · yapıyı görmek için tıklayın
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
              {shortPreview(text, 80)}
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-700 shadow-sm">
            Düzenle
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
        <p
          className={`line-clamp-4 whitespace-pre-wrap text-sm leading-6 ${!text?.trim() ? uiEmptyText : "text-slate-700"}`}
        >
          {text?.trim()
            ? renderHighlightedText(shortPreview(text, 240), highlightQuery)
            : shortPreview(text, 240)}
        </p>
      </div>

      <p className="mt-2 text-[11px] font-black text-emerald-700">
        Tam okumak için tıklayın →
      </p>
    </button>
  );
}

function StoneDetailPage() {
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
  const { confirm } = useConfirm();
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
  const [successMessage, setSuccessMessage] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(
    null
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [wasViewed, setWasViewed] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [isDemoReference, setIsDemoReference] = useState(false);
  const { isDemo } = useDemoGuard();
  const isContentProtected = isDemo && !isDemoReference;

  // Düzenleme modalı: scroll-lock + Esc + focus tuzağı (P0-3/P0-4).
  const editorOverlay = useOverlay<HTMLDivElement>({
    open: Boolean(activeEditor),
    onClose: () => {
      if (!saving) setActiveEditor(null);
    },
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
    setSuccessMessage("");

    try {
      const tenantId = await getSyncedTenantId();
      if (!tenantId) {
        setLoading(false);
        setStone(null);
        setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
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
        setErrorMessage(`Kayıt okunurken hata oluştu\n${error ?? ""}`);
        return;
      }

      if (!data) {
        setStone(null);
        setErrorMessage(`Kayıt bulunamadı.\nID: ${id}`);
        return;
      }

      const safe = commitStoneRecord(data as Record<string, unknown>);
      if (!safe) {
        setErrorMessage(`Kayıt okunurken hata oluştu\nGeçersiz kayıt verisi`);
      }
    } catch (err) {
      setLoading(false);
      setStone(null);
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Kayıt okunurken hata oluştu\n${message}`);
    }
  }

  useEffect(() => {
    runInEffect(() => {
      loadStone();
    });
  }, [id]);

  function openReader(title: string, badge: string, text: string | null | undefined) {
    if (editEnabled) return;

    setActiveReader({
      title,
      badge,
      text: text && text.trim() ? text : "Henüz bilgi girilmedi.",
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
    setActiveEditor({
      mode: "text",
      field,
      title,
      badge,
      value: String(stone[field] || ""),
      multiline,
    });
  }

  function openCheckboxEditor(
    field: "chakras" | "warning_tags",
    title: string,
    badge: string,
    options: string[]
  ) {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      mode: "checkbox",
      field,
      title,
      badge,
      selected: stone[field] || [],
      options,
    });
  }

  function openAssignmentsEditor() {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      mode: "assignments",
      title: "Atamalar",
      badge: "ATAMA",
      values: assignmentsToValues(stone.assignments),
    });
  }

  function toggleSelected(option: string) {
    if (!activeEditor || activeEditor.mode !== "checkbox") return;

    setActiveEditor({
      ...activeEditor,
      selected: activeEditor.selected.includes(option)
        ? activeEditor.selected.filter((item) => item !== option)
        : [...activeEditor.selected, option],
    });
  }

  async function saveEditor() {
    if (!stone || !activeEditor) return;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
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
        setErrorMessage("Taş adı boş bırakılamaz.");
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
        setErrorMessage(check.error ?? MINERAL_PERCENT_ERROR);
        return;
      }
      payload.assignments = check.value;
    }

    const { ok, row: data, error } = await updateStone(stone.id, payload);

    setSaving(false);

    if (!ok || !data) {
      setErrorMessage(`Kayıt güncellenemedi: ${error ?? "kayıt bulunamadı."}`);
      return;
    }

    commitStoneRecord(data as Record<string, unknown>);
    setActiveEditor(null);
  }

  async function downloadWordReport() {
    if (!safeStone) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    const userId = readYasamUser()?.id;
    if (!userId) return;
    setWordBusy(true);
    try {
      const res = await fetch(`/api/dogaltas/stones/${safeStone.id}/word-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = safeFileName(safeStone.stone_name);
      const dateSlug = new Date().toISOString().slice(0, 10);
      a.download = `dogaltas-${safeName}-${dateSlug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // sessiz hata — kullanıcı network iletişimini zaten görecek
    } finally {
      setWordBusy(false);
    }
  }

  async function handleDeleteStoneTrigger() {
    if (!stone) return;
    const confirmed = await deleteConfirm({
      title: "Taşı Sil",
      message: `"${stone.stone_name || "Bu taş"}" kaydını silmek istediğinizden emin misiniz?`,
      secondMessage: "Bu işlem geri alınamaz. Kalıcı olarak silinsin mi?",
    });
    if (!confirmed) return;
    await deleteStone();
  }

  async function deleteStone() {
    if (!stone) return;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setDeleteLoading(true);
    setErrorMessage("");

    const { ok, error } = await apiDeleteStone(stone.id);

    setDeleteLoading(false);

    if (!ok) {
      setErrorMessage(`Kayıt silinemedi: ${error ?? "Lütfen tekrar deneyin."}`);
      return;
    }

    router.push("/dogaltas/dogaltas-listesi");
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

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setImageBusy(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const additions: { id: string; name: string; url: string; file_path: string }[] = [];
    const baseImages = [...(currentStone.images || [])];

    for (const file of files) {
      const cleanName = safeFileName(file.name);
      const filePath = `catalog/${tenantId}/${currentStone.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from(STONE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setImageBusy(false);
        setErrorMessage(`Görsel yüklenemedi: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(STONE_BUCKET).getPublicUrl(filePath);

      additions.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        url: publicUrlData.publicUrl,
        file_path: filePath,
      });
    }

    const nextImages = [...baseImages, ...additions];

    const { ok, row: data, error } = await updateStone(currentStone.id, { images: nextImages });

    setImageBusy(false);

    if (!ok || !data) {
      setErrorMessage(`Kayıt güncellenemedi: ${error ?? "kayıt bulunamadı."}`);
      return;
    }

    commitStoneRecord(data as Record<string, unknown>);
  }

  async function handleDeleteImage(image: {
    id: string;
    name: string;
    url?: string;
    file_path?: string;
  }) {
    const currentStone = stoneRef.current;
    if (!currentStone) return;

    const confirmed = await confirm({
      title: "Fotoğrafı sil",
      message: `${image.name} silinsin mi? Bu işlem geri alınamaz.`,
      tone: "danger",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setImageBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (image.file_path) {
      const { error: removeError } = await supabase.storage.from(STONE_BUCKET).remove([image.file_path]);
      if (removeError) {
        setImageBusy(false);
        setErrorMessage(`Depolama temizlenemedi: ${removeError.message}`);
        return;
      }
    }

    const nextImages = (currentStone.images || []).filter((img) => img.id !== image.id);

    const { ok, row: data, error } = await updateStone(currentStone.id, {
      images: nextImages.length > 0 ? nextImages : [],
    });

    setImageBusy(false);

    if (!ok || !data) {
      setErrorMessage(`Kayıt güncellenemedi: ${error ?? "kayıt bulunamadı."}`);
      return;
    }

    if (previewImage?.url && image.url && previewImage.url === image.url) {
      setPreviewImage(null);
    }

    commitStoneRecord(data as Record<string, unknown>);
  }

  const safeStone = useMemo(
    () => (stone ? toSafeStone(stone as unknown as Record<string, unknown>) : null),
    [stone],
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

  const readerHasMatch = useMemo(
    () =>
      Boolean(activeReader) &&
      Boolean(highlightQuery.trim()) &&
      textMatchesQuery(activeReader?.text, highlightQuery),
    [activeReader, highlightQuery],
  );

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          Kayıt yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !stone) {
    const isReadError = errorMessage.startsWith("Kayıt okunurken hata oluştu");

    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-[48px]">💎</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-950">
            {isReadError ? "Kayıt okunurken hata oluştu" : "Kayıt bulunamadı"}
          </h1>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-6 text-slate-500">
            {isReadError
              ? errorMessage.replace(/^Kayıt okunurken hata oluştu\n?/, "")
              : errorMessage || "Bu doğaltaş kaydı görüntülenemedi."}
          </p>

          <Link
            href={listBackHref}
            className="btn-soft mt-6"
          >
            {hasFilterContext ? "Aramaya Dön" : "Taş Listesine Dön"}
          </Link>
        </div>
      </main>
    );
  }

  if (!safeStone) return null;

  const isLibraryStone = safeStone.tenant_id === ADMIN_LIBRARY_TENANT_ID;

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

  const images = normalizeImages(safeImages);
  const imagesWithUrl = images.filter((img) => img.displayable && img.url);
  const imagesNotWebFormat = images.filter((img) => !img.displayable);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-emerald-700">
                💎 DOĞALTAŞ DETAY
              </span>
              {isLibraryStone && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
                  📚 Kütüphane · Görüntüleme
                </span>
              )}
              {wasViewed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black text-indigo-600">
                  👁 Bakıldı
                </span>
              )}
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openTextEditor("stone_name", "Taş Adı", "BAŞLIK", false)}
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
              {safeStone.updated_at ? ` · güncellendi ${formatDate(safeStone.updated_at)}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={listBackHref}
              className="btn-soft"
            >
              {hasFilterContext ? "← Aramaya Dön" : "← Taş Listesi"}
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
                {editEnabled ? "Kaydet" : "Düzenle"}
              </button>
            )}

            {!isDemo && (
              <button
                type="button"
                onClick={() => void downloadWordReport()}
                disabled={wordBusy}
                className="btn-soft"
              >
                {wordBusy ? "⏳..." : "📄 Word"}
              </button>
            )}

            {!isLibraryStone && !isDemo && (
              <button
                type="button"
                onClick={() => void handleDeleteStoneTrigger()}
                className="btn-danger"
              >
                Sil
              </button>
            )}
          </div>
        </header>

        {hasFilterContext && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-600">Eşleşme:</span>
            {highlightQuery && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">🔍 {highlightQuery}</span>}
            {astroFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">♈ {astroFilter}</span>}
            {chakraFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">🔵 {chakraFilter}</span>}
            {mineralFilter && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-800">💎 {mineralFilter}</span>}
            {warnFilter && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">⚠️ Uyarılı</span>}
          </div>
        )}

        {editEnabled && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 text-xs font-black text-violet-800 shadow-sm">
            Düzenleme modu: düzenlemek istediğiniz kartı seçin.
          </div>
        )}

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
                  <div className={`relative overflow-hidden ${uiImageArea}`}>
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
                        className="btn-danger absolute right-2 top-2 z-10 !px-2.5 !py-1 !text-[10px] !rounded-lg"
                      >
                        Sil
                      </button>
                    )}
                    <h2 className="border-t border-emerald-200/80 bg-white/70 px-3 pb-3 pt-3 text-xl font-black text-slate-950">
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
                              className="btn-danger absolute -right-1 -top-1 z-10 !px-1.5 !py-0.5 !text-[9px] !rounded-md"
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={uiImageArea}>
                  <div className="px-3 py-2 text-center">
                    <div className="text-[34px]">💎</div>
                    <h2 className="mt-1 text-sm font-black text-slate-900">
                      {safeStone.stone_name}
                    </h2>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">
                      Görsel eklenmemiş
                    </p>
                  </div>
                </div>
              )}

              {imagesNotWebFormat.length > 0 && (
                <div className="mt-4 space-y-2 text-left">
                  <p className="text-[12px] font-black text-slate-700">
                    Web&apos;de gösterilemeyen görseller
                  </p>
                  {imagesNotWebFormat.map((image) => (
                    <div
                      key={image.id}
                      className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100"
                    >
                      <span className="block min-w-0 truncate">{image.name}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                        Görsel yolu web formatında değil
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
                          className="btn-danger mt-2 shrink-0 !px-2 !py-1 !text-[10px] !rounded-lg"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editEnabled && (
                <div className="mt-4">
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
                    Fotoğraf Ekle
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
            <button
              type="button"
              onClick={() => openCheckboxEditor("chakras", "Çakralar", "ÇAKRA", CHAKRA_OPTIONS)}
              className={mergeMatchCardClass(uiInfoCard, Boolean(sectionMatches?.chakras))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-black text-slate-950">Çakralar</h3>
                  {sectionMatches?.chakras ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    Seç
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
                        <span key={chakra} className={toneClass("violet")}>{chakra}</span>
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
                      <span key={chakra} className={toneClass("violet")}>{chakra}</span>
                    ))
                  )}
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => openCheckboxEditor("warning_tags", "Uyarı Etiketleri", "UYARI ETİKETLERİ", WARNING_OPTIONS)}
              className={mergeMatchCardClass(uiInfoCard, Boolean(sectionMatches?.warningTags))}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-black text-slate-950">Uyarı Etiketleri</h3>
                  {sectionMatches?.warningTags ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    Seç
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
                  <h3 className="text-sm font-black text-slate-950">Atamalar</h3>
                  {sectionMatches?.assignments ? <SearchMatchBadge /> : null}
                </div>
                {editEnabled && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                    Düzenle
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
                          <p className="text-[11px] font-black text-slate-600">{title}</p>
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
                          <p className="text-[11px] font-black text-slate-600">{title}</p>
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
              title="Kısa Açıklama"
              badge="GENEL BİLGİ"
              text={safeStone.short_description}
              tone="cyan"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.shortDescription}
              onOpenEdit={() => openTextEditor("short_description", "Kısa Açıklama", "GENEL BİLGİ")}
              onOpenRead={() => openReader("Kısa Açıklama", "GENEL BİLGİ", safeStone.short_description)}
            />

            <TextBlock
              title="Genel Taş Açıklaması"
              badge="DETAYLI BİLGİ"
              text={safeStone.general_info}
              tone="cyan"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.generalInfo}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("general_info", "Genel Taş Açıklaması", "DETAYLI BİLGİ")}
              onOpenRead={() => openReader("Genel Taş Açıklaması", "DETAYLI BİLGİ", safeStone.general_info)}
            />

            <TextBlock
              title="Kaynak Notu"
              badge="KAYNAK"
              text={safeStone.source_note}
              tone="slate"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.sourceNote}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("source_note", "Kaynak Notu", "KAYNAK")}
              onOpenRead={() => openReader("Kaynak Notu", "KAYNAK", safeStone.source_note)}
            />

            <TextBlock
              title="Fiziksel Etkiler"
              badge="BEDENSEL ETKİ"
              text={safeStone.physical_effects}
              tone="emerald"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.physicalEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("physical_effects", "Fiziksel Etkiler", "BEDENSEL ETKİ")}
              onOpenRead={() => openReader("Fiziksel Etkiler", "BEDENSEL ETKİ", safeStone.physical_effects)}
            />

            <TextBlock
              title="Ruhsal Etkiler"
              badge="RUHSAL ETKİ"
              text={safeStone.spiritual_effects}
              tone="violet"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.spiritualEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("spiritual_effects", "Ruhsal Etkiler", "RUHSAL ETKİ")}
              onOpenRead={() => openReader("Ruhsal Etkiler", "RUHSAL ETKİ", safeStone.spiritual_effects)}
            />

            <TextBlock
              title="Diğer Etkiler"
              badge="TAMAMLAYICI NOT"
              text={safeStone.other_effects}
              tone="amber"
              editEnabled={editEnabled}
              highlightQuery={highlightQuery}
              hasSearchMatch={sectionMatches?.otherEffects}
              isContentProtected={isContentProtected}
              onOpenEdit={() => openTextEditor("other_effects", "Diğer Etkiler", "TAMAMLAYICI NOT")}
              onOpenRead={() => openReader("Diğer Etkiler", "TAMAMLAYICI NOT", safeStone.other_effects)}
            />

            <div className="lg:col-span-2">
              <TextBlock
                title="Uyarılar ve Hassasiyetler"
                badge="KLİNİK NOT"
                text={safeStone.warning_text}
                tone="rose"
                editEnabled={editEnabled}
                highlightQuery={highlightQuery}
                hasSearchMatch={sectionMatches?.warningText}
                isContentProtected={isContentProtected}
                onOpenEdit={() => openTextEditor("warning_text", "Uyarılar ve Hassasiyetler", "KLİNİK NOT")}
                onOpenRead={() =>
                  openReader("Uyarılar ve Hassasiyetler", "KLİNİK NOT", safeStone.warning_text)
                }
              />
            </div>

            <section className={`${uiInfoCard} lg:col-span-2`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={toneClass("cyan")}>KULLANIM ALANLARI</span>
                <h2 className="text-sm font-black text-slate-950">Kullanım / Uygulama Notları</h2>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ["Feng Shui", "feng_shui", safeStone.feng_shui],
                  ["Meditasyon", "meditation", safeStone.meditation],
                  ["Bakım", "care", safeStone.care],
                  ["Uygulama", "application", safeStone.application],
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
                          ? openTextEditor(key as EditableTextField, String(title), "KULLANIM ALANI")
                          : openReader(String(title), "KULLANIM ALANI", String(text || ""))
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
                          Düzenle
                        </span>
                      ) : (
                        <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-400 ring-1 ring-slate-100">
                          Oku
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
                          : shortPreview(String(text || ""), 80)}
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
        subtitle={`${safeStone.stone_name} · detaylı okuma`}
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
            if (event.target === event.currentTarget && !saving) {
              setActiveEditor(null);
            }
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
                  {safeStone.stone_name} kaydı düzenleniyor.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveEditor(null)}
                  disabled={saving}
                  className="btn-soft"
                >
                  Vazgeç
                </button>

                <button
                  type="button"
                  onClick={saveEditor}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet / Güncelle"}
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

            {activeEditor.mode === "checkbox" && (
              <div className="grid max-h-[56vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {activeEditor.options.map((option) => {
                  const checked = activeEditor.selected.includes(option);

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
                      <span>{option}</span>
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
              </div>
            )}

            {activeEditor.mode === "assignments" && (
              <div className="grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {Object.entries(activeEditor.values).map(([section, value]) => (
                  <div key={section} className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <label className="text-[13px] font-black text-slate-800">
                      {section}
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
                      placeholder="Her satıra bir kayıt yazın. Örn: Demir / 20"
                    />
                  </div>
                ))}
              </div>
            )}

            {activeEditor.mode === "text" &&
              (activeEditor.multiline ? (
                <textarea
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-[430px] max-h-[62vh] w-full resize-none rounded-[24px] border border-emerald-100 bg-white p-5 text-[15px] leading-8 text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                  placeholder={`${activeEditor.title} yazın...`}
                  autoFocus
                />
              ) : (
                <input
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-16 w-full rounded-2xl border border-emerald-100 bg-white px-5 text-[24px] font-black text-slate-950 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                  placeholder={`${activeEditor.title} yazın...`}
                  autoFocus
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
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-500">
      <p className="text-sm font-semibold text-slate-600">Kayıt yükleniyor...</p>
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

"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  countListFilledSections,
  fetchHealingGuideList,
  listRowPreview,
  matchesListSearch,
  type HealingGuideListRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";
import { supabase } from "@/lib/supabase";

type GuideImage = {
  id: string;
  name: string;
  url: string;
  file_path?: string;
  section?: string;
};

type HealingGuideRecord = {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  general_summary: string | null;
  medical_causes: string | null;
  subconscious_causes: string | null;
  temperament_causes: string | null;
  other_causes: string | null;
  iridology_match: string | null;
  hand_analysis_match: string | null;
  cupping_leech: string | null;
  reflexology: string | null;
  diet_recommendations: string | null;
  herbal_methods: string | null;
  stone_recommendations: string | null;
  aromatherapy: string | null;
  meditation: string | null;
  breathwork: string | null;
  bioenergy: string | null;
  massage: string | null;
  daily_routine: string | null;
  sleep_routine: string | null;
  supportive_alternative_methods: string | null;
  islamic_recommendations: string | null;
  images: GuideImage[] | null;
  created_at: string;
  updated_at: string | null;
};

type GuideForm = {
  name: string;
  category: string;
  general_summary: string;
  medical_causes: string;
  subconscious_causes: string;
  temperament_causes: string;
  other_causes: string;
  iridology_match: string;
  hand_analysis_match: string;
  cupping_leech: string;
  reflexology: string;
  diet_recommendations: string;
  herbal_methods: string;
  stone_recommendations: string;
  aromatherapy: string;
  meditation: string;
  breathwork: string;
  bioenergy: string;
  massage: string;
  daily_routine: string;
  sleep_routine: string;
  supportive_alternative_methods: string;
  islamic_recommendations: string;
};

const emptyForm: GuideForm = {
  name: "",
  category: "",
  general_summary: "",
  medical_causes: "",
  subconscious_causes: "",
  temperament_causes: "",
  other_causes: "",
  iridology_match: "",
  hand_analysis_match: "",
  cupping_leech: "",
  reflexology: "",
  diet_recommendations: "",
  herbal_methods: "",
  stone_recommendations: "",
  aromatherapy: "",
  meditation: "",
  breathwork: "",
  bioenergy: "",
  massage: "",
  daily_routine: "",
  sleep_routine: "",
  supportive_alternative_methods: "",
  islamic_recommendations: "",
};

const FORM_SECTIONS: { key: keyof GuideForm; label: string; multiline?: boolean }[] = [
  { key: "name", label: "Rahatsızlık adı" },
  { key: "category", label: "Kategori" },
  { key: "general_summary", label: "Genel / Özeti", multiline: true },
  { key: "medical_causes", label: "Tıbbi Nedenler", multiline: true },
  { key: "subconscious_causes", label: "Bilinçaltı Sebepleri", multiline: true },
  { key: "temperament_causes", label: "Mizaç Sebepleri", multiline: true },
  { key: "other_causes", label: "Diğer Sebepler", multiline: true },
  { key: "iridology_match", label: "İridoloji’de Karşılığı", multiline: true },
  { key: "hand_analysis_match", label: "El Analizinde Karşılığı", multiline: true },
  { key: "cupping_leech", label: "Hacamat & Sülük", multiline: true },
  { key: "reflexology", label: "Refleksoloji", multiline: true },
  { key: "diet_recommendations", label: "Diyet Önerileri", multiline: true },
  { key: "herbal_methods", label: "Bitkisel Yöntemler", multiline: true },
  { key: "stone_recommendations", label: "Doğaltaş Önerileri", multiline: true },
  { key: "aromatherapy", label: "Aromaterapi", multiline: true },
  { key: "meditation", label: "Meditasyon", multiline: true },
  { key: "breathwork", label: "Nefes", multiline: true },
  { key: "bioenergy", label: "Biyoenerji", multiline: true },
  { key: "massage", label: "Masaj", multiline: true },
  { key: "daily_routine", label: "Günlük Rutin", multiline: true },
  { key: "sleep_routine", label: "Uyku Düzeni", multiline: true },
  {
    key: "supportive_alternative_methods",
    label: "Destekleyici / Alternatif Uygulamalar",
    multiline: true,
  },
  {
    key: "islamic_recommendations",
    label: "İslami Öneriler",
    multiline: true,
  },
];

type FormTabId =
  | "rahatsizlik"
  | "belirtiler"
  | "uygulamalar"
  | "dogaltas"
  | "aromaterapi"
  | "destekleyici"
  | "islami_oneriler";

const FORM_TABS: {
  id: FormTabId;
  label: string;
  icon: string;
  desc: string;
  keys: (keyof GuideForm)[];
}[] = [
  {
    id: "rahatsizlik",
    label: "Rahatsızlık",
    icon: "📋",
    desc: "Temel tanım, kategori ve genel özet bilgileri.",
    keys: ["name", "category", "general_summary"],
  },
  {
    id: "belirtiler",
    label: "Belirtiler / Sebepler",
    icon: "🔍",
    desc: "Olası nedenler ve iridoloji / el analizi eşleştirmeleri.",
    keys: [
      "medical_causes",
      "subconscious_causes",
      "temperament_causes",
      "other_causes",
      "iridology_match",
      "hand_analysis_match",
    ],
  },
  {
    id: "uygulamalar",
    label: "Uygulamalar / Yöntemler",
    icon: "🙌",
    desc: "Hacamat, refleksoloji, diyet ve bitkisel yöntem alanları.",
    keys: ["cupping_leech", "reflexology", "diet_recommendations", "herbal_methods"],
  },
  {
    id: "dogaltas",
    label: "Doğaltaş & Mineral",
    icon: "💎",
    desc: "Taş ve mineral önerilerinizi buradan girin.",
    keys: ["stone_recommendations"],
  },
  {
    id: "aromaterapi",
    label: "Aromaterapi",
    icon: "🌸",
    desc: "Aromaterapi ile ilgili notlar ve öneriler.",
    keys: ["aromatherapy"],
  },
  {
    id: "destekleyici",
    label: "Destekleyici",
    icon: "✨",
    desc: "Meditasyon, nefes, biyoenerji, masaj ve günlük rutinler.",
    keys: [
      "meditation",
      "breathwork",
      "bioenergy",
      "massage",
      "daily_routine",
      "sleep_routine",
      "supportive_alternative_methods",
    ],
  },
  {
    id: "islami_oneriler",
    label: "İslami Öneriler",
    icon: "🕌",
    desc: "Dua, sure, niyet, manevi destek notları.",
    keys: ["islamic_recommendations"],
  },
];

function trimOrNull(value: string) {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dcfce7_0%,#ecfeff_35%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-emerald-300/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(16,185,129,0.14)] backdrop-blur-xl";
const uiStatCard =
  "rounded-2xl border-2 border-cyan-200 bg-white/90 px-8 py-5 text-center shadow-md";
const uiFilterCard =
  "rounded-[30px] border-[3px] border-cyan-300/45 bg-white/75 p-5 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-xl";
const uiSearchInput =
  "h-14 w-full rounded-2xl border-2 border-emerald-200 bg-white/90 pl-12 pr-5 font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";
const uiViewBtn =
  "rounded-2xl px-6 py-4 font-black shadow-md transition-all duration-300 hover:-translate-y-1";
const uiViewBtnActive = "bg-slate-950 text-white";
const uiViewBtnIdle = "border-2 border-emerald-200 bg-white text-slate-800";
const uiNewBtn =
  "rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4 font-black text-white shadow-md transition-all duration-300 hover:-translate-y-1";
const uiContentCard =
  "w-full rounded-[34px] border-[3px] border-emerald-300/45 bg-white/80 p-6 shadow-[0_0_50px_rgba(16,185,129,0.14)] backdrop-blur-xl xl:p-8";
const uiEmptyCard = `${uiContentCard} min-h-[420px]`;

const listPageContent = "relative z-10 w-full space-y-3 px-5 py-4 sm:px-6 xl:px-8 2xl:px-10";
const listHeaderCard =
  "max-h-[220px] shrink-0 overflow-hidden rounded-[22px] border border-emerald-300/40 bg-white/85 p-4 shadow-[0_8px_28px_rgba(16,185,129,0.1)] backdrop-blur-xl sm:py-5";
const listStatCard =
  "min-w-[4.5rem] rounded-xl border border-cyan-200/80 bg-white/90 px-3 py-2 text-center shadow-sm sm:min-w-[5rem]";
const listFilterCard =
  "rounded-[22px] border border-cyan-300/40 bg-white/85 p-4 shadow-[0_6px_24px_rgba(34,211,238,0.08)] backdrop-blur-xl";
const listSearchInput =
  "h-11 w-full rounded-xl border border-emerald-200 bg-white/90 pl-10 pr-4 text-sm font-semibold shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60";
const listViewBtn =
  "rounded-xl px-4 py-2 text-[12px] font-black shadow-sm transition hover:-translate-y-0.5";
const listNewBtn =
  "rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-[12px] font-black text-white shadow-sm transition hover:-translate-y-0.5";
const listContentCard =
  "w-full rounded-[22px] border border-emerald-300/40 bg-white/85 p-4 shadow-[0_8px_28px_rgba(16,185,129,0.08)] backdrop-blur-xl sm:p-5";
const listGuideCardGrid = "grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3";
const listGuideCard =
  "group flex flex-col rounded-[32px] border border-emerald-100 bg-white/85 p-5 shadow-[0_10px_40px_rgba(16,185,129,0.12)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_20px_50px_rgba(16,185,129,0.18)]";
const listGuideCardBadge =
  "inline-flex rounded-full bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 px-3 py-0.5 text-[11px] font-semibold tracking-wide text-white shadow-[0_6px_22px_rgba(16,185,129,0.45)] ring-1 ring-emerald-300/40";
const listGuideCardCategory =
  "inline-flex rounded-full border border-emerald-100/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-800";
const listGuideCardCta =
  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 px-4 text-[13px] font-semibold text-white shadow-[0_10px_28px_rgba(16,185,129,0.35)] ring-1 ring-white/25 transition-all duration-300 group-hover:shadow-[0_14px_36px_rgba(16,185,129,0.48)] hover:brightness-105";

type PageView = "menu" | "new" | "list";

const uiMenuCardBase =
  "group relative flex h-[360px] w-full flex-col overflow-hidden rounded-[30px] border-2 p-8 text-left shadow-[0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40 lg:p-10";

const uiMenuBadge =
  "inline-flex rounded-full border bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm";

const uiMenuTitle = "text-[22px] font-black leading-tight tracking-tight text-slate-950 lg:text-2xl";

const uiMenuDesc =
  "mt-2 max-w-[300px] text-sm font-medium leading-snug text-slate-600 line-clamp-2";

function NewRecordMenuIcon() {
  return (
    <span
      className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-emerald-200/80 bg-white/80 text-[42px] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-white/90"
      aria-hidden
    >
      <span className="leading-none">🌿</span>
      <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-base font-black text-white shadow-md ring-2 ring-white">
        +
      </span>
    </span>
  );
}

function ListMenuIcon() {
  return (
    <span
      className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-violet-200/80 bg-white/80 text-[42px] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-white/90"
      aria-hidden
    >
      📚
    </span>
  );
}

type MenuStatBadge = {
  label: string;
  variant: "solid" | "outline";
  palette: "emerald" | "violet";
};

function menuStatBadgeClass(badge: MenuStatBadge) {
  if (badge.variant === "solid") {
    return badge.palette === "emerald"
      ? "rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm ring-1 ring-emerald-500/30"
      : "rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm ring-1 ring-violet-500/30";
  }
  return badge.palette === "emerald"
    ? "rounded-full border border-emerald-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-emerald-800"
    : "rounded-full border border-violet-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-violet-800";
}

function MenuChoiceCard({
  onClick,
  cardTone,
  glowTone,
  badgeLabel,
  badgeTone,
  icon,
  title,
  description,
  statBadges,
  ctaLabel,
  ctaTone,
}: {
  onClick: () => void;
  cardTone: string;
  glowTone: string;
  badgeLabel: string;
  badgeTone: string;
  icon: ReactNode;
  title: string;
  description: string;
  statBadges: MenuStatBadge[];
  ctaLabel: string;
  ctaTone: string;
}) {
  return (
    <button type="button" onClick={onClick} className={`${uiMenuCardBase} ${cardTone}`}>
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full blur-2xl transition group-hover:opacity-100 ${glowTone}`}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="shrink-0">
          <span className={`${uiMenuBadge} ${badgeTone}`}>{badgeLabel}</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-1 py-3 text-center">
          <div className="mb-3 shrink-0">{icon}</div>
          <h2 className={uiMenuTitle}>{title}</h2>
          <p className={uiMenuDesc}>{description}</p>
        </div>

        <div className="shrink-0 space-y-3">
          <div className="flex min-h-[26px] flex-wrap items-center justify-center gap-2">
            {statBadges.map((badge) => (
              <span key={badge.label} className={menuStatBadgeClass(badge)}>
                {badge.label}
              </span>
            ))}
          </div>
          <span
            className={`block w-full rounded-2xl py-3.5 text-center text-[15px] font-black shadow-md ring-1 transition group-hover:brightness-105 ${ctaTone}`}
          >
            {ctaLabel}
          </span>
        </div>
      </div>
    </button>
  );
}
const menuPageShell =
  "relative flex h-screen flex-col overflow-hidden max-lg:min-h-screen max-lg:h-auto max-lg:overflow-y-auto";
const menuPageContent =
  "relative z-10 flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:gap-4 lg:px-10 lg:py-4";
const menuHeaderCard =
  "shrink-0 rounded-[26px] border-2 border-emerald-300/45 bg-white/75 p-4 shadow-[0_0_32px_rgba(16,185,129,0.12)] backdrop-blur-xl lg:p-5";
const menuStatCard =
  "rounded-xl border border-cyan-200 bg-white/90 px-3 py-2.5 text-center shadow-sm sm:px-4 sm:py-3";

function SifaRehberiMainMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 px-6 py-4 text-[16px] font-black text-white shadow-[0_14px_36px_-10px_rgba(5,150,105,0.55)] ring-2 ring-white/40 transition duration-200 hover:scale-[1.03] hover:border-emerald-300/70 hover:shadow-[0_18px_44px_-8px_rgba(16,185,129,0.65)] sm:w-auto sm:justify-start sm:px-7 sm:text-[17px]"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/20 text-lg shadow-sm"
        aria-hidden
      >
        🏠
      </span>
      <span>← Şifa Rehberi Ana Menü</span>
    </button>
  );
}

function SifaRehberiToolbarMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300/55 bg-gradient-to-r from-emerald-600 to-teal-500 px-3.5 text-[12px] font-black text-white shadow-md ring-1 ring-white/35 transition hover:brightness-105"
    >
      <span aria-hidden className="text-sm leading-none">
        ←
      </span>
      <span className="hidden sm:inline">Şifa Rehberi Ana Menü</span>
      <span className="sm:hidden">Ana Menü</span>
    </button>
  );
}

const uiFormFieldInput =
  "h-12 w-full rounded-2xl border border-emerald-100 bg-white/90 px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100/80";

const uiFormFieldTextarea =
  "min-h-[104px] max-h-[148px] w-full cursor-pointer resize-y rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3 text-base leading-relaxed text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100/80";

const uiFormMiniCard =
  "rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";

function FormFieldMiniCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${uiFormMiniCard} ${className}`.trim()}>
      <header className="mb-3">
        <h4 className="text-[13px] font-black tracking-tight text-slate-900">{title}</h4>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export default function SifaRehberiPage() {
  const [rows, setRows] = useState<HealingGuideListRow[]>([]);
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pageView, setPageView] = useState<PageView>("menu");
  const [form, setForm] = useState(() => ({ ...emptyForm }));
  const [viewMode, setViewMode] = useState<"list" | "card">("card");
  const [largeEditorKey, setLargeEditorKey] = useState<keyof GuideForm | null>(null);
  const [largeEditorLabel, setLargeEditorLabel] = useState("");
  const [largeEditorValue, setLargeEditorValue] = useState("");
  const [formTab, setFormTab] = useState<FormTabId>("rahatsizlik");
  const [formImages, setFormImages] = useState<GuideImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightbox, setLightbox] = useState<GuideImage | null>(null);
  const [uploadTargetSection, setUploadTargetSection] = useState<FormTabId | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  async function loadGuides(tenantId: string) {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { rows: nextRows, error } = await fetchHealingGuideList(tenantId);

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error}`);
      return;
    }

    setRows(nextRows);
  }

  useEffect(() => {
    runInEffect(() => {
      void (async () => {
        const tenantId = await getSyncedTenantId();
        setQueryTenantId(tenantId);
        if (!tenantId) {
          setLoading(false);
          setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
          setRows([]);
          return;
        }
        await loadGuides(tenantId);
      })();
    });
  }, []);

  useEffect(() => {
    if (pageView === "new") return;
    runInEffect(() => {
      setLargeEditorKey(null);
      setLargeEditorLabel("");
      setLargeEditorValue("");
      setFormTab("rahatsizlik");
    });
  }, [pageView]);

  function goToMainMenu() {
    setPageView("menu");
    resetForm();
    setErrorMessage("");
    setSuccessMessage("");
    setLightbox(null);
  }

  function openNewRecord() {
    resetForm();
    setErrorMessage("");
    setSuccessMessage("");
    setPageView("new");
  }

  function openList() {
    setErrorMessage("");
    setSuccessMessage("");
    setPageView("list");
  }

  const filteredRows = useMemo(() => {
    const list = rows.filter((row) => matchesListSearch(row, search));
    return [...list].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "tr-TR")
    );
  }, [rows, search]);

  const categoryCount = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = r.category?.trim();
      if (c) set.add(c);
    });
    return set.size;
  }, [rows]);

  const activeFormTab = useMemo(
    () => FORM_TABS.find((t) => t.id === formTab) ?? FORM_TABS[0],
    [formTab]
  );

  const tabImages = useMemo(
    () => formImages.filter((img) => img.section === formTab),
    [formImages, formTab]
  );

  function triggerImagePick(section: FormTabId) {
    setUploadTargetSection(section);
    imageFileInputRef.current?.click();
  }

  async function handleGuideImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const section = uploadTargetSection;
    e.target.value = "";
    setUploadTargetSection(null);
    if (!file || !section) return;

    setUploadingImage(true);
    setErrorMessage("");

    const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const basename = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
    if (!queryTenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const file_path = `healing-guides/${queryTenantId}/${basename}`;

    const { error: upErr } = await supabase.storage.from("stone-photos").upload(file_path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    setUploadingImage(false);

    if (upErr) {
      setErrorMessage(`Görsel yüklenemedi: ${upErr.message}`);
      return;
    }

    const { data: pub } = supabase.storage.from("stone-photos").getPublicUrl(file_path);
    const entry: GuideImage = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: file.name,
      url: pub.publicUrl,
      file_path,
      section,
    };
    setFormImages((prev) => [...prev, entry]);
  }

  async function removeGuideImage(img: GuideImage) {
    setErrorMessage("");
    if (img.file_path) {
      const { error: rmErr } = await supabase.storage.from("stone-photos").remove([img.file_path]);
      if (rmErr) {
        setErrorMessage(`Görsel silinemedi: ${rmErr.message}`);
        return;
      }
    }
    setFormImages((prev) => prev.filter((i) => i.id !== img.id));
    setLightbox((cur) => (cur?.id === img.id ? null : cur));
  }

  function closeLargeEditor() {
    setLargeEditorKey(null);
    setLargeEditorLabel("");
    setLargeEditorValue("");
  }

  function openLargeEditor(key: keyof GuideForm, label: string) {
    setLargeEditorKey(key);
    setLargeEditorLabel(label);
    setLargeEditorValue(form[key]);
  }

  function saveLargeEditor() {
    if (!largeEditorKey) return;
    setForm((prev) => ({ ...prev, [largeEditorKey]: largeEditorValue }));
    closeLargeEditor();
  }

  function resetForm() {
    closeLargeEditor();
    setFormTab("rahatsizlik");
    setFormImages([]);
    setForm(() => ({ ...emptyForm }));
  }

  async function handleSave() {
    const nameTrim = form.name.trim();
    if (!nameTrim) {
      setErrorMessage("Rahatsızlık adı zorunludur.");
      setSuccessMessage("");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const now = new Date().toISOString();

    if (!queryTenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("healing_guides").insert({
      tenant_id: queryTenantId,
      name: nameTrim,
      category: trimOrNull(form.category),
      general_summary: trimOrNull(form.general_summary),
      medical_causes: trimOrNull(form.medical_causes),
      subconscious_causes: trimOrNull(form.subconscious_causes),
      temperament_causes: trimOrNull(form.temperament_causes),
      other_causes: trimOrNull(form.other_causes),
      iridology_match: trimOrNull(form.iridology_match),
      hand_analysis_match: trimOrNull(form.hand_analysis_match),
      cupping_leech: trimOrNull(form.cupping_leech),
      reflexology: trimOrNull(form.reflexology),
      diet_recommendations: trimOrNull(form.diet_recommendations),
      herbal_methods: trimOrNull(form.herbal_methods),
      stone_recommendations: trimOrNull(form.stone_recommendations),
      aromatherapy: trimOrNull(form.aromatherapy),
      meditation: trimOrNull(form.meditation),
      breathwork: trimOrNull(form.breathwork),
      bioenergy: trimOrNull(form.bioenergy),
      massage: trimOrNull(form.massage),
      daily_routine: trimOrNull(form.daily_routine),
      sleep_routine: trimOrNull(form.sleep_routine),
      supportive_alternative_methods: trimOrNull(form.supportive_alternative_methods),
      islamic_recommendations: trimOrNull(form.islamic_recommendations),
      images: formImages.length > 0 ? formImages : null,
      updated_at: now,
    });

    setSaving(false);

    if (insertError) {
      setErrorMessage(`Kayıt eklenemedi: ${insertError.message}`);
      return;
    }

    resetForm();
    setSuccessMessage("Şifa rehberi kaydı oluşturuldu.");
    await loadGuides(queryTenantId);
    setPageView("list");
  }

  const isMenuView = pageView === "menu";
  const isListView = pageView === "list";
  const isNewView = pageView === "new";

  const newViewScrollArea =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const newViewFieldInput =
    "h-10 w-full rounded-xl border border-emerald-100/90 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100/80";

  const newViewFieldTextarea =
    "min-h-[88px] max-h-[120px] w-full cursor-pointer resize-none rounded-xl border border-emerald-100/90 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100/80";

  const newViewMiniCard =
    "rounded-2xl border border-emerald-100/80 bg-gradient-to-b from-white to-emerald-50/30 p-4 shadow-[0_8px_24px_-12px_rgba(16,185,129,0.25)]";

  function renderNewViewImagesBlock() {
    return (
      <section className={newViewMiniCard}>
        <header className="mb-3">
          <h4 className="text-[13px] font-black tracking-tight text-slate-900">Görseller</h4>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Bu bölüme görsel ekleyin</p>
        </header>
        <button
          type="button"
          disabled={uploadingImage}
          onClick={() => triggerImagePick(formTab)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-100 bg-white px-3 text-[12px] font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-60"
        >
          <span aria-hidden>📷</span>
          {uploadingImage ? "Yükleniyor…" : "Görsel Ekle"}
        </button>
        {tabImages.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tabImages.map((img) => (
              <div key={img.id} className="relative w-16 shrink-0 rounded-lg border border-emerald-100 p-0.5">
                <button type="button" onClick={() => setLightbox(img)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="aspect-square h-14 w-full rounded-md object-cover" />
                </button>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void removeGuideImage(img);
                  }}
                  className="absolute right-0 top-0 rounded bg-rose-600 px-1 text-[8px] font-black text-white"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  if (isNewView) {
    return (
      <>
        <div className="h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-cyan-50 to-white p-4 text-slate-950">
          <header className="mb-4 flex h-16 shrink-0 items-center justify-between rounded-3xl border border-emerald-100/70 bg-white/80 px-5 shadow sm:px-6">
            <SifaRehberiToolbarMenuButton onClick={goToMainMenu} />
            <div className="min-w-0 pl-4 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Yeni Kayıt</p>
              <h2 className="truncate text-base font-black text-slate-950">Yeni rahatsızlık kaydı</h2>
            </div>
          </header>

          {(errorMessage || successMessage) ? (
            <div className="mb-3 shrink-0 space-y-1">
              {errorMessage ? (
                <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 ring-1 ring-rose-100">
                  {errorMessage}
                </p>
              ) : null}
              {successMessage && !errorMessage ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  {successMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            className={`grid min-h-0 grid-cols-[300px_1fr] gap-5 ${
              errorMessage || successMessage ? "h-[calc(100vh-148px)]" : "h-[calc(100vh-112px)]"
            }`}
          >
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGuideImageFileChange}
            />

            <aside
              className={`h-full min-h-0 rounded-[28px] border border-emerald-100/80 bg-white/85 p-4 shadow-xl ${newViewScrollArea}`}
            >
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Bölümler</p>
              <div className="space-y-2">
                {FORM_TABS.map((tab) => {
                  const active = formTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFormTab(tab.id)}
                      className={`flex h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-bold transition ${
                        active
                          ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-[0_6px_18px_rgba(16,185,129,0.35)]"
                          : "border border-emerald-100/80 bg-white/70 text-slate-600 hover:bg-emerald-50/80"
                      }`}
                    >
                      <span className="text-base leading-none">{tab.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-emerald-100/80 bg-white/85 shadow-xl">
              <div className={`${newViewScrollArea} p-6`}>
                <div className="mx-auto max-w-5xl space-y-5 pb-4">
                  {formTab === "rahatsizlik" ? (
                    <>
                      <header className="border-b border-emerald-100/80 pb-4">
                        <h3 className="text-lg font-black tracking-tight text-slate-950">Rahatsızlık Bilgileri</h3>
                        <p className="mt-1 text-[12px] font-medium text-slate-500">
                          Temel tanım, kategori ve özet alanlarını doldurun.
                        </p>
                      </header>
                      <div className="grid grid-cols-2 gap-5">
                        <section className={newViewMiniCard}>
                          <header className="mb-2.5">
                            <h4 className="text-[13px] font-black text-slate-900">Rahatsızlık adı</h4>
                            <p className="text-[11px] font-medium text-slate-500">Zorunlu</p>
                          </header>
                          <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={newViewFieldInput}
                            placeholder="Örn. Migren"
                          />
                        </section>
                        <section className={newViewMiniCard}>
                          <header className="mb-2.5">
                            <h4 className="text-[13px] font-black text-slate-900">Kategori</h4>
                            <p className="text-[11px] font-medium text-slate-500">Sınıflandırma</p>
                          </header>
                          <input
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                            className={newViewFieldInput}
                            placeholder="Örn. Sinir sistemi"
                          />
                        </section>
                      </div>
                      <section className={newViewMiniCard}>
                        <header className="mb-2.5">
                          <h4 className="text-[13px] font-black text-slate-900">Genel / Özet</h4>
                          <p className="text-[11px] font-medium text-slate-500">Geniş editör için tıklayın</p>
                        </header>
                        <textarea
                          readOnly
                          value={form.general_summary}
                          onClick={() => openLargeEditor("general_summary", "Genel / Özeti")}
                          onFocus={(e) => {
                            openLargeEditor("general_summary", "Genel / Özeti");
                            e.target.blur();
                          }}
                          rows={3}
                          className={newViewFieldTextarea}
                        />
                      </section>
                      {renderNewViewImagesBlock()}
                    </>
                  ) : (
                    <>
                      <header className="border-b border-emerald-100/80 pb-4">
                        <h3 className="text-lg font-black tracking-tight text-slate-950">{activeFormTab.label}</h3>
                        <p className="mt-1 text-[12px] font-medium text-slate-500">
                          Bu bölümdeki alanları düzenleyin; uzun metinler için alana tıklayın.
                        </p>
                      </header>
                      <div className="grid grid-cols-2 gap-5">
                        {activeFormTab.keys.map((fieldKey) => {
                          const meta = FORM_SECTIONS.find((s) => s.key === fieldKey);
                          if (!meta) return null;
                          const { key, label, multiline } = meta;
                          return (
                            <section
                              key={key}
                              className={`${newViewMiniCard} ${multiline ? "col-span-2" : ""}`}
                            >
                              <header className="mb-2.5">
                                <h4 className="text-[13px] font-black text-slate-900">{label}</h4>
                              </header>
                              {multiline ? (
                                <textarea
                                  readOnly
                                  value={form[key]}
                                  onClick={() => openLargeEditor(key, label)}
                                  onFocus={(e) => {
                                    openLargeEditor(key, label);
                                    e.target.blur();
                                  }}
                                  rows={3}
                                  className={newViewFieldTextarea}
                                />
                              ) : (
                                <input
                                  value={form[key]}
                                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                  className={newViewFieldInput}
                                />
                              )}
                            </section>
                          );
                        })}
                        <div className="col-span-2">{renderNewViewImagesBlock()}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 z-10 flex shrink-0 items-center gap-2.5 border-t border-emerald-100/80 bg-white/95 px-5 py-2.5 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-[13px] font-black text-white shadow-md disabled:opacity-60"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
                <button
                  type="button"
                  onClick={goToMainMenu}
                  className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Kapat
                </button>
              </div>
            </section>
          </div>
        </div>

        {lightbox ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
            role="presentation"
            onClick={() => setLightbox(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[min(960px,96vw)] rounded-[24px] bg-white p-3 shadow-2xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={lightbox.name}
                className="max-h-[min(78vh,720px)] w-auto max-w-full rounded-2xl object-contain"
              />
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute right-3 top-3 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white"
              >
                Kapat
              </button>
            </div>
          </div>
        ) : null}

        {largeEditorKey ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm">
            <div
              className="w-full max-w-[920px] rounded-[28px] bg-white p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
            >
              <h3 className="mb-4 text-[20px] font-black text-slate-950">{largeEditorLabel}</h3>
              <textarea
                value={largeEditorValue}
                onChange={(e) => setLargeEditorValue(e.target.value)}
                className="h-[min(480px,52vh)] w-full resize-y rounded-2xl border border-emerald-100 p-5 text-[15px] leading-7 text-slate-800 outline-none focus:ring-4 focus:ring-emerald-100/70"
                autoFocus
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveLargeEditor}
                  className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white"
                >
                  Kaydet
                </button>
                <button
                  type="button"
                  onClick={closeLargeEditor}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <main
      className={
        isMenuView
          ? `${menuPageShell} bg-[radial-gradient(circle_at_top_left,#dcfce7_0%,#ecfeff_35%,#f8fafc_100%)] text-slate-950`
          : pageBg
      }
    >
      <div
        className={`pointer-events-none absolute left-0 top-0 rounded-full bg-emerald-300/20 blur-[150px] ${
          isMenuView ? "h-[280px] w-[280px]" : "h-[520px] w-[520px]"
        }`}
      />
      <div
        className={`pointer-events-none absolute right-0 top-0 rounded-full bg-cyan-300/20 blur-[150px] ${
          isMenuView ? "h-[280px] w-[280px]" : "h-[520px] w-[520px]"
        }`}
      />

      <div className={isMenuView ? menuPageContent : isListView ? listPageContent : pageContent}>
        <header
          className={
            isMenuView
              ? `${menuHeaderCard} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4`
              : isListView
                ? `${listHeaderCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
                : `${uiHeaderCard} flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between`
          }
        >
          <div className="min-w-0 flex-1">
            <div
              className={`inline-flex rounded-full border border-emerald-200 bg-emerald-50 font-black text-emerald-700 ${
                isMenuView || isListView
                  ? "mb-1.5 px-3 py-0.5 text-[10px] tracking-[0.14em]"
                  : "mb-3 px-5 py-2"
              }`}
            >
              ✶ ŞİFA REHBERİ
            </div>

            <h1
              className={
                isMenuView
                  ? "text-3xl font-black tracking-tight text-slate-950 lg:text-4xl"
                  : isListView
                    ? "text-4xl font-black tracking-tight text-slate-950 xl:text-5xl"
                    : "text-5xl font-black tracking-tight text-slate-950 xl:text-6xl"
              }
            >
              Şifa Rehberi
            </h1>

            <p
              className={
                isMenuView
                  ? "mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-slate-600 lg:text-[15px]"
                  : isListView
                    ? "mt-1 line-clamp-2 text-sm font-medium leading-snug text-slate-600"
                    : "mt-3 text-lg font-medium text-slate-600 xl:text-xl"
              }
            >
              {pageView === "menu"
                ? "Yeni kayıt oluşturun veya kayıtlı şifa rehberi listenize geçin."
                : "Kayıtlı şifa rehberlerinizi arayın, listeleyin ve detaylarını açın."}
            </p>

            <Link
              href="/"
              className={
                isMenuView || isListView
                  ? "mt-2 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-800 shadow-sm transition hover:bg-emerald-50"
                  : "mt-4 inline-flex items-center gap-2 rounded-2xl border-2 border-emerald-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md transition hover:bg-emerald-50"
              }
            >
              <svg
                aria-hidden
                className={`shrink-0 text-emerald-600 ${isMenuView || isListView ? "h-3.5 w-3.5" : "h-4 w-4"}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
              </svg>
              <span className="truncate">Ana Panele Dön</span>
            </Link>
          </div>

          <div
            className={`grid w-full shrink-0 grid-cols-3 ${
              isMenuView ? "gap-2 lg:w-auto lg:gap-3" : isListView ? "gap-2 sm:w-auto" : "gap-4 lg:w-auto"
            }`}
          >
            <div className={isMenuView ? menuStatCard : isListView ? listStatCard : uiStatCard}>
              <div
                className={
                  isMenuView
                    ? "text-xl font-black lg:text-2xl"
                    : isListView
                      ? "text-lg font-black sm:text-xl"
                      : "text-3xl font-black"
                }
              >
                {rows.length}
              </div>
              <div
                className={
                  isMenuView || isListView
                    ? "text-[10px] font-bold text-slate-500"
                    : "text-sm font-bold text-slate-500"
                }
              >
                Kayıt
              </div>
            </div>
            <div className={isMenuView ? menuStatCard : isListView ? listStatCard : uiStatCard}>
              <div
                className={
                  isMenuView
                    ? "text-xl font-black lg:text-2xl"
                    : isListView
                      ? "text-lg font-black sm:text-xl"
                      : "text-3xl font-black"
                }
              >
                {categoryCount}
              </div>
              <div
                className={
                  isMenuView || isListView
                    ? "text-[10px] font-bold text-slate-500"
                    : "text-sm font-bold text-slate-500"
                }
              >
                Kategori
              </div>
            </div>
            <div className={isMenuView ? menuStatCard : isListView ? listStatCard : uiStatCard}>
              <div
                className={
                  isMenuView
                    ? "text-xl font-black lg:text-2xl"
                    : isListView
                      ? "text-lg font-black sm:text-xl"
                      : "text-3xl font-black"
                }
              >
                {filteredRows.length}
              </div>
              <div
                className={
                  isMenuView || isListView
                    ? "text-[10px] font-bold text-slate-500"
                    : "text-sm font-bold text-slate-500"
                }
              >
                Görünen
              </div>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div
            className={`rounded-2xl bg-rose-50 font-black text-rose-700 ring-1 ring-rose-100 ${
              isMenuView ? "shrink-0 px-4 py-2 text-[12px]" : "px-5 py-3 text-[13px]"
            }`}
          >
            {errorMessage}
          </div>
        ) : null}

        {successMessage && !errorMessage ? (
          <div
            className={`rounded-2xl bg-emerald-50 font-black text-emerald-700 ring-1 ring-emerald-100 ${
              isMenuView ? "shrink-0 px-4 py-2 text-[12px]" : "px-5 py-3 text-[13px]"
            }`}
          >
            {successMessage}
          </div>
        ) : null}

        {pageView === "menu" ? (
          <section className="flex min-h-0 flex-1 items-center justify-center">
            <div className="grid w-full max-w-[1280px] grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:gap-6">
              <MenuChoiceCard
                onClick={openNewRecord}
                cardTone="border-emerald-300/55 bg-gradient-to-br from-emerald-50 via-teal-50/95 to-cyan-50/85 hover:border-emerald-400/70"
                glowTone="bg-emerald-300/25 group-hover:bg-emerald-300/35"
                badgeLabel="Manuel kayıt"
                badgeTone="border-emerald-200/80 text-emerald-800"
                icon={<NewRecordMenuIcon />}
                title="Yeni Rahatsızlık Kaydı"
                description="Bölümlü form ile nedenler, bitkisel yöntemler ve destekleyici uygulamaları tek kayıtta toplayın."
                statBadges={[
                  { label: `${FORM_TABS.length} bölüm`, variant: "solid", palette: "emerald" },
                  { label: "Görsel destekli", variant: "outline", palette: "emerald" },
                ]}
                ctaLabel="Yeni kayıt oluştur"
                ctaTone="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white ring-emerald-400/40"
              />

              <MenuChoiceCard
                onClick={openList}
                cardTone="border-violet-300/55 bg-gradient-to-br from-violet-50 via-indigo-50/95 to-sky-50/85 hover:border-violet-400/70 focus-visible:ring-violet-300/40"
                glowTone="bg-violet-300/25 group-hover:bg-violet-300/35"
                badgeLabel="Kütüphane"
                badgeTone="border-violet-200/80 text-violet-800"
                icon={<ListMenuIcon />}
                title="Kayıtlı Şifa Rehberi Listesi"
                description="Rahatsızlık rehberlerini arayın, kart veya liste görünümünde inceleyin."
                statBadges={[
                  {
                    label: loading ? "…" : `${rows.length} kayıt`,
                    variant: "solid",
                    palette: "violet",
                  },
                  {
                    label: `${categoryCount} kategori`,
                    variant: "outline",
                    palette: "violet",
                  },
                ]}
                ctaLabel="Listeyi aç"
                ctaTone="bg-gradient-to-r from-violet-500 to-indigo-500 text-white ring-violet-400/40"
              />
            </div>
          </section>
        ) : null}

        {pageView === "list" ? (
        <section className={listFilterCard}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <SifaRehberiToolbarMenuButton onClick={goToMainMenu} />
            <p className="truncate text-[11px] font-bold text-slate-500">Kayıtlı rehber listesi</p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 w-full flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-slate-400">
                ⌕
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="İsim, kategori veya rehber metinlerinde ara..."
                className={listSearchInput}
              />
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${listViewBtn} ${
                  viewMode === "list" ? uiViewBtnActive : uiViewBtnIdle
                }`}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${listViewBtn} ${
                  viewMode === "card" ? uiViewBtnActive : uiViewBtnIdle
                }`}
              >
                Kart
              </button>
              <button
                type="button"
                onClick={() => {
                  if (queryTenantId) void loadGuides(queryTenantId);
                }}
                className={`${listViewBtn} ${uiViewBtnIdle}`}
              >
                Yenile
              </button>
              <button
                type="button"
                onClick={openNewRecord}
                className={listNewBtn}
              >
                + Yeni Rahatsızlık
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
            <p className="text-[11px] font-bold text-slate-400">
              {search.trim()
                ? `${filteredRows.length} sonuç`
                : `${filteredRows.length} kayıt (A–Z)`}
            </p>
            {loading && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                Yükleniyor...
              </span>
            )}
          </div>
        </section>
        ) : null}

        {pageView === "list" ? (
        <section className={listContentCard}>
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-sm font-bold text-slate-500">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <div className="text-4xl">✶</div>
              <h3 className="mt-3 text-2xl font-black text-slate-900">
                {search.trim() ? "Kayıt bulunamadı" : "Henüz kayıt yok"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {search.trim()
                  ? "Aramayı değiştirin veya yeni bir rahatsızlık rehberi ekleyin."
                  : "Admin toplu veri aktarımı sonrası kayıtlar burada listelenir. Yeni kayıt da ekleyebilirsiniz."}
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-hidden overflow-x-auto rounded-[24px] bg-white/86 ring-1 ring-slate-100">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-[1.1fr_0.85fr_0.55fr_1.2fr_0.75fr_0.55fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  <div>Rahatsızlık</div>
                  <div>Kategori</div>
                  <div>Dolu bölüm</div>
                  <div>Özet</div>
                  <div>Son güncelleme</div>
                  <div className="text-right">İşlem</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredRows.map((row) => {
                    const filled = countListFilledSections(row);
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1.1fr_0.85fr_0.55fr_1.2fr_0.75fr_0.55fr] gap-3 px-4 py-3 text-[12px] transition hover:bg-cyan-50/45"
                      >
                        <div className="min-w-0 font-black text-slate-950">
                          <span className="block truncate">{row.name}</span>
                        </div>
                        <div className="min-w-0 truncate text-slate-600">
                          {row.category?.trim() || "—"}
                        </div>
                        <div className="font-bold text-slate-600">{filled}</div>
                        <div className="min-w-0 text-[12px] leading-5 text-slate-500">
                          <span className="line-clamp-2 block">{listRowPreview(row, 100)}</span>
                        </div>
                        <div className="whitespace-nowrap text-[12px] font-semibold text-slate-500">
                          {formatDate(row.updated_at || row.created_at)}
                        </div>
                        <div className="flex justify-end">
                          <Link
                            href={`/sifa-rehberi/${row.id}`}
                            className="inline-flex shrink-0 rounded-2xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition hover:bg-slate-800"
                          >
                            Detayı Aç
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className={listGuideCardGrid}>
              {filteredRows.map((row) => {
                const filled = countListFilledSections(row);
                return (
                  <article key={row.id} className={listGuideCard}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={listGuideCardBadge}>{filled} bölüm dolu</span>
                      {row.category?.trim() ? (
                        <span className={listGuideCardCategory}>{row.category}</span>
                      ) : null}
                    </div>

                    <h2 className="mt-2.5 line-clamp-2 text-xl font-black tracking-tight text-slate-950">
                      {row.name}
                    </h2>

                    <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-slate-600">
                      {listRowPreview(row)}
                    </p>

                    <div className="mt-3 border-t border-emerald-50 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        Son güncelleme
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-slate-600">
                        {formatDate(row.updated_at || row.created_at)}
                      </p>
                    </div>

                    <Link href={`/sifa-rehberi/${row.id}`} className={`mt-3 ${listGuideCardCta}`}>
                      <span aria-hidden className="text-sm leading-none opacity-90">
                        ✦
                      </span>
                      Detayı Aç →
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        ) : null}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[min(960px,96vw)] rounded-[24px] bg-white p-3 shadow-2xl ring-1 ring-white/90"
            role="dialog"
            aria-modal="true"
            aria-label="Görsel önizleme"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-h-[min(78vh,720px)] w-auto max-w-full rounded-2xl object-contain"
            />
            <p className="mt-2 truncate px-1 text-center text-[12px] font-bold text-slate-600">
              {lightbox.name}
            </p>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-3 top-3 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white shadow-lg transition hover:bg-slate-800"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

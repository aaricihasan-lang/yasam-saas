"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { HealingGuideSectionType } from "@/lib/admin/healingGuideJsonImport";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  deleteHealingGuide,
  fetchHealingGuideDetail,
  firstSectionTabWithContent,
  getHealingGuideSectionDisplayTitle,
  groupSectionsByType,
  HEALING_SECTION_DISPLAY,
  peekCachedDetail,
  replaceHealingGuideSections,
  updateHealingGuide,
  type HealingGuideDetail,
  type HealingGuideSectionRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";
import {
  SectionEditor,
  sectionRowToEditable,
  editableToPayload,
  type EditableSection,
} from "@/components/sifa-rehberi/SectionEditor";
import { supabase } from "@/lib/supabase";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { isDemoFixtureGuide, getDemoGuideDetail } from "@/lib/demo/demoSifaRehberi";
import MemoryPicker from "@/components/yasam-hafizasi/MemoryPicker";

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

type DetailTabId =
  | "rahatsizlik"
  | "belirtiler"
  | "uygulamalar"
  | "dogaltas"
  | "aromaterapi"
  | "islami_oneriler"
  | "destekleyici";

type DraftTextKey =
  | "name"
  | "category"
  | "general_summary"
  | "medical_causes"
  | "subconscious_causes"
  | "temperament_causes"
  | "other_causes"
  | "iridology_match"
  | "hand_analysis_match"
  | "cupping_leech"
  | "reflexology"
  | "diet_recommendations"
  | "herbal_methods"
  | "stone_recommendations"
  | "aromatherapy"
  | "meditation"
  | "breathwork"
  | "bioenergy"
  | "massage"
  | "daily_routine"
  | "sleep_routine"
  | "supportive_alternative_methods"
  | "islamic_recommendations";

type Draft = Record<DraftTextKey, string> & { images: GuideImage[] };

const FIELD_LABELS: Record<Exclude<DraftTextKey, "name" | "category">, string> = {
  general_summary: "Genel / Özet",
  medical_causes: "Tıbbi Nedenler",
  subconscious_causes: "Bilinçaltı Sebepleri",
  temperament_causes: "Mizaç Sebepleri",
  other_causes: "Diğer Sebepler",
  iridology_match: "İridoloji’de Karşılığı",
  hand_analysis_match: "El Analizinde Karşılığı",
  cupping_leech: "Hacamat & Sülük",
  reflexology: "Refleksoloji",
  diet_recommendations: "Diyet Önerileri",
  herbal_methods: "Bitkisel Yöntemler",
  stone_recommendations: "Doğaltaş Önerileri",
  aromatherapy: "Aromaterapi",
  islamic_recommendations: "İslami Öneriler",
  meditation: "Meditasyon",
  breathwork: "Nefes",
  bioenergy: "Biyoenerji",
  massage: "Masaj",
  daily_routine: "Günlük Rutin",
  sleep_routine: "Uyku Düzeni",
  supportive_alternative_methods: "Destekleyici / Alternatif Uygulamalar",
};

const SIFA_REHBERI_LIST_HREF = "/sifa-rehberi?view=list";

const detailToolbarWrap =
  "flex flex-wrap items-center gap-2 rounded-xl border border-white/90 bg-white/60 p-1 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-md";

const detailToolbarBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 max-md:h-10 max-md:px-4 max-md:text-[13px]";

const DETAIL_TABS: {
  id: DetailTabId;
  label: string;
  icon: string;
  desc: string;
  keys: Exclude<DraftTextKey, "name" | "category">[];
}[] = [
  {
    id: "rahatsizlik",
    label: "Rahatsızlık",
    icon: "📋",
    desc: "Genel özet ve tanıtım metni.",
    keys: ["general_summary"],
  },
  {
    id: "belirtiler",
    label: "Belirtiler / Sebepler",
    icon: "🔍",
    desc: "Nedenler ve analiz eşleştirmeleri.",
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
    desc: "Uygulanabilir yöntem ve öneriler.",
    keys: ["cupping_leech", "reflexology", "diet_recommendations", "herbal_methods"],
  },
  {
    id: "dogaltas",
    label: "Doğaltaş & Mineral",
    icon: "💎",
    desc: "Taş ve mineral önerileri.",
    keys: ["stone_recommendations"],
  },
  {
    id: "aromaterapi",
    label: "Aromaterapi",
    icon: "🌸",
    desc: "Aromaterapi notları.",
    keys: ["aromatherapy"],
  },
  {
    id: "islami_oneriler",
    label: "İslami Öneriler",
    icon: "🕌",
    desc: "Dua, sure, niyet ve manevi destek.",
    keys: ["islamic_recommendations"],
  },
  {
    id: "destekleyici",
    label: "Destekleyici",
    icon: "✨",
    desc: "Meditasyon, nefes, rutin ve destekleyici uygulamalar.",
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
];

const detailNavBtnActive =
  "bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-[0_12px_36px_rgba(16,185,129,0.42)] ring-2 ring-emerald-300/55";
const detailNavBtnIdle =
  "bg-white/75 text-slate-700 ring-1 ring-emerald-100/70 hover:bg-white hover:ring-emerald-200/90";

const sectionPremiumCard =
  "rounded-xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-cyan-50/30 p-4 shadow-sm ring-1 ring-white/90 max-md:rounded-2xl max-md:bg-none max-md:bg-white max-md:border-slate-100 max-md:shadow-none max-md:ring-0";

const sectionNoteBody =
  "whitespace-pre-wrap rounded-lg border border-slate-100 bg-white/90 p-3 text-sm leading-6 text-slate-700 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:text-[15px] max-md:leading-7";

const detailNavBtnBase =
  "flex w-full min-h-[34px] items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold transition lg:min-w-0 max-md:w-full max-md:min-h-[44px] max-md:gap-2.5 max-md:rounded-xl max-md:px-3.5 max-md:text-[13px]";

type SectionBadgeTone = "emerald" | "cyan" | "violet";

const SECTION_BADGE_STYLES: Record<SectionBadgeTone, string> = {
  emerald: "border-emerald-100/90 bg-emerald-50/95 text-emerald-800",
  cyan: "border-cyan-100/90 bg-cyan-50/95 text-cyan-800",
  violet: "border-violet-100/90 bg-violet-50/95 text-violet-800",
};

function normalizeSectionModeKey(mode: string | null | undefined): string {
  if (!mode?.trim()) return "";
  return mode.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function sectionCardIcon(section: HealingGuideSectionRow, displayTitle: string): string {
  const mode = normalizeSectionModeKey(section.mode);
  if (mode.includes("bitkisel") || mode === "herbal" || displayTitle.includes("Bitkisel")) return "🌿";
  if (mode.includes("hacamat") || displayTitle.includes("Hacamat")) return "💧";
  if (mode.includes("refleks") || displayTitle.includes("Refleks")) return "👣";
  if (mode.includes("diyet") || displayTitle.includes("Diyet")) return "🥗";
  if (mode.includes("aroma") || displayTitle.includes("Aromaterapi")) return "🌸";

  switch (section.section_type) {
    case "reasons":
      return "🔍";
    case "applications":
      return "🙌";
    case "stones_details":
      return "💎";
    case "islamic_suggestions":
      return "🕌";
    case "supportive":
      return "✨";
    default:
      return "✦";
  }
}

function sectionContentBadge(
  section: HealingGuideSectionRow,
): { label: string; tone: SectionBadgeTone } | null {
  const mode = normalizeSectionModeKey(section.mode);

  if (section.section_type === "applications" || section.section_type === "herbal") {
    if (mode.includes("bitkisel") || mode === "herbal" || mode === "herbal_methods") {
      return { label: "Bitkisel destek", tone: "emerald" };
    }
    return { label: "Uygulama yöntemi", tone: "cyan" };
  }

  if (section.section_type === "reasons") {
    return { label: "Uzman notu", tone: "violet" };
  }

  if (section.section_type === "supportive") {
    return { label: "Destekleyici uygulama", tone: "cyan" };
  }

  if (section.source?.trim()) {
    return { label: "Uzman notu", tone: "violet" };
  }

  return null;
}

function trimOrNull(value: string) {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeImages(raw: HealingGuideRecord["images"]): GuideImage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as GuideImage[];
  return [];
}

function detailToRecord(detail: HealingGuideDetail): HealingGuideRecord {
  const l = detail.guide.legacy;
  return {
    id: detail.guide.id,
    tenant_id: detail.guide.tenant_id,
    name: detail.guide.name,
    category: detail.guide.category,
    general_summary: l.general_summary ?? null,
    medical_causes: l.medical_causes ?? null,
    subconscious_causes: l.subconscious_causes ?? null,
    temperament_causes: l.temperament_causes ?? null,
    other_causes: l.other_causes ?? null,
    iridology_match: l.iridology_match ?? null,
    hand_analysis_match: l.hand_analysis_match ?? null,
    cupping_leech: l.cupping_leech ?? null,
    reflexology: l.reflexology ?? null,
    diet_recommendations: l.diet_recommendations ?? null,
    herbal_methods: l.herbal_methods ?? null,
    stone_recommendations: l.stone_recommendations ?? null,
    aromatherapy: l.aromatherapy ?? null,
    meditation: l.meditation ?? null,
    breathwork: l.breathwork ?? null,
    bioenergy: l.bioenergy ?? null,
    massage: l.massage ?? null,
    daily_routine: l.daily_routine ?? null,
    sleep_routine: l.sleep_routine ?? null,
    supportive_alternative_methods: l.supportive_alternative_methods ?? null,
    islamic_recommendations: l.islamic_recommendations ?? null,
    images: normalizeImages(detail.guide.images as HealingGuideRecord["images"]),
    created_at: detail.guide.created_at,
    updated_at: detail.guide.updated_at,
  };
}

function recordToDraft(r: HealingGuideRecord): Draft {
  const s = (v: string | null | undefined) => (typeof v === "string" ? v : v ?? "") || "";
  return {
    name: s(r.name),
    category: s(r.category),
    general_summary: s(r.general_summary),
    medical_causes: s(r.medical_causes),
    subconscious_causes: s(r.subconscious_causes),
    temperament_causes: s(r.temperament_causes),
    other_causes: s(r.other_causes),
    iridology_match: s(r.iridology_match),
    hand_analysis_match: s(r.hand_analysis_match),
    cupping_leech: s(r.cupping_leech),
    reflexology: s(r.reflexology),
    diet_recommendations: s(r.diet_recommendations),
    herbal_methods: s(r.herbal_methods),
    stone_recommendations: s(r.stone_recommendations),
    aromatherapy: s(r.aromatherapy),
    meditation: s(r.meditation),
    breathwork: s(r.breathwork),
    bioenergy: s(r.bioenergy),
    massage: s(r.massage),
    daily_routine: s(r.daily_routine),
    sleep_routine: s(r.sleep_routine),
    supportive_alternative_methods: s(r.supportive_alternative_methods),
    islamic_recommendations: s(r.islamic_recommendations),
    images: normalizeImages(r.images),
  };
}

// Demo hesapta korunan içerik başlığının yanında gösterilen küçük kilit rozeti.
function DemoLockChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-700">
      🔒 Demo
    </span>
  );
}

export default function SifaRehberiDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [queryTenantId, setQueryTenantId] = useState<string | null>(null);
  const [record, setRecord] = useState<HealingGuideRecord | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [symptoms, setSymptoms] = useState<string | null>(null);
  const [sections, setSections] = useState<HealingGuideSectionRow[]>([]);
  // FAZ 2: section-native düzenleme draft'ı (karmaşık/imported kayıtlar için).
  const [editSections, setEditSections] = useState<EditableSection[]>([]);
  const [tab, setTab] = useState<DetailTabId>("rahatsizlik");
  const [sectionTab, setSectionTab] = useState<HealingGuideSectionType>("reasons");
  const [editEnabled, setEditEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  // BF-14 P2: danışana özel teslim eki (guide target). Yoksa çıktı değişmez.
  const [yhPickerOpen, setYhPickerOpen] = useState(false);
  const [yhSelection, setYhSelection] = useState<{ selectionGroupId: string; clientId: string; total: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [lightbox, setLightbox] = useState<GuideImage | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadTargetSection, setUploadTargetSection] = useState<DetailTabId | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  // Arka plan revalidate'in aktif düzenlemeyi ezmemesi için editEnabled aynası.
  const editEnabledRef = useRef(false);
  useEffect(() => {
    editEnabledRef.current = editEnabled;
  }, [editEnabled]);

  const activeTab = useMemo(
    () => DETAIL_TABS.find((t) => t.id === tab) ?? DETAIL_TABS[0],
    [tab]
  );

  const useSectionView = sections.length > 0 && !editEnabled;
  // FAZ 2: section-tabanlı kayıtlar artık section-native editörle KAYIPSIZ düzenlenir
  // (form-şekilli olma zorunluluğu KALDIRILDI → 35/35 production kaydı editlenebilir).
  const sectionEditMode = editEnabled && sections.length > 0;
  const { isDemo } = useDemoGuard();
  // Demo: sol menü ve bölüm başlıkları görünür; yalnızca içerik alanları DemoBlur ile korunur.

  const groupedSections = useMemo(() => groupSectionsByType(sections), [sections]);

  const activeSectionMeta = useMemo(
    () => HEALING_SECTION_DISPLAY.find((t) => t.type === sectionTab) ?? HEALING_SECTION_DISPLAY[0],
    [sectionTab]
  );

  const sectionsInActiveTab = groupedSections[sectionTab] ?? [];

  const tabImages = useMemo(
    () => (draft?.images ?? []).filter((img) => img.section === tab),
    [draft?.images, tab]
  );

  const loadRecord = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      setRecord(null);
      setDraft(null);
      return;
    }

    setErrorMessage("");

    // Demo fixture rahatsızlık — Supabase atlanır, zengin korumalı içerik gösterilir.
    if (isDemo && isDemoFixtureGuide(id)) {
      setLoading(true);
      setNotFound(false);
      const detail = getDemoGuideDetail(id);
      setLoading(false);
      if (!detail) {
        setNotFound(true);
        setRecord(null);
        setDraft(null);
        setSections([]);
        setSymptoms(null);
        return;
      }
      const demoRow = detailToRecord(detail);
      setRecord(demoRow);
      setDraft(recordToDraft(demoRow));
      setSymptoms(detail.guide.symptoms);
      setSections(detail.sections);
      setQueryTenantId("demo");
      setNotFound(false);
      return;
    }

    // SWR: önbellekte varsa anında boya (spinner yok), sonra arka planda revalidate et.
    const cached = peekCachedDetail(id);
    const hasCache = Boolean(cached);
    if (cached) {
      const cachedRow = detailToRecord(cached);
      setRecord(cachedRow);
      if (!editEnabledRef.current) setDraft(recordToDraft(cachedRow));
      setSymptoms(cached.guide.symptoms);
      setSections(cached.sections);
      if (cached.sections.length > 0) {
        setSectionTab(firstSectionTabWithContent(groupSectionsByType(cached.sections)));
      }
      setNotFound(false);
      setLoading(false);
    } else {
      setLoading(true);
      setNotFound(false);
    }

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      if (!hasCache) {
        setLoading(false);
        setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
        setRecord(null);
        setDraft(null);
        setSections([]);
        setNotFound(false);
      }
      return;
    }

    setQueryTenantId(tenantId);

    const { detail, error, notFound: missing } = await fetchHealingGuideDetail(tenantId, id);

    if (!hasCache) setLoading(false);

    if (error) {
      // Revalidate hatası: önbellek gösterimi varsa koru, yoksa hata göster.
      if (!hasCache) {
        setErrorMessage(`Kayıt yüklenemedi: ${error}`);
        setRecord(null);
        setDraft(null);
        setSections([]);
        setNotFound(false);
      }
      return;
    }

    if (missing || !detail) {
      // Sunucuda silinmiş → önbellek olsa bile "bulunamadı" göster.
      setNotFound(true);
      setRecord(null);
      setDraft(null);
      setSections([]);
      setSymptoms(null);
      return;
    }

    const row = detailToRecord(detail);
    setRecord(row);
    if (!editEnabledRef.current) setDraft(recordToDraft(row));
    setSymptoms(detail.guide.symptoms);
    setSections(detail.sections);
    if (!hasCache && detail.sections.length > 0) {
      setSectionTab(firstSectionTabWithContent(groupSectionsByType(detail.sections)));
    }
    setNotFound(false);
  }, [id, isDemo]);

  useEffect(() => {
    runInEffect(() => {
      void loadRecord();
    });
  }, [loadRecord]);

  useBfcacheRefresh();

  function setDraftField<K extends DraftTextKey>(key: K, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function persistImages(nextImages: GuideImage[]) {
    if (!id || !queryTenantId) return { error: "id yok" };
    const { error } = await updateHealingGuide(id, {
      images: nextImages.length > 0 ? nextImages : null,
    });
    return { error };
  }

  function triggerImagePick(section: DetailTabId) {
    setUploadTargetSection(section);
    imageFileInputRef.current?.click();
  }

  async function handleGuideImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const section = uploadTargetSection;
    e.target.value = "";
    setUploadTargetSection(null);
    if (!file || !section || !draft || !id) return;

    setUploadingImage(true);
    setErrorMessage("");

    const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const basename = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
    if (!queryTenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const file_path = `healing-guides/${queryTenantId}/${id}/${section}/${basename}`;

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

    const nextImages = [...draft.images, entry];
    setDraft((prev) => (prev ? { ...prev, images: nextImages } : prev));

    const { error: dbErr } = await persistImages(nextImages);
    if (dbErr) {
      setErrorMessage(`Görsel kaydedilemedi: ${dbErr}`);
      try {
        await supabase.storage.from("stone-photos").remove([file_path]);
      } catch {
        /* ignore */
      }
      setDraft((prev) =>
        prev ? { ...prev, images: prev.images.filter((i) => i.id !== entry.id) } : prev
      );
      return;
    }

    setRecord((prev) => (prev ? { ...prev, images: nextImages } : prev));
    setSuccessMessage("Görsel eklendi.");
    setTimeout(() => setSuccessMessage(""), 2500);
  }

  async function removeGuideImage(img: GuideImage) {
    if (!draft) return;
    setErrorMessage("");

    if (img.file_path) {
      const { error: rmErr } = await supabase.storage.from("stone-photos").remove([img.file_path]);
      if (rmErr) {
        setErrorMessage(`Depolama silinemedi: ${rmErr.message}`);
        return;
      }
    }

    const nextImages = draft.images.filter((i) => i.id !== img.id);
    setDraft((prev) => (prev ? { ...prev, images: nextImages } : prev));
    setLightbox((cur) => (cur?.id === img.id ? null : cur));

    const { error: dbErr } = await persistImages(nextImages);
    if (dbErr) {
      setErrorMessage(`Veritabanı güncellenemedi: ${dbErr}`);
      await loadRecord();
      return;
    }

    setRecord((prev) => (prev ? { ...prev, images: nextImages } : prev));
    setSuccessMessage("Görsel kaldırıldı.");
    setTimeout(() => setSuccessMessage(""), 2500);
  }

  async function handleSaveFields() {
    if (!draft || !id) return;
    const nameTrim = draft.name.trim();
    if (!nameTrim) {
      setErrorMessage("Rahatsızlık adı zorunludur.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!queryTenantId) {
      setSaving(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    // SECTION-NATIVE edit yolu (Faz 2): içerik healing_guide_sections'ta durur.
    // Guide satırına yalnız üst-düzey alanlar (ad/kategori/görsel) yazılır; bölümler
    // section-native editör draft'ından atomic replace RPC ile kayıpsız kaydedilir.
    if (sections.length > 0) {
      const { error: guideErr } = await updateHealingGuide(id, {
        name: nameTrim,
        category: trimOrNull(draft.category),
        images: draft.images.length > 0 ? draft.images : null,
      });
      if (guideErr) {
        setSaving(false);
        setErrorMessage(`Kayıt güncellenemedi: ${guideErr}`);
        return;
      }
      const { error: secErr } = await replaceHealingGuideSections(id, editableToPayload(editSections));
      setSaving(false);
      if (secErr) {
        setErrorMessage(`Bölümler kaydedilemedi: ${secErr}`);
        return;
      }
      setEditEnabled(false);
      setSuccessMessage("Kayıt güncellendi.");
      await loadRecord();
      return;
    }

    // Flat (legacy / eski manuel) kayıt: mevcut davranış aynen korunur.
    const { error } = await updateHealingGuide(id, {
      name: nameTrim,
      category: trimOrNull(draft.category),
      general_summary: trimOrNull(draft.general_summary),
      medical_causes: trimOrNull(draft.medical_causes),
      subconscious_causes: trimOrNull(draft.subconscious_causes),
      temperament_causes: trimOrNull(draft.temperament_causes),
      other_causes: trimOrNull(draft.other_causes),
      iridology_match: trimOrNull(draft.iridology_match),
      hand_analysis_match: trimOrNull(draft.hand_analysis_match),
      cupping_leech: trimOrNull(draft.cupping_leech),
      reflexology: trimOrNull(draft.reflexology),
      diet_recommendations: trimOrNull(draft.diet_recommendations),
      herbal_methods: trimOrNull(draft.herbal_methods),
      stone_recommendations: trimOrNull(draft.stone_recommendations),
      aromatherapy: trimOrNull(draft.aromatherapy),
      meditation: trimOrNull(draft.meditation),
      breathwork: trimOrNull(draft.breathwork),
      bioenergy: trimOrNull(draft.bioenergy),
      massage: trimOrNull(draft.massage),
      daily_routine: trimOrNull(draft.daily_routine),
      sleep_routine: trimOrNull(draft.sleep_routine),
      supportive_alternative_methods: trimOrNull(draft.supportive_alternative_methods),
      islamic_recommendations: trimOrNull(draft.islamic_recommendations),
      images: draft.images.length > 0 ? draft.images : null,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error}`);
      return;
    }

    setEditEnabled(false);
    setSuccessMessage("Kayıt güncellendi.");
    await loadRecord();
  }

  const downloadWord = useCallback(async () => {
    const tenantId = queryTenantId ?? await getSyncedTenantId();
    if (!tenantId || !record) return;
    const userId = readYasamUser()?.id;
    if (!userId) {
      setErrorMessage("Kullanıcı oturumu bulunamadı.");
      return;
    }
    setWordBusy(true);
    try {
      const res = await fetch("/api/sifa-rehberi/word-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          "x-session-token": readSessionToken() ?? "",
        },
        body: JSON.stringify({
          tenantId, userId, exportMode: "single", id: record.id,
          ...(yhSelection ? { clientId: yhSelection.clientId, selectionGroupId: yhSelection.selectionGroupId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setErrorMessage(err.error || "Rapor oluşturulamadı.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sifa-rehberi-${record.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [queryTenantId, record, yhSelection]);

  function toggleEditOrSave() {
    if (!draft || !record) return;
    if (editEnabled) {
      void handleSaveFields();
    } else {
      // FAZ 2: section-tabanlı kayıt → section-native editör draft'ını doldur (KAYIPSIZ,
      // section_type/mode/title/note/source/source_kind/expert_note/attention taşınır).
      // Flat/legacy kayıt → 21-alanlı form (mevcut davranış korunur).
      setDraft(recordToDraft(record));
      if (sections.length > 0) {
        setEditSections(sections.map(sectionRowToEditable));
      }
      setEditEnabled(true);
      setErrorMessage("");
    }
  }

  async function confirmDeleteRecord() {
    if (!id) return;
    setDeleting(true);
    setErrorMessage("");
    if (!queryTenantId) {
      setDeleting(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    const { error } = await deleteHealingGuide(id);
    setDeleting(false);
    if (error) {
      setErrorMessage(`Silinemedi: ${error}`);
      return;
    }
    setDeleteConfirmOpen(false);
    router.push(SIFA_REHBERI_LIST_HREF);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
        <div className="flex w-full items-center justify-center px-4 py-24 lg:px-8">
          <p className="text-[15px] font-bold text-slate-500">Yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (notFound || !record || !draft) {
    return (
      <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-10 lg:px-8 xl:px-10">
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] bg-white/72 p-8 text-center shadow-[0_18px_55px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
            <div className="text-[52px]">✶</div>
            <h1 className="mt-3 text-[22px] font-black text-slate-900">Kayıt bulunamadı</h1>
            <p className="mt-2 max-w-md text-[14px] font-medium leading-relaxed text-slate-500">
              Bu şifa rehberi kaydı bulunamadı veya erişim izniniz yok.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 max-md:px-3 max-md:py-3 lg:px-8 xl:px-10">
        {isDemo && (
          <DemoModuleBanner className="mb-3" message="Demo görünümü: rahatsızlık adı, kategori, tüm bölümler ve başlıklar görünür; uzmanın klinik içerikleri her başlığın altında korunur. Düzenleme yapılamaz." />
        )}
        <header className="mb-3 rounded-xl bg-white/70 p-3 shadow-sm ring-1 ring-white/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-emerald-700 ring-1 ring-emerald-100">
                ŞİFA REHBERİ DETAY
              </div>
              {editEnabled ? (
                <input
                  value={draft.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                  className="mt-1 w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-lg font-bold text-slate-950 outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100/60"
                  placeholder="Rahatsızlık adı"
                />
              ) : (
                <h1 className="mt-1 text-lg font-bold leading-snug tracking-tight text-slate-950 lg:text-xl">
                  {draft.name || record.name}
                </h1>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-slate-400">Kategori</span>
                {editEnabled ? (
                  <input
                    value={draft.category}
                    onChange={(e) => setDraftField("category", e.target.value)}
                    className="min-w-[200px] flex-1 rounded-2xl border border-slate-200/90 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 outline-none focus:border-emerald-200 focus:ring-4 focus:ring-emerald-100/60"
                    placeholder="—"
                  />
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/60">
                    {draft.category.trim() || "—"}
                  </span>
                )}
              </div>
              {!editEnabled && symptoms?.trim() ? (
                <div className="mt-2 rounded-lg border border-emerald-100/90 bg-emerald-50/40 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Belirtiler
                  </p>
                  <DemoBlur isProtected={isDemo}>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-5 text-slate-600">
                      {symptoms.trim()}
                    </p>
                  </DemoBlur>
                </div>
              ) : null}
            </div>

            {/* Araç çubuğu — demo hesapta gizli */}
            {!isDemo && (
            <div className={detailToolbarWrap}>
              <button
                type="button"
                onClick={() => setYhPickerOpen(true)}
                disabled={!record}
                className={`${detailToolbarBtn} border border-violet-200/90 bg-violet-50/95 text-violet-800 shadow-sm hover:bg-violet-100 disabled:opacity-60`}
              >
                🧠 Yaşam Hafızası&apos;ndan Seç{yhSelection ? ` (${yhSelection.total})` : ""}
              </button>
              <button
                type="button"
                onClick={() => void downloadWord()}
                disabled={wordBusy || !record}
                className={`${detailToolbarBtn} border border-emerald-200/90 bg-emerald-50/95 text-emerald-800 shadow-sm hover:bg-emerald-100`}
              >
                {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
              </button>
              <button
                type="button"
                onClick={toggleEditOrSave}
                disabled={saving}
                className={`${detailToolbarBtn} text-white shadow-[0_12px_28px_rgba(15,23,42,0.22)] ring-1 ring-slate-700/40 hover:shadow-[0_16px_36px_rgba(15,23,42,0.32)] ${
                  editEnabled
                    ? "bg-gradient-to-r from-emerald-600 to-teal-500 ring-emerald-500/30 hover:brightness-105"
                    : "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950"
                }`}
              >
                {saving ? "Kaydediliyor..." : editEnabled ? "Kaydet" : "Düzenle"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                  setErrorMessage("");
                }}
                className={`${detailToolbarBtn} border border-red-200/90 bg-red-50/95 text-red-700 shadow-sm hover:bg-red-100`}
              >
                Sil
              </button>
            </div>
            )}
          </div>
        </header>

        {errorMessage ? (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-5 py-3 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">
            {successMessage}
          </div>
        ) : null}

        <section className="flex max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/86 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90 max-md:max-h-none max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none max-md:ring-0 lg:max-h-[min(88vh,960px)] lg:flex-row">
          {sectionEditMode ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 max-md:overflow-visible max-md:p-0 max-md:pt-3 lg:p-5">
              <div className="rounded-2xl border border-white/90 bg-white/80 p-4 shadow-sm max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
                <h2 className="text-base font-bold tracking-tight text-slate-950 max-md:text-lg">
                  Bölümler
                </h2>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 lg:text-sm">
                  Bölümleri ekleyin, düzenleyin, ↑↓ ile sıralayın veya silin. İçerik uzunluk sınırı yoktur.
                </p>
                <div className="mt-4">
                  <SectionEditor value={editSections} onChange={setEditSections} disabled={saving} />
                </div>
              </div>
            </div>
          ) : (
          <>
          <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-100/80 p-3 max-md:block max-md:overflow-visible max-md:border-b-0 max-md:p-0 max-md:pb-1 lg:w-[240px] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-slate-100/80 lg:p-4">
            <div className="space-y-1.5 rounded-2xl bg-[linear-gradient(165deg,rgba(236,253,245,0.95)_0%,rgba(224,242,254,0.55)_48%,rgba(250,245,255,0.75)_100%)] p-2 ring-1 ring-white/90 max-md:flex max-md:w-full max-md:flex-col max-md:gap-1.5 max-md:space-y-0 max-md:rounded-none max-md:bg-none max-md:p-0 max-md:ring-0">
              {useSectionView
                ? HEALING_SECTION_DISPLAY.map((t) => {
                    const active = sectionTab === t.type;
                    const count = groupedSections[t.type]?.length ?? 0;
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => setSectionTab(t.type)}
                        className={`${detailNavBtnBase} min-w-[148px] max-md:min-w-0 ${
                          active ? detailNavBtnActive : detailNavBtnIdle
                        }`}
                      >
                        <span className="text-sm leading-none">{t.icon}</span>
                        <span className="flex-1 leading-snug">{t.label}</span>
                        {count > 0 ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {count}
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className={`hidden max-md:inline text-[13px] font-bold ${
                              active ? "text-white/70" : "text-slate-300"
                            }`}
                          >
                            —
                          </span>
                        )}
                      </button>
                    );
                  })
                : DETAIL_TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`${detailNavBtnBase} min-w-[148px] max-md:min-w-0 ${
                          active ? detailNavBtnActive : detailNavBtnIdle
                        }`}
                      >
                        <span className="text-sm leading-none">{t.icon}</span>
                        <span className="leading-snug">{t.label}</span>
                      </button>
                    );
                  })}
            </div>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 max-md:overflow-visible max-md:p-0 max-md:pt-3 lg:p-5">
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGuideImageFileChange}
            />

            <div className="rounded-2xl border border-white/90 bg-white/80 p-4 shadow-sm max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
              <h2
                className={
                  useSectionView
                    ? "text-base font-bold tracking-tight text-slate-950 max-md:text-lg lg:text-lg"
                    : "text-[15px] font-bold tracking-tight text-slate-950 max-md:text-lg"
                }
              >
                {useSectionView ? activeSectionMeta.label : activeTab.label}
              </h2>
              <p
                className={
                  useSectionView
                    ? "mt-1 text-xs font-medium leading-relaxed text-slate-500 lg:text-sm"
                    : "mt-1 text-[12px] font-medium leading-relaxed text-slate-500"
                }
              >
                {useSectionView ? activeSectionMeta.desc : activeTab.desc}
              </p>

              {editEnabled ? (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => triggerImagePick(tab)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-[12px] font-black text-emerald-900 shadow-sm ring-1 ring-emerald-100/80 transition hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span aria-hidden>📷</span>
                    {uploadingImage ? "Yükleniyor…" : "Görsel Ekle"}
                  </button>
                </div>
              ) : null}

              {tabImages.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {tabImages.map((img) => (
                    <div
                      key={img.id}
                      className="relative w-[88px] shrink-0 rounded-2xl border border-slate-200/90 bg-white p-1 shadow-sm ring-1 ring-slate-100/80"
                    >
                      <button
                        type="button"
                        onClick={() => setLightbox(img)}
                        className="block w-full overflow-hidden rounded-xl outline-none ring-emerald-200/0 transition focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt=""
                          className="aspect-square h-20 w-full object-cover"
                        />
                      </button>
                      {editEnabled ? (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void removeGuideImage(img);
                          }}
                          className="absolute right-1 top-1 rounded-lg bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white shadow-md ring-1 ring-rose-500/40 transition hover:bg-rose-700"
                        >
                          Sil
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                {useSectionView ? (
                  sectionsInActiveTab.length === 0 ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                      <p className="text-[15px] font-black text-slate-700">Henüz kayıt yok</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        Bu bölüm için içerik henüz eklenmemiş.
                      </p>
                    </div>
                  ) : (
                    sectionsInActiveTab.map((section) => {
                      const displayTitle = getHealingGuideSectionDisplayTitle(section);
                      const hasNote = Boolean(section.note?.trim());
                      const hasSource = Boolean(section.source?.trim());
                      const badge = sectionContentBadge(section);
                      const cardIcon = sectionCardIcon(section, displayTitle);

                      return (
                        <article key={section.id} className={sectionPremiumCard}>
                          <div className="flex items-start gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-sm shadow-sm ring-1 ring-white/70"
                              aria-hidden
                            >
                              {cardIcon}
                            </span>
                            <div className="min-w-0 flex-1">
                              {badge ? (
                                <span
                                  className={`mb-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${SECTION_BADGE_STYLES[badge.tone]}`}
                                >
                                  {badge.label}
                                </span>
                              ) : null}
                              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-slate-950 max-md:text-[15px]">
                                {displayTitle}
                                {isDemo ? <DemoLockChip /> : null}
                              </h3>
                            </div>
                          </div>
                          {hasNote ? (
                            <DemoBlur isProtected={isDemo}>
                              <div className={`mt-2.5 ${sectionNoteBody}`}>{section.note!.trim()}</div>
                            </DemoBlur>
                          ) : null}
                          {hasSource ? (
                            <DemoBlur isProtected={isDemo}>
                              <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
                                <span className="font-bold text-slate-600">Kaynak:</span>{" "}
                                {section.source!.trim()}
                              </p>
                            </DemoBlur>
                          ) : null}
                          {!hasNote && !hasSource ? (
                            <p className="mt-2 text-xs font-medium text-slate-400">
                              Bu başlık için henüz açıklama eklenmemiş.
                            </p>
                          ) : null}
                        </article>
                      );
                    })
                  )
                ) : (
                  activeTab.keys.map((key) => {
                    const label = FIELD_LABELS[key];
                    const value = draft[key];
                    return (
                      <div key={key} className={sectionPremiumCard}>
                        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 max-md:text-[12px]">
                          {label}
                          {isDemo ? <DemoLockChip /> : null}
                        </h3>
                        {editEnabled ? (
                          <textarea
                            value={value}
                            onChange={(e) => setDraftField(key, e.target.value)}
                            rows={6}
                            className="mt-1 w-full resize-y rounded-lg border border-slate-200/90 bg-white/95 p-3 text-sm leading-6 text-slate-900 shadow-inner outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-100/50"
                          />
                        ) : (
                          <DemoBlur isProtected={isDemo}>
                            <div className={sectionNoteBody}>
                              {value.trim() ? value : (
                                <span className="text-slate-400">Henüz kayıt yok</span>
                              )}
                            </div>
                          </DemoBlur>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          </>
          )}
        </section>
      </div>

      {lightbox ? (
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
            <p className="mt-2 truncate px-1 text-center text-[12px] font-bold text-slate-600">{lightbox.name}</p>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute right-3 top-3 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white shadow-lg transition hover:bg-slate-800"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div
            className="w-full max-w-[440px] rounded-[26px] border border-white/90 bg-[linear-gradient(165deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-emerald-100/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="mb-1 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-rose-700 ring-1 ring-rose-100">
              ONAY
            </div>
            <h2 id="delete-confirm-title" className="mt-3 text-[18px] font-black leading-snug text-slate-950">
              Bu kaydı silmek istiyor musunuz?
            </h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
              Bu işlem geri alınamaz. Şifa rehberi kaydı ve bağlı içerikleri silinecek.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-[12px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteRecord()}
                disabled={deleting}
                className="rounded-2xl bg-rose-600 px-5 py-2.5 text-[12px] font-black text-white shadow-[0_12px_28px_rgba(225,29,72,0.25)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {yhPickerOpen && record && !isDemo ? (
        <MemoryPicker
          open={yhPickerOpen}
          onClose={() => setYhPickerOpen(false)}
          targetKind="guide"
          targetRef={record.id}
          onConfirmed={(r) => {
            setYhSelection(r);
            setYhPickerOpen(false);
            setSuccessMessage(`${r.total} kayıt danışan teslim ekine eklenecek.`);
          }}
        />
      ) : null}
    </main>
  );
}

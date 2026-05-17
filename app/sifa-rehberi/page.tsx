"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

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

const SEARCH_KEYS: (keyof HealingGuideRecord)[] = [
  "name",
  "category",
  "general_summary",
  "medical_causes",
  "subconscious_causes",
  "temperament_causes",
  "other_causes",
  "iridology_match",
  "hand_analysis_match",
  "cupping_leech",
  "reflexology",
  "diet_recommendations",
  "herbal_methods",
  "stone_recommendations",
  "aromatherapy",
  "meditation",
  "breathwork",
  "bioenergy",
  "massage",
  "daily_routine",
  "sleep_routine",
  "supportive_alternative_methods",
  "islamic_recommendations",
];

const COUNT_KEYS: (keyof HealingGuideRecord)[] = SEARCH_KEYS.filter((k) => k !== "name" && k !== "category");

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

function countFilledSections(record: HealingGuideRecord) {
  return COUNT_KEYS.filter((key) => {
    const v = record[key];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
}

function shortPreview(record: HealingGuideRecord, limit = 140) {
  const chunk =
    (record.general_summary && record.general_summary.trim()) ||
    COUNT_KEYS.map((k) => record[k])
      .find((v) => typeof v === "string" && v && v.trim().length > 0)
      ?.toString()
      .replace(/\s+/g, " ")
      .trim();

  if (!chunk) return "Henüz özet eklenmedi.";
  return chunk.length > limit ? `${chunk.slice(0, limit)}…` : chunk;
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

export default function SifaRehberiPage() {
  const [rows, setRows] = useState<HealingGuideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
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

  async function loadGuides() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("healing_guides")
      .select("*")
      .eq("tenant_id", TENANT_ID);

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      return;
    }

    setRows((data || []) as HealingGuideRecord[]);
  }

  useEffect(() => {
    runInEffect(() => {
      loadGuides();
    });
  }, []);

  useEffect(() => {
    if (showForm) return;
    runInEffect(() => {
      setLargeEditorKey(null);
      setLargeEditorLabel("");
      setLargeEditorValue("");
      setFormTab("rahatsizlik");
    });
  }, [showForm]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    let list = rows;

    if (keyword) {
      list = rows.filter((row) => {
        const text = SEARCH_KEYS.map((k) => row[k] ?? "")
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return text.includes(keyword);
      });
    }

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
    const file_path = `healing-guides/${TENANT_ID}/${basename}`;

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

    const { error: insertError } = await supabase.from("healing_guides").insert({
      tenant_id: TENANT_ID,
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
    setShowForm(false);
    setSuccessMessage("Şifa rehberi kaydı oluşturuldu.");
    await loadGuides();
    resetForm();
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 font-black text-emerald-700">
              ✶ ŞİFA REHBERİ
            </div>

            <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
              Şifa Rehberi
            </h1>

            <p className="mt-3 text-lg font-medium text-slate-600 xl:text-xl">
              Rahatsızlık bazlı bütünsel şifa rehberi — listeleyin, arayın ve yeni kayıt ekleyin.
            </p>

            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border-2 border-emerald-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md transition hover:bg-emerald-50"
            >
              <svg
                aria-hidden
                className="h-4 w-4 shrink-0 text-emerald-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
              </svg>
              <span className="truncate">Ana Panele Dön</span>
            </Link>
          </div>

          <div className="grid w-full grid-cols-3 gap-4 lg:w-auto">
            <div className={uiStatCard}>
              <div className="text-3xl font-black">{rows.length}</div>
              <div className="text-sm font-bold text-slate-500">Kayıt</div>
            </div>
            <div className={uiStatCard}>
              <div className="text-3xl font-black">{categoryCount}</div>
              <div className="text-sm font-bold text-slate-500">Kategori</div>
            </div>
            <div className={uiStatCard}>
              <div className="text-3xl font-black">{filteredRows.length}</div>
              <div className="text-sm font-bold text-slate-500">Görünen</div>
            </div>
          </div>
        </header>

        <section className={uiFilterCard}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 w-full flex-1">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl text-slate-400">
                ⌕
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="İsim, kategori veya rehber metinlerinde ara..."
                className={uiSearchInput}
              />
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-3 xl:w-auto xl:justify-end">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${uiViewBtn} ${
                  viewMode === "list" ? uiViewBtnActive : uiViewBtnIdle
                }`}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${uiViewBtn} ${
                  viewMode === "card" ? uiViewBtnActive : uiViewBtnIdle
                }`}
              >
                Kart
              </button>
              <button
                type="button"
                onClick={loadGuides}
                className={`${uiViewBtn} ${uiViewBtnIdle}`}
              >
                Yenile
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className={uiNewBtn}
              >
                + Yeni Rahatsızlık
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
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

        {showForm && (
          <section className="mb-4 flex max-h-[min(92vh,920px)] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/86 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90">
            <div className="shrink-0 border-b border-slate-100/90 bg-white/60 px-5 py-5 backdrop-blur-sm lg:px-6">
              <h2 className="text-4xl font-black text-slate-950">Yeni rahatsızlık kaydı</h2>
              <p className="mt-2 text-lg text-slate-600">
                Sol menüden bölüm seçin; boş bırakılan alanlar veritabanında boş kalır.
              </p>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[320px_1fr] lg:p-6">
              <nav className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:w-[320px] lg:flex-col lg:overflow-y-auto lg:pb-0">
                <div className="min-h-[760px] w-full min-w-[280px] space-y-6 rounded-[34px] border-[3px] border-emerald-300/40 bg-gradient-to-b from-emerald-50 via-cyan-50 to-white p-5 shadow-[0_0_45px_rgba(16,185,129,0.12)] lg:min-w-0">
                  <div className="inline-flex rounded-full bg-emerald-100 px-4 py-2 font-black tracking-[0.2em] text-emerald-700">
                    BÖLÜMLER
                  </div>
                  {FORM_TABS.map((tab) => {
                    const active = formTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFormTab(tab.id)}
                        className={`flex h-[74px] w-full min-w-[260px] items-center justify-start gap-4 rounded-[22px] px-6 text-left text-lg font-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:translate-x-2 lg:min-w-0 ${
                          active
                            ? "scale-[1.03] bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.30)]"
                            : "border-2 border-emerald-100 bg-white/90 text-slate-800 hover:bg-emerald-50"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[28px] leading-none">
                          {tab.icon}
                        </span>
                        <span className="leading-snug">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-[22px] border border-white bg-white/80 p-6 shadow-md lg:p-8">
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleGuideImageFileChange}
                />
                <h3 className="mb-4 text-xl font-black text-slate-900">
                  {activeFormTab.label}
                </h3>
                <p className="text-lg leading-relaxed text-slate-600">
                  {activeFormTab.desc}
                </p>

                <div className="mt-6 flex flex-col gap-6">
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => triggerImagePick(formTab)}
                    className="inline-flex w-fit items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-[12px] font-black text-emerald-900 shadow-sm ring-1 ring-emerald-100/80 transition hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span aria-hidden>📷</span>
                    {uploadingImage ? "Yükleniyor…" : "Görsel Ekle"}
                  </button>
                  {tabImages.length > 0 ? (
                    <div className="flex flex-wrap gap-2.5">
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
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 space-y-6">
                  {activeFormTab.keys.map((fieldKey) => {
                    const meta = FORM_SECTIONS.find((s) => s.key === fieldKey);
                    if (!meta) return null;
                    const { key, label, multiline } = meta;
                    return (
                      <div key={key} className="block">
                        <label className="block">
                          <span className="mb-4 flex items-center gap-2 text-xl font-black text-slate-900">
                            <span
                              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-sm ring-4 ring-emerald-100/90"
                              aria-hidden
                            />
                            {label}
                          </span>
                          <div className="rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm">
                            {multiline ? (
                              <textarea
                                readOnly
                                value={form[key]}
                                onClick={() => openLargeEditor(key, label)}
                                onFocus={(e) => {
                                  openLargeEditor(key, label);
                                  e.target.blur();
                                }}
                                rows={key === "general_summary" ? 4 : 3}
                                className="min-h-[180px] w-full cursor-pointer resize-y rounded-xl border-0 bg-white px-5 py-4 text-lg leading-8 text-slate-900 outline-none ring-0 transition placeholder:text-base focus:ring-2 focus:ring-emerald-100/80"
                              />
                            ) : (
                              <input
                                value={form[key]}
                                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                className="h-14 w-full rounded-xl border-0 bg-white px-5 text-lg font-semibold leading-8 text-slate-900 outline-none ring-0 transition placeholder:text-base focus:ring-2 focus:ring-emerald-100/80"
                              />
                            )}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white/95 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)] transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200"
                >
                  Kapat
                </button>
              </div>
            </div>
          </section>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        )}

        {successMessage && !errorMessage && (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-5 py-3 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">
            {successMessage}
          </div>
        )}

        <section className={uiContentCard}>
          {loading ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-base font-bold text-slate-500">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <div className="text-6xl">✶</div>
              <h3 className="mt-4 text-4xl font-black text-slate-900">Kayıt bulunamadı</h3>
              <p className="mt-3 text-lg text-slate-500">
                Aramayı değiştirin veya yeni bir rahatsızlık rehberi ekleyin.
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
                    const filled = countFilledSections(row);
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
                          <span className="line-clamp-2 block">{shortPreview(row, 100)}</span>
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredRows.map((row) => {
                const filled = countFilledSections(row);
                return (
                  <article
                    key={row.id}
                    className="flex flex-col rounded-[24px] border border-white/90 bg-white/88 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)] ring-1 ring-slate-100/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:ring-emerald-200/80"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black tracking-tight text-white shadow-[0_6px_16px_rgba(5,150,105,0.3)] ring-1 ring-emerald-500/30">
                        {filled} bölüm dolu
                      </span>
                      {row.category?.trim() ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">
                          {row.category}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-[18px] font-black leading-snug text-slate-950">{row.name}</h2>
                    <p className="mt-3 flex-1 text-[12px] leading-6 text-slate-600">{shortPreview(row)}</p>
                    <p className="mt-2 text-[11px] font-bold text-slate-400">
                      Son güncelleme: {formatDate(row.updated_at || row.created_at)}
                    </p>
                    <Link
                      href={`/sifa-rehberi/${row.id}`}
                      className="mt-4 inline-flex w-fit items-center justify-center rounded-2xl bg-slate-950 px-5 py-2.5 text-[12px] font-black text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition hover:bg-slate-800"
                    >
                      Detayı Aç
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
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

      {largeEditorKey && showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm">
          <div
            className="w-full max-w-[920px] rounded-[28px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)] ring-1 ring-white"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sifa-large-editor-title"
          >
            <header className="mb-4 border-b border-slate-100 pb-4">
              <h3
                id="sifa-large-editor-title"
                className="text-[20px] font-black leading-snug text-slate-950"
              >
                {largeEditorLabel}
              </h3>
            </header>

            <textarea
              value={largeEditorValue}
              onChange={(e) => setLargeEditorValue(e.target.value)}
              className="h-[min(480px,52vh)] w-full resize-y rounded-2xl border border-cyan-100 bg-white p-5 text-[15px] leading-7 text-slate-800 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
              autoFocus
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveLargeEditor}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)] transition hover:bg-emerald-700"
              >
                Kaydet
              </button>
              <button
                type="button"
                onClick={closeLargeEditor}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { useToast } from "@/components/ui/ToastProvider";
import { AromaterapiModuleNav } from "@/app/aromaterapi/_components/AromaterapiModuleNav";
import {
  createOil,
  deleteOil,
  fetchOilDetail,
  fetchOilNameMap,
  updateOil,
  oilTypeBadgeClass,
  oilTypeLabel,
  oilToFormData,
  parseTagsInput,
  parseImageUrls,
  OIL_TYPES,
  type AromatherapyOil,
  type OilFormData,
} from "@/lib/aromaterapi/aromatherapyData";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoGate } from "@/components/demo/DemoGate";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { isDemoFixtureOil, getDemoOilDetail, DEMO_SEED_OILS_FULL } from "@/lib/demo/demoAromaterapi";

// -------------------------------------------------------
// Sekme tanımları
// -------------------------------------------------------

type DetailTabId =
  | "kimlik"
  | "botanik"
  | "yag-ozellikleri"
  | "kimyasal"
  | "ruhsal-duygusal"
  | "kullanim"
  | "uyumlu"
  | "onlemler"
  | "notlar";

type DetailTab = {
  id: DetailTabId;
  label: string;
  icon: string;
  desc: string;
  fields: (keyof OilFormData)[];
};

const DETAIL_TABS: DetailTab[] = [
  { id: "kimlik",          label: "Kimlik",              icon: "🌿", desc: "Ad, Latince/İngilizce ad, yağ tipi ve kategori.",              fields: ["name", "latin_name", "english_name", "oil_type", "category"] },
  { id: "botanik",         label: "Botanik & Kaynak",    icon: "🌱", desc: "Menşei, çıkarma yöntemi, kullanılan bitki bölümü ve raf ömrü.", fields: ["origin", "extraction_method", "plant_part", "shelf_life"] },
  { id: "yag-ozellikleri", label: "Yağ Özellikleri",     icon: "✨", desc: "Koku profili, nota, renk, kıvam ve fotosensitiflik.",           fields: ["aroma_profile", "aroma_note", "color", "consistency", "is_photosensitive"] },
  { id: "kimyasal",        label: "Kimyasal İçerik",     icon: "🔬", desc: "Ana kimyasal bileşenler ve terapötik özellikler.",             fields: ["main_components", "therapeutic_properties_raw"] },
  { id: "ruhsal-duygusal", label: "Ruhsal & Duygusal",   icon: "💚", desc: "Duygusal, ruhsal, fiziksel ve cilt faydaları.",               fields: ["emotional_benefits", "spiritual_benefits", "physical_benefits", "skin_benefits", "benefits"] },
  { id: "kullanim",        label: "Kullanım Şekilleri",  icon: "💧", desc: "Difüzyon, masaj, genel kullanım ve seyreltme oranı.",          fields: ["diffuser_usage", "massage_usage", "usage_methods", "dilution_ratio"] },
  { id: "uyumlu",          label: "Uyumlu Yağlar",       icon: "🔮", desc: "İyi karıştığı yağlar, hedef sistemler, çakra ve element.",    fields: ["blends_well_with_raw", "target_systems_raw", "chakra_connection", "element_connection"] },
  { id: "onlemler",        label: "Önlemler & Güvenlik", icon: "⚠️", desc: "Güvenlik notları ve kontrendikasyonlar.",                    fields: ["safety_notes", "contraindications"] },
  { id: "notlar",          label: "Notlar",               icon: "📝", desc: "Görseller (URL), ek notlar ve kaynak bilgisi.",               fields: ["images_raw", "notes", "source"] },
];

// -------------------------------------------------------
// Alan meta bilgileri
// -------------------------------------------------------

const FIELD_META: Record<
  string,
  { label: string; multiline?: boolean; isOilType?: boolean; isTags?: boolean; isBooleanToggle?: boolean; isImageList?: boolean }
> = {
  name:              { label: "Yağ Adı" },
  latin_name:        { label: "Latince Adı" },
  english_name:      { label: "İngilizce Adı" },
  oil_type:          { label: "Yağ Tipi", isOilType: true },
  category:          { label: "Kategori" },
  origin:            { label: "Menşei / Ülke" },
  extraction_method: { label: "Çıkarma Yöntemi" },
  plant_part:        { label: "Kullanılan Bitki Bölümü" },
  shelf_life:        { label: "Raf Ömrü" },
  aroma_profile:     { label: "Koku Profili", multiline: true },
  aroma_note:        { label: "Koku Notası" },
  color:             { label: "Renk" },
  consistency:       { label: "Kıvam / Yoğunluk" },
  is_photosensitive: { label: "Fotosensitif", isBooleanToggle: true },
  main_components:            { label: "Ana Kimyasal Bileşenler", multiline: true },
  therapeutic_properties_raw: { label: "Terapötik Özellikler", multiline: true, isTags: true },
  emotional_benefits: { label: "Duygusal Etkiler", multiline: true },
  spiritual_benefits: { label: "Ruhsal Etkiler", multiline: true },
  physical_benefits:  { label: "Fiziksel Faydalar", multiline: true },
  skin_benefits:      { label: "Cilt Faydaları", multiline: true },
  benefits:           { label: "Genel Faydalar", multiline: true },
  diffuser_usage:     { label: "Brülör & Buharlaştırıcı", multiline: true },
  massage_usage:      { label: "Masaj Kullanımı", multiline: true },
  usage_methods:      { label: "Genel Kullanım Yöntemleri", multiline: true },
  dilution_ratio:     { label: "Seyreltme Oranı" },
  blends_well_with_raw: { label: "İyi Karıştığı Yağlar", isTags: true, multiline: true },
  target_systems_raw:   { label: "Hedef Sistemler", isTags: true, multiline: true },
  chakra_connection:    { label: "Çakra Bağlantısı" },
  element_connection:   { label: "Element Bağlantısı" },
  safety_notes:         { label: "Güvenlik Notları", multiline: true },
  contraindications:    { label: "Kontrendikasyonlar", multiline: true },
  images_raw: { label: "Görseller", isImageList: true, multiline: true },
  notes:      { label: "Ek Notlar", multiline: true },
  source:     { label: "Kaynak" },
};

// Demo hesapta içerikleri korunan sekmeler (kimlik sekmesi açık kalır)
const DEMO_PROTECTED_TABS = new Set<DetailTabId>([
  "botanik", "yag-ozellikleri", "kimyasal",
  "ruhsal-duygusal", "kullanim", "uyumlu", "onlemler", "notlar",
]);

// Görünüm modunda tam genişlik (col-span-full) alacak alanlar.
// Listede OLMAYAN kısa/tek satırlık alanlar 2-kolon grid'de yan yana yerleşir.
const FULL_WIDTH_FIELDS = new Set([
  "aroma_profile", "main_components", "therapeutic_properties_raw",
  "emotional_benefits", "spiritual_benefits", "physical_benefits",
  "skin_benefits", "benefits", "diffuser_usage", "massage_usage",
  "usage_methods", "blends_well_with_raw", "target_systems_raw",
  "safety_notes", "contraindications", "images_raw", "notes",
  "is_photosensitive", "category",
]);

// -------------------------------------------------------
// Yardımcı fonksiyonlar
// -------------------------------------------------------

function isOilFieldEmpty(fieldKey: keyof OilFormData, draft: OilFormData): boolean {
  const meta = FIELD_META[fieldKey as string];
  if (!meta) return true;
  if (meta.isBooleanToggle) return !draft.is_photosensitive;
  const rawValue = draft[fieldKey as keyof OilFormData];
  const value = typeof rawValue === "string" ? rawValue : "";
  if (meta.isImageList) return parseImageUrls(value).length === 0;
  if (meta.isTags) return parseTagsInput(value).length === 0;
  return value.trim() === "";
}

function tabHasData(t: DetailTab, draft: OilFormData): boolean {
  return t.fields.some((f) => !isOilFieldEmpty(f as keyof OilFormData, draft));
}

// -------------------------------------------------------
// Blend lookup — 3 kademeli isim eşleştirme
// -------------------------------------------------------

type BlendEntry = { id: string; name: string };

function normTR(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .trim();
}

function stripYagSuffix(s: string): string {
  return s.replace(/\s+yağı\.?\s*$/i, "").replace(/\s+yağ\.?\s*$/i, "").trim();
}

function buildBlendMap(oils: BlendEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const oil of oils) {
    const { id, name } = oil;
    if (!map.has(name))               map.set(name, id);
    if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), id);
    const norm = normTR(stripYagSuffix(name));
    if (!map.has(norm))               map.set(norm, id);
  }
  return map;
}

function lookupBlend(name: string, map: Map<string, string>): string | null {
  return (
    map.get(name) ??
    map.get(name.toLowerCase()) ??
    map.get(normTR(stripYagSuffix(name))) ??
    null
  );
}

// -------------------------------------------------------
// Küçük bileşenler
// -------------------------------------------------------

function TagsList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          {tag}
        </span>
      ))}
    </div>
  );
}

// Premium kart grid — uyumlu yağlar için
function BlendCardGrid({ tags, blendMap }: { tags: string[]; blendMap: Map<string, string> | null }) {
  if (!tags.length) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
      {tags.map((tag) => {
        const targetId = blendMap ? lookupBlend(tag, blendMap) : null;
        const base = "group flex min-h-[52px] flex-col justify-between rounded-xl border p-2.5 text-left text-[11px] font-semibold leading-snug transition-all";
        if (targetId) {
          return (
            <Link
              key={tag}
              href={`/aromaterapi/yaglar/${targetId}`}
              className={`${base} border-violet-200/80 bg-gradient-to-br from-violet-50 to-purple-50/60 text-violet-800 shadow-sm hover:border-violet-300 hover:from-violet-100 hover:to-purple-100/70 hover:shadow-md`}
            >
              <span className="flex-1 leading-snug">{tag}</span>
              <span className="mt-1.5 text-[9px] font-bold tracking-wide text-violet-400/80 transition group-hover:text-violet-500">
                ↗ Git
              </span>
            </Link>
          );
        }
        return (
          <div key={tag} className={`${base} cursor-default border-slate-200/60 bg-white/50 text-slate-400`}>
            <span className="flex-1 leading-snug">{tag}</span>
            <span className="mt-1.5 text-[9px] text-slate-300">—</span>
          </div>
        );
      })}
    </div>
  );
}

// URL protokol güvenlik kontrolü — javascript: gibi tehlikeli protokolleri engeller
function isSafeUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

// Kimyasal bileşenler — virgüllü ise premium chip grid
function ChemicalChips({ raw }: { raw: string }) {
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length < 2) {
    return <p className="whitespace-pre-wrap text-[13px] leading-[1.75] text-slate-800">{raw}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400/50" />
          {c}
        </span>
      ))}
    </div>
  );
}

// -------------------------------------------------------
// Detay Sayfası
// -------------------------------------------------------

export default function OilDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? "") : "";

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [oil, setOil] = useState<AromatherapyOil | null>(null);
  const [draft, setDraft] = useState<OilFormData | null>(null);
  const [tab, setTab] = useState<DetailTabId>("kimlik");
  const [editEnabled, setEditEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [blendMap, setBlendMap] = useState<Map<string, string> | null>(null);

  const activeTab = useMemo(() => DETAIL_TABS.find((t) => t.id === tab) ?? DETAIL_TABS[0], [tab]);

  const activeFields = useMemo(() => {
    if (editEnabled || !draft) return activeTab.fields;
    return activeTab.fields.filter((f) => !isOilFieldEmpty(f as keyof OilFormData, draft));
  }, [editEnabled, activeTab.fields, draft]);

  const tabIsEmpty = !editEnabled && activeFields.length === 0;
  const isSharedContent = oil?.tenant_id === null;
  const { isDemo } = useDemoGuard();
  const isDemoProtectedTab = isDemo && DEMO_PROTECTED_TABS.has(tab);

  const loadOil = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setErrorMessage("");
    setNotFound(false);

    // Demo fixture yağı — Supabase atlanır
    if (isDemo && isDemoFixtureOil(id)) {
      const fixture = getDemoOilDetail(id);
      setLoading(false);
      if (fixture) {
        setOil(fixture);
        setDraft(oilToFormData(fixture));
        setBlendMap(buildBlendMap(DEMO_SEED_OILS_FULL.map((o) => ({ id: o.id, name: o.name }))));
      } else {
        setNotFound(true);
      }
      return;
    }

    const tid = await getSyncedTenantId();
    if (!tid) { setLoading(false); setErrorMessage(MISSING_SESSION_TENANT_MESSAGE); return; }
    setTenantId(tid);

    // Yağ detayı + blend haritası paralel çekilir
    const [oilResult, namesResult] = await Promise.all([
      fetchOilDetail(tid, id),
      fetchOilNameMap(),
    ]);

    setLoading(false);
    if (oilResult.error) { setErrorMessage(`Kayıt yüklenemedi: ${oilResult.error}`); return; }
    if (oilResult.notFound || !oilResult.oil) { setNotFound(true); return; }
    setOil(oilResult.oil);
    setDraft(oilToFormData(oilResult.oil));

    if (!namesResult.error && namesResult.names) {
      setBlendMap(buildBlendMap(namesResult.names as BlendEntry[]));
    }
  }, [id]);

  useEffect(() => { runInEffect(() => { void loadOil(); }); }, [loadOil]);
  useBfcacheRefresh();

  function handleNavigation(href: string) {
    if (editEnabled) { setPendingNavHref(href); setLeaveConfirmOpen(true); }
    else router.push(href);
  }
  function confirmLeave() { setLeaveConfirmOpen(false); setEditEnabled(false); if (pendingNavHref) router.push(pendingNavHref); setPendingNavHref(null); }
  function cancelLeave() { setLeaveConfirmOpen(false); setPendingNavHref(null); }

  function setDraftField(key: keyof OilFormData, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function startEdit() { if (!oil) return; setDraft(oilToFormData(oil)); setEditEnabled(true); setErrorMessage(""); }
  function cancelEdit() { if (!oil) return; setDraft(oilToFormData(oil)); setEditEnabled(false); setErrorMessage(""); }

  async function handleSave() {
    if (!draft || !id || !tenantId) return;
    const nameTrim = draft.name.trim();
    if (!nameTrim) { setErrorMessage("Yağ adı zorunludur."); return; }
    setSaving(true); setErrorMessage("");
    const t = (v: string) => v.trim() || "";
    const { error } = await updateOil(id, {
      name: nameTrim, latin_name: t(draft.latin_name), english_name: t(draft.english_name),
      oil_type: draft.oil_type || "essential", category: t(draft.category),
      extraction_method: t(draft.extraction_method), plant_part: t(draft.plant_part),
      origin: t(draft.origin), shelf_life: t(draft.shelf_life),
      aroma_profile: t(draft.aroma_profile), aroma_note: t(draft.aroma_note),
      color: t(draft.color), consistency: t(draft.consistency), is_photosensitive: draft.is_photosensitive,
      main_components: t(draft.main_components), therapeutic_properties: parseTagsInput(draft.therapeutic_properties_raw),
      emotional_benefits: t(draft.emotional_benefits), spiritual_benefits: t(draft.spiritual_benefits),
      physical_benefits: t(draft.physical_benefits), skin_benefits: t(draft.skin_benefits), benefits: t(draft.benefits),
      diffuser_usage: t(draft.diffuser_usage), massage_usage: t(draft.massage_usage),
      usage_methods: t(draft.usage_methods), dilution_ratio: t(draft.dilution_ratio),
      blends_well_with: parseTagsInput(draft.blends_well_with_raw), target_systems: parseTagsInput(draft.target_systems_raw),
      chakra_connection: t(draft.chakra_connection), element_connection: t(draft.element_connection),
      safety_notes: t(draft.safety_notes), contraindications: t(draft.contraindications),
      images: parseImageUrls(draft.images_raw), notes: t(draft.notes), source: t(draft.source),
    });
    setSaving(false);
    if (error) { setErrorMessage(`Kayıt güncellenemedi: ${error}`); return; }
    setEditEnabled(false);
    showToast({ title: "Başarılı", message: "Kayıt güncellendi.", type: "success" });
    await loadOil();
  }

  async function handleDelete() {
    if (!id || !tenantId) return;
    setDeleting(true); setErrorMessage("");
    const { error } = await deleteOil(id);
    setDeleting(false);
    if (error) { setErrorMessage(`Silinemedi: ${error}`); return; }
    setDeleteConfirmOpen(false); router.push("/aromaterapi/yaglar?view=list");
  }

  async function handleCopy() {
    if (!oil || !tenantId) return;
    setCopying(true); setErrorMessage("");
    const t = (v: string) => v || "";
    const { id: newId, error } = await createOil({
      name: `${oil.name} (Kopya)`,
      latin_name: t(oil.latin_name), english_name: t(oil.english_name), oil_type: oil.oil_type,
      category: t(oil.category), extraction_method: t(oil.extraction_method), plant_part: t(oil.plant_part),
      origin: t(oil.origin), shelf_life: t(oil.shelf_life), aroma_profile: t(oil.aroma_profile),
      aroma_note: t(oil.aroma_note), color: t(oil.color), consistency: t(oil.consistency),
      is_photosensitive: oil.is_photosensitive ?? false, main_components: t(oil.main_components),
      therapeutic_properties: oil.therapeutic_properties ?? [],
      emotional_benefits: t(oil.emotional_benefits), spiritual_benefits: t(oil.spiritual_benefits),
      physical_benefits: t(oil.physical_benefits), skin_benefits: t(oil.skin_benefits), benefits: t(oil.benefits),
      diffuser_usage: t(oil.diffuser_usage), massage_usage: t(oil.massage_usage),
      usage_methods: t(oil.usage_methods), dilution_ratio: t(oil.dilution_ratio),
      blends_well_with: oil.blends_well_with ?? [], target_systems: oil.target_systems ?? [],
      chakra_connection: t(oil.chakra_connection), element_connection: t(oil.element_connection),
      safety_notes: t(oil.safety_notes), contraindications: t(oil.contraindications),
      images: oil.images ?? [], notes: t(oil.notes), source: t(oil.source),
    });
    setCopying(false);
    if (error || !newId) { setErrorMessage("Kopyalama başarısız."); return; }
    router.push(`/aromaterapi/yaglar/${newId}`);
  }

  // -------------------------------------------------------
  // Yükleniyor / Bulunamadı
  // -------------------------------------------------------

  const pageBg = "bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)]";

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg}`}>
        <p className="text-sm font-bold text-slate-500">Yükleniyor...</p>
      </main>
    );
  }

  if (notFound || !oil || !draft) {
    return (
      <main className={`flex min-h-screen items-center justify-center p-4 ${pageBg}`}>
        <div className="flex max-w-md flex-col items-center rounded-[28px] bg-white/80 p-10 text-center shadow ring-1 ring-white/80">
          <div className="text-[52px]">🌸</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-900">Kayıt bulunamadı</h1>
          <p className="mt-2 text-[14px] font-medium text-slate-500">Bu yağ kaydı bulunamadı veya erişim izniniz yok.</p>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------
  // Ana Render
  // -------------------------------------------------------

  const btnBase = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition disabled:opacity-60";

  const plantPartChip = oil.plant_part.trim();
  const originChip    = oil.origin.trim().split(",")[0]?.trim() ?? "";
  const blendsCount   = (oil.blends_well_with ?? []).length;
  const hasInfoChips  = plantPartChip || originChip || blendsCount > 0;

  return (
    <main className={`flex min-h-screen flex-col text-slate-950 ${pageBg}`}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-2 px-3 py-4 sm:px-5 lg:px-8 xl:px-10">

        <AromaterapiModuleNav />

        {isDemo && (
          <DemoModuleBanner
            message={
              isDemoFixtureOil(id)
                ? "Bu demo yağ kaydıdır. Kimlik bilgileri görünürdür; klinik detaylar demo hesabında korunur."
                : "Kütüphane kaydı. Kimlik sekmesi açıktır; klinik içerikler demo hesabında korunur."
            }
          />
        )}

        {/* ─── HERO HEADER ──────────────────────────────────── */}
        <header className="overflow-hidden rounded-[20px] bg-white/95 shadow-[0_2px_20px_rgba(245,158,11,0.09)] ring-1 ring-amber-200/40">
          <div className="px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">

              {/* Sol: isim + meta */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-1.5">
                  <button type="button" onClick={() => handleNavigation("/aromaterapi")}
                    className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600/70 hover:text-amber-700">
                    Aromaterapi
                  </button>
                  <span className="text-[10px] text-amber-400">/</span>
                  <button type="button" onClick={() => handleNavigation("/aromaterapi/yaglar?view=list")}
                    className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600/70 hover:text-amber-700">
                    Yağlar
                  </button>
                </div>

                {editEnabled ? (
                  <input
                    value={draft.name}
                    onChange={(e) => setDraftField("name", e.target.value)}
                    className="w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50/30 px-3 py-2 text-[18px] font-black text-slate-950 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100/70"
                    placeholder="Yağ adı"
                  />
                ) : (
                  <h1 className="text-[18px] font-black leading-tight tracking-tight text-slate-950 sm:text-[20px]">
                    {oil.name}
                  </h1>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${oilTypeBadgeClass(oil.oil_type)}`}>
                    {oilTypeLabel(oil.oil_type)}
                  </span>
                  {oil.latin_name.trim() ? (
                    <span className="text-[12px] font-medium italic text-slate-500">{oil.latin_name}</span>
                  ) : null}
                  {oil.english_name.trim() ? (
                    <span className="text-[11px] text-slate-400">· {oil.english_name.split(";")[0]?.trim()}</span>
                  ) : null}
                  {oil.category.trim() ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{oil.category}</span>
                  ) : null}
                  {oil.is_photosensitive ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">☀️ Fotosensitif</span>
                  ) : null}
                  {isSharedContent ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-400">🔒 Paylaşımlı</span>
                  ) : null}
                </div>

                {hasInfoChips ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {plantPartChip ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        🌱 {plantPartChip}
                      </span>
                    ) : null}
                    {originChip ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700">
                        📍 {originChip}
                      </span>
                    ) : null}
                    {blendsCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700">
                        🔮 {blendsCount} uyumlu yağ
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Sağ: aksiyon butonları — demo hesapta gizli */}
              {!isDemo && (
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {isSharedContent ? (
                  <button type="button" onClick={() => void handleCopy()} disabled={copying}
                    className={`${btnBase} bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow ring-1 ring-slate-700/30 hover:brightness-110`}>
                    {copying ? "Düzenleniyor…" : "✏️ Düzenle"}
                  </button>
                ) : editEnabled ? (
                  <>
                    <button type="button" onClick={() => void handleSave()} disabled={saving}
                      className={`${btnBase} bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow ring-1 ring-amber-400/30 hover:brightness-105`}>
                      {saving ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button type="button" onClick={cancelEdit} disabled={saving}
                      className={`${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
                      Vazgeç
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={startEdit}
                      className={`${btnBase} bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow ring-1 ring-slate-700/30 hover:brightness-110`}>
                      ✏️ Düzenle
                    </button>
                    <button type="button" onClick={() => { setDeleteConfirmOpen(true); setErrorMessage(""); }}
                      className={`${btnBase} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}>
                      Sil
                    </button>
                  </>
                )}
              </div>
              )}
            </div>
          </div>

          {editEnabled && (
            <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-1.5 text-[11px] font-semibold text-amber-700">
              ✏️ Düzenleme modundasınız — kaydetmeden çıkmak için Vazgeç&apos;e basın
            </div>
          )}
          {isSharedContent && !editEnabled && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-1.5 text-[11px] font-medium text-slate-500">
              Bu kayıt ortak kütüphaneden kullanılmaktadır. Düzenleme yaptığınızda size özel bir kopya oluşturulur.
            </div>
          )}
          {errorMessage ? (
            <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[12px] font-black text-rose-700">{errorMessage}</div>
          ) : null}
        </header>

        {/* ─── ANA İÇERİK ──────────────────────────────────── */}
        <section className="flex flex-col rounded-[20px] bg-white/92 shadow-[0_4px_28px_rgba(15,23,42,0.06)] ring-1 ring-amber-100/70 lg:flex-row lg:items-start">

          {/* Sidebar */}
          <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-amber-100/60 bg-gradient-to-b from-amber-50/50 to-white/20 p-2 lg:w-[200px] lg:flex-col lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:border-amber-100/60 lg:p-2.5">
            {DETAIL_TABS.map((t) => {
              const active   = tab === t.id;
              const hasData  = tabHasData(t, draft);
              const hasDot   = !active && hasData;
              const isEmpty  = !active && !editEnabled && !hasData;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-[9px] text-[12px] font-bold transition lg:w-full lg:rounded-lg ${
                    active
                      ? "bg-gradient-to-r from-amber-500 to-rose-400 text-white shadow-[0_4px_16px_rgba(245,158,11,0.35)]"
                      : "text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                  } ${isEmpty ? "opacity-40" : ""}`}
                >
                  <span className="shrink-0 text-sm leading-none">{t.icon}</span>
                  <span className="flex-1 whitespace-nowrap text-left lg:whitespace-normal">{t.label}</span>
                  {hasDot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" /> : null}
                </button>
              );
            })}
          </nav>

          {/* İçerik paneli */}
          <div className="min-w-0 p-4 lg:flex-1 lg:p-5">

            {/* Sekme başlığı */}
            <div className="mb-4 flex items-center gap-2.5 border-b border-amber-100/50 pb-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-100 bg-amber-50/60 text-base leading-none shadow-sm">
                {activeTab.icon}
              </span>
              <div>
                <h2 className="text-[14px] font-black tracking-tight text-slate-950">{activeTab.label}</h2>
                <p className="text-[11px] font-medium text-slate-400">{activeTab.desc}</p>
              </div>
            </div>

            {/* Demo korumalı sekme — her zaman önce kontrol edilir */}
            {isDemoProtectedTab ? (
              <DemoGate
                isProtected={true}
                message="Bu sekme içeriği demo hesabında korunur. Tam sürümde tüm klinik detaylar açık olarak kullanılabilir."
              >
                <div className="space-y-3">
                  <div className="h-20 rounded-xl border border-slate-100 bg-white/70" />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="h-16 rounded-xl border border-slate-100 bg-white/70" />
                    <div className="h-16 rounded-xl border border-slate-100 bg-white/70" />
                  </div>
                  <div className="h-24 rounded-xl border border-slate-100 bg-white/70" />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="h-14 rounded-xl border border-slate-100 bg-white/70" />
                    <div className="h-14 rounded-xl border border-slate-100 bg-white/70" />
                  </div>
                </div>
              </DemoGate>

            ) : tabIsEmpty ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/50 text-2xl shadow-sm">📋</div>
                <p className="mt-3 text-[13px] font-medium text-slate-400">Bu bölümde kayıtlı bilgi yok</p>
                {!isDemo && (!isSharedContent ? (
                  <button type="button" onClick={startEdit}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110">
                    ✏️ Düzenle
                  </button>
                ) : (
                  <button type="button" onClick={() => void handleCopy()} disabled={copying}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-[12px] font-bold text-white shadow disabled:opacity-60 hover:brightness-110">
                    ✏️ Düzenle
                  </button>
                ))}
              </div>

            ) : editEnabled ? (
              /* ── Edit modu — değiştirilmedi ── */
              <div className="space-y-3">
                {activeFields.map((fieldKey) => {
                  const meta = FIELD_META[fieldKey as string];
                  if (!meta) return null;
                  const rawValue = draft[fieldKey as keyof OilFormData];
                  const value    = typeof rawValue === "string" ? rawValue : "";

                  const inputCls    = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100/60";
                  const textareaCls = "w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-[13px] leading-[1.65] text-slate-900 shadow-inner outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100/60";
                  const cardCls     = "rounded-xl border border-amber-100/80 bg-gradient-to-br from-white to-amber-50/20 p-3.5 shadow-sm";
                  const labelCls    = "mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-amber-600";

                  if (meta.isBooleanToggle) {
                    const boolVal = draft.is_photosensitive;
                    return (
                      <div key={fieldKey} className={cardCls}>
                        <p className={labelCls}>{meta.label}</p>
                        <button type="button"
                          onClick={() => setDraft((prev) => prev ? { ...prev, is_photosensitive: !prev.is_photosensitive } : prev)}
                          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-bold transition ${boolVal ? "bg-amber-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200"}`}>
                          <span className="text-base leading-none">{boolVal ? "☀️" : "○"}</span>
                          {boolVal ? "Evet — Fotosensitif" : "Hayır — Fotosensitif Değil"}
                        </button>
                      </div>
                    );
                  }
                  if (meta.isOilType) {
                    return (
                      <div key={fieldKey} className={cardCls}>
                        <p className={labelCls}>{meta.label}</p>
                        <select value={draft.oil_type} onChange={(e) => setDraftField("oil_type", e.target.value)} className={inputCls}>
                          {OIL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    );
                  }
                  if (meta.isImageList) {
                    return (
                      <div key={fieldKey} className={cardCls}>
                        <p className={labelCls}>{meta.label}</p>
                        <textarea value={value} onChange={(e) => setDraftField(fieldKey as keyof OilFormData, e.target.value)}
                          rows={4} placeholder={"Her satıra bir URL girin…\nhttps://example.com/gorsel.jpg"} className={textareaCls} />
                        <p className="mt-1.5 text-[10px] font-medium text-slate-400">Her satıra bir URL girin.</p>
                      </div>
                    );
                  }
                  return (
                    <div key={fieldKey} className={cardCls}>
                      <p className={labelCls}>{meta.label}</p>
                      {meta.multiline ? (
                        <textarea value={value} onChange={(e) => setDraftField(fieldKey as keyof OilFormData, e.target.value)} rows={4} className={textareaCls} />
                      ) : (
                        <input type="text" value={value} onChange={(e) => setDraftField(fieldKey as keyof OilFormData, e.target.value)} className={inputCls} />
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-2 border-t border-amber-100/60 pt-4">
                  <button type="button" onClick={() => void handleSave()} disabled={saving}
                    className="inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 text-[13px] font-black text-white shadow-md disabled:opacity-60">
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button type="button" onClick={cancelEdit}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700 hover:bg-slate-50">
                    Vazgeç
                  </button>
                </div>
              </div>

            ) : (
              /* ── Görünüm modu — gerçek hesap veya açık kimlik sekmesi ── */
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeFields.map((fieldKey) => {
                  const meta = FIELD_META[fieldKey as string];
                  if (!meta) return null;
                  const rawValue    = draft[fieldKey as keyof OilFormData];
                  const value       = typeof rawValue === "string" ? rawValue : "";
                  const isFullWidth = FULL_WIDTH_FIELDS.has(fieldKey as string);

                  const itemCls  = `rounded-xl border border-slate-100/80 bg-white/70 px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.04)]${isFullWidth ? " col-span-full" : ""}`;
                  const labelCls = "mb-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-amber-600/80";

                  if (meta.isBooleanToggle) {
                    return draft.is_photosensitive ? (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd>
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-800">
                            ☀️ Fotosensitif — Güneş ışığına maruz kalmadan önce uyarı verilmesi gerekir.
                          </span>
                        </dd>
                      </div>
                    ) : null;
                  }

                  if (meta.isImageList) {
                    const urls = parseImageUrls(value);
                    if (!urls.length) return null;
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd className="space-y-2">
                          {urls.map((url, i) => {
                            const safe = isSafeUrl(url);
                            return (
                            <div key={i} className="flex items-center gap-3 rounded-xl border border-amber-100/60 bg-amber-50/20 p-2.5 shadow-sm">
                              {safe ? (
                                // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URL, protocol validated above
                                <img src={url} alt={`Görsel ${i + 1}`} className="h-14 w-14 shrink-0 rounded-lg border border-amber-100 object-cover shadow-sm" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-xs font-bold text-rose-400">!</div>
                              )}
                              {safe ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[12px] font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900">{url}</a>
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-rose-500" title="Geçersiz URL protokolü">{url}</span>
                              )}
                            </div>
                            );
                          })}
                        </dd>
                      </div>
                    );
                  }

                  /* Uyumlu yağlar: premium kart grid */
                  if (fieldKey === "blends_well_with_raw") {
                    const tags = parseTagsInput(value);
                    if (!tags.length) return null;
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd className="mt-0.5"><BlendCardGrid tags={tags} blendMap={blendMap} /></dd>
                      </div>
                    );
                  }

                  if (meta.isTags) {
                    const tags = parseTagsInput(value);
                    if (!tags.length) return null;
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd><TagsList tags={tags} /></dd>
                      </div>
                    );
                  }

                  /* Kimyasal bileşenler: premium chip grid */
                  if (fieldKey === "main_components" && value.trim()) {
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd className="mt-0.5"><ChemicalChips raw={value} /></dd>
                      </div>
                    );
                  }

                  if (meta.isOilType) {
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${oilTypeBadgeClass(draft.oil_type)}`}>
                            {oilTypeLabel(draft.oil_type)}
                          </span>
                        </dd>
                      </div>
                    );
                  }

                  if (meta.multiline) {
                    return (
                      <div key={fieldKey} className={itemCls}>
                        <dt className={labelCls}>{meta.label}</dt>
                        <dd className="whitespace-pre-wrap text-[13px] leading-[1.75] text-slate-800">{value}</dd>
                      </div>
                    );
                  }

                  return (
                    <div key={fieldKey} className={itemCls}>
                      <dt className={labelCls}>{meta.label}</dt>
                      <dd className="text-[13px] font-medium text-slate-800">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        </section>

      </div>

      {/* Kaydedilmemiş değişiklik onayı */}
      {leaveConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[26px] border border-white/90 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60" role="dialog" aria-modal="true">
            <div className="mb-1 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-amber-700 ring-1 ring-amber-100">
              KAYDEDİLMEMİŞ DEĞİŞİKLİK
            </div>
            <h2 className="mt-3 text-[18px] font-black leading-snug text-slate-950">Değişiklikleriniz kaydedilmedi</h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
              Düzenleme modunda kaydedilmemiş değişiklikler var. Ne yapmak istiyorsunuz?
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => { cancelLeave(); void handleSave(); }} disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2.5 text-[12px] font-black text-white shadow hover:brightness-105 disabled:opacity-60">
                Kaydet ve Çık
              </button>
              <button type="button" onClick={confirmLeave}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-[12px] font-black text-slate-700 hover:bg-slate-200">
                Kaydetmeden Çık
              </button>
              <button type="button" onClick={cancelLeave}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-black text-slate-600 hover:bg-slate-50">
                İptal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Silme onayı */}
      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[26px] border border-white/90 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60" role="dialog" aria-modal="true">
            <div className="mb-1 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-rose-700 ring-1 ring-rose-100">
              ONAY
            </div>
            <h2 className="mt-3 text-[18px] font-black leading-snug text-slate-950">Bu yağ kaydını silmek istiyor musunuz?</h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
              Bu işlem geri alınamaz. <strong>{oil.name}</strong> kaydı kalıcı olarak silinecek.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-[12px] font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                Vazgeç
              </button>
              <button type="button" onClick={() => void handleDelete()} disabled={deleting}
                className="rounded-2xl bg-rose-600 px-5 py-2.5 text-[12px] font-black text-white shadow hover:bg-rose-700 disabled:opacity-60">
                {deleting ? "Siliniyor…" : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

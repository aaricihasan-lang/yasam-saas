"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  fetchOilDetail,
  oilTypeBadgeClass,
  oilTypeLabel,
  oilToFormData,
  parseTagsInput,
  OIL_TYPES,
  type AromatherapyOil,
  type OilFormData,
} from "@/lib/aromaterapi/aromatherapyData";
import { supabase } from "@/lib/supabase";

// -------------------------------------------------------
// Detay sekmeleri
// -------------------------------------------------------

type DetailTabId =
  | "kimlik"
  | "koku"
  | "bilesim"
  | "faydalar"
  | "kullanim"
  | "enerji"
  | "notlar";

type DetailTab = {
  id: DetailTabId;
  label: string;
  icon: string;
  desc: string;
  fields: (keyof OilFormData)[];
};

const DETAIL_TABS: DetailTab[] = [
  {
    id: "kimlik",
    label: "Kimlik & Botanik",
    icon: "🌿",
    desc: "Ad, tip, kategori, menşei, çıkarma yöntemi ve bitki bölümü.",
    fields: ["name", "latin_name", "oil_type", "category", "origin", "extraction_method", "plant_part"],
  },
  {
    id: "koku",
    label: "Koku & Görünüm",
    icon: "✨",
    desc: "Koku profili, nota, renk ve kıvam bilgileri.",
    fields: ["aroma_profile", "aroma_note", "color", "consistency"],
  },
  {
    id: "bilesim",
    label: "Bileşim & Terapötik",
    icon: "🔬",
    desc: "Ana bileşenler ve terapötik özellikler.",
    fields: ["main_components", "therapeutic_properties_raw"],
  },
  {
    id: "faydalar",
    label: "Faydalar",
    icon: "💚",
    desc: "Fiziksel, duygusal, manevi ve cilt faydaları.",
    fields: ["physical_benefits", "emotional_benefits", "spiritual_benefits", "skin_benefits", "benefits"],
  },
  {
    id: "kullanim",
    label: "Kullanım & Güvenlik",
    icon: "⚠️",
    desc: "Kullanım yöntemleri, seyreltme oranı ve güvenlik notları.",
    fields: ["usage_methods", "dilution_ratio", "safety_notes", "contraindications"],
  },
  {
    id: "enerji",
    label: "Enerji & Bağlantı",
    icon: "🔮",
    desc: "Çakra bağlantısı, element ve iyi karıştığı yağlar.",
    fields: ["chakra_connection", "element_connection", "blends_well_with_raw"],
  },
  {
    id: "notlar",
    label: "Notlar & Kaynak",
    icon: "📝",
    desc: "Ek notlar ve referans kaynak.",
    fields: ["notes", "source"],
  },
];

// -------------------------------------------------------
// Alan meta bilgileri
// -------------------------------------------------------

const FIELD_META: Record<
  string,
  { label: string; multiline?: boolean; isSelect?: boolean; isOilType?: boolean; isTags?: boolean }
> = {
  name: { label: "Yağ Adı" },
  latin_name: { label: "Latince Adı" },
  oil_type: { label: "Yağ Tipi", isSelect: true, isOilType: true },
  category: { label: "Kategori" },
  origin: { label: "Menşei / Ülke" },
  extraction_method: { label: "Çıkarma Yöntemi" },
  plant_part: { label: "Kullanılan Bitki Bölümü" },
  aroma_profile: { label: "Koku Profili", multiline: true },
  aroma_note: { label: "Koku Notası" },
  color: { label: "Renk" },
  consistency: { label: "Kıvam / Yoğunluk" },
  main_components: { label: "Ana Bileşenler", multiline: true },
  therapeutic_properties_raw: { label: "Terapötik Özellikler", multiline: true, isTags: true },
  physical_benefits: { label: "Fiziksel Faydalar", multiline: true },
  emotional_benefits: { label: "Duygusal Faydalar", multiline: true },
  spiritual_benefits: { label: "Manevi Faydalar", multiline: true },
  skin_benefits: { label: "Cilt Faydaları", multiline: true },
  benefits: { label: "Genel Faydalar", multiline: true },
  usage_methods: { label: "Kullanım Yöntemleri", multiline: true },
  dilution_ratio: { label: "Seyreltme Oranı" },
  safety_notes: { label: "Güvenlik Notları", multiline: true },
  contraindications: { label: "Kontrendikasyonlar", multiline: true },
  chakra_connection: { label: "Çakra Bağlantısı" },
  element_connection: { label: "Element Bağlantısı" },
  blends_well_with_raw: { label: "İyi Karıştığı Yağlar", isTags: true, multiline: true },
  notes: { label: "Ek Notlar", multiline: true },
  source: { label: "Kaynak" },
};

// -------------------------------------------------------
// Tasarım token'ları
// -------------------------------------------------------

const toolbarBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

const navBtnBase =
  "flex w-full min-h-[34px] items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold transition";

const navBtnActive =
  "bg-gradient-to-r from-amber-500 to-rose-400 text-white shadow-[0_10px_28px_rgba(245,158,11,0.38)] ring-2 ring-amber-300/55";

const navBtnIdle =
  "bg-white/75 text-slate-700 ring-1 ring-amber-100/70 hover:bg-white hover:ring-amber-200/90";

const sectionCard =
  "rounded-xl border border-amber-100 bg-gradient-to-br from-white via-amber-50/30 to-rose-50/20 p-4 shadow-sm ring-1 ring-white/90";

const sectionBody =
  "whitespace-pre-wrap rounded-lg border border-slate-100 bg-white/90 p-3 text-sm leading-6 text-slate-700";

// -------------------------------------------------------
// Tag gösterim bileşeni
// -------------------------------------------------------

function TagsList({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-sm text-slate-400">Henüz eklenmemiş</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// -------------------------------------------------------
// Detay sayfası
// -------------------------------------------------------

export default function OilDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

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
  const [successMessage, setSuccessMessage] = useState("");

  const activeTab = useMemo(
    () => DETAIL_TABS.find((t) => t.id === tab) ?? DETAIL_TABS[0],
    [tab],
  );

  const isSharedContent = oil?.tenant_id === null;

  const loadOil = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setErrorMessage("");
    setNotFound(false);

    const tid = await getSyncedTenantId();
    if (!tid) {
      setLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }
    setTenantId(tid);

    const { oil: data, error, notFound: missing } = await fetchOilDetail(tid, id);
    setLoading(false);

    if (error) { setErrorMessage(`Kayıt yüklenemedi: ${error}`); return; }
    if (missing || !data) { setNotFound(true); return; }

    setOil(data);
    setDraft(oilToFormData(data));
  }, [id]);

  useEffect(() => {
    runInEffect(() => { void loadOil(); });
  }, [loadOil]);

  useBfcacheRefresh();

  // -------------------------------------------------------
  // Navigasyon — unsaved changes koruması
  // -------------------------------------------------------

  function handleNavigation(href: string) {
    if (editEnabled) {
      setPendingNavHref(href);
      setLeaveConfirmOpen(true);
    } else {
      router.push(href);
    }
  }

  function confirmLeave() {
    setLeaveConfirmOpen(false);
    setEditEnabled(false);
    if (pendingNavHref) router.push(pendingNavHref);
    setPendingNavHref(null);
  }

  function cancelLeave() {
    setLeaveConfirmOpen(false);
    setPendingNavHref(null);
  }

  // -------------------------------------------------------
  // Edit kontrolleri
  // -------------------------------------------------------

  function setDraftField(key: keyof OilFormData, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function startEdit() {
    if (!oil) return;
    setDraft(oilToFormData(oil));
    setEditEnabled(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelEdit() {
    if (!oil) return;
    setDraft(oilToFormData(oil));
    setEditEnabled(false);
    setErrorMessage("");
  }

  async function handleSave() {
    if (!draft || !id || !tenantId) return;
    const nameTrim = draft.name.trim();
    if (!nameTrim) { setErrorMessage("Yağ adı zorunludur."); return; }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const t = (v: string) => v.trim() || "";

    const { data: updatedRows, error } = await supabase
      .from("aromatherapy_oils")
      .update({
        name: nameTrim,
        latin_name: t(draft.latin_name),
        oil_type: draft.oil_type || "essential",
        category: t(draft.category),
        extraction_method: t(draft.extraction_method),
        plant_part: t(draft.plant_part),
        origin: t(draft.origin),
        aroma_profile: t(draft.aroma_profile),
        aroma_note: t(draft.aroma_note),
        color: t(draft.color),
        consistency: t(draft.consistency),
        main_components: t(draft.main_components),
        therapeutic_properties: parseTagsInput(draft.therapeutic_properties_raw),
        benefits: t(draft.benefits),
        emotional_benefits: t(draft.emotional_benefits),
        physical_benefits: t(draft.physical_benefits),
        spiritual_benefits: t(draft.spiritual_benefits),
        skin_benefits: t(draft.skin_benefits),
        usage_methods: t(draft.usage_methods),
        dilution_ratio: t(draft.dilution_ratio),
        safety_notes: t(draft.safety_notes),
        contraindications: t(draft.contraindications),
        blends_well_with: parseTagsInput(draft.blends_well_with_raw),
        chakra_connection: t(draft.chakra_connection),
        element_connection: t(draft.element_connection),
        notes: t(draft.notes),
        source: t(draft.source),
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("id");

    setSaving(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setErrorMessage("Güncelleme başarısız — bu kayıt değiştirilemez veya erişim izniniz yok.");
      return;
    }

    setEditEnabled(false);
    setSuccessMessage("Kayıt güncellendi.");
    await loadOil();
  }

  async function handleDelete() {
    if (!id || !tenantId) return;
    setDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("aromatherapy_oils")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    setDeleting(false);
    if (error) { setErrorMessage(`Silinemedi: ${error.message}`); return; }

    setDeleteConfirmOpen(false);
    router.push("/aromaterapi/yaglar?view=list");
  }

  async function handleCopy() {
    if (!oil || !tenantId) return;
    setCopying(true);
    setErrorMessage("");

    const t = (v: string) => v || "";

    const { data, error } = await supabase
      .from("aromatherapy_oils")
      .insert({
        tenant_id: tenantId,
        name: `${oil.name} (Kopya)`,
        latin_name: t(oil.latin_name),
        oil_type: oil.oil_type,
        category: t(oil.category),
        extraction_method: t(oil.extraction_method),
        plant_part: t(oil.plant_part),
        origin: t(oil.origin),
        aroma_profile: t(oil.aroma_profile),
        aroma_note: t(oil.aroma_note),
        color: t(oil.color),
        consistency: t(oil.consistency),
        main_components: t(oil.main_components),
        therapeutic_properties: oil.therapeutic_properties ?? [],
        benefits: t(oil.benefits),
        emotional_benefits: t(oil.emotional_benefits),
        physical_benefits: t(oil.physical_benefits),
        spiritual_benefits: t(oil.spiritual_benefits),
        skin_benefits: t(oil.skin_benefits),
        usage_methods: t(oil.usage_methods),
        dilution_ratio: t(oil.dilution_ratio),
        safety_notes: t(oil.safety_notes),
        contraindications: t(oil.contraindications),
        blends_well_with: oil.blends_well_with ?? [],
        chakra_connection: t(oil.chakra_connection),
        element_connection: t(oil.element_connection),
        notes: t(oil.notes),
        source: t(oil.source),
      })
      .select("id")
      .single();

    setCopying(false);

    if (error || !data) {
      setErrorMessage("Kopyalama başarısız.");
      return;
    }

    router.push(`/aromaterapi/yaglar/${data.id}`);
  }

  // -------------------------------------------------------
  // Yükleniyor
  // -------------------------------------------------------

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)]">
        <div className="flex w-full items-center justify-center py-24">
          <p className="text-sm font-bold text-slate-500">Yükleniyor...</p>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------
  // Bulunamadı
  // -------------------------------------------------------

  if (notFound || !oil || !draft) {
    return (
      <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)]">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-10 lg:px-8">
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[28px] bg-white/72 p-8 text-center shadow ring-1 ring-white/80">
            <div className="text-[52px]">🌸</div>
            <h1 className="mt-3 text-[22px] font-black text-slate-900">Kayıt bulunamadı</h1>
            <p className="mt-2 max-w-md text-[14px] font-medium leading-relaxed text-slate-500">
              Bu yağ kaydı bulunamadı veya erişim izniniz yok.
            </p>
            <Link
              href="/aromaterapi/yaglar?view=list"
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-6 py-3 text-[13px] font-black text-white shadow transition hover:brightness-105"
            >
              <span aria-hidden>←</span>
              Listeye Dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------
  // Detay görünümü
  // -------------------------------------------------------

  const detailScrollArea =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950">
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-5 lg:px-8 xl:px-10">

        {/* Toolbar */}
        <header className="mb-3 rounded-xl bg-white/70 p-3 shadow-sm ring-1 ring-white/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black tracking-[0.1em] text-amber-700 ring-1 ring-amber-100">
                AROMATERAPİ — YAĞ DETAY
              </div>

              {editEnabled ? (
                <input
                  value={draft.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                  className="mt-1 w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-lg font-bold text-slate-950 outline-none transition focus:border-amber-200 focus:ring-2 focus:ring-amber-100/60"
                  placeholder="Yağ adı"
                />
              ) : (
                <h1 className="mt-1 text-lg font-bold leading-snug tracking-tight text-slate-950 lg:text-xl">
                  {oil.name}
                </h1>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${oilTypeBadgeClass(oil.oil_type)}`}
                >
                  {oilTypeLabel(oil.oil_type)}
                </span>
                {oil.category.trim() ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/60">
                    {oil.category}
                  </span>
                ) : null}
                {oil.latin_name.trim() ? (
                  <span className="text-[12px] font-medium italic text-slate-500">
                    {oil.latin_name}
                  </span>
                ) : null}
                {isSharedContent ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                    🔒 Paylaşımlı içerik
                  </span>
                ) : null}
              </div>
            </div>

            {/* Toolbar butonları */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/90 bg-white/60 p-1 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-md">
              <button
                type="button"
                onClick={() => handleNavigation("/aromaterapi/yaglar?view=list")}
                className={`${toolbarBtn} border border-slate-200/90 bg-white/90 text-slate-800 shadow-sm ring-1 ring-white/90 hover:bg-white`}
              >
                <span aria-hidden className="text-base leading-none">←</span>
                Listeye Dön
              </button>
              <button
                type="button"
                onClick={() => handleNavigation("/aromaterapi")}
                className={`${toolbarBtn} border border-amber-200/90 bg-amber-50/95 text-amber-800 shadow-sm hover:bg-amber-100`}
              >
                Ana
              </button>

              {isSharedContent ? (
                /* Paylaşımlı içerik: sadece kopyala */
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={copying}
                  className={`${toolbarBtn} bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow ring-1 ring-violet-400/30 hover:brightness-105`}
                >
                  {copying ? "Kopyalanıyor..." : "📋 Kopyala ve Düzenle"}
                </button>
              ) : editEnabled ? (
                /* Edit modu: Kaydet + Vazgeç */
                <>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className={`${toolbarBtn} bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow ring-1 ring-amber-400/30 hover:brightness-105`}
                  >
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className={`${toolbarBtn} border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm hover:bg-slate-50`}
                  >
                    Vazgeç
                  </button>
                </>
              ) : (
                /* Normal mod: Düzenle + Sil */
                <>
                  <button
                    type="button"
                    onClick={startEdit}
                    className={`${toolbarBtn} bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white shadow ring-1 ring-slate-700/40 hover:shadow-lg`}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteConfirmOpen(true); setErrorMessage(""); }}
                    className={`${toolbarBtn} border border-red-200/90 bg-red-50/95 text-red-700 hover:bg-red-100`}
                  >
                    Sil
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Düzenleme modu banner */}
        {editEnabled && (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-[12px] font-bold text-amber-800 shadow-sm ring-1 ring-amber-100">
            <span aria-hidden>✏️</span>
            <span>Düzenleme modundasınız — değişiklikler henüz kaydedilmedi. Kaydet veya Vazgeç butonunu kullanın.</span>
          </div>
        )}

        {/* Paylaşımlı içerik banner */}
        {isSharedContent && !editEnabled && (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-2.5 text-[12px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-100">
            <span aria-hidden>🔒</span>
            <span>Bu kayıt paylaşımlı içeriktir ve doğrudan düzenlenemez. Kendi hesabınıza kopyalamak için <strong>&quot;Kopyala ve Düzenle&quot;</strong> butonunu kullanın.</span>
          </div>
        )}

        {errorMessage ? (
          <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="mb-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-[13px] font-black text-emerald-700 ring-1 ring-emerald-100">
            {successMessage}
          </div>
        ) : null}

        {/* Ana içerik */}
        <section className="flex max-h-[min(92vh,920px)] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/86 shadow-[0_18px_55px_rgba(15,23,42,0.05)] ring-1 ring-white/90 lg:max-h-[min(88vh,960px)] lg:flex-row">

          {/* Sekme navigasyonu */}
          <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-100/80 p-3 lg:w-[220px] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-slate-100/80 lg:p-4">
            <div className="space-y-1 rounded-2xl bg-[linear-gradient(165deg,rgba(255,247,237,0.95)_0%,rgba(253,244,255,0.55)_48%,rgba(255,255,255,0.75)_100%)] p-2 ring-1 ring-white/90">
              {DETAIL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`${navBtnBase} min-w-[140px] ${tab === t.id ? navBtnActive : navBtnIdle}`}
                >
                  <span className="text-sm leading-none">{t.icon}</span>
                  <span className="flex-1 leading-snug">{t.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* İçerik paneli */}
          <div className={`${detailScrollArea} p-4 lg:p-5`}>
            <div className="rounded-2xl border border-white/90 bg-white/80 p-4 shadow-sm">
              <h2 className="text-[15px] font-bold tracking-tight text-slate-950">{activeTab.label}</h2>
              <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">
                {activeTab.desc}
              </p>

              <div className="mt-4 space-y-3">
                {activeTab.fields.map((fieldKey) => {
                  const meta = FIELD_META[fieldKey as string];
                  if (!meta) return null;

                  const rawValue = draft[fieldKey as keyof OilFormData];
                  const value = typeof rawValue === "string" ? rawValue : "";

                  return (
                    <div key={fieldKey} className={sectionCard}>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        {meta.label}
                      </h3>

                      {editEnabled ? (
                        meta.isOilType ? (
                          <select
                            value={draft.oil_type}
                            onChange={(e) => setDraftField("oil_type", e.target.value)}
                            className="h-9 w-full rounded-lg border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-amber-200 focus:ring-2 focus:ring-amber-100/50"
                          >
                            {OIL_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : meta.multiline ? (
                          <textarea
                            value={value}
                            onChange={(e) => setDraftField(fieldKey as keyof OilFormData, e.target.value)}
                            rows={5}
                            className="mt-1 w-full resize-y rounded-lg border border-slate-200/90 bg-white/95 p-3 text-sm leading-6 text-slate-900 shadow-inner outline-none transition focus:border-amber-200 focus:ring-2 focus:ring-amber-100/50"
                          />
                        ) : (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => setDraftField(fieldKey as keyof OilFormData, e.target.value)}
                            className="h-9 w-full rounded-lg border border-slate-200/90 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-amber-200 focus:ring-2 focus:ring-amber-100/50"
                          />
                        )
                      ) : (
                        meta.isTags ? (
                          <TagsList tags={parseTagsInput(value)} />
                        ) : meta.isOilType ? (
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${oilTypeBadgeClass(draft.oil_type)}`}>
                            {oilTypeLabel(draft.oil_type)}
                          </span>
                        ) : meta.multiline ? (
                          <div className={sectionBody}>
                            {value.trim() ? value : (
                              <span className="text-slate-400">Henüz kayıt yok</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm font-medium text-slate-700">
                            {value.trim() ? value : <span className="text-slate-400">—</span>}
                          </p>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Kaydedilmemiş değişiklik — ayrılma onayı */}
      {leaveConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div
            className="w-full max-w-[420px] rounded-[26px] border border-white/90 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60"
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-1 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-amber-700 ring-1 ring-amber-100">
              KAYDEDİLMEMİŞ DEĞİŞİKLİK
            </div>
            <h2 className="mt-3 text-[18px] font-black leading-snug text-slate-950">
              Değişiklikleriniz kaydedilmedi
            </h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
              Düzenleme modunda kaydedilmemiş değişiklikler var. Çıkmadan önce ne yapmak istiyorsunuz?
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => { cancelLeave(); void handleSave(); }}
                disabled={saving}
                className="rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2.5 text-[12px] font-black text-white shadow hover:brightness-105 disabled:opacity-60"
              >
                Kaydet ve Çık
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-[12px] font-black text-slate-700 hover:bg-slate-200"
              >
                Kaydetmeden Çık
              </button>
              <button
                type="button"
                onClick={cancelLeave}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-black text-slate-600 hover:bg-slate-50"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Silme onayı */}
      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div
            className="w-full max-w-[420px] rounded-[26px] border border-white/90 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/60"
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-1 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-rose-700 ring-1 ring-rose-100">
              ONAY
            </div>
            <h2 className="mt-3 text-[18px] font-black leading-snug text-slate-950">
              Bu yağ kaydını silmek istiyor musunuz?
            </h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
              Bu işlem geri alınamaz. <strong>{oil.name}</strong> kaydı kalıcı olarak silinecek.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-2xl bg-slate-100 px-5 py-2.5 text-[12px] font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-2xl bg-rose-600 px-5 py-2.5 text-[12px] font-black text-white shadow hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

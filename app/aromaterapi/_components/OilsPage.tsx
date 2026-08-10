"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { AromaterapiModuleNav } from "@/app/aromaterapi/_components/AromaterapiModuleNav";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  createOil,
  deleteOils,
  fetchOilList,
  buildOilSearchBlob,
  foldForSearch,
  oilListRowPreview,
  oilTypeBadgeClass,
  oilTypeLabel,
  OIL_TYPES,
  parseTagsInput,
  parseImageUrls,
  EMPTY_OIL_FORM,
  isAdminTransferOil,
  ADMIN_TRANSFER_BADGE,
  type OilListRow,
  type OilFormData,
} from "@/lib/aromaterapi/aromatherapyData";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { BulkExportBar } from "@/components/common/BulkExportBar";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { DemoBlur } from "@/components/demo/DemoBlur";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { DEMO_SEED_OILS, isDemoFixtureOil } from "@/lib/demo/demoAromaterapi";

// -------------------------------------------------------
// Sayfa yapılandırması
// -------------------------------------------------------

export interface OilsPageConfig {
  /** Belirli bir yağ tipine kilitli sayfa. Undefined = tüm tipler (legacy). */
  fixedOilType?: string;
  /** URL kökü — ?view=list/new bu path üzerinde çalışır. */
  basePath: string;
  pageTitle: string;
  pageSubtitle: string;
  pageDescription: string;
}

// -------------------------------------------------------
// Tasarım token'ları
// -------------------------------------------------------

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";

const headerCard =
  "shrink-0 overflow-hidden rounded-2xl border border-amber-200/50 bg-white/85 p-3.5 shadow-sm backdrop-blur-xl";

const filterCard =
  "rounded-2xl border border-amber-200/40 bg-white/85 p-3.5 shadow-sm backdrop-blur-xl";

const contentCard =
  "w-full rounded-2xl border border-amber-200/40 bg-white/85 p-4 shadow-sm backdrop-blur-xl";

const oilCardGrid =
  "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

const oilCard =
  "group flex flex-col rounded-2xl border border-amber-100 bg-white/85 p-4 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md";

const searchInput =
  "h-9 w-full rounded-lg border border-amber-200 bg-white/90 pl-9 pr-3 text-sm font-medium shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200/40";

const viewBtn =
  "rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-sm transition hover:-translate-y-0.5";
const viewBtnActive = "bg-slate-950 text-white";
const viewBtnIdle = "border border-amber-200 bg-white text-slate-800";

const newBtn =
  "rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5";

const hubBtn =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300/55 bg-gradient-to-r from-amber-500 to-rose-400 px-3.5 text-[12px] font-black text-white shadow-md ring-1 ring-white/35 transition hover:brightness-105";

// -------------------------------------------------------
// Form sekme tanımları (9 sekme — Excel yapısıyla örtüşür)
// -------------------------------------------------------

type FormTabId =
  | "kimlik"
  | "botanik"
  | "yag-ozellikleri"
  | "kimyasal"
  | "ruhsal-duygusal"
  | "kullanim"
  | "uyumlu"
  | "onlemler"
  | "notlar";

const FORM_TABS: {
  id: FormTabId;
  label: string;
  icon: string;
  desc: string;
  fields: (keyof OilFormData)[];
}[] = [
  {
    id: "kimlik",
    label: "Kimlik",
    icon: "🌿",
    desc: "Ad, Latince/İngilizce ad, yağ tipi ve kategori.",
    fields: ["name", "latin_name", "english_name", "oil_type", "category"],
  },
  {
    id: "botanik",
    label: "Botanik & Kaynak",
    icon: "🌱",
    desc: "Menşei, çıkarma yöntemi, kullanılan bitki bölümü ve raf ömrü.",
    fields: ["origin", "extraction_method", "plant_part", "shelf_life"],
  },
  {
    id: "yag-ozellikleri",
    label: "Yağ Özellikleri",
    icon: "✨",
    desc: "Koku profili, nota, renk, kıvam ve fotosensitiflik.",
    fields: ["aroma_profile", "aroma_note", "color", "consistency", "is_photosensitive"],
  },
  {
    id: "kimyasal",
    label: "Kimyasal İçerik",
    icon: "🔬",
    desc: "Ana kimyasal bileşenler ve terapötik özellikler.",
    fields: ["main_components", "therapeutic_properties_raw"],
  },
  {
    id: "ruhsal-duygusal",
    label: "Ruhsal & Duygusal",
    icon: "💚",
    desc: "Duygusal, ruhsal, fiziksel ve cilt faydaları.",
    fields: ["emotional_benefits", "spiritual_benefits", "physical_benefits", "skin_benefits", "benefits"],
  },
  {
    id: "kullanim",
    label: "Kullanım Şekilleri",
    icon: "💧",
    desc: "Difüzyon, masaj, genel kullanım ve seyreltme oranı.",
    fields: ["diffuser_usage", "massage_usage", "usage_methods", "dilution_ratio"],
  },
  {
    id: "uyumlu",
    label: "Uyumlu Yağlar",
    icon: "🔮",
    desc: "İyi karıştığı yağlar, hedef sistemler, çakra ve element bağlantısı.",
    fields: ["blends_well_with_raw", "target_systems_raw", "chakra_connection", "element_connection"],
  },
  {
    id: "onlemler",
    label: "Önlemler & Güvenlik",
    icon: "⚠️",
    desc: "Güvenlik notları ve kontrendikasyonlar.",
    fields: ["safety_notes", "contraindications"],
  },
  {
    id: "notlar",
    label: "Notlar",
    icon: "📝",
    desc: "Görseller (URL), ek notlar ve kaynak.",
    fields: ["images_raw", "notes", "source"],
  },
];

// -------------------------------------------------------
// Alan meta bilgileri
// -------------------------------------------------------

const FIELD_META: Record<
  string,
  {
    label: string;
    placeholder?: string;
    multiline?: boolean;
    isOilType?: boolean;
    isBooleanToggle?: boolean;
    isImageList?: boolean;
  }
> = {
  name:              { label: "Yağ Adı", placeholder: "Örn. Lavanta" },
  latin_name:        { label: "Latince Adı", placeholder: "Örn. Lavandula angustifolia" },
  english_name:      { label: "İngilizce Adı", placeholder: "Örn. Lavender" },
  oil_type:          { label: "Yağ Tipi", isOilType: true },
  category:          { label: "Kategori", placeholder: "Örn. Çiçek, Narenciye, Ağaç…" },

  origin:            { label: "Menşei / Ülke", placeholder: "Örn. Fransa, Türkiye…" },
  extraction_method: { label: "Çıkarma Yöntemi", placeholder: "Örn. Buhar damıtma, Soğuk pres…" },
  plant_part:        { label: "Kullanılan Bitki Bölümü", placeholder: "Örn. Çiçek, Yaprak, Meyve kabuğu…" },
  shelf_life:        { label: "Raf Ömrü", placeholder: "Örn. 12–18 ay" },

  aroma_profile:     { label: "Koku Profili", placeholder: "Örn. Çiçeksi, tatlı, odunsu…", multiline: true },
  aroma_note:        { label: "Koku Notası", placeholder: "Örn. Üst nota, Orta nota, Alt nota" },
  color:             { label: "Renk", placeholder: "Örn. Renksiz, Sarı, Soluk sarı…" },
  consistency:       { label: "Kıvam / Yoğunluk", placeholder: "Örn. İnce, Orta, Koyu…" },
  is_photosensitive: { label: "Fotosensitif mi?", isBooleanToggle: true },

  main_components:          { label: "Ana Kimyasal Bileşenler", placeholder: "Örn. Linalool %51, Linalyl asetat %38…", multiline: true },
  therapeutic_properties_raw: {
    label: "Terapötik Özellikler",
    placeholder: "Virgülle ayırın: antibakteriyel, antifungal, antiseptik…",
    multiline: true,
  },

  emotional_benefits: { label: "Duygusal Etkiler", placeholder: "Rahatlatıcı, stres azaltıcı, sakinleştirici…", multiline: true },
  spiritual_benefits: { label: "Ruhsal Etkiler", placeholder: "Meditasyonu derinleştirir, sezgiyi açar…", multiline: true },
  physical_benefits:  { label: "Fiziksel Faydalar", placeholder: "Ağrı kesici, kas gevşetici, bağışıklık destekleyici…", multiline: true },
  skin_benefits:      { label: "Cilt Faydaları", placeholder: "Nemlendirici, yenileyici, sivilce karşıtı…", multiline: true },
  benefits:           { label: "Genel Faydalar", placeholder: "Diğer genel faydalar…", multiline: true },

  diffuser_usage: { label: "Brülör & Buharlaştırıcı", placeholder: "Difüzyon yöntemi, damlalık sayısı ve dozaj bilgisi…", multiline: true },
  massage_usage:  { label: "Masaj Kullanımı", placeholder: "Masaj için uygulama yöntemi, karışım oranı…", multiline: true },
  usage_methods:  { label: "Genel Kullanım Yöntemleri", placeholder: "İnhalasyon, banyo, kompres, difüzyon…", multiline: true },
  dilution_ratio: { label: "Seyreltme Oranı", placeholder: "Örn. %1-3 (taşıyıcı yağda)" },

  blends_well_with_raw: {
    label: "İyi Karıştığı Yağlar",
    placeholder: "Virgülle ayırın: bergamot, sandal ağacı, gül…",
    multiline: true,
  },
  target_systems_raw: {
    label: "Hedef Sistemler",
    placeholder: "Virgülle ayırın: sinir sistemi, bağışıklık sistemi…",
    multiline: true,
  },
  chakra_connection:  { label: "Çakra Bağlantısı", placeholder: "Örn. Kalp çakrası, Taç çakrası…" },
  element_connection: { label: "Element Bağlantısı", placeholder: "Örn. Hava, Ateş, Su, Toprak, Eter…" },

  safety_notes:     { label: "Güvenlik Notları", placeholder: "Hamilelerde, çocuklarda dikkat; güneşe çıkmadan önce…", multiline: true },
  contraindications: { label: "Kontrendikasyonlar", placeholder: "Kimler kullanmamalı…", multiline: true },

  images_raw: {
    label: "Görseller (URL)",
    placeholder: "Her satıra bir URL girin…\nhttps://example.com/gorsel.jpg",
    multiline: true,
    isImageList: true,
  },
  notes:  { label: "Ek Notlar", placeholder: "Ek notlar…", multiline: true },
  source: { label: "Kaynak", placeholder: "Kitap, eğitim, kaynak adı…" },
};

// -------------------------------------------------------
// Yeni Kayıt Formu
// -------------------------------------------------------

function NewOilForm({
  onBack,
  onSaved,
  defaultOilType = "essential",
}: {
  onBack: () => void;
  onSaved: () => void;
  defaultOilType?: string;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<OilFormData>({
    ...EMPTY_OIL_FORM,
    oil_type: defaultOilType,
  });
  const [formTab, setFormTab] = useState<FormTabId>("kimlik");
  const [saving, setSaving] = useState(false);
  // Çift tıklamaya karşı senkron kilit — React re-render'ı beklemeden ikinci
  // çağrıyı anında engeller, böylece mükerrer kayıt oluşmaz.
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [largeKey, setLargeKey] = useState<string | null>(null);
  const [largeValue, setLargeValue] = useState("");

  const activeTab = useMemo(
    () => FORM_TABS.find((t) => t.id === formTab) ?? FORM_TABS[0],
    [formTab],
  );

  function setField(key: keyof OilFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openLarge(key: string) {
    setLargeKey(key);
    setLargeValue(form[key as keyof OilFormData] as string);
  }

  function saveLarge() {
    if (!largeKey) return;
    setForm((prev) => ({ ...prev, [largeKey]: largeValue }));
    setLargeKey(null);
  }

  async function handleSave() {
    // Halihazırda bir kayıt isteği uçuyorsa ikinci tıklamayı yok say.
    if (submittingRef.current) return;
    const nameTrim = form.name.trim();
    if (!nameTrim) { setError("Yağ adı zorunludur."); return; }

    submittingRef.current = true;
    setSaving(true);
    setError("");

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setError(MISSING_SESSION_TENANT_MESSAGE);
      setSaving(false);
      submittingRef.current = false;
      return;
    }

    const t = (v: string) => v.trim() || "";

    const { error: insertError } = await createOil({
      name: nameTrim,
      latin_name: t(form.latin_name),
      english_name: t(form.english_name),
      oil_type: form.oil_type || "essential",
      category: t(form.category),
      extraction_method: t(form.extraction_method),
      plant_part: t(form.plant_part),
      origin: t(form.origin),
      shelf_life: t(form.shelf_life),
      aroma_profile: t(form.aroma_profile),
      aroma_note: t(form.aroma_note),
      color: t(form.color),
      consistency: t(form.consistency),
      is_photosensitive: form.is_photosensitive,
      main_components: t(form.main_components),
      therapeutic_properties: parseTagsInput(form.therapeutic_properties_raw),
      emotional_benefits: t(form.emotional_benefits),
      spiritual_benefits: t(form.spiritual_benefits),
      physical_benefits: t(form.physical_benefits),
      skin_benefits: t(form.skin_benefits),
      benefits: t(form.benefits),
      diffuser_usage: t(form.diffuser_usage),
      massage_usage: t(form.massage_usage),
      usage_methods: t(form.usage_methods),
      dilution_ratio: t(form.dilution_ratio),
      blends_well_with: parseTagsInput(form.blends_well_with_raw),
      target_systems: parseTagsInput(form.target_systems_raw),
      chakra_connection: t(form.chakra_connection),
      element_connection: t(form.element_connection),
      safety_notes: t(form.safety_notes),
      contraindications: t(form.contraindications),
      images: parseImageUrls(form.images_raw),
      notes: t(form.notes),
      source: t(form.source),
    });

    setSaving(false);

    if (insertError) {
      setError(`Kayıt eklenemedi: ${insertError}`);
      submittingRef.current = false;
      return;
    }

    // Başarılıda kilit açılmaz: onSaved() listeye yönlendirip formu unmount eder.
    showToast({ title: "Başarılı", message: "Yağ kaydı oluşturuldu.", type: "success" });
    onSaved();
  }

  const scrollArea =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const fieldInput =
    "h-10 w-full rounded-xl border border-amber-100/90 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100/80";

  const fieldTextarea =
    "min-h-[80px] max-h-[120px] w-full cursor-pointer resize-none rounded-xl border border-amber-100/90 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100/80";

  const miniCard =
    "rounded-2xl border border-amber-100/80 bg-gradient-to-b from-white to-amber-50/30 p-4 shadow-[0_6px_20px_-10px_rgba(245,158,11,0.2)]";

  return (
    <>
      <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] p-4 text-slate-950">
        {/* Header */}
        <header className="mb-4 flex h-16 shrink-0 items-center justify-between rounded-3xl border border-amber-100/70 bg-white/80 px-5 shadow sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300/55 bg-gradient-to-r from-amber-500 to-rose-400 px-3.5 text-[12px] font-black text-white shadow-md ring-1 ring-white/35 transition hover:brightness-105"
          >
            <span aria-hidden className="text-sm leading-none">←</span>
            <span className="hidden sm:inline">Listeye Dön</span>
            <span className="sm:hidden">Geri</span>
          </button>
          <div className="min-w-0 pl-4 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Yeni Kayıt</p>
            <h2 className="truncate text-base font-black text-slate-950">Yeni yağ kaydı</h2>
          </div>
        </header>

        {error ? (
          <div className="mb-3 shrink-0 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 ring-1 ring-rose-100">
            {error}
          </div>
        ) : null}

        {/* Mobil yatay sekme barı */}
        <div className="mb-3 shrink-0 overflow-x-auto lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-1.5 pb-0.5">
            {FORM_TABS.map((tab) => {
              const active = formTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFormTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition ${
                    active
                      ? "bg-gradient-to-r from-amber-500 to-rose-400 text-white shadow-[0_4px_12px_rgba(245,158,11,0.3)]"
                      : "border border-amber-100/80 bg-white/80 text-slate-600 hover:bg-amber-50"
                  }`}
                >
                  <span className="text-sm leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
          {/* Desktop sidebar */}
          <aside className={`hidden h-full min-h-0 rounded-[28px] border border-amber-100/80 bg-white/85 p-4 shadow-xl lg:block ${scrollArea}`}>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Bölümler</p>
            <div className="space-y-1.5">
              {FORM_TABS.map((tab) => {
                const active = formTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFormTab(tab.id)}
                    className={`flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[12px] font-bold transition ${
                      active
                        ? "bg-gradient-to-r from-amber-500 to-rose-400 text-white shadow-[0_6px_18px_rgba(245,158,11,0.35)]"
                        : "border border-amber-100/80 bg-white/70 text-slate-600 hover:bg-amber-50/80"
                    }`}
                  >
                    <span className="shrink-0 text-base leading-none">{tab.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* İçerik */}
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-amber-100/80 bg-white/85 shadow-xl">
            <div className={`${scrollArea} p-5`}>
              <header className="mb-5 border-b border-amber-100/80 pb-4">
                <h3 className="text-lg font-black tracking-tight text-slate-950">{activeTab.label}</h3>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{activeTab.desc}</p>
              </header>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {activeTab.fields.map((fieldKey) => {
                  const meta = FIELD_META[fieldKey as string];
                  if (!meta) return null;

                  /* Boolean toggle */
                  if (meta.isBooleanToggle) {
                    const boolVal = form.is_photosensitive;
                    return (
                      <section key={fieldKey} className={`${miniCard} sm:col-span-2`}>
                        <header className="mb-2.5">
                          <h4 className="text-[13px] font-black text-slate-900">{meta.label}</h4>
                        </header>
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, is_photosensitive: !prev.is_photosensitive }))}
                          className={`inline-flex h-10 items-center gap-2.5 rounded-xl px-4 text-[13px] font-bold transition ${
                            boolVal
                              ? "bg-amber-500 text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200"
                          }`}
                        >
                          <span className="text-base leading-none">{boolVal ? "☀️" : "○"}</span>
                          {boolVal ? "Evet — Fotosensitif" : "Hayır — Fotosensitif Değil"}
                        </button>
                        {boolVal && (
                          <p className="mt-2 text-[11px] font-medium text-amber-700">
                            Güneş ışığına maruz kalmadan önce uyarı verilmesi gerekir.
                          </p>
                        )}
                      </section>
                    );
                  }

                  /* Yağ tipi select */
                  if (meta.isOilType) {
                    return (
                      <section key={fieldKey} className={miniCard}>
                        <header className="mb-2.5">
                          <h4 className="text-[13px] font-black text-slate-900">{meta.label}</h4>
                        </header>
                        <select
                          value={form.oil_type}
                          onChange={(e) => setField("oil_type", e.target.value)}
                          className="h-10 w-full rounded-xl border border-amber-100/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100/80"
                        >
                          {OIL_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </section>
                    );
                  }

                  return (
                    <section key={fieldKey} className={`${miniCard} ${meta.multiline ? "sm:col-span-2" : ""}`}>
                      <header className="mb-2.5">
                        <h4 className="text-[13px] font-black text-slate-900">{meta.label}</h4>
                      </header>
                      {meta.multiline ? (
                        <>
                          <textarea
                            readOnly
                            value={form[fieldKey as keyof OilFormData] as string}
                            onClick={() => openLarge(fieldKey as string)}
                            onFocus={(e) => { openLarge(fieldKey as string); e.target.blur(); }}
                            rows={3}
                            placeholder={meta.placeholder}
                            className={`${fieldTextarea} cursor-pointer`}
                          />
                          {meta.isImageList ? (
                            <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                              Her satıra bir URL girin. Galeri yükleme ilerleyen aşamada eklenecek.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <input
                          type="text"
                          value={form[fieldKey as keyof OilFormData] as string}
                          onChange={(e) => setField(fieldKey as keyof OilFormData, e.target.value)}
                          placeholder={meta.placeholder}
                          className={fieldInput}
                        />
                      )}
                    </section>
                  );
                })}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5 border-t border-amber-100/80 bg-white/95 px-5 py-3 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={`inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 text-[13px] font-black text-white shadow-md disabled:opacity-60 ${saving ? "pointer-events-none" : ""}`}
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700 shadow-sm hover:bg-slate-50"
              >
                İptal
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Büyük metin editörü */}
      {largeKey ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-4 backdrop-blur-sm">
          <div className="w-full max-w-[920px] rounded-[28px] bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
            <h3 className="mb-4 text-[18px] font-black text-slate-950">
              {FIELD_META[largeKey]?.label ?? largeKey}
            </h3>
            <textarea
              value={largeValue}
              onChange={(e) => setLargeValue(e.target.value)}
              placeholder={FIELD_META[largeKey]?.placeholder}
              className="h-[min(420px,52vh)] w-full resize-y rounded-2xl border border-amber-100 p-5 text-[15px] leading-7 text-slate-800 outline-none focus:ring-4 focus:ring-amber-100/70"
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={saveLarge}
                className="rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-6 py-3 text-[13px] font-black text-white"
              >
                Uygula
              </button>
              <button
                type="button"
                onClick={() => setLargeKey(null)}
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

// -------------------------------------------------------
// Liste içeriği
// -------------------------------------------------------

type PageView = "list" | "new";

function viewFromParam(v: string | null): PageView {
  return v === "new" ? "new" : "list";
}

function OilsPageContent({ fixedOilType, basePath, pageTitle, pageSubtitle, pageDescription }: OilsPageConfig) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = readYasamUser()?.is_demo_account === true;

  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [rows, setRows] = useState<OilListRow[]>(() =>
    isDemo ? (fixedOilType ? DEMO_SEED_OILS.filter((o) => o.oil_type === fixedOilType) : DEMO_SEED_OILS) : [],
  );
  const [tenantId, setTenantId] = useState<string | null>(isDemo ? "demo" : null);
  const [loading, setLoading] = useState(!isDemo);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(fixedOilType ?? "all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const pageView = useMemo(() => viewFromParam(searchParams.get("view")), [searchParams]);
  const [errorMessage, setErrorMessage] = useState("");
  // Sonsuz kaydırma: tüm veri bellekte tutulur (arama/sayaç doğru kalsın diye),
  // ama DOM'a bir seferde yalnızca `visibleCount` kadar kart basılır. Böylece
  // 1500+ kayıtta bile mobil render performansı korunur.
  const RENDER_PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadOils = useCallback(async (tid: string) => {
    if (isDemo) {
      setRows(fixedOilType ? DEMO_SEED_OILS.filter((o) => o.oil_type === fixedOilType) : DEMO_SEED_OILS);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    const { rows: nextRows, error } = await fetchOilList(tid, fixedOilType);
    setLoading(false);
    if (error) { setErrorMessage(`Yağlar yüklenemedi: ${error}`); return; }
    setRows(nextRows);
  }, [fixedOilType, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    runInEffect(() => {
      void (async () => {
        const tid = await getSyncedTenantId();
        setTenantId(tid);
        if (!tid) { setLoading(false); setErrorMessage(MISSING_SESSION_TENANT_MESSAGE); return; }
        await loadOils(tid);
      })();
    });
  }, [loadOils, isDemo]);

  useBfcacheRefresh();

  // PERF-2C: sıralama yalnız `rows` değiştiğinde çalışır (localeCompare arama/tip
  // filtresi değişince yeniden koşmaz). Önce sırala → sonra filtrele; filtre sırayı
  // koruduğu için çıktı, route'un name,id sırasıyla birebir aynı kalır.
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr-TR")),
    [rows],
  );

  // PERF-2B: satır başına fold'lanmış arama blob'u yalnız `rows` değiştiğinde üretilir.
  // Her tuş vuruşunda yalnız sorgu bir kez fold'lanır + kayıt başına tek `includes`.
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, buildOilSearchBlob(r));
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = foldForSearch(search.trim());
    return sortedRows.filter(
      (r) =>
        (typeFilter === "all" || r.oil_type === typeFilter) &&
        (q === "" || (searchIndex.get(r.id) ?? "").includes(q)),
    );
  }, [sortedRows, searchIndex, search, typeFilter]);

  // Görünen (DOM'a basılan) alt küme. filteredRows.length her zaman gerçek toplamı verir.
  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount],
  );
  const hasMore = visibleCount < filteredRows.length;

  // Arama/filtre/görünüm değişince pencereyi başa sar.
  useEffect(() => {
    setVisibleCount(RENDER_PAGE);
  }, [search, typeFilter, viewMode, rows]);

  // Sentinel görünür olunca bir sonraki grubu yükle (sonsuz kaydırma).
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + RENDER_PAGE, filteredRows.length));
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filteredRows.length, visibleCount]);

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = { all: rows.length };
    for (const r of rows) map[r.oil_type] = (map[r.oil_type] ?? 0) + 1;
    return map;
  }, [rows]);

  const toggleOilSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Uzman artık YALNIZ kendi tenant kayıtlarını görür (paylaşımlı/kanonik null-tenant
  // satırlar API'de filtrelenir). Admin'den gelen snapshot kopyalar da uzmanın kendi
  // tenant kaydıdır → hepsi seçilip düzenlenip silinebilir. Defensif null filtresi
  // korunur (beklenmedik bir null satır asla seçilemez).
  const ownFilteredRows = useMemo(
    () => filteredRows.filter((r) => r.tenant_id !== null),
    [filteredRows],
  );

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(ownFilteredRows.map((r) => r.id)));
  }, [ownFilteredRows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !tenantId) return;

    const confirmed = await deleteConfirm({
      title: "Seçili yağları sil",
      message: `${ids.length} yağ kaydını silmek istediğinizden emin misiniz?`,
      secondMessage: "Bu işlem geri alınamaz. Seçili kayıtlar kalıcı olarak silinecek.",
    });
    if (!confirmed) return;

    setDeleteLoading(true);

    const { deletedIds, error: deleteError } = await deleteOils(ids);

    setDeleteLoading(false);

    if (deleteError) {
      setErrorMessage(`Seçili kayıtlar silinemedi: ${deleteError}`);
      return;
    }

    const deletedCount = deletedIds.length;
    if (deletedCount === 0) {
      setErrorMessage("Silme işlemi gerçekleşmedi. Lütfen sayfayı yenileyip tekrar deneyin.");
      return;
    }

    const deletedIdSet = new Set(deletedIds);
    setRows((prev) => prev.filter((r) => !deletedIdSet.has(r.id)));
    setSelectedIds(new Set());
    showToast({ title: "Başarılı", message: `${deletedCount} yağ kaydı başarıyla silindi.`, type: "success" });
  }

  function goToList() { router.replace(`${basePath}?view=list`); }
  function goToNew()  { router.push(`${basePath}?view=new`); }

  function handleSaved() {
    goToList();
    if (tenantId) void loadOils(tenantId);
  }

  if (pageView === "new" && !isDemo) {
    return (
      <NewOilForm
        onBack={goToList}
        onSaved={handleSaved}
        defaultOilType={fixedOilType ?? "essential"}
      />
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-[320px] w-[320px] rounded-full bg-amber-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[280px] w-[280px] rounded-full bg-violet-200/18 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] space-y-3 px-3 py-3 sm:px-5 xl:px-7">
        <AromaterapiModuleNav />
        {isDemo && (
          <DemoModuleBanner message="Yağ kütüphanesi demo hesabı için temsili verilerle gösterilmektedir. Yağ adı, kategori ve tip görünürdür; klinik detaylar korunur. Yeni kayıt ve düzenleme işlemleri demo hesabında çalışmaz." />
        )}
        {/* Header */}
        <header className={`${headerCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-black tracking-[0.14em] text-amber-700">
              ✦ {pageSubtitle}
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">{pageTitle}</h1>
            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-500">{pageDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/aromaterapi" className={hubBtn}>
              <span aria-hidden className="text-sm leading-none">←</span>
              <span className="hidden sm:inline">Aromaterapi Ana</span>
              <span className="sm:hidden">Ana</span>
            </Link>
            {!isDemo && (
              <button type="button" onClick={goToNew} className={newBtn}>
                + Yeni Yağ
              </button>
            )}
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-2 text-[12px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {/* Filtre & Arama */}
        <section className={filterCard}>
          {/* Tip filtresi — fixedOilType yoksa göster */}
          {!fixedOilType && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {[{ value: "all", label: "Tümü" }, ...OIL_TYPES].map((t) => {
                const active = typeFilter === t.value;
                const count = typeCounts[t.value] ?? 0;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTypeFilter(t.value)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition ${
                      active
                        ? "border-amber-400 bg-amber-500 text-white shadow-sm"
                        : "border-amber-100 bg-white/80 text-slate-600 hover:border-amber-200"
                    }`}
                  >
                    {t.label}
                    <span className={`rounded-full px-1 text-[9px] font-black ${active ? "bg-white/20 text-white" : "bg-amber-50 text-amber-700"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 w-full flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Yağ adı, özellik, etki veya menşei ara…"
                className={searchInput}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setViewMode("card")} className={`${viewBtn} ${viewMode === "card" ? viewBtnActive : viewBtnIdle}`}>Kart</button>
              <button type="button" onClick={() => setViewMode("list")} className={`${viewBtn} ${viewMode === "list" ? viewBtnActive : viewBtnIdle}`}>Liste</button>
              <button type="button" onClick={() => { if (tenantId) void loadOils(tenantId); }} className={`${viewBtn} ${viewBtnIdle}`}>↻</button>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
            <p className="text-[11px] font-bold text-slate-400">
              {search.trim() || (!fixedOilType && typeFilter !== "all")
                ? `${filteredRows.length} sonuç`
                : `${filteredRows.length} yağ (A–Z)`}
            </p>
            {loading && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-100">
                Yükleniyor...
              </span>
            )}
          </div>
        </section>

        {!isDemo && !loading && filteredRows.length > 0 ? (
          <BulkExportBar
            compact
            selectedCount={selectedIds.size}
            totalCount={rows.length}
            filteredCount={filteredRows.length}
            selectAllLabel="Kendi Kayıtlarımı Seç"
            selectAllCount={ownFilteredRows.length}
            hasActiveFilter={Boolean(search.trim() || (!fixedOilType && typeFilter !== "all"))}
            onSelectAll={selectAllFiltered}
            onClearSelection={clearSelection}
            onDeleteSelected={() => void handleBulkDelete()}
            isDeleting={deleteLoading}
          />
        ) : null}

        {/* İçerik */}
        <section className={contentCard}>
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-sm font-bold text-slate-500">
              Yağlar yükleniyor...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <div className="text-5xl">🌸</div>
              <h3 className="mt-4 text-xl font-black text-slate-900">
                {search.trim() || typeFilter !== "all" ? "Sonuç bulunamadı" : "Henüz yağ kaydı yok"}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                {search.trim() || typeFilter !== "all"
                  ? "Aramayı değiştirin veya filtreyi kaldırın."
                  : "Yeni yağ ekle butonuyla ilk kaydınızı oluşturun."}
              </p>
              {!isDemo && (
                <button
                  type="button"
                  onClick={goToNew}
                  className="mt-5 inline-flex items-center rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 py-2.5 text-[13px] font-black text-white shadow-md"
                >
                  + Yeni Yağ Ekle
                </button>
              )}
            </div>
          ) : viewMode === "card" ? (
            <div className={oilCardGrid}>
              {visibleRows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                <article key={row.id} className={`${oilCard} ${isSelected ? "ring-2 ring-amber-400/60 ring-offset-1" : ""}`}>
                  {!isDemo && row.tenant_id !== null && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOilSelection(row.id)}
                        aria-label={`${row.name} seç`}
                        className="h-4 w-4 rounded accent-amber-600"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-wide ${oilTypeBadgeClass(row.oil_type)}`}>
                      {oilTypeLabel(row.oil_type)}
                    </span>
                    {row.category.trim() ? (
                      <span className="inline-flex rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {row.category}
                      </span>
                    ) : null}
                    {row.is_photosensitive ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                        ☀️ Fotosensitif
                      </span>
                    ) : null}
                    {isAdminTransferOil(row) ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold text-violet-700"
                        title="Bu kayıt Admin'den bağımsız kopya olarak eklendi. Düzenleyebilir veya silebilirsiniz."
                      >
                        {ADMIN_TRANSFER_BADGE}
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-2.5 text-[17px] font-black tracking-tight text-slate-950">{row.name}</h2>
                  {row.latin_name.trim() ? (
                    <p className="mt-0.5 text-[12px] font-medium italic text-slate-500">{row.latin_name}</p>
                  ) : null}
                  {row.english_name.trim() ? (
                    <p className="line-clamp-1 text-[11px] font-medium text-slate-400" title={row.english_name}>
                      {row.english_name}
                    </p>
                  ) : null}

                  <DemoBlur isProtected={isDemo && isDemoFixtureOil(row.id)} className="mt-2">
                    <p className="line-clamp-2 text-[12px] leading-snug text-slate-600">
                      {oilListRowPreview(row)}
                    </p>
                  </DemoBlur>

                  <div className="mt-auto pt-3">
                    <Link
                      href={`/aromaterapi/yaglar/${row.id}`}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-3 text-[12px] font-semibold text-white shadow-sm ring-1 ring-white/25 transition hover:brightness-105"
                    >
                      <span aria-hidden className="text-sm leading-none opacity-90">✦</span>
                      Detayı Aç →
                    </Link>
                  </div>
                </article>
                );
              })}
            </div>
          ) : (
            /* Liste görünümü */
            <div className="overflow-hidden overflow-x-auto rounded-[20px] bg-white/86 ring-1 ring-slate-100">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[2rem_1.2fr_0.9fr_0.8fr_1.4fr_0.6fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  <div />
                  <div>Yağ Adı</div>
                  <div>Tip</div>
                  <div>Kategori</div>
                  <div>Önizleme</div>
                  <div className="text-right">İşlem</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleRows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    return (
                    <div key={row.id} className={`grid grid-cols-[2rem_1.2fr_0.9fr_0.8fr_1.4fr_0.6fr] gap-3 px-4 py-3 text-[12px] transition hover:bg-amber-50/30 ${isSelected ? "bg-amber-50/60" : ""}`}>
                      <div className="flex items-center">
                        {isDemo || row.tenant_id === null ? null : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOilSelection(row.id)}
                            aria-label={`${row.name} seç`}
                            className="h-4 w-4 rounded accent-amber-600"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{row.name}</p>
                        {row.latin_name.trim() ? (
                          <p className="truncate text-[11px] italic text-slate-400">{row.latin_name}</p>
                        ) : null}
                        {row.english_name.trim() ? (
                          <p className="truncate text-[10px] text-slate-400" title={row.english_name}>
                            {row.english_name}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${oilTypeBadgeClass(row.oil_type)}`}>
                          {oilTypeLabel(row.oil_type)}
                        </span>
                        {row.is_photosensitive ? (
                          <span className="mt-0.5 block text-[9px] font-bold text-amber-600">☀️ Fotosensitif</span>
                        ) : null}
                        {isAdminTransferOil(row) ? (
                          <span className="mt-0.5 block text-[9px] font-bold text-violet-600" title="Admin'den bağımsız kopya">
                            {ADMIN_TRANSFER_BADGE}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-slate-600">{row.category || "—"}</div>
                      <div className="min-w-0">
                        <DemoBlur isProtected={isDemo && isDemoFixtureOil(row.id)}>
                          <span className="line-clamp-2 text-slate-500">{oilListRowPreview(row, 100)}</span>
                        </DemoBlur>
                      </div>
                      <div className="flex justify-end">
                        <Link
                          href={`/aromaterapi/yaglar/${row.id}`}
                          className="inline-flex shrink-0 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white shadow transition hover:bg-slate-800"
                        >
                          Aç
                        </Link>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Sonsuz kaydırma sentinel'i + manuel fallback buton */}
        {!loading && filteredRows.length > 0 && hasMore ? (
          <div ref={sentinelRef} className="flex flex-col items-center gap-1 py-3">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => Math.min(c + RENDER_PAGE, filteredRows.length))}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-5 py-2 text-[12px] font-black text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
            >
              Daha Fazla Göster
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                {filteredRows.length - visibleCount} kayıt daha
              </span>
            </button>
            <p className="text-[10px] font-bold text-slate-400">
              {visibleCount} / {filteredRows.length} gösteriliyor
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

// -------------------------------------------------------
// Export (Suspense wrapper dahil)
// -------------------------------------------------------

const fallback = (
  <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-sm font-bold text-slate-500">
    Yükleniyor…
  </div>
);

export default function OilsPage(config: OilsPageConfig) {
  return (
    <Suspense fallback={fallback}>
      <OilsPageContent {...config} />
    </Suspense>
  );
}

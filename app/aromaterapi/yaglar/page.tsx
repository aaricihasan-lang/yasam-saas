"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import {
  fetchOilList,
  matchesOilSearch,
  oilListRowPreview,
  oilTypeBadgeClass,
  oilTypeLabel,
  OIL_TYPES,
  parseTagsInput,
  parseImageUrls,
  EMPTY_OIL_FORM,
  type OilListRow,
  type OilFormData,
} from "@/lib/aromaterapi/aromatherapyData";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/ToastProvider";

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
// Form sekmeler
// -------------------------------------------------------

type FormTabId =
  | "kimlik"
  | "botanik"
  | "koku"
  | "bilesim"
  | "faydalar"
  | "kullanim"
  | "enerji"
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
    desc: "Ad, Latince ad, yağ tipi, kategori, menşei, raf ömrü ve görseller.",
    fields: ["name", "latin_name", "oil_type", "category", "origin", "shelf_life", "images_raw"],
  },
  {
    id: "botanik",
    label: "Botanik",
    icon: "🌱",
    desc: "Çıkarma yöntemi ve kullanılan bitki bölümü.",
    fields: ["extraction_method", "plant_part"],
  },
  {
    id: "koku",
    label: "Koku & Görünüm",
    icon: "✨",
    desc: "Koku profili, nota, renk ve kıvam.",
    fields: ["aroma_profile", "aroma_note", "color", "consistency"],
  },
  {
    id: "bilesim",
    label: "Bileşim",
    icon: "🔬",
    desc: "Ana bileşenler ve terapötik özellikler.",
    fields: ["main_components", "therapeutic_properties_raw"],
  },
  {
    id: "faydalar",
    label: "Faydalar",
    icon: "💚",
    desc: "Fiziksel, duygusal, manevi, cilt faydaları ve hedef sistemler.",
    fields: ["physical_benefits", "emotional_benefits", "spiritual_benefits", "skin_benefits", "benefits", "target_systems_raw"],
  },
  {
    id: "kullanim",
    label: "Kullanım & Güvenlik",
    icon: "⚠️",
    desc: "Kullanım yöntemleri, seyreltme, güvenlik notları ve fotosensitiflik.",
    fields: ["usage_methods", "dilution_ratio", "safety_notes", "contraindications", "is_photosensitive"],
  },
  {
    id: "enerji",
    label: "Enerji & Bağlantı",
    icon: "🔮",
    desc: "Çakra, element ve iyi karıştığı yağlar.",
    fields: ["chakra_connection", "element_connection", "blends_well_with_raw"],
  },
  {
    id: "notlar",
    label: "Notlar",
    icon: "📝",
    desc: "Ek notlar ve kaynak.",
    fields: ["notes", "source"],
  },
];

const FIELD_META: Record<
  string,
  { label: string; placeholder?: string; multiline?: boolean; isSelect?: boolean; isOilType?: boolean; isBooleanToggle?: boolean; isImageList?: boolean }
> = {
  name: { label: "Yağ Adı", placeholder: "Örn. Lavanta", multiline: false },
  latin_name: { label: "Latince Adı", placeholder: "Örn. Lavandula angustifolia", multiline: false },
  oil_type: { label: "Yağ Tipi", isSelect: true, isOilType: true },
  category: { label: "Kategori", placeholder: "Örn. Çiçek, Narenciye, Ağaç…", multiline: false },
  origin: { label: "Menşei / Ülke", placeholder: "Örn. Fransa, Türkiye…", multiline: false },
  extraction_method: { label: "Çıkarma Yöntemi", placeholder: "Örn. Buhar damıtma", multiline: false },
  plant_part: { label: "Kullanılan Bitki Bölümü", placeholder: "Örn. Çiçek, Yaprak, Meyve kabuğu…", multiline: false },
  aroma_profile: { label: "Koku Profili", placeholder: "Örn. Çiçeksi, tatlı, odunsu…", multiline: false },
  aroma_note: { label: "Koku Notası", placeholder: "Örn. Üst nota, Orta nota, Alt nota", multiline: false },
  color: { label: "Renk", placeholder: "Örn. Renksiz, Sarı, Soluk sarı…", multiline: false },
  consistency: { label: "Kıvam / Yoğunluk", placeholder: "Örn. İnce, Orta, Koyu…", multiline: false },
  main_components: { label: "Ana Bileşenler", placeholder: "Örn. Linalool %51, Linalyl asetat %38…", multiline: true },
  therapeutic_properties_raw: {
    label: "Terapötik Özellikler",
    placeholder: "Virgülle ayırın: antibakteriyel, antifungal, antiseptik…",
    multiline: true,
  },
  physical_benefits: { label: "Fiziksel Faydalar", placeholder: "Ağrı kesici, kas gevşetici, bağışıklık destekleyici…", multiline: true },
  emotional_benefits: { label: "Duygusal Faydalar", placeholder: "Rahatlatıcı, stres azaltıcı, sakinleştirici…", multiline: true },
  spiritual_benefits: { label: "Manevi Faydalar", placeholder: "Meditasyonu derinleştirir, sezgiyi açar…", multiline: true },
  skin_benefits: { label: "Cilt Faydaları", placeholder: "Nemlendirici, yenileyici, sivilce karşıtı…", multiline: true },
  benefits: { label: "Genel Faydalar", placeholder: "Diğer genel faydalar…", multiline: true },
  usage_methods: { label: "Kullanım Yöntemleri", placeholder: "Difüzyon, masaj, inhalasyon, banyo, kompres…", multiline: true },
  dilution_ratio: { label: "Seyreltme Oranı", placeholder: "Örn. %1-3 (taşıyıcı yağda)", multiline: false },
  safety_notes: { label: "Güvenlik Notları", placeholder: "Hamilelerde, çocuklarda dikkat; güneşe çıkmadan önce…", multiline: true },
  contraindications: { label: "Kontrendikasyonlar", placeholder: "Kimler kullanmamalı…", multiline: true },
  chakra_connection: { label: "Çakra Bağlantısı", placeholder: "Örn. Kalp çakrası, Taç çakrası…", multiline: false },
  element_connection: { label: "Element Bağlantısı", placeholder: "Örn. Hava, Ateş, Su, Toprak, Eter…", multiline: false },
  blends_well_with_raw: {
    label: "İyi Karıştığı Yağlar",
    placeholder: "Virgülle ayırın: bergamot, sandal ağacı, gül…",
    multiline: false,
  },
  notes: { label: "Ek Notlar", placeholder: "Ek notlar…", multiline: true },
  source: { label: "Kaynak", placeholder: "Kitap, eğitim, kaynak adı…", multiline: false },
  shelf_life: { label: "Raf Ömrü", placeholder: "Örn. 12–18 ay", multiline: false },
  images_raw: {
    label: "Görseller (URL)",
    placeholder: "Her satıra bir URL girin…\nhttps://example.com/gorsel.jpg",
    multiline: true,
    isImageList: true,
  },
  is_photosensitive: { label: "Fotosensitif mi?", isBooleanToggle: true },
  target_systems_raw: {
    label: "Hedef Sistemler",
    placeholder: "Virgülle ayırın: sinir sistemi, bağışıklık sistemi, sindirim sistemi…",
    multiline: true,
  },
};

type PageView = "list" | "new";

function viewFromParam(v: string | null): PageView {
  if (v === "new") return "new";
  return "list";
}

// -------------------------------------------------------
// Yeni kayıt formu bileşeni
// -------------------------------------------------------

function NewOilForm({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<OilFormData>({ ...EMPTY_OIL_FORM });
  const [formTab, setFormTab] = useState<FormTabId>("kimlik");
  const [saving, setSaving] = useState(false);
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
    const nameTrim = form.name.trim();
    if (!nameTrim) {
      setError("Yağ adı zorunludur.");
      return;
    }

    setSaving(true);
    setError("");

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setError(MISSING_SESSION_TENANT_MESSAGE);
      setSaving(false);
      return;
    }

    const t = (v: string) => v.trim() || "";

    const { error: insertError } = await supabase.from("aromatherapy_oils").insert({
      tenant_id: tenantId,
      name: nameTrim,
      latin_name: t(form.latin_name),
      oil_type: form.oil_type || "essential",
      category: t(form.category),
      extraction_method: t(form.extraction_method),
      plant_part: t(form.plant_part),
      origin: t(form.origin),
      aroma_profile: t(form.aroma_profile),
      aroma_note: t(form.aroma_note),
      color: t(form.color),
      consistency: t(form.consistency),
      main_components: t(form.main_components),
      therapeutic_properties: parseTagsInput(form.therapeutic_properties_raw),
      benefits: t(form.benefits),
      emotional_benefits: t(form.emotional_benefits),
      physical_benefits: t(form.physical_benefits),
      spiritual_benefits: t(form.spiritual_benefits),
      skin_benefits: t(form.skin_benefits),
      usage_methods: t(form.usage_methods),
      dilution_ratio: t(form.dilution_ratio),
      safety_notes: t(form.safety_notes),
      contraindications: t(form.contraindications),
      blends_well_with: parseTagsInput(form.blends_well_with_raw),
      chakra_connection: t(form.chakra_connection),
      element_connection: t(form.element_connection),
      notes: t(form.notes),
      source: t(form.source),
      images: parseImageUrls(form.images_raw),
      is_photosensitive: form.is_photosensitive,
      shelf_life: t(form.shelf_life),
      target_systems: parseTagsInput(form.target_systems_raw),
    });

    setSaving(false);

    if (insertError) {
      setError(`Kayıt eklenemedi: ${insertError.message}`);
      return;
    }

    showToast({ title: "Başarılı", message: "Yağ kaydı oluşturuldu.", type: "success" });
    onSaved();
  }

  const newFormScrollArea =
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

        {/* Mobil / Tablet yatay sekme barı (lg altı) */}
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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
          {/* Desktop sidebar — lg+ ekranlarda görünür */}
          <aside
            className={`hidden h-full min-h-0 rounded-[28px] border border-amber-100/80 bg-white/85 p-4 shadow-xl lg:block ${newFormScrollArea}`}
          >
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Bölümler</p>
            <div className="space-y-1.5">
              {FORM_TABS.map((tab) => {
                const active = formTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFormTab(tab.id)}
                    className={`flex h-12 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-bold transition ${
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

          {/* İçerik alanı */}
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-amber-100/80 bg-white/85 shadow-xl">
            <div className={`${newFormScrollArea} p-5`}>
              <header className="mb-5 border-b border-amber-100/80 pb-4">
                <h3 className="text-lg font-black tracking-tight text-slate-950">{activeTab.label}</h3>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{activeTab.desc}</p>
              </header>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {activeTab.fields.map((fieldKey) => {
                  const meta = FIELD_META[fieldKey as string];
                  if (!meta) return null;

                  if (meta.isBooleanToggle) {
                    const boolVal = form.is_photosensitive;
                    return (
                      <section key={fieldKey} className={`${miniCard} sm:col-span-2`}>
                        <header className="mb-2.5">
                          <h4 className="text-[13px] font-black text-slate-900">{meta.label}</h4>
                        </header>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({ ...prev, is_photosensitive: !prev.is_photosensitive }))
                          }
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
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </section>
                    );
                  }

                  return (
                    <section
                      key={fieldKey}
                      className={`${miniCard} ${meta.multiline ? "sm:col-span-2" : ""}`}
                    >
                      <header className="mb-2.5">
                        <h4 className="text-[13px] font-black text-slate-900">{meta.label}</h4>
                      </header>
                      {meta.multiline ? (
                        <>
                          <textarea
                            readOnly
                            value={form[fieldKey as keyof OilFormData] as string}
                            onClick={() => openLarge(fieldKey as string)}
                            onFocus={(e) => {
                              openLarge(fieldKey as string);
                              e.target.blur();
                            }}
                            rows={3}
                            placeholder={meta.placeholder}
                            className={`${fieldTextarea} cursor-pointer`}
                          />
                          {meta.isImageList ? (
                            <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                              Her satıra bir URL girin. Galeri yükleme desteği ilerleyen aşamada eklenecek.
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
                className="inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 text-[13px] font-black text-white shadow-md disabled:opacity-60"
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
          <div
            className="w-full max-w-[920px] rounded-[28px] bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
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
// Ana sayfa
// -------------------------------------------------------

export default function YaglarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-sm font-bold text-slate-500">
          Yükleniyor…
        </div>
      }
    >
      <YaglarContent />
    </Suspense>
  );
}

function YaglarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<OilListRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const pageView = useMemo(() => viewFromParam(searchParams.get("view")), [searchParams]);
  const [errorMessage, setErrorMessage] = useState("");

  const loadOils = useCallback(async (tid: string) => {
    setLoading(true);
    setErrorMessage("");
    const { rows: nextRows, error } = await fetchOilList(tid);
    setLoading(false);
    if (error) {
      setErrorMessage(`Yağlar yüklenemedi: ${error}`);
      return;
    }
    setRows(nextRows);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void (async () => {
        const tid = await getSyncedTenantId();
        setTenantId(tid);
        if (!tid) {
          setLoading(false);
          setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
          return;
        }
        await loadOils(tid);
      })();
    });
  }, [loadOils]);

  useBfcacheRefresh();

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => typeFilter === "all" || r.oil_type === typeFilter)
      .filter((r) => matchesOilSearch(r, search))
      .sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
  }, [rows, search, typeFilter]);

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      map[r.oil_type] = (map[r.oil_type] ?? 0) + 1;
    }
    return map;
  }, [rows]);

  function goToList() {
    router.replace("/aromaterapi/yaglar?view=list");
  }

  function goToNew() {
    router.push("/aromaterapi/yaglar?view=new");
  }

  function handleSaved() {
    goToList();
    if (tenantId) void loadOils(tenantId);
  }

  if (pageView === "new") {
    return <NewOilForm onBack={goToList} onSaved={handleSaved} />;
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-[320px] w-[320px] rounded-full bg-amber-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[280px] w-[280px] rounded-full bg-violet-200/18 blur-[100px]" />

      <div className="relative z-10 w-full space-y-3 px-3 py-3 sm:px-5 xl:px-7">
        {/* Header */}
        <header className={`${headerCard} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-black tracking-[0.14em] text-amber-700">
              ✦ AROMATERAPİ — YAĞLAR
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">
              Yağlar Kütüphanesi
            </h1>
            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-500">
              Uçucu yağ, sabit yağ, hidrosol, reçine ve ekstrakt kayıtları
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/aromaterapi"
              className={hubBtn}
            >
              <span aria-hidden className="text-sm leading-none">←</span>
              <span className="hidden sm:inline">Aromaterapi Ana</span>
              <span className="sm:hidden">Ana</span>
            </Link>
            <button type="button" onClick={goToNew} className={newBtn}>
              + Yeni Yağ
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-2 text-[12px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {/* Filtre & arama */}
        <section className={filterCard}>
          {/* Tip filtresi */}
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
                  <span
                    className={`rounded-full px-1 text-[9px] font-black ${
                      active ? "bg-white/20 text-white" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 w-full flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Yağ adı, kategori, özellik veya fayda ara…"
                className={searchInput}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`${viewBtn} ${viewMode === "card" ? viewBtnActive : viewBtnIdle}`}
              >
                Kart
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`${viewBtn} ${viewMode === "list" ? viewBtnActive : viewBtnIdle}`}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => { if (tenantId) void loadOils(tenantId); }}
                className={`${viewBtn} ${viewBtnIdle}`}
              >
                ↻
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
            <p className="text-[11px] font-bold text-slate-400">
              {search.trim() || typeFilter !== "all"
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
              <button
                type="button"
                onClick={goToNew}
                className="mt-5 inline-flex items-center rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 py-2.5 text-[13px] font-black text-white shadow-md"
              >
                + Yeni Yağ Ekle
              </button>
            </div>
          ) : viewMode === "card" ? (
            <div className={oilCardGrid}>
              {filteredRows.map((row) => (
                <article key={row.id} className={oilCard}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-wide ${oilTypeBadgeClass(row.oil_type)}`}
                    >
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
                  </div>

                  <h2 className="mt-2.5 text-[17px] font-black tracking-tight text-slate-950">
                    {row.name}
                  </h2>
                  {row.latin_name.trim() ? (
                    <p className="mt-0.5 text-[12px] font-medium italic text-slate-500">
                      {row.latin_name}
                    </p>
                  ) : null}

                  <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-slate-600">
                    {oilListRowPreview(row)}
                  </p>

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
              ))}
            </div>
          ) : (
            /* Liste görünümü */
            <div className="overflow-hidden overflow-x-auto rounded-[20px] bg-white/86 ring-1 ring-slate-100">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_1.4fr_0.6fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  <div>Yağ Adı</div>
                  <div>Tip</div>
                  <div>Kategori</div>
                  <div>Fayda Önizleme</div>
                  <div className="text-right">İşlem</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1.2fr_0.9fr_0.8fr_1.4fr_0.6fr] gap-3 px-4 py-3 text-[12px] transition hover:bg-amber-50/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{row.name}</p>
                        {row.latin_name.trim() ? (
                          <p className="truncate text-[11px] italic text-slate-400">{row.latin_name}</p>
                        ) : null}
                      </div>
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${oilTypeBadgeClass(row.oil_type)}`}>
                          {oilTypeLabel(row.oil_type)}
                        </span>
                        {row.is_photosensitive ? (
                          <span className="mt-0.5 block text-[9px] font-bold text-amber-600">
                            ☀️ Fotosensitif
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-slate-600">{row.category || "—"}</div>
                      <div className="min-w-0">
                        <span className="line-clamp-2 text-slate-500">{oilListRowPreview(row, 100)}</span>
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
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

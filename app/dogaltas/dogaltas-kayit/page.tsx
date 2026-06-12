"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
const STONE_BUCKET = "stone-photos";

const chakraOptions = [
  "Kök Çakra",
  "Sakral Çakra",
  "Solar Pleksus",
  "Kalp Çakra",
  "Boğaz Çakra",
  "Üçüncü Göz",
  "Taç Çakra",
];

const effectSections = [
  {
    title: "Fiziksel Etkiler",
    key: "physical_effects",
    desc: "Bedensel etkiler, destek alanları ve kullanım notları.",
    icon: "🫀",
    accent: "cyan",
  },
  {
    title: "Ruhsal Etkiler",
    key: "spiritual_effects",
    desc: "Ruhsal denge, farkındalık ve içsel çalışma notları.",
    icon: "✨",
    accent: "violet",
  },
  {
    title: "Diğer Etkiler",
    key: "other_effects",
    desc: "Ek bilgiler, gözlemler ve tamamlayıcı notlar.",
    icon: "📝",
    accent: "orange",
  },
];

const usageSections = [
  { title: "Feng Shui", key: "feng_shui" },
  { title: "Meditasyon", key: "meditation" },
  { title: "Bakım", key: "care" },
  { title: "Uygulama", key: "application" },
];

const warningTypes = [
  "Genel Uyarı",
  "Hamilelik",
  "Çocuklar",
  "Tansiyon / Kalp",
  "Uyku / Huzursuzluk",
  "Enerji Hassasiyeti",
];

const assignmentSections = [
  {
    title: "Mineraller",
    desc: "Mineral adı ve oran yüzdesi ekleyin.",
    icon: "🧪",
    fields: ["Mineral", "Oran %"],
  },
  {
    title: "Etkili Organlar",
    desc: "Etkili organ veya kısa not ekleyin.",
    icon: "🫀",
    fields: ["Etkili Organ / Not"],
  },
  {
    title: "Astrolojik Atama",
    desc: "Burç, gezegen veya astrolojik eşleşme ekleyin.",
    icon: "✨",
    fields: ["Astrolojik Atama"],
  },
  {
    title: "Elementler",
    desc: "Ateş, su, hava, toprak gibi elementleri ekleyin.",
    icon: "🌿",
    fields: ["Element"],
  },
];

type AssignmentRows = Record<string, string[][]>;
type AssignmentInputs = Record<string, string[]>;

type UploadedImage = {
  id: string;
  name: string;
  url: string;
  file_path?: string;
};

type FormData = {
  stone_name: string;
  short_description: string;
  general_info: string;
  source_note: string;
  physical_effects: string;
  spiritual_effects: string;
  other_effects: string;
  warning_text: string;
  feng_shui: string;
  meditation: string;
  care: string;
  application: string;
};

const emptyFormData: FormData = {
  stone_name: "",
  short_description: "",
  general_info: "",
  source_note: "",
  physical_effects: "",
  spiritual_effects: "",
  other_effects: "",
  warning_text: "",
  feng_shui: "",
  meditation: "",
  care: "",
  application: "",
};

const emptyAssignmentRows: AssignmentRows = {
  Mineraller: [],
  "Etkili Organlar": [],
  "Astrolojik Atama": [],
  Elementler: [],
};

const emptyAssignmentInputs: AssignmentInputs = {
  Mineraller: ["", ""],
  "Etkili Organlar": [""],
  "Astrolojik Atama": [""],
  Elementler: [""],
};

const uiCard =
  "rounded-[32px] border-[3px] border-cyan-400/70 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 bg-white/55 shadow-[0_0_35px_rgba(34,211,238,0.25)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]";
const uiInput =
  "w-full h-10 rounded-xl border-2 border-cyan-300/50 bg-white/90 px-4 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiTextarea =
  "w-full min-h-[100px] resize-none rounded-xl border-2 border-cyan-300/50 bg-white/90 px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiLabel = "mb-1.5 block text-[13px] font-bold text-slate-700";
const uiPanel =
  "rounded-3xl border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 shadow-md transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1";
const uiBtn =
  "inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-black transition";

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

const COMPRESS_MAX_W = 1200;
const COMPRESS_MAX_H = 1200;
const COMPRESS_WEBP_QUALITY = 0.75;

async function compressImageFileToWebp(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode"));
      image.src = objectUrl;
    });

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w === 0 || h === 0) return file;

    const scale = Math.min(1, COMPRESS_MAX_W / w, COMPRESS_MAX_H / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", COMPRESS_WEBP_QUALITY);
    });
    if (!blob) return file;

    const base = file.name.replace(/\.[^/.]+$/, "") || "image";
    const webpName = `${safeFileName(base)}.webp`;
    return new File([blob], webpName, { type: "image/webp" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function DogaltasKayitPage() {
  const [formData, setFormData] = useState<FormData>(emptyFormData);
  const [selectedChakras, setSelectedChakras] = useState<string[]>([]);
  const [selectedWarnings, setSelectedWarnings] = useState<string[]>([]);
  const [largeEditorTitle, setLargeEditorTitle] = useState<string | null>(null);
  const [largeEditorKey, setLargeEditorKey] = useState<keyof FormData | null>(null);
  const [largeEditorValue, setLargeEditorValue] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState<string | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRows>(emptyAssignmentRows);
  const [assignmentInputs, setAssignmentInputs] = useState<AssignmentInputs>(emptyAssignmentInputs);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<UploadedImage | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeAssignment = assignmentSections.find((item) => item.title === assignmentTitle);

  function showMessage(message: string) {
    setSavedMessage(message);
    setErrorMessage("");
    setTimeout(() => setSavedMessage(""), 2400);
  }

  function showError(message: string) {
    setErrorMessage(message);
    setSavedMessage("");
  }

  function updateField(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function openLargeEditor(title: string, field: keyof FormData) {
    setLargeEditorTitle(title);
    setLargeEditorKey(field);
    setLargeEditorValue(formData[field] || "");
  }

  function closeLargeEditor() {
    setLargeEditorTitle(null);
    setLargeEditorKey(null);
    setLargeEditorValue("");
  }

  function saveLargeEditor() {
    if (largeEditorKey) {
      updateField(largeEditorKey, largeEditorValue);
    }
    closeLargeEditor();
  }

  function closeAssignment() {
    setAssignmentTitle(null);
  }

  function updateAssignmentInput(sectionTitle: string, index: number, value: string) {
    setAssignmentInputs((prev) => {
      const current = [...(prev[sectionTitle] || [])];
      current[index] = value;
      return { ...prev, [sectionTitle]: current };
    });
  }

  function addAssignmentRow() {
    if (!activeAssignment) return;

    const sectionTitle = activeAssignment.title;
    const values = assignmentInputs[sectionTitle] || [];
    const hasValue = values.some((value) => value.trim().length > 0);

    if (!hasValue) return;

    setAssignmentRows((prev) => ({
      ...prev,
      [sectionTitle]: [...(prev[sectionTitle] || []), values],
    }));

    setAssignmentInputs((prev) => ({
      ...prev,
      [sectionTitle]: activeAssignment.fields.map(() => ""),
    }));
  }

  function deleteAssignmentRow(sectionTitle: string, index: number) {
    setAssignmentRows((prev) => ({
      ...prev,
      [sectionTitle]: (prev[sectionTitle] || []).filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  function toggleChakra(chakra: string) {
    setSelectedChakras((prev) =>
      prev.includes(chakra) ? prev.filter((item) => item !== chakra) : [...prev, chakra]
    );
  }

  function toggleWarning(warning: string) {
    setSelectedWarnings((prev) =>
      prev.includes(warning) ? prev.filter((item) => item !== warning) : [...prev, warning]
    );
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    event.target.value = "";
    if (files.length === 0) return;

    const uploaded: UploadedImage[] = [];

    for (const file of files) {
      const compressed = await compressImageFileToWebp(file);
      const cleanName = safeFileName(compressed.name);
      const tenantId = await getSyncedTenantId();
      if (!tenantId) {
        showError(MISSING_SESSION_TENANT_MESSAGE);
        return;
      }
      const filePath = `catalog/${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from(STONE_BUCKET)
        .upload(filePath, compressed, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        showError("Görsel yüklenemedi: " + uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STONE_BUCKET)
        .getPublicUrl(filePath);

      uploaded.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        url: publicUrlData.publicUrl,
        file_path: filePath,
      });
    }

    setImages((prev) => [...prev, ...uploaded]);
    showMessage(`${uploaded.length} resim yüklendi.`);
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((image) => image.id !== id));
  }

  async function handleSave() {
    if (!formData.stone_name.trim()) {
      showError("Taş adı zorunlu hocam.");
      return;
    }

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      showError(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      tenant_id: tenantId,
      stone_name: formData.stone_name.trim(),
      short_description: formData.short_description,
      general_info: formData.general_info,
      source_note: formData.source_note,
      physical_effects: formData.physical_effects,
      spiritual_effects: formData.spiritual_effects,
      other_effects: formData.other_effects,
      warning_text: formData.warning_text,
      warning_tags: selectedWarnings,
      feng_shui: formData.feng_shui,
      meditation: formData.meditation,
      care: formData.care,
      application: formData.application,
      chakras: selectedChakras,
      assignments: assignmentRows,
      images: images.map((image) => ({
        id: image.id,
        name: image.name,
        url: image.url,
        file_path: image.file_path,
      })),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("stones").insert(payload);

    setIsSaving(false);

    if (error) {
      showError(`Kayıt yapılamadı: ${error.message}`);
      return;
    }

    setFormData(() => ({ ...emptyFormData }));
    setSelectedChakras([]);
    setSelectedWarnings([]);
    setAssignmentRows(emptyAssignmentRows);
    setAssignmentInputs(emptyAssignmentInputs);
    setImages([]);
    setPreviewImage(null);
    showMessage("Doğaltaş kaydı Supabase'e kaydedildi.");
    setShowForm(false);
  }

  function handleClear() {
    setFormData(emptyFormData);
    setSelectedChakras([]);
    setSelectedWarnings([]);
    setAssignmentRows(emptyAssignmentRows);
    setAssignmentInputs(emptyAssignmentInputs);
    setImages([]);
    showMessage("Form temizlendi.");
  }

  function handleCancel() {
    window.location.href = "/dogaltas";
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] pb-20 text-slate-950">
      <div className="absolute left-0 top-0 h-[500px] w-[500px] bg-cyan-300/20 blur-[150px]" />
      <div className="absolute right-0 top-0 h-[500px] w-[500px] bg-violet-300/20 blur-[150px]" />

      <div className="relative w-full px-5 py-4 xl:px-8 2xl:px-10">
        <header className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="mb-1.5 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700">
                💎 DOĞALTAŞ MODÜLÜ
              </div>

              <h1 className="text-2xl font-black tracking-tight text-slate-950">
                Doğaltaş Kayıt
              </h1>

              <p className="mt-1 text-sm text-slate-600">
                Taş bilgilerini, etkilerini, kullanım alanlarını, uyarılarını ve atamalarını tek ekranda yönetin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(savedMessage || errorMessage) && (
              <span
                className={`rounded-2xl px-5 py-3 text-base font-black ring-1 ${
                  errorMessage
                    ? "bg-rose-50 text-rose-700 ring-rose-100"
                    : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                }`}
              >
                {errorMessage || savedMessage}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className={`rounded-xl px-5 py-2.5 text-sm font-black shadow-md transition hover:brightness-110 ${
                showForm
                  ? "border border-slate-200 bg-white text-slate-700"
                  : "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
              }`}
            >
              {showForm ? "Formu Kapat" : "+ Yeni Kayıt"}
            </button>
          </div>
        </header>

        {!showForm && (
          <div className="rounded-[24px] border-[3px] border-cyan-300/40 bg-white/65 shadow-[0_0_40px_rgba(6,182,212,0.10)] backdrop-blur-xl flex flex-col items-center gap-4 py-14 text-center">
            <span className="text-5xl">💎</span>
            <div>
              <h2 className="text-lg font-black text-slate-800">Doğaltaş Kayıt Ekranı</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Yeni taş kaydı oluşturmak için "+ Yeni Kayıt" butonuna basın.
                Kayıtlı taşları Taş Listesi'nden görüntüleyebilirsiniz.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110"
              >
                + Yeni Kayıt Oluştur
              </button>
              <a
                href="/dogaltas/dogaltas-listesi"
                className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Taş Listesi
              </a>
            </div>
          </div>
        )}

        {showForm && <section className="space-y-4">
          <div className={`${uiCard} p-4`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-lg ring-1 ring-cyan-100">
                  💎
                </span>
                <div>
                <h2 className="text-base font-black tracking-wide text-slate-950">Temel Bilgi</h2>
                <p className="mt-0.5 text-slate-500">
                  Masaüstündeki temel kayıt alanının sade web uyarlaması.
                </p>
                </div>
              </div>

              <span className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-black text-cyan-700">
                Ana Kayıt
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div>
                  <label className={uiLabel}>
                    Taş Adı
                  </label>
                  <input
                    type="text"
                    value={formData.stone_name}
                    onChange={(event) => updateField("stone_name", event.target.value)}
                    placeholder="Örn. Ametist"
                    className={uiInput}
                  />
                </div>

                <div>
                  <label className={uiLabel}>
                    Kısa Açıklama
                  </label>

                  <textarea
                    value={formData.short_description}
                    onChange={(event) => updateField("short_description", event.target.value)}
                    onFocus={() => openLargeEditor("Kısa Açıklama", "short_description")}
                    placeholder="Taşın kısa tanımı, temel özelliği ve öne çıkan etkisi..."
                    className={uiTextarea}
                  />
                </div>
              </div>

              <div>
                <label className={uiLabel}>
                  Görsel Alanı
                </label>

                <div className="rounded-2xl border-2 border-dashed border-cyan-300 bg-gradient-to-br from-cyan-50/90 to-violet-50/80 p-4 text-center shadow-md">
                  <div className="flex min-h-[200px] flex-col items-center justify-center">
                    <div className="text-4xl">💎</div>
                    <p className="mt-2 text-base font-black text-slate-800">
                      Birden fazla taş görseli ekle
                    </p>
                    <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-slate-500">
                      Dosya adı Supabase’e kaydolur.
                    </p>

                    <label className={`${uiBtn} mt-3 cursor-pointer bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110`}>
                      Resim Seç
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>

                  {images.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {images.map((image) => (
                        <div key={image.id} className="group relative overflow-hidden rounded-2xl border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 shadow-sm">
                          <button type="button" onClick={() => setPreviewImage(image)} className="block h-24 w-full">
                            <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeImage(image.id)}
                            className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-slate-950/80 text-xs font-black text-white group-hover:flex"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`${uiCard} p-4`}>
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-lg ring-1 ring-violet-100">
                📋
              </span>
              <div>
                <h2 className="text-base font-black tracking-wide text-slate-950">Genel Bilgi</h2>
                <p className="mt-0.5 text-slate-500">
                  Bilgi paneli / tablo / özet mantığının sade web karşılığı.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[
                { title: "Genel Bilgi / Tanım", key: "general_info" as keyof FormData },
                { title: "Oluşum / Kaynak Notu", key: "source_note" as keyof FormData },
              ].map((item) => (
                <div key={item.key}>
                  <label className={uiLabel}>
                    {item.title}
                  </label>

                  <textarea
                    value={formData[item.key]}
                    onChange={(event) => updateField(item.key, event.target.value)}
                    onFocus={() => openLargeEditor(item.title, item.key)}
                    placeholder={`${item.title} yaz...`}
                    className={uiTextarea}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {effectSections.map((section) => (
              <div
                key={section.title}
                className={`${uiCard} flex min-h-[160px] flex-col border-l-[8px] p-4 ${
                  section.accent === "cyan"
                    ? "border-l-cyan-500"
                    : section.accent === "violet"
                      ? "border-l-violet-500"
                      : "border-l-orange-500"
                }`}
              >
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base ring-1 ${
                      section.accent === "cyan"
                        ? "bg-cyan-50 ring-cyan-100"
                        : section.accent === "violet"
                          ? "bg-violet-50 ring-violet-100"
                          : "bg-orange-50 ring-orange-100"
                    }`}
                  >
                    {section.icon}
                  </span>
                  <div>
                    <h3 className="text-base font-black tracking-wide text-slate-950">{section.title}</h3>
                    <p className="mt-0.5 text-slate-500">{section.desc}</p>
                  </div>
                </div>

                <textarea
                  value={formData[section.key as keyof FormData]}
                  onChange={(event) => updateField(section.key as keyof FormData, event.target.value)}
                  onFocus={() => openLargeEditor(section.title, section.key as keyof FormData)}
                  placeholder="Bu alana tıklayınca büyük yazı ekranı açılır..."
                  className={`${uiTextarea} mt-auto`}
                />
              </div>
            ))}
          </div>

          <div className={`${uiCard} p-4`}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-lg ring-1 ring-emerald-100">
                  ✨
                </span>
                <div>
                  <h2 className="text-base font-black tracking-wide text-slate-950">İleri Seviye Notlar</h2>
                  <p className="mt-0.5 text-slate-500">Feng Shui, meditasyon, bakım, uygulama ve uyarı notları.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-black text-slate-500 shadow-sm">
                {advancedOpen ? "▲ Gizle" : "▼ Göster"}
              </span>
            </button>

            {advancedOpen && (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
                  {usageSections.map((item) => (
                    <div key={item.key} className={`${uiPanel} p-4`}>
                      <p className="mb-2 text-[13px] font-bold text-slate-800">{item.title}</p>

                      <textarea
                        value={formData[item.key as keyof FormData]}
                        onChange={(event) => updateField(item.key as keyof FormData, event.target.value)}
                        onFocus={() => openLargeEditor(item.title, item.key as keyof FormData)}
                        placeholder={`${item.title} notu...`}
                        className={uiTextarea}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-amber-200/60 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-base ring-1 ring-amber-200">
                        ⚠️
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-slate-950">Uyarılar ve Hassasiyetler</h3>
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-700/80">Danışan modülü ile entegre — bu alan taş önerilerinde otomatik kontrol edilir.</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
                      Klinik Not
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                    <div>
                      <label className={uiLabel}>Uyarı Metni</label>
                      <textarea
                        value={formData.warning_text}
                        onChange={(event) => updateField("warning_text", event.target.value)}
                        onFocus={() => openLargeEditor("Uyarılar", "warning_text")}
                        placeholder="Bu taş için dikkat edilmesi gereken durumları yazın. Örn. hassas kişilerde uzun süreli kullanım önerilmez..."
                        className={uiTextarea}
                      />
                    </div>

                    <div>
                      <label className={uiLabel}>Uyarı Etiketleri</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {warningTypes.map((warning) => (
                          <label key={warning} className={`${uiPanel} flex cursor-pointer items-center gap-2.5 px-3 py-2`}>
                            <input
                              type="checkbox"
                              checked={selectedWarnings.includes(warning)}
                              onChange={() => toggleWarning(warning)}
                              className="h-5 w-5 accent-rose-600"
                            />
                            <span className="text-[13px] font-bold text-slate-700">{warning}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`${uiCard} p-4`}>
            <button
              type="button"
              onClick={() => setAssignmentsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg ring-1 ring-indigo-100">
                  📎
                </span>
                <div>
                  <h2 className="text-base font-black tracking-wide text-slate-950">Atamalar</h2>
                  <p className="mt-0.5 text-slate-500">Mineral, organ, astroloji, element ve çakra alanları.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-black text-slate-500 shadow-sm">
                {assignmentsOpen ? "▲ Gizle" : "▼ Göster"}
              </span>
            </button>

            {assignmentsOpen && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {assignmentSections.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setAssignmentTitle(item.title)}
                    className={`${uiPanel} flex w-full items-center justify-between px-4 py-3 text-left`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-base ring-1 ring-cyan-100">{item.icon}</span>
                      <span>
                        <span className="block text-[13px] font-bold text-slate-800">{item.title}</span>
                        <span className="block text-xs text-slate-500">Düzenle / ekle</span>
                      </span>
                    </span>
                    <span className="text-lg font-black text-cyan-600">→</span>
                  </button>
                ))}

                <div className={`${uiPanel} md:col-span-2 p-4`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-base ring-1 ring-cyan-100">🌀</span>
                    <span className="text-[13px] font-bold text-slate-800">Çakra Atama</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
                    {chakraOptions.map((chakra) => (
                      <label key={chakra} className="flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-200/60 bg-white/80 px-3 py-2 transition hover:bg-cyan-50">
                        <input
                          type="checkbox"
                          checked={selectedChakras.includes(chakra)}
                          onChange={() => toggleChakra(chakra)}
                          className="h-4 w-4 accent-cyan-600"
                        />
                        <span className="text-[12px] font-bold text-slate-700">{chakra}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>}
      </div>

      {showForm && <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-5 py-2.5 shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:px-8 2xl:px-10">
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-500">
            Kaydedilmeden ayrılırsanız taslak kaybolabilir.
          </p>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleClear} className={`${uiBtn} bg-slate-100 text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200`}>
              Temizle
            </button>

            <button type="button" onClick={handleCancel} className={`${uiBtn} border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 text-slate-800 hover:brightness-[1.02]`}>
              İptal
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`${uiBtn} bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>}

      {largeEditorTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm">
          <div className="flex h-[82vh] w-full max-w-[1040px] flex-col rounded-[30px] bg-white p-6 shadow-[0_35px_90px_rgba(15,23,42,0.22)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-black text-cyan-700">
                  BÜYÜK YAZI EKRANI
                </div>
                <h2 className="text-[26px] font-black text-slate-950">{largeEditorTitle}</h2>
                <p className="mt-1 text-[13px] text-slate-500">Uzun metinleri rahat yazmak için geniş düzen.</p>
              </div>

              <button type="button" onClick={closeLargeEditor} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200">
                ×
              </button>
            </div>

            <textarea
              value={largeEditorValue}
              onChange={(event) => setLargeEditorValue(event.target.value)}
              placeholder="Notunuzu geniş ekranda yazın..."
              className="min-h-0 flex-1 resize-none rounded-[24px] border-2 border-cyan-300/50 bg-white/90 p-5 text-[15px] font-medium leading-7 text-slate-700 shadow-inner outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeLargeEditor} className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                İptal
              </button>

              <button type="button" onClick={saveLargeEditor} className={`${uiBtn} bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110`}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm">
          <div className="flex h-[78vh] w-full max-w-[980px] flex-col rounded-[30px] bg-white p-6 shadow-[0_35px_90px_rgba(15,23,42,0.22)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                  ATAMA PANELİ
                </div>
                <h2 className="text-[26px] font-black text-slate-950">{activeAssignment.icon} {activeAssignment.title}</h2>
                <p className="mt-1 text-[13px] text-slate-500">{activeAssignment.desc}</p>
              </div>

              <button type="button" onClick={closeAssignment} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200">
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
              <div className={activeAssignment.fields.length === 2 ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
                {activeAssignment.fields.map((field, index) => (
                  <div key={field}>
                    <label className={uiLabel}>{field}</label>
                    <input
                      type="text"
                      value={(assignmentInputs[activeAssignment.title] || [])[index] || ""}
                      onChange={(event) => updateAssignmentInput(activeAssignment.title, index, event.target.value)}
                      placeholder={`${field} yaz...`}
                      className="h-12 w-full rounded-2xl border-2 border-cyan-300/50 bg-white/90 px-4 text-[14px] font-medium shadow-inner outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30"
                    />
                  </div>
                ))}
              </div>

              <button type="button" onClick={addAssignmentRow} className={`${uiBtn} self-end bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110`}>
                Satır Ekle
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-[24px] border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 p-4">
              <div className={activeAssignment.fields.length === 2 ? "grid grid-cols-[1fr_120px_90px] border-b border-slate-200 pb-3 text-[12px] font-black text-slate-500" : "grid grid-cols-[1fr_90px] border-b border-slate-200 pb-3 text-[12px] font-black text-slate-500"}>
                <span>{activeAssignment.fields[0]}</span>
                {activeAssignment.fields.length === 2 && <span>{activeAssignment.fields[1]}</span>}
                <span className="text-right">İşlem</span>
              </div>

              <div className="mt-3 space-y-2">
                {(assignmentRows[activeAssignment.title] || []).length === 0 ? (
                  <div className="flex h-[210px] items-center justify-center text-center text-[13px] font-medium text-slate-400">
                    Henüz kayıt eklenmedi.
                  </div>
                ) : (
                  (assignmentRows[activeAssignment.title] || []).map((row, rowIndex) => (
                    <div
                      key={`${activeAssignment.title}-${rowIndex}`}
                      className={activeAssignment.fields.length === 2 ? "grid grid-cols-[1fr_120px_90px] items-center rounded-2xl bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-4 py-3 text-[13px] font-bold text-slate-700 ring-1 ring-cyan-200/60" : "grid grid-cols-[1fr_90px] items-center rounded-2xl bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-4 py-3 text-[13px] font-bold text-slate-700 ring-1 ring-cyan-200/60"}
                    >
                      <span>{row[0]}</span>
                      {activeAssignment.fields.length === 2 && <span>{row[1]}</span>}
                      <button type="button" onClick={() => deleteAssignmentRow(activeAssignment.title, rowIndex)} className="justify-self-end rounded-xl bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100">
                        Sil
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeAssignment} className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                İptal
              </button>

              <button type="button" onClick={closeAssignment} className={`${uiBtn} bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110`}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-6" onClick={() => setPreviewImage(null)}>
          <button type="button" onClick={() => setPreviewImage(null)} className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white transition hover:bg-white/20">
            ×
          </button>

          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-[0_35px_90px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

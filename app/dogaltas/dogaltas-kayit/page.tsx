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
  "w-full h-16 rounded-2xl border-2 border-cyan-300/50 bg-white/90 px-6 text-[17px] text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiTextarea =
  "w-full min-h-[170px] resize-none rounded-2xl border-2 border-cyan-300/50 bg-white/90 px-6 py-5 text-[17px] leading-relaxed text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";
const uiLabel = "mb-2 block text-[15px] font-bold text-slate-700";
const uiPanel =
  "rounded-3xl border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 shadow-md transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1";
const uiBtn =
  "inline-flex h-14 items-center justify-center rounded-2xl px-8 text-base font-black transition";

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
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<UploadedImage | null>(null);

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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#eef2ff_35%,#f8fafc_100%)] pb-32 text-slate-950">
      <div className="absolute left-0 top-0 h-[500px] w-[500px] bg-cyan-300/20 blur-[150px]" />
      <div className="absolute right-0 top-0 h-[500px] w-[500px] bg-violet-300/20 blur-[150px]" />

      <div className="relative w-full px-6 py-6 xl:px-10 2xl:px-14">
        <header className="mb-5 flex items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <Link
              href="/dogaltas"
              className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 text-xl text-slate-800 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              ←
            </Link>

            <div>
              <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-black tracking-[0.12em] text-emerald-700">
                💎 DOĞALTAŞ MODÜLÜ
              </div>

              <h1 className="text-5xl font-black tracking-tight text-slate-950">
                Doğaltaş Kayıt
              </h1>

              <p className="mt-2 text-lg text-slate-600">
                Taş bilgilerini, etkilerini, kullanım alanlarını, uyarılarını ve atamalarını tek ekranda yönetin.
              </p>
            </div>
          </div>

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
        </header>

        <section className="space-y-6">
          <div className={`${uiCard} p-6`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-2xl ring-1 ring-cyan-100">
                  💎
                </span>
                <div>
                <h2 className="text-xl font-black tracking-wide text-slate-950">Temel Bilgi</h2>
                <p className="mt-0.5 text-slate-500">
                  Masaüstündeki temel kayıt alanının sade web uyarlaması.
                </p>
                </div>
              </div>

              <span className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-black text-cyan-700">
                Ana Kayıt
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
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

                <div className="rounded-3xl border-2 border-dashed border-cyan-300 bg-gradient-to-br from-cyan-50/90 to-violet-50/80 p-5 text-center shadow-md">
                  <div className="flex min-h-[320px] flex-col items-center justify-center">
                    <div className="text-6xl">💎</div>
                    <p className="mt-3 text-lg font-black text-slate-800">
                      Birden fazla taş görseli ekle
                    </p>
                    <p className="mt-2 max-w-[280px] text-base leading-relaxed text-slate-600">
                      Şimdilik dosya adı Supabase’e kaydolur. Storage bağlantısını sonraki adımda yapacağız.
                    </p>

                    <label className={`${uiBtn} mt-5 cursor-pointer bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg hover:brightness-110`}>
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

          <div className={`${uiCard} p-6`}>
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-2xl ring-1 ring-violet-100">
                📋
              </span>
              <div>
                <h2 className="text-xl font-black tracking-wide text-slate-950">Genel Bilgi</h2>
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {effectSections.map((section) => (
              <div
                key={section.title}
                className={`${uiCard} flex min-h-[220px] flex-col border-l-[8px] p-5 ${
                  section.accent === "cyan"
                    ? "border-l-cyan-500"
                    : section.accent === "violet"
                      ? "border-l-violet-500"
                      : "border-l-orange-500"
                }`}
              >
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ring-1 ${
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
                    <h3 className="text-xl font-black tracking-wide text-slate-950">{section.title}</h3>
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

          <div className={`${uiCard} p-6`}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-2xl ring-1 ring-rose-100">
                  ⚠️
                </span>
                <div>
                  <h2 className="text-xl font-black tracking-wide text-slate-950">Uyarılar</h2>
                  <p className="mt-0.5 text-slate-500">Klinik ve güvenlik notları.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-sm font-black text-rose-700">
                Klinik Not
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
              <div>
                <label className={uiLabel}>
                  Uyarı Metni
                </label>

                <textarea
                  value={formData.warning_text}
                  onChange={(event) => updateField("warning_text", event.target.value)}
                  onFocus={() => openLargeEditor("Uyarılar", "warning_text")}
                  placeholder="Bu taş için dikkat edilmesi gereken durumları yazın. Örn. hassas kişilerde uzun süreli kullanım önerilmez..."
                  className={uiTextarea}
                />
              </div>

              <div>
                <label className={uiLabel}>
                  Uyarı Etiketleri
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  {warningTypes.map((warning) => (
                    <label key={warning} className={`${uiPanel} flex cursor-pointer items-center gap-3 px-4 py-3`}>
                      <input
                        type="checkbox"
                        checked={selectedWarnings.includes(warning)}
                        onChange={() => toggleWarning(warning)}
                        className="h-5 w-5 accent-rose-600"
                      />
                      <span className="text-[15px] font-bold text-slate-700">{warning}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={`${uiCard} p-6`}>
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl ring-1 ring-emerald-100">
                🧘
              </span>
              <div>
                <h2 className="text-xl font-black tracking-wide text-slate-950">Kullanım / Uygulama Alanları</h2>
                <p className="mt-0.5 text-slate-500">Feng Shui, meditasyon, bakım ve uygulama notları.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              {usageSections.map((item) => (
                <div key={item.key} className={`${uiPanel} p-5`}>
                  <p className="mb-3 text-[15px] font-bold text-slate-800">{item.title}</p>

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
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className={`${uiCard} p-6`}>
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-2xl ring-1 ring-indigo-100">
                  🔗
                </span>
                <div>
                  <h2 className="text-xl font-black tracking-wide text-slate-950">Atamalar</h2>
                  <p className="mt-0.5 text-slate-500">Mineral, organ, astroloji ve element alanları.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {assignmentSections.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setAssignmentTitle(item.title)}
                    className={`${uiPanel} flex w-full items-center justify-between px-5 py-4 text-left`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-xl ring-1 ring-cyan-100">{item.icon}</span>
                      <span>
                        <span className="block text-[15px] font-bold text-slate-800">{item.title}</span>
                        <span className="block text-base text-slate-500">Düzenle / ekle</span>
                      </span>
                    </span>
                    <span className="text-lg font-black text-cyan-600">→</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={`${uiCard} p-6`}>
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-2xl ring-1 ring-cyan-100">
                  🌀
                </span>
                <div>
                  <h2 className="text-xl font-black tracking-wide text-slate-950">Çakra Atama</h2>
                  <p className="mt-0.5 text-slate-500">Desktop’taki checkbox yapısının web karşılığı.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2.5">
                {chakraOptions.map((chakra) => (
                  <label key={chakra} className={`${uiPanel} flex cursor-pointer items-center gap-3 px-5 py-4`}>
                    <input
                      type="checkbox"
                      checked={selectedChakras.includes(chakra)}
                      onChange={() => toggleChakra(chakra)}
                      className="h-5 w-5 accent-cyan-600"
                    />
                    <span className="text-[15px] font-bold text-slate-700">{chakra}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-cyan-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-6 py-4 shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:px-10 2xl:px-14">
        <div className="flex w-full items-center justify-between gap-4">
          <p className="text-base font-semibold text-slate-600">
            Değişiklikleri kaydetmeden çıkarsanız bu sayfadaki taslak bilgiler kaybolabilir.
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
      </div>

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

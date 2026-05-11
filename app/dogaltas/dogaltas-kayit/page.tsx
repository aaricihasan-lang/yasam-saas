"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

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
    color: "from-cyan-50 to-white",
  },
  {
    title: "Ruhsal Etkiler",
    key: "spiritual_effects",
    desc: "Ruhsal denge, farkındalık ve içsel çalışma notları.",
    color: "from-violet-50 to-white",
  },
  {
    title: "Diğer Etkiler",
    key: "other_effects",
    desc: "Ek bilgiler, gözlemler ve tamamlayıcı notlar.",
    color: "from-emerald-50 to-white",
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

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newImages = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newImages]);
    showMessage(`${newImages.length} resim eklendi.`);
    event.target.value = "";
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((image) => image.id !== id));
  }

  async function handleSave() {
    if (!formData.stone_name.trim()) {
      showError("Taş adı zorunlu hocam.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      tenant_id: TENANT_ID,
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
      })),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("stones").insert(payload);

    setIsSaving(false);

    if (error) {
      showError(`Kayıt yapılamadı: ${error.message}`);
      return;
    }

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
    <main className="min-h-screen bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] pb-28 text-slate-950">
      <div className="mx-auto max-w-[1320px] px-6 py-6">
        <header className="mb-6 flex items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <Link
              href="/dogaltas"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-lg shadow-[0_14px_35px_rgba(15,23,42,0.055)] ring-1 ring-white"
            >
              ←
            </Link>

            <div>
              <div className="mb-1 inline-flex rounded-full bg-white/70 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-white">
                💎 DOĞALTAŞ MODÜLÜ
              </div>

              <h1 className="text-[34px] font-black tracking-tight">
                Doğaltaş Kayıt
              </h1>

              <p className="mt-1 text-[14px] font-medium text-slate-500">
                Taş bilgilerini, etkilerini, kullanım alanlarını, uyarılarını ve atamalarını tek ekranda yönetin.
              </p>
            </div>
          </div>

          {(savedMessage || errorMessage) && (
            <span
              className={`rounded-2xl px-4 py-3 text-[12px] font-black ring-1 ${
                errorMessage
                  ? "bg-rose-50 text-rose-700 ring-rose-100"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-100"
              }`}
            >
              {errorMessage || savedMessage}
            </span>
          )}
        </header>

        <section className="space-y-5">
          <div className="rounded-[30px] bg-white/76 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-black text-slate-950">Temel Bilgi</h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Masaüstündeki temel kayıt alanının sade web uyarlaması.
                </p>
              </div>

              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-black text-cyan-700">
                Ana Kayıt
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_330px]">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                    Taş Adı
                  </label>
                  <input
                    type="text"
                    value={formData.stone_name}
                    onChange={(event) => updateField("stone_name", event.target.value)}
                    placeholder="Örn. Ametist"
                    className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 text-[14px] font-medium outline-none transition placeholder:text-slate-400 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                    Kısa Açıklama
                  </label>

                  <textarea
                    value={formData.short_description}
                    onChange={(event) => updateField("short_description", event.target.value)}
                    onFocus={() => openLargeEditor("Kısa Açıklama", "short_description")}
                    placeholder="Taşın kısa tanımı, temel özelliği ve öne çıkan etkisi..."
                    className="h-[160px] w-full resize-none rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-[14px] font-medium leading-6 outline-none transition placeholder:text-slate-400 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                  Görsel Alanı
                </label>

                <div className="rounded-[26px] border border-dashed border-cyan-200 bg-gradient-to-br from-cyan-50/80 to-white/80 p-4 text-center">
                  <div className="flex min-h-[180px] flex-col items-center justify-center">
                    <div className="text-[52px]">💎</div>
                    <p className="mt-3 text-[13px] font-black text-slate-700">
                      Birden fazla taş görseli ekle
                    </p>
                    <p className="mt-1 max-w-[230px] text-[11px] leading-5 text-slate-500">
                      Şimdilik dosya adı Supabase’e kaydolur. Storage bağlantısını sonraki adımda yapacağız.
                    </p>

                    <label className="mt-4 cursor-pointer rounded-2xl bg-white px-4 py-2 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50">
                      Resim Seç
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>

                  {images.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {images.map((image) => (
                        <div key={image.id} className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
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

          <div className="rounded-[30px] bg-white/76 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
            <div className="mb-4">
              <h2 className="text-[18px] font-black text-slate-950">Genel Bilgi</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Bilgi paneli / tablo / özet mantığının sade web karşılığı.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[
                { title: "Genel Bilgi / Tanım", key: "general_info" as keyof FormData },
                { title: "Oluşum / Kaynak Notu", key: "source_note" as keyof FormData },
              ].map((item) => (
                <div key={item.key}>
                  <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                    {item.title}
                  </label>

                  <textarea
                    value={formData[item.key]}
                    onChange={(event) => updateField(item.key, event.target.value)}
                    onFocus={() => openLargeEditor(item.title, item.key)}
                    placeholder={`${item.title} yaz...`}
                    className="h-[150px] w-full resize-none rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-[14px] font-medium leading-6 outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {effectSections.map((section) => (
              <div
                key={section.title}
                className={`rounded-[26px] bg-gradient-to-br ${section.color} p-5 shadow-[0_18px_45px_rgba(15,23,42,0.038)] ring-1 ring-white`}
              >
                <div className="mb-2">
                  <h3 className="text-[15px] font-black text-slate-900">{section.title}</h3>
                  <p className="mt-2 min-h-[42px] text-[12px] leading-5 text-slate-500">
                    {section.desc}
                  </p>
                </div>

                <textarea
                  value={formData[section.key as keyof FormData]}
                  onChange={(event) => updateField(section.key as keyof FormData, event.target.value)}
                  onFocus={() => openLargeEditor(section.title, section.key as keyof FormData)}
                  placeholder="Bu alana tıklayınca büyük yazı ekranı açılır..."
                  className="mt-3 h-[105px] w-full resize-none rounded-2xl border border-slate-200/70 bg-white/86 p-3 text-[13px] font-medium leading-5 outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                />
              </div>
            ))}
          </div>

          <div className="rounded-[30px] bg-white/76 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-black text-slate-950">Uyarılar</h2>
              <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-rose-700 shadow-sm ring-1 ring-rose-100">
                Klinik Not
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
              <div>
                <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                  Uyarı Metni
                </label>

                <textarea
                  value={formData.warning_text}
                  onChange={(event) => updateField("warning_text", event.target.value)}
                  onFocus={() => openLargeEditor("Uyarılar", "warning_text")}
                  placeholder="Bu taş için dikkat edilmesi gereken durumları yazın. Örn. hassas kişilerde uzun süreli kullanım önerilmez..."
                  className="h-[160px] w-full resize-none rounded-2xl border border-rose-100 bg-white/90 p-4 text-[14px] font-medium leading-6 outline-none transition placeholder:text-slate-400 focus:border-rose-200 focus:ring-4 focus:ring-rose-100/70"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-black text-slate-600">
                  Uyarı Etiketleri
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  {warningTypes.map((warning) => (
                    <label key={warning} className="flex cursor-pointer items-center gap-2 rounded-2xl bg-white/86 px-3 py-3 ring-1 ring-rose-100 transition hover:bg-rose-50">
                      <input
                        type="checkbox"
                        checked={selectedWarnings.includes(warning)}
                        onChange={() => toggleWarning(warning)}
                        className="h-4 w-4 accent-rose-600"
                      />
                      <span className="text-[12px] font-bold text-slate-700">{warning}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] bg-white/76 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
            <div className="mb-4">
              <h2 className="text-[18px] font-black text-slate-950">Kullanım / Uygulama Alanları</h2>
              <p className="mt-1 text-[12px] text-slate-500">Feng Shui, meditasyon, bakım ve uygulama notları.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
              {usageSections.map((item, index) => (
                <div key={item.key} className={`rounded-2xl p-4 ring-1 ring-white ${index === 0 ? "bg-emerald-50" : "bg-white/84"}`}>
                  <p className="mb-3 text-[13px] font-black text-slate-800">{item.title}</p>

                  <textarea
                    value={formData[item.key as keyof FormData]}
                    onChange={(event) => updateField(item.key as keyof FormData, event.target.value)}
                    onFocus={() => openLargeEditor(item.title, item.key as keyof FormData)}
                    placeholder={`${item.title} notu...`}
                    className="h-[95px] w-full resize-none rounded-xl border border-slate-200/70 bg-white/88 p-3 text-[12px] outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_330px]">
            <div className="rounded-[30px] bg-white/78 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
              <h2 className="text-[18px] font-black text-slate-950">Atamalar</h2>
              <p className="mt-1 text-[12px] text-slate-500">Mineral, organ, astroloji ve element alanları.</p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {assignmentSections.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setAssignmentTitle(item.title)}
                    className="flex w-full items-center justify-between rounded-2xl bg-white/86 px-4 py-3 text-left ring-1 ring-slate-100 transition hover:bg-cyan-50 hover:ring-cyan-100"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-lg">{item.icon}</span>
                      <span>
                        <span className="block text-[13px] font-black text-slate-700">{item.title}</span>
                        <span className="block text-[11px] font-medium text-slate-400">Düzenle / ekle</span>
                      </span>
                    </span>
                    <span className="text-slate-400">→</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] bg-white/78 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.045)] ring-1 ring-white">
              <h2 className="text-[18px] font-black text-slate-950">Çakra Atama</h2>
              <p className="mt-1 text-[12px] text-slate-500">Desktop’taki checkbox yapısının web karşılığı.</p>

              <div className="mt-4 grid grid-cols-1 gap-2.5">
                {chakraOptions.map((chakra) => (
                  <label key={chakra} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/86 px-4 py-3 ring-1 ring-slate-100 transition hover:bg-cyan-50">
                    <input
                      type="checkbox"
                      checked={selectedChakras.includes(chakra)}
                      onChange={() => toggleChakra(chakra)}
                      className="h-4 w-4 accent-cyan-600"
                    />
                    <span className="text-[13px] font-bold text-slate-700">{chakra}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/70 bg-white/80 px-6 py-4 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4">
          <p className="text-[12px] font-bold text-slate-500">
            Değişiklikleri kaydetmeden çıkarsanız bu sayfadaki taslak bilgiler kaybolabilir.
          </p>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleClear} className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50">
              Temizle
            </button>

            <button type="button" onClick={handleCancel} className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50">
              İptal
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-2xl bg-slate-950 px-7 py-3 text-[13px] font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.13)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </div>

      {largeEditorTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm">
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
              className="min-h-0 flex-1 resize-none rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-[15px] font-medium leading-7 text-slate-700 outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeLargeEditor} className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                İptal
              </button>

              <button type="button" onClick={saveLargeEditor} className="rounded-2xl bg-slate-950 px-6 py-3 text-[13px] font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.13)] transition hover:bg-slate-800">
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm">
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
                    <label className="mb-1.5 block text-[12px] font-black text-slate-600">{field}</label>
                    <input
                      type="text"
                      value={(assignmentInputs[activeAssignment.title] || [])[index] || ""}
                      onChange={(event) => updateAssignmentInput(activeAssignment.title, index, event.target.value)}
                      placeholder={`${field} yaz...`}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 text-[14px] font-medium outline-none focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
                    />
                  </div>
                ))}
              </div>

              <button type="button" onClick={addAssignmentRow} className="self-end rounded-2xl bg-slate-950 px-5 py-3 text-[13px] font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.13)] transition hover:bg-slate-800">
                Satır Ekle
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
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
                      className={activeAssignment.fields.length === 2 ? "grid grid-cols-[1fr_120px_90px] items-center rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-slate-700 ring-1 ring-slate-100" : "grid grid-cols-[1fr_90px] items-center rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-slate-700 ring-1 ring-slate-100"}
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

              <button type="button" onClick={closeAssignment} className="rounded-2xl bg-slate-950 px-6 py-3 text-[13px] font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.13)] transition hover:bg-slate-800">
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

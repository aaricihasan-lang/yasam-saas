"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { DuplicateWarningModal } from "@/app/dogaltas/components/DuplicateWarningModal";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { createStone, checkDuplicate } from "@/lib/dogaltas/dogaltasApi";
import { parseMineralPercent } from "@/lib/dogaltas/mineralPercent";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";
import {
  DOGALTAS_INPUT_CLASS,
  DOGALTAS_LABEL_CLASS,
  DOGALTAS_TEXTAREA_CLASS,
} from "@/lib/dogaltas/formStyles";
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
    key: "physical_effects",
    icon: "🫀",
    accent: "cyan",
  },
  {
    key: "spiritual_effects",
    icon: "✨",
    accent: "violet",
  },
  {
    key: "other_effects",
    icon: "📝",
    accent: "orange",
  },
];

const usageSections = [
  { key: "feng_shui" },
  { key: "meditation" },
  { key: "care" },
  { key: "application" },
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
  "rounded-[32px] border-[3px] border-emerald-400/70 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 bg-white/55 shadow-[0_0_35px_rgba(34,211,238,0.25)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]";
const uiInput = DOGALTAS_INPUT_CLASS;
const uiTextarea = DOGALTAS_TEXTAREA_CLASS;
const uiLabel = DOGALTAS_LABEL_CLASS;
const uiPanel =
  "rounded-3xl border-2 border-emerald-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 shadow-md transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1";
const uiBtn =
  "inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-black transition";

/**
 * Doğrudan yazılabilen textarea + isteğe bağlı "geniş ekran" butonu.
 * Eskiden alanlar focus'ta beklenmedik bir modal açıyordu (sezgisiz); artık
 * kullanıcı yerinde yazar, geniş düzen yalnızca ⤢ butonuna basınca açılır.
 */
function ExpandableTextarea({
  value,
  onChange,
  onExpand,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onExpand: () => void;
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations("stones.records");
  return (
    <div className={`relative ${className}`}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${uiTextarea} pr-12`}
      />
      <button
        type="button"
        onClick={onExpand}
        title={t("expand.editWide")}
        aria-label={t("expand.editWide")}
        className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/60 bg-white/95 text-base font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-900"
      >
        ⤢
      </button>
    </div>
  );
}

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

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/**
 * FAZ-2C: Kabul edilebilir görsel dosyası mı?
 * - MIME tipi varsa `image/` ile başlamalı.
 * - MIME tipi BOŞSA (bazı Android picker'ları geçerli görsel için boş `type` döner)
 *   dosya uzantısına bakılır → geçerli görseller sessizce elenmez.
 * - MIME ve uzantı ikisi de görsel değilse reddedilir.
 */
function isAcceptableImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith("image/");
  return IMAGE_EXTENSION_RE.test(file.name);
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
  const t = useTranslations("stones.records");
  // Facet display: value KANONİK Türkçe kalır (chakras[]/warning_tags[] yazımı + filtre
  // canonical'da); yalnız görünen etiket localize edilir. Anahtar eksikse canonical'a düşer.
  const tf = useTranslations("stones");
  const tc = useTranslations("stones.common");
  const facet = (v: string) => (tf.has(`facetLabels.${v}`) ? tf(`facetLabels.${v}`) : v);
  // Atama (assignments) display: section title/desc/field görünen etiketleri localize;
  // KANONİK Türkçe title `assignments` DB object key + `=== "Mineraller"` mantığı DEĞİŞMEZ.
  const asgLabel = (v: string) => (tf.has(`assignmentLabels.${v}`) ? tf(`assignmentLabels.${v}`) : v);
  const asgDesc = (v: string) => (tf.has(`assignmentDesc.${v}`) ? tf(`assignmentDesc.${v}`) : v);
  const asgField = (v: string) => (tf.has(`assignmentFields.${v}`) ? tf(`assignmentFields.${v}`) : v);
  // Alan-özel placeholder (ör. "Oran %" → doğal "Enter percentage…"); yoksa jenerik
  // "{field} yaz…"/"Write {field}…" fallback. KANONİK alan anahtarı (v) değişmez.
  const asgFieldPh = (v: string) =>
    tf.has(`assignmentFieldPlaceholders.${v}`)
      ? tf(`assignmentFieldPlaceholders.${v}`)
      : t("placeholderWrite", { field: asgField(v) });
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
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  // Modül-bazlı çift kayıt uyarısı (DT-P1-1)
  const [dupModal, setDupModal] = useState<{ label: string; id: string } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<UploadedImage | null>(null);
  // FAZ-5H: tek aktif fotoğraf kaldırma; çift istek/çift dokunuş engeli + buton busy görünümü.
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  // FAZ-5B: explicit tetikleme — implicit label yerine ref.click() (mobil picker güvenilirliği).
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeAssignment = assignmentSections.find((item) => item.title === assignmentTitle);

  // F-017: kaydedilmemiş değişiklik koruması. Form açık ve girilmiş veri varsa
  // (kaydetme sırasında hariç), sekme yenileme/kapatma öncesi tarayıcı uyarısı verilir.
  // Next 16 App Router iç-navigasyonu için monkey-patch YAPILMAZ (güvenilir değil);
  // yalnız native beforeunload ile refresh/close korunur.
  const isDirty = useMemo(() => {
    if (!showForm || isSaving) return false;
    return (
      JSON.stringify(formData) !== JSON.stringify(emptyFormData) ||
      selectedChakras.length > 0 ||
      selectedWarnings.length > 0 ||
      images.length > 0 ||
      JSON.stringify(assignmentRows) !== JSON.stringify(emptyAssignmentRows) ||
      JSON.stringify(assignmentInputs) !== JSON.stringify(emptyAssignmentInputs)
    );
  }, [showForm, isSaving, formData, selectedChakras, selectedWarnings, images, assignmentRows, assignmentInputs]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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

  /**
   * "Kaydet": input'ta bekleyen değeri (varsa) gerçekten satır olarak ekler,
   * sonra modalı kapatır. addAssignmentRow boş input'ta no-op olduğu için
   * bekleyen değer yoksa yalnızca kapatır. (İptal/× yalnızca kapatır.)
   */
  function saveAssignmentAndClose() {
    addAssignmentRow();
    closeAssignment();
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

    // Mineraller: oran (2. sütun) 0..100 olmalı; boş serbest (DT-P0-4).
    let rowToStore = values;
    if (sectionTitle === "Mineraller") {
      const parsed = parseMineralPercent(values[1]);
      if (!parsed.ok) {
        // Yalnız DISPLAY localize; validation davranışı (parsed.ok) locale-bağımsız.
        showError(tf("validation.mineralPercentInvalid"));
        return;
      }
      rowToStore = values.map((value, index) => (index === 1 ? parsed.value : value));
    }

    setAssignmentRows((prev) => ({
      ...prev,
      [sectionTitle]: [...(prev[sectionTitle] || []), rowToStore],
    }));

    setAssignmentInputs((prev) => ({
      ...prev,
      [sectionTitle]: activeAssignment.fields.map(() => ""),
    }));
  }

  async function deleteAssignmentRow(sectionTitle: string, index: number) {
    // FAZ-1: Form satırı (organ/mineral vb.) silmede yanlışlıkla kayıp koruması.
    // Ortak useDeleteConfirm: masaüstü tek açıklayıcı onay, mobil/PWA 2 aşamalı onay.
    // Silinecek satır değeri (organ/mineral adı) onay metninde açıkça gösterilir.
    const row = (assignmentRows[sectionTitle] || [])[index] || [];
    const label = row.filter((v) => v && v.trim()).join(" • ") || t("assignRow.rowFallback", { section: asgLabel(sectionTitle) });
    const confirmed = await deleteConfirm({
      title: t("assignRow.deleteTitle", { section: asgLabel(sectionTitle) }),
      message: t("assignRow.deleteMessage", { label }),
      secondMessage: t("assignRow.deleteSecondMessage", { label }),
    });
    if (!confirmed) return;
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
    // FAZ-2C: input referansı async işlemlerden ÖNCE yerel değişkene alınır ve hemen
    // sıfırlanır (aynı dosya tekrar seçilebilsin; event güvenli kullanılsın).
    const input = event.target;
    const selected = Array.from(input.files || []);
    input.value = "";
    // Boş MIME'li (Android) geçerli görseller elenmesin; görsel olmayanlar reddedilsin.
    const files = selected.filter(isAcceptableImageFile);
    if (files.length === 0) {
      if (selected.length > 0) showError(t("toasts.onlyImages"));
      return;
    }

    const uploaded: UploadedImage[] = [];
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();

    for (const file of files) {
      // F-016: yükleme SUNUCU-YETKİLİ route üzerinden — client-direct storage bypass yok.
      // Path + tip/boyut doğrulaması server'da; tenant oturumdan türetilir.
      const compressed = await compressImageFileToWebp(file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("name", file.name);

      const res = await fetch("/api/dogaltas/stones/photos", {
        method: "POST",
        headers: {
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean; demo?: boolean;
        image?: { id: string; name: string; file_path: string };
        previewUrl?: string | null;
      };

      if (json.demo) { showMessage(t("toasts.demoNoUpload")); return; }
      if (!res.ok || !json.ok || !json.image) {
        // FAZ-2B: Ham backend hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
        console.error("[dogaltas-kayit] görsel yükleme hatası:", `HTTP ${res.status}`);
        showError(t("toasts.imageUploadFailed"));
        return;
      }

      // F-016: DB source-of-truth = file_path. `url` yalnız OTURUM önizlemesi (kısa ömürlü
      // signed previewUrl); kaydederken SIYRILIR (persist edilmez) → kalıcı public URL yok.
      uploaded.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: json.image.name || file.name,
        url: json.previewUrl ?? "",
        file_path: json.image.file_path,
      });
    }

    setImages((prev) => [...prev, ...uploaded]);
    showMessage(t("toasts.imagesUploaded", { count: uploaded.length }));
  }

  async function removeImage(id: string) {
    // FAZ-5H: tek aktif kaldırma — devam eden işlem varken yeni istek başlatma.
    if (removingImageId) return;
    const image = images.find((img) => img.id === id);
    if (!image) return;

    // Onaydan ÖNCE Storage çağrısı ve state değişikliği yok.
    const confirmed = await deleteConfirm({
      title: t("photoConfirm.title"),
      message: t("photoConfirm.message"),
      secondMessage: t("photoConfirm.secondMessage"),
      confirmText: t("photoConfirm.confirm"),
      cancelText: t("photoConfirm.cancel"),
      secondConfirmText: t("photoConfirm.confirm"),
    });
    if (!confirmed) return;

    // Path elle türetilmez; yalnız state'teki file_path kullanılır. Yoksa Storage'a dokunma.
    if (!image.file_path) {
      console.error("[dogaltas-kayit] fotoğraf kaldırma: file_path yok", image.id);
      showError(t("toasts.photoRemoveFailed"));
      return;
    }

    setRemovingImageId(id);
    try {
      // F-016: silme SUNUCU-YETKİLİ route üzerinden — ownership (tenant öneki) server'da doğrulanır.
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch("/api/dogaltas/stones/photos", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ file_path: image.file_path }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; demo?: boolean };
      if (!res.ok || (!json.ok && !json.demo)) {
        // FAZ-5H: ham backend hatası kullanıcıya gösterilmez; fotoğraf önizlemede kalır.
        console.error("[dogaltas-kayit] fotoğraf kaldırma hatası:", `HTTP ${res.status}`);
        showError(t("toasts.photoRemoveFailed"));
        return;
      }
      setImages((prev) => prev.filter((img) => img.id !== id));
      showMessage(t("toasts.photoRemoved"));
    } finally {
      setRemovingImageId(null);
    }
  }

  async function handleSave(forceCreate = false) {
    if (!formData.stone_name.trim()) {
      showError(t("toasts.stoneNameRequired"));
      return;
    }

    // Modül-bazlı çift kayıt kontrolü (yalnız ilk denemede; çift-tık koruması).
    if (!forceCreate) {
      if (dupChecking || dupModal || isSaving) return;
      setDupChecking(true);
      const dup = await checkDuplicate("stone", formData.stone_name);
      setDupChecking(false);
      if (dup.ok && dup.exists && dup.match) {
        setDupModal({ label: dup.match.label, id: dup.match.id });
        return;
      }
    }

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      showError(tc("workspaceUnavailable"));
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
      // F-016: yalnız file_path persist edilir (canonical). Kısa ömürlü signed preview url
      // KAYDEDİLMEZ → DB'de kalıcı public/expired URL kalmaz.
      images: images.map((image) => ({
        id: image.id,
        name: image.name,
        file_path: image.file_path,
      })),
      updated_at: new Date().toISOString(),
    };

    const { ok, error } = await createStone(payload);

    setIsSaving(false);

    if (!ok) {
      // FAZ-2B: Ham backend/API hatası kullanıcıya gösterilmez; yalnız geliştirici logunda.
      console.error("[dogaltas-kayit] kayıt hatası:", error);
      showError(t("toasts.saveFailed"));
      showToast({
        type: "error",
        title: t("toasts.saveFailedTitle"),
        message: t("toasts.saveFailed"),
      });
      return;
    }

    setFormData(() => ({ ...emptyFormData }));
    setSelectedChakras([]);
    setSelectedWarnings([]);
    setAssignmentRows(emptyAssignmentRows);
    setAssignmentInputs(emptyAssignmentInputs);
    setImages([]);
    setPreviewImage(null);
    // Toast provider seviyesinde render edilir → form kapanıp intro'ya dönülse de
    // 4 sn boyunca görünür kalır (inline savedMessage'a bağımlı değil).
    showToast({
      type: "success",
      title: t("toasts.savedTitle"),
      message: t("toasts.savedMessage"),
    });
    setShowForm(false);
  }

  function handleClear() {
    setFormData(emptyFormData);
    setSelectedChakras([]);
    setSelectedWarnings([]);
    setAssignmentRows(emptyAssignmentRows);
    setAssignmentInputs(emptyAssignmentInputs);
    setImages([]);
    showMessage(t("toasts.formCleared"));
  }

  function handleCancel() {
    window.location.href = "/dogaltas";
  }

  return (
    <DogaltasSectionShell
      eyebrow={t("shell.eyebrow")}
      title={t("shell.title")}
      subtitle={t("shell.subtitle")}
      icon="💎"
      contentClassName="mt-4 pb-40 sm:pb-24"
      actions={
        <>
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
          {/* FAZ-2A: Form kapalıyken tek giriş noktası intro CTA'dır; header butonu
              yalnızca form açıkken "Formu Kapat" olarak görünür (kapatmak veriyi silmez). */}
          {showForm && (
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-soft"
            >
              {t("actions.closeForm")}
            </button>
          )}
        </>
      }
    >
      <BfcacheRefreshHandler />
      <div className="relative w-full">

        {!showForm && (
          <div className="rounded-[24px] border-[3px] border-emerald-300/40 bg-white/65 shadow-[0_0_40px_rgba(6,182,212,0.10)] backdrop-blur-xl flex flex-col items-center gap-4 py-14 text-center">
            <span className="text-5xl">💎</span>
            <div>
              <h2 className="text-lg font-black text-slate-800">{t("intro.title")}</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                {t("intro.description")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="btn-primary"
              >
                {t("intro.createCta")}
              </button>
              <a
                href="/dogaltas/dogaltas-listesi"
                className="btn-soft"
              >
                {t("intro.listCta")}
              </a>
            </div>
          </div>
        )}

        {showForm && <section className="space-y-4">
          <div className={`${uiCard} p-4`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-lg ring-1 ring-emerald-100">
                  💎
                </span>
                <div>
                <h2 className="text-base font-black tracking-wide text-slate-950">{t("basic.title")}</h2>
                <p className="mt-0.5 text-slate-500">
                  {t("basic.desc")}
                </p>
                </div>
              </div>

              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-black text-emerald-700">
                {t("basic.badge")}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div>
                  <label className={uiLabel}>
                    {t("fields.stoneName")}
                  </label>
                  <input
                    type="text"
                    value={formData.stone_name}
                    onChange={(event) => updateField("stone_name", event.target.value)}
                    placeholder={t("fields.stoneNamePlaceholder")}
                    className={uiInput}
                  />
                </div>

                <div>
                  <label className={uiLabel}>
                    {t("fields.shortDescription")}{" "}
                    <span className="font-semibold text-slate-400">{t("fields.optional")}</span>
                  </label>

                  <ExpandableTextarea
                    value={formData.short_description}
                    onChange={(value) => updateField("short_description", value)}
                    onExpand={() => openLargeEditor(t("fields.shortDescription"), "short_description")}
                    placeholder={t("fields.shortDescriptionPlaceholder")}
                  />
                </div>
              </div>

              <div>
                <label className={uiLabel}>
                  {t("image.areaLabel")}
                </label>

                <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-violet-50/80 p-4 text-center shadow-md">
                  <div className="flex min-h-[200px] flex-col items-center justify-center">
                    <div className="text-4xl">💎</div>
                    <p className="mt-2 text-base font-black text-slate-800">
                      {t("image.addMultiple")}
                    </p>
                    <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-slate-500">
                      {t("image.hint")}
                    </p>

                    {/* FAZ-5B: explicit ref.click() ile iki açık seçenek — implicit label kaldırıldı.
                        Galeri (multiple, capture yok) ve Kamera (capture=environment, multiple yok)
                        aynı handleImageUpload'ı kullanır. */}
                    {/* Bakım kararı: mobilde (<768px) fotoğraf ekleme/çekme gizli; masaüstünde korunur. */}
                    <div className="hidden md:contents">
                    <div className="mt-3 flex w-full max-w-[320px] flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className={`${uiBtn} min-h-[44px] flex-1 cursor-pointer bg-gradient-to-r from-emerald-500 to-violet-600 text-white shadow-lg hover:brightness-110`}
                      >
                        {t("image.pickFromGallery")}
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className={`${uiBtn} min-h-[44px] flex-1 cursor-pointer bg-gradient-to-r from-emerald-500 to-violet-600 text-white shadow-lg hover:brightness-110`}
                      >
                        {t("image.takePhoto")}
                      </button>
                    </div>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      aria-label={t("image.pickFromGalleryAria")}
                      className="sr-only"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      aria-label={t("image.takePhotoAria")}
                      className="sr-only"
                    />
                    </div>
                  </div>

                  {images.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {images.map((image) => (
                        <div key={image.id} className="group relative overflow-hidden rounded-2xl border-2 border-emerald-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 shadow-sm">
                          <button type="button" onClick={() => setPreviewImage(image)} className="block h-24 w-full">
                            <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void removeImage(image.id)}
                            disabled={removingImageId === image.id}
                            aria-label={t("image.removePhotoAria")}
                            className="absolute right-1.5 top-1.5 hidden h-11 w-11 items-center justify-center rounded-full bg-slate-950/80 text-sm font-black text-white transition disabled:opacity-60 sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 md:flex"
                          >
                            {removingImageId === image.id ? "⋯" : "×"}
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
                <h2 className="text-base font-black tracking-wide text-slate-950">{t("general.title")}</h2>
                <p className="mt-0.5 text-slate-500">
                  {t("general.desc")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[
                { key: "general_info" as keyof FormData },
                { key: "source_note" as keyof FormData },
              ].map((item) => {
                const title = t(`general.${item.key}`);
                return (
                <div key={item.key}>
                  <label className={uiLabel}>
                    {title}
                  </label>

                  <ExpandableTextarea
                    value={formData[item.key]}
                    onChange={(value) => updateField(item.key, value)}
                    onExpand={() => openLargeEditor(title, item.key)}
                    placeholder={t("placeholderWrite", { field: title })}
                  />
                </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {effectSections.map((section) => (
              <div
                key={section.key}
                className={`${uiCard} flex min-h-[160px] flex-col border-l-[8px] p-4 ${
                  section.accent === "cyan"
                    ? "border-l-emerald-500"
                    : section.accent === "violet"
                      ? "border-l-violet-500"
                      : "border-l-orange-500"
                }`}
              >
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base ring-1 ${
                      section.accent === "cyan"
                        ? "bg-emerald-50 ring-emerald-100"
                        : section.accent === "violet"
                          ? "bg-violet-50 ring-violet-100"
                          : "bg-orange-50 ring-orange-100"
                    }`}
                  >
                    {section.icon}
                  </span>
                  <div>
                    <h3 className="text-base font-black tracking-wide text-slate-950">{t(`effects.${section.key}.title`)}</h3>
                    <p className="mt-0.5 text-slate-500">{t(`effects.${section.key}.desc`)}</p>
                  </div>
                </div>

                <ExpandableTextarea
                  value={formData[section.key as keyof FormData]}
                  onChange={(value) => updateField(section.key as keyof FormData, value)}
                  onExpand={() => openLargeEditor(t(`effects.${section.key}.title`), section.key as keyof FormData)}
                  placeholder={t("placeholderWrite", { field: t(`effects.${section.key}.title`) })}
                  className="mt-auto"
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
                  <h2 className="text-base font-black tracking-wide text-slate-950">{t("advanced.title")}</h2>
                  <p className="mt-0.5 text-slate-500">{t("advanced.desc")}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-black text-slate-500 shadow-sm">
                {advancedOpen ? t("toggle.hide") : t("toggle.show")}
              </span>
            </button>

            {advancedOpen && (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
                  {usageSections.map((item) => (
                    <div key={item.key} className={`${uiPanel} p-4`}>
                      <p className="mb-2 text-[13px] font-bold text-slate-800">{t(`usage.${item.key}`)}</p>

                      <ExpandableTextarea
                        value={formData[item.key as keyof FormData]}
                        onChange={(value) => updateField(item.key as keyof FormData, value)}
                        onExpand={() => openLargeEditor(t(`usage.${item.key}`), item.key as keyof FormData)}
                        placeholder={t("placeholderNote", { field: t(`usage.${item.key}`) })}
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
                        <h3 className="text-sm font-black text-slate-950">{t("warnings.title")}</h3>
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-700/80">{t("warnings.integrationNote")}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
                      {t("warnings.clinicalBadge")}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                    <div>
                      <label className={uiLabel}>{t("warnings.textLabel")}</label>
                      <ExpandableTextarea
                        value={formData.warning_text}
                        onChange={(value) => updateField("warning_text", value)}
                        onExpand={() => openLargeEditor(t("warnings.largeEditorTitle"), "warning_text")}
                        placeholder={t("warnings.textPlaceholder")}
                      />
                    </div>

                    <div>
                      <label className={uiLabel}>{t("warnings.tagsLabel")}</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {warningTypes.map((warning) => (
                          <label key={warning} className={`${uiPanel} flex cursor-pointer items-center gap-2.5 px-3 py-2`}>
                            <input
                              type="checkbox"
                              checked={selectedWarnings.includes(warning)}
                              onChange={() => toggleWarning(warning)}
                              className="h-5 w-5 accent-rose-600"
                            />
                            <span className="text-[13px] font-bold text-slate-700">{facet(warning)}</span>
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
                  <h2 className="text-base font-black tracking-wide text-slate-950">{t("assignments.title")}</h2>
                  <p className="mt-0.5 text-slate-500">{t("assignments.desc")}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-black text-slate-500 shadow-sm">
                {assignmentsOpen ? t("toggle.hide") : t("toggle.show")}
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
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-base ring-1 ring-emerald-100">{item.icon}</span>
                      <span>
                        <span className="block text-[13px] font-bold text-slate-800">{asgLabel(item.title)}</span>
                        <span className="block text-xs text-slate-500">{t("assignments.editAdd")}</span>
                      </span>
                    </span>
                    <span className="text-lg font-black text-emerald-600">→</span>
                  </button>
                ))}

                <div className={`${uiPanel} md:col-span-2 p-4`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-base ring-1 ring-emerald-100">🌀</span>
                    <span className="text-[13px] font-bold text-slate-800">{t("assignments.chakraTitle")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
                    {chakraOptions.map((chakra) => (
                      <label key={chakra} className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200/60 bg-white/80 px-3 py-2 transition hover:bg-emerald-50">
                        <input
                          type="checkbox"
                          checked={selectedChakras.includes(chakra)}
                          onChange={() => toggleChakra(chakra)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span className="text-[12px] font-bold text-slate-700">{facet(chakra)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>}
      </div>

      {showForm && <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:px-8 2xl:px-10">
        {/* FAZ-2D: Mobilde birincil Kaydet tam genişlik ve belirgin; Temizle/İptal ikincil
            alt satırda. Masaüstünde mevcut tek satır düzen (Temizle · İptal · Kaydet) korunur.
            Safe-area alt boşluğu eklendi; dar ekranda yatay taşma/sıkışma yok. */}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden text-sm font-semibold text-slate-500 sm:block">
            {t("bottomBar.leaveWarning")}
          </p>

          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="flex gap-2 sm:gap-3">
              <button type="button" onClick={handleClear} className="btn-soft flex-1 sm:flex-none">
                {t("common.clear")}
              </button>

              <button type="button" onClick={handleCancel} className="btn-soft flex-1 sm:flex-none">
                {t("common.cancel")}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || dupChecking}
              className="btn-primary w-full sm:w-auto"
            >
              {dupChecking ? t("bottomBar.checking") : isSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>}

      <DuplicateWarningModal
        open={!!dupModal}
        label={dupModal?.label ?? ""}
        busy={isSaving}
        onOpenExisting={() => {
          if (dupModal) router.push(`/dogaltas/dogaltas-listesi/${dupModal.id}`);
        }}
        onCreateAnyway={() => {
          setDupModal(null);
          void handleSave(true);
        }}
        onCancel={() => setDupModal(null)}
      />

      {largeEditorTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-6 backdrop-blur-sm">
          <div className="flex h-[82vh] w-full max-w-[1040px] flex-col rounded-[30px] bg-white p-6 shadow-[0_35px_90px_rgba(15,23,42,0.22)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                  {t("largeEditor.badge")}
                </div>
                <h2 className="text-[26px] font-black text-slate-950">{largeEditorTitle}</h2>
                <p className="mt-1 text-[13px] text-slate-500">{t("largeEditor.subtitle")}</p>
              </div>

              <button type="button" onClick={closeLargeEditor} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200">
                ×
              </button>
            </div>

            <textarea
              value={largeEditorValue}
              onChange={(event) => setLargeEditorValue(event.target.value)}
              placeholder={t("largeEditor.placeholder")}
              className="min-h-0 flex-1 resize-none rounded-[24px] border-2 border-emerald-200 bg-white/90 p-5 text-[15px] font-medium leading-7 text-slate-700 shadow-inner outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeLargeEditor} className="btn-soft">
                {t("common.cancel")}
              </button>

              <button type="button" onClick={saveLargeEditor} className="btn-primary">
                {t("common.save")}
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
                  {t("assignModal.badge")}
                </div>
                <h2 className="text-[26px] font-black text-slate-950">{activeAssignment.icon} {asgLabel(activeAssignment.title)}</h2>
                <p className="mt-1 text-[13px] text-slate-500">{asgDesc(activeAssignment.title)}</p>
              </div>

              <button type="button" onClick={closeAssignment} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200">
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
              <div className={activeAssignment.fields.length === 2 ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
                {activeAssignment.fields.map((field, index) => (
                  <div key={field}>
                    <label className={uiLabel}>{asgField(field)}</label>
                    <input
                      type="text"
                      value={(assignmentInputs[activeAssignment.title] || [])[index] || ""}
                      onChange={(event) => updateAssignmentInput(activeAssignment.title, index, event.target.value)}
                      placeholder={asgFieldPh(field)}
                      className="h-12 w-full rounded-2xl border-2 border-emerald-200 bg-white/90 px-4 text-[14px] font-medium shadow-inner outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30"
                    />
                  </div>
                ))}
              </div>

              <button type="button" onClick={addAssignmentRow} className="btn-primary self-end">
                {t("assignModal.addRow")}
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-[24px] border-2 border-emerald-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 p-4">
              {/* FAZ-3A: İsim ve oran tek içerik sütununda (görsel ayrım rows'da "•" / mobilde alt satır). */}
              <div className="grid grid-cols-[1fr_90px] border-b border-slate-200 pb-3 text-[12px] font-black text-slate-500">
                <span>
                  {asgField(activeAssignment.fields[0])}
                  {activeAssignment.fields.length === 2 ? ` • ${asgField(activeAssignment.fields[1])}` : ""}
                </span>
                <span className="text-right">{t("assignModal.actionColumn")}</span>
              </div>

              <div className="mt-3 space-y-2">
                {(assignmentRows[activeAssignment.title] || []).length === 0 ? (
                  <div className="flex h-[210px] items-center justify-center text-center text-[13px] font-medium text-slate-400">
                    {t("assignModal.empty")}
                  </div>
                ) : (
                  (assignmentRows[activeAssignment.title] || []).map((row, rowIndex) => (
                    <div
                      key={`${activeAssignment.title}-${rowIndex}`}
                      className="grid grid-cols-[1fr_90px] items-center rounded-2xl bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-4 py-3 text-[13px] font-bold text-slate-700 ring-1 ring-emerald-200/60"
                    >
                      {/* FAZ-3A: "İsim • %Oran" (masaüstü tek satır, dar mobilde alt satır). Veri değişmez; % yalnız görüntü. */}
                      <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-1.5">
                        <span className="truncate">{row[0]}</span>
                        {activeAssignment.fields.length === 2 && row[1] ? (
                          <span className="text-emerald-700">
                            <span className="hidden sm:inline"> • </span>
                            {activeAssignment.title === "Mineraller" ? `%${row[1]}` : row[1]}
                          </span>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => void deleteAssignmentRow(activeAssignment.title, rowIndex)} className="btn-danger justify-self-end !rounded-xl !px-3 !py-1.5 !text-[11px]">
                        {t("common.delete")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeAssignment} className="btn-soft">
                {t("common.cancel")}
              </button>

              <button type="button" onClick={saveAssignmentAndClose} className="btn-primary">
                {t("common.save")}
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
    </DogaltasSectionShell>
  );
}

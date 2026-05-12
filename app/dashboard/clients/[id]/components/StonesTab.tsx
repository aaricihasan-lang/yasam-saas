"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const STONE_PHOTO_BUCKET = "stone-photos";

type ClientStone = {
  id: string;
  tenant_id: string;
  client_id: string;
  stone_name: string | null;
  stone_type: string | null;
  note: string | null;
  usage_area: string | null;
  combination_text: string | null;
  warning_text: string | null;
  other_notes: string | null;
  image_url: string | null;
  stone_date: string | null;
  created_at: string;
};

type StonePhoto = {
  id: string;
  tenant_id: string;
  client_id: string;
  stone_id: string;
  image_url: string;
  file_path: string;
  created_at: string;
};

type StonesTabProps = {
  clientId: string;
};

type StoneFormState = {
  stoneName: string;
  stoneType: string;
  note: string;
  usageArea: string;
  combinationText: string;
  warningText: string;
  otherNotes: string;
  stoneDate: string;
};

const emptyForm: StoneFormState = {
  stoneName: "",
  stoneType: "",
  note: "",
  usageArea: "",
  combinationText: "",
  warningText: "",
  otherNotes: "",
  stoneDate: "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function isFormEmpty(form: StoneFormState, selectedFilesCount = 0) {
  return (
    selectedFilesCount === 0 &&
    !form.stoneName.trim() &&
    !form.stoneType.trim() &&
    !form.note.trim() &&
    !form.usageArea.trim() &&
    !form.combinationText.trim() &&
    !form.warningText.trim() &&
    !form.otherNotes.trim() &&
    !form.stoneDate.trim()
  );
}

function formToPayload(form: StoneFormState) {
  return {
    stone_name: form.stoneName.trim(),
    stone_type: form.stoneType.trim(),
    note: form.note.trim(),
    usage_area: form.usageArea.trim(),
    combination_text: form.combinationText.trim(),
    warning_text: form.warningText.trim(),
    other_notes: form.otherNotes.trim(),
    stone_date: form.stoneDate || null,
  };
}

function stoneToForm(stone: ClientStone): StoneFormState {
  return {
    stoneName: stone.stone_name || "",
    stoneType: stone.stone_type || "",
    note: stone.note || "",
    usageArea: stone.usage_area || "",
    combinationText: stone.combination_text || "",
    warningText: stone.warning_text || "",
    otherNotes: stone.other_notes || "",
    stoneDate: stone.stone_date || "",
  };
}

function formatDate(date: string | null) {
  if (!date) return "Tarih belirtilmedi";

  return new Date(date).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function inputClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const focus =
    tone === "emerald"
      ? "focus:border-emerald-400 focus:ring-emerald-100"
      : tone === "blue"
        ? "focus:border-blue-400 focus:ring-blue-100"
        : tone === "violet"
          ? "focus:border-violet-400 focus:ring-violet-100"
          : tone === "amber"
            ? "focus:border-amber-400 focus:ring-amber-100"
            : tone === "rose"
              ? "focus:border-rose-400 focus:ring-rose-100"
              : "focus:border-slate-400 focus:ring-slate-100";

  return `w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${focus}`;
}

function boxClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "rounded-2xl border p-4 shadow-sm transition hover:shadow-md";

  if (tone === "emerald") return `${base} border-emerald-200 bg-emerald-50/60`;
  if (tone === "blue") return `${base} border-blue-200 bg-blue-50/60`;
  if (tone === "violet") return `${base} border-violet-200 bg-violet-50/60`;
  if (tone === "amber") return `${base} border-amber-200 bg-amber-50/70`;
  if (tone === "rose") return `${base} border-rose-200 bg-rose-50/70`;
  return `${base} border-slate-200 bg-white`;
}

function SectionLabel({
  icon,
  title,
  tone = "emerald",
}: {
  icon: string;
  title: string;
  tone?: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : tone === "slate"
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <label className="mb-1.5 flex items-center gap-2 text-xs font-black text-slate-900">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-xl border text-sm shadow-sm ${toneClass}`}
      >
        {icon}
      </span>
      {title}
    </label>
  );
}

function DetailBlock({
  title,
  value,
  tone = "slate",
  icon = "◆",
}: {
  title: string;
  value: string | null;
  tone?: "slate" | "emerald" | "amber" | "rose" | "violet" | "blue";
  icon?: string;
}) {
  if (!value) return null;

  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : tone === "violet"
            ? "border-violet-200 bg-violet-50 text-violet-950"
            : tone === "blue"
              ? "border-blue-200 bg-blue-50 text-blue-950"
              : "border-slate-200 bg-white text-slate-800";

  const iconClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : tone === "rose"
          ? "bg-rose-100 text-rose-700"
          : tone === "violet"
            ? "bg-violet-100 text-violet-700"
            : tone === "blue"
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-700";

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneClass}`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-xl text-sm font-black ${iconClass}`}
        >
          {icon}
        </span>
        <div className="text-sm font-black text-slate-950">{title}</div>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-5">{value}</div>
    </div>
  );
}

type FormFieldsProps = {
  data: StoneFormState;
  onChange: <K extends keyof StoneFormState>(
    key: K,
    value: StoneFormState[K]
  ) => void;
};

function FormFields({ data, onChange }: FormFieldsProps) {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        <div className={boxClass("emerald")}>
          <SectionLabel icon="💎" title="Taş Adı" tone="emerald" />
          <input
            value={data.stoneName}
            onChange={(e) => onChange("stoneName", e.target.value)}
            placeholder="Örn: Ametist, Şungit, Pirit"
            className={inputClass("emerald")}
          />
        </div>

        <div className={boxClass("blue")}>
          <SectionLabel icon="📿" title="Kullanım / Tür" tone="blue" />
          <input
            value={data.stoneType}
            onChange={(e) => onChange("stoneType", e.target.value)}
            placeholder="Kolye, bileklik, cep taşı..."
            className={inputClass("blue")}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="📅" title="Tarih" tone="violet" />
          <input
            type="date"
            value={data.stoneDate}
            onChange={(e) => onChange("stoneDate", e.target.value)}
            className={inputClass("violet")}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className={boxClass("emerald")}>
          <SectionLabel icon="📋" title="Kullanım Detayı" tone="emerald" />
          <textarea
            value={data.usageArea}
            onChange={(e) => onChange("usageArea", e.target.value)}
            placeholder="Nasıl kullanılacak? Süre, bölge, yöntem..."
            rows={3}
            className={`${inputClass("emerald")} resize-none leading-5`}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="🧩" title="Kombin" tone="violet" />
          <textarea
            value={data.combinationText}
            onChange={(e) => onChange("combinationText", e.target.value)}
            placeholder="Birlikte verilen taşlar veya kombin mantığı..."
            rows={3}
            className={`${inputClass("violet")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className={boxClass("amber")}>
          <SectionLabel icon="⚠️" title="Uyarı" tone="amber" />
          <textarea
            value={data.warningText}
            onChange={(e) => onChange("warningText", e.target.value)}
            placeholder="Suyla temas, gece kullanımı, hassasiyet vb."
            rows={3}
            className={`${inputClass("amber")} resize-none leading-5`}
          />
        </div>

        <div className={boxClass("blue")}>
          <SectionLabel icon="ℹ️" title="Diğer" tone="blue" />
          <textarea
            value={data.otherNotes}
            onChange={(e) => onChange("otherNotes", e.target.value)}
            placeholder="Serbest alan..."
            rows={3}
            className={`${inputClass("blue")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className={`mt-3 ${boxClass("emerald")}`}>
        <SectionLabel icon="📝" title="Genel Not" tone="emerald" />
        <textarea
          value={data.note}
          onChange={(e) => onChange("note", e.target.value)}
          placeholder="Taşla ilgili genel öneri, takip notu, seans yorumu..."
          rows={3}
          className={`${inputClass("emerald")} resize-none leading-5`}
        />
      </div>
    </>
  );
}

type CreatePhotoPickerProps = {
  selectedFiles: File[];
  selectedPreviews: string[];
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onRemove: (index: number) => void;
};

function CreatePhotoPicker({
  selectedFiles,
  selectedPreviews,
  onSelect,
  onClear,
  onRemove,
}: CreatePhotoPickerProps) {
  return (
    <div className={`mt-3 ${boxClass("rose")}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SectionLabel icon="📷" title="Fotoğraflar" tone="rose" />

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-rose-200 bg-white px-2 py-1 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-50">
            Bilgisayardan Foto Seç
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={onSelect}
            />
          </label>

          {selectedFiles.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-2xl border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              Seçimi Temizle
            </button>
          )}
        </div>
      </div>

      {selectedPreviews.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-rose-200 bg-white/70 p-3 text-xs font-semibold text-slate-400">
          Taşı kaydetmeden önce bilgisayardan birden fazla fotoğraf seçebilirsin.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7">
          {selectedPreviews.map((preview, index) => (
            <div
              key={preview}
              className="relative overflow-hidden rounded-2xl border border-white bg-white shadow-sm"
            >
              <img
                src={preview}
                alt={`Seçilen fotoğraf ${index + 1}`}
                className="h-20 w-full object-cover"
              />

              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-2 top-2 rounded-full bg-red-600/90 px-2 py-1 text-[10px] font-black text-white shadow-sm"
              >
                Sil
              </button>

              <div className="truncate px-2 py-1 text-[10px] font-bold text-slate-500">
                {selectedFiles[index]?.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PhotoGalleryProps = {
  stone: ClientStone;
  stonePhotos: StonePhoto[];
  uploadingStoneId: string | null;
  deletingPhotoId: string | null;
  onUpload: (stoneId: string, event: ChangeEvent<HTMLInputElement>) => void;
  onDeletePhoto: (photo: StonePhoto) => void;
  onSelectPhoto: (photo: StonePhoto) => void;
};

function PhotoGallery({
  stone,
  stonePhotos,
  uploadingStoneId,
  deletingPhotoId,
  onUpload,
  onDeletePhoto,
  onSelectPhoto,
}: PhotoGalleryProps) {
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">
            📷 Taş Fotoğrafları
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {stonePhotos.length} fotoğraf kayıtlı
          </div>
        </div>

        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">
          {uploadingStoneId === stone.id ? "Yükleniyor..." : "Fotoğraf Ekle"}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            disabled={uploadingStoneId === stone.id}
            onChange={(event) => onUpload(stone.id, event)}
          />
        </label>
      </div>

      {stonePhotos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-4 text-sm font-semibold text-slate-400">
          Henüz fotoğraf eklenmemiş. “Fotoğraf Ekle” ile sonradan da fotoğraf
          ekleyebilirsin.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {stonePhotos.map((photo) => (
            <div
              key={photo.id}
              className="group relative overflow-hidden rounded-2xl border border-white bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => onSelectPhoto(photo)}
                className="block h-20 w-full overflow-hidden"
              >
                <img
                  src={photo.image_url}
                  alt={stone.stone_name || "Taş fotoğrafı"}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </button>

              <button
                type="button"
                onClick={() => onDeletePhoto(photo)}
                disabled={deletingPhotoId === photo.id}
                className="absolute right-2 top-2 rounded-full bg-red-600/90 px-2 py-1 text-[10px] font-black text-white opacity-0 shadow-sm transition group-hover:opacity-100 disabled:opacity-50"
              >
                {deletingPhotoId === photo.id ? "..." : "Sil"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StonesTab({ clientId }: StonesTabProps) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [stones, setStones] = useState<ClientStone[]>([]);
  const [photos, setPhotos] = useState<StonePhoto[]>([]);

  const [form, setForm] = useState<StoneFormState>({
    ...emptyForm,
    stoneDate: todayISO(),
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StoneFormState>(emptyForm);

  const [lightboxPhotos, setLightboxPhotos] = useState<StonePhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploadingStoneId, setUploadingStoneId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const photosByStoneId = useMemo(() => {
    const grouped: Record<string, StonePhoto[]> = {};

    photos.forEach((photo) => {
      if (!grouped[photo.stone_id]) {
        grouped[photo.stone_id] = [];
      }

      grouped[photo.stone_id].push(photo);
    });

    return grouped;
  }, [photos]);

  const totalWithPhoto = useMemo(() => {
    return Object.values(photosByStoneId).filter((items) => items.length > 0)
      .length;
  }, [photosByStoneId]);

  function updateFormField<K extends keyof StoneFormState>(
    key: K,
    value: StoneFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditField<K extends keyof StoneFormState>(
    key: K,
    value: StoneFormState[K]
  ) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  function clearSelectedFiles() {
    selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setSelectedPreviews([]);
  }

  function handleCreatePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      showToast({
        title: "İşlem başarısız",
        message: "Sadece fotoğraf dosyası seçebilirsin.",
        type: "error",
      });
    }

    selectedPreviews.forEach((url) => URL.revokeObjectURL(url));

    setSelectedFiles(imageFiles);
    setSelectedPreviews(imageFiles.map((file) => URL.createObjectURL(file)));
  }

  function removeSelectedFile(index: number) {
    URL.revokeObjectURL(selectedPreviews[index]);

    setSelectedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setSelectedPreviews((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function loadStones() {
    if (!clientId) return;

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("client_stones")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId)
      .order("stone_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Taş kayıtları yüklenemedi:", error);
      setErrorMessage("Taş kayıtları yüklenemedi: " + error.message);
      setLoading(false);
      return;
    }

    setStones(data || []);
    setLoading(false);
  }

  async function loadPhotos() {
    if (!clientId) return;

    setPhotosLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("client_stone_photos")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Taş fotoğrafları yüklenemedi:", error);
      setErrorMessage("Taş fotoğrafları yüklenemedi: " + error.message);
      setPhotosLoading(false);
      return;
    }

    setPhotos(data || []);
    setPhotosLoading(false);
  }

  async function refreshAll() {
    await loadStones();
    await loadPhotos();
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    return () => {
      selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedPreviews]);

  async function uploadFilesForStone(stoneId: string, files: File[]) {
    for (const file of files) {
      const cleanName = safeFileName(file.name);
      const filePath = `${TENANT_ID}/${clientId}/${stoneId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from(STONE_PHOTO_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Foto yüklenemedi:", uploadError);
        showToast({
          title: "İşlem başarısız",
          message: "Foto yüklenemedi: " + uploadError.message,
          type: "error",
        });
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STONE_PHOTO_BUCKET)
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("client_stone_photos")
        .insert({
          tenant_id: TENANT_ID,
          client_id: clientId,
          stone_id: stoneId,
          image_url: publicUrlData.publicUrl,
          file_path: filePath,
        });

      if (insertError) {
        console.error("Foto kaydı veritabanına yazılamadı:", insertError);
        showToast({
          title: "İşlem başarısız",
          message: "Foto kaydı yazılamadı: " + insertError.message,
          type: "error",
        });

        await supabase.storage.from(STONE_PHOTO_BUCKET).remove([filePath]);
      }
    }
  }

  async function addStone() {
    if (!clientId) {
      showToast({
        title: "İşlem başarısız",
        message: "Danışan bilgisi bulunamadı.",
        type: "error",
      });
      return;
    }

    if (isFormEmpty(form, selectedFiles.length)) {
      showToast({
        title: "İşlem başarısız",
        message: "Lütfen en az bir alan doldurun veya fotoğraf seçin.",
        type: "error",
      });
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("client_stones")
      .insert({
        tenant_id: TENANT_ID,
        client_id: clientId,
        ...formToPayload(form),
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("Taş kaydı eklenemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message:
          "Taş kaydı eklenemedi: " + (error?.message || "Kayıt ID alınamadı."),
        type: "error",
      });
      setSaving(false);
      return;
    }

    if (selectedFiles.length > 0) {
      await uploadFilesForStone(data.id, selectedFiles);
    }

    setForm({ ...emptyForm, stoneDate: todayISO() });
    clearSelectedFiles();
    await refreshAll();

    setSaving(false);

    showToast({
      title: "Başarılı",
      message: "Taş kaydı eklendi.",
      type: "success",
    });
  }

  function startEdit(stone: ClientStone) {
    setEditingId(stone.id);
    setEditForm(stoneToForm(stone));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function updateStone(id: string) {
    if (isFormEmpty(editForm, 0)) {
      showToast({
        title: "İşlem başarısız",
        message: "Boş kayıt güncellenemez.",
        type: "error",
      });
      return;
    }

    setUpdating(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("client_stones")
      .update(formToPayload(editForm))
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId);

    if (error) {
      console.error("Taş kaydı güncellenemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Taş kaydı güncellenemedi: " + error.message,
        type: "error",
      });
      setUpdating(false);
      return;
    }

    cancelEdit();
    await refreshAll();
    setUpdating(false);

    showToast({
      title: "Başarılı",
      message: "Taş kaydı güncellendi.",
      type: "success",
    });
  }

  async function deleteStone(id: string) {
    const ok = await confirm({
      title: "Kaydı sil",
      message:
        "Bu taş kaydı silinsin mi? Bu taşa bağlı fotoğraflar da listeden kalkar.",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    setErrorMessage("");

    const stonePhotos = photosByStoneId[id] || [];

    if (stonePhotos.length > 0) {
      const paths = stonePhotos.map((photo) => photo.file_path);

      const { error: storageError } = await supabase.storage
        .from(STONE_PHOTO_BUCKET)
        .remove(paths);

      if (storageError) {
        console.error("Taş fotoğrafları storage üzerinden silinemedi:", storageError);
      }
    }

    const { error } = await supabase
      .from("client_stones")
      .delete()
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId);

    if (error) {
      console.error("Taş kaydı silinemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Taş kaydı silinemedi: " + error.message,
        type: "error",
      });
      return;
    }

    if (editingId === id) {
      cancelEdit();
    }

    await refreshAll();

    showToast({
      title: "Başarılı",
      message: "Taş kaydı silindi.",
      type: "success",
    });
  }

  async function uploadStonePhotos(
    stoneId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    setUploadingStoneId(stoneId);
    setErrorMessage("");

    await uploadFilesForStone(stoneId, files);
    await loadPhotos();

    setUploadingStoneId(null);
  }

  async function deletePhoto(photo: StonePhoto) {
    const ok = await confirm({
      title: "Kaydı sil",
      message: "Bu fotoğraf silinsin mi?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    setDeletingPhotoId(photo.id);
    setErrorMessage("");

    const { error: storageError } = await supabase.storage
      .from(STONE_PHOTO_BUCKET)
      .remove([photo.file_path]);

    if (storageError) {
      console.error("Foto storage üzerinden silinemedi:", storageError);
    }

    const { error } = await supabase
      .from("client_stone_photos")
      .delete()
      .eq("id", photo.id)
      .eq("tenant_id", TENANT_ID)
      .eq("client_id", clientId);

    if (error) {
      console.error("Foto kaydı silinemedi:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Foto kaydı silinemedi: " + error.message,
        type: "error",
      });
      setDeletingPhotoId(null);
      return;
    }

    const currentPhoto = lightboxPhotos[lightboxIndex];

    if (currentPhoto?.id === photo.id) {
      closeLightbox();
    }

    await loadPhotos();
    setDeletingPhotoId(null);

    showToast({
      title: "Başarılı",
      message: "Fotoğraf silindi.",
      type: "success",
    });
  }

  function openLightbox(photoList: StonePhoto[], photo: StonePhoto) {
    const index = photoList.findIndex((item) => item.id === photo.id);

    setLightboxPhotos(photoList);
    setLightboxIndex(index >= 0 ? index : 0);
  }

  function closeLightbox() {
    setLightboxPhotos([]);
    setLightboxIndex(0);
  }

  function showPrevPhoto() {
    setLightboxIndex((prev) =>
      prev <= 0 ? lightboxPhotos.length - 1 : prev - 1
    );
  }

  function showNextPhoto() {
    setLightboxIndex((prev) =>
      prev >= lightboxPhotos.length - 1 ? 0 : prev + 1
    );
  }

  const activeLightboxPhoto = lightboxPhotos[lightboxIndex] || null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/50">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-emerald-50/40 to-violet-50/40 px-3 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm">
                Profesyonel Taş Takip Sistemi
              </div>

              <h2 className="text-base font-black tracking-tight text-slate-950">
                Danışan Taşları
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-5 text-slate-600">
                Taş bilgilerini ve fotoğrafları tek ekrandan seçip tek tuşla
                kaydedebilirsin.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-md">
                <div className="text-base font-black text-emerald-700">
                  {stones.length}
                </div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  kayıt
                </div>
              </div>

              <div className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-center shadow-md">
                <div className="text-base font-black text-violet-700">
                  {totalWithPhoto}
                </div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  foto taş
                </div>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-white px-3 py-2 text-center shadow-md">
                <div className="text-base font-black text-blue-700">
                  {photos.length}
                </div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  foto
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 via-violet-400 to-rose-400" />
        </div>

        <div className="p-4">
          {errorMessage && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          <FormFields data={form} onChange={updateFormField} />

          <CreatePhotoPicker
            selectedFiles={selectedFiles}
            selectedPreviews={selectedPreviews}
            onSelect={handleCreatePhotoSelection}
            onClear={clearSelectedFiles}
            onRemove={removeSelectedFile}
          />

          <div className="mt-3 flex justify-center">
            <button
              onClick={addStone}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:from-emerald-700 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? selectedFiles.length > 0
                  ? "Taş ve fotoğraflar kaydediliyor..."
                  : "Kaydediliyor..."
                : "💾 Taşı Kaydet"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/50">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-950">
              Kayıtlı Taşlar
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Bu danışana ait taş önerileri, kombinleri, fotoğrafları ve takip
              notları.
            </p>
          </div>

          <button
            onClick={refreshAll}
            disabled={loading || photosLoading}
            className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || photosLoading ? "Yükleniyor..." : "Listeyi Yenile"}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
            Taş kayıtları yükleniyor...
          </div>
        ) : stones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <div className="text-base font-black text-slate-800">
              Henüz taş kaydı yok
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              İlk taşı yukarıdaki formdan ekleyebilirsin.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {stones.map((stone) => {
              const isEditing = editingId === stone.id;
              const stonePhotos = photosByStoneId[stone.id] || [];
              const coverPhoto = stonePhotos[0];

              return (
                <div
                  key={stone.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/70"
                >
                  {!isEditing ? (
                    <div className="p-4">
                      <div className="grid gap-2 lg:grid-cols-[145px_1fr]">
                        <div>
                          {coverPhoto ? (
                            <button
                              type="button"
                              onClick={() => openLightbox(stonePhotos, coverPhoto)}
                              className="block h-32 w-full overflow-hidden rounded-2xl border border-slate-200 shadow-md"
                            >
                              <img
                                src={coverPhoto.image_url}
                                alt={stone.stone_name || "Taş fotoğrafı"}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                            </button>
                          ) : (
                            <div className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm font-black text-slate-400">
                              📷 Foto yok
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                                {stone.stone_type || "Kullanım türü belirtilmedi"}
                              </div>

                              <h4 className="text-base font-black tracking-tight text-slate-950">
                                {stone.stone_name || "İsimsiz taş"}
                              </h4>

                              <p className="mt-1 text-xs font-bold text-slate-500">
                                Taş tarihi: {formatDate(stone.stone_date)}
                              </p>

                              <p className="mt-1 text-xs font-bold text-slate-500">
                                Kayıt tarihi: {formatDate(stone.created_at)}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <label className="cursor-pointer rounded-xl border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">
                                {uploadingStoneId === stone.id
                                  ? "Yükleniyor..."
                                  : "Fotoğraf Ekle"}
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingStoneId === stone.id}
                                  onChange={(event) =>
                                    uploadStonePhotos(stone.id, event)
                                  }
                                />
                              </label>

                              <button
                                onClick={() => startEdit(stone)}
                                className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                              >
                                Düzenle
                              </button>

                              <button
                                onClick={() => deleteStone(stone.id)}
                                className="rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                              >
                                Sil
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <DetailBlock
                              title="Kullanım"
                              value={stone.usage_area}
                              tone="emerald"
                              icon="📋"
                            />
                            <DetailBlock
                              title="Kombin"
                              value={stone.combination_text}
                              tone="violet"
                              icon="🧩"
                            />
                            <DetailBlock
                              title="Uyarı"
                              value={stone.warning_text}
                              tone="amber"
                              icon="⚠️"
                            />
                            <DetailBlock
                              title="Diğer"
                              value={stone.other_notes}
                              tone="blue"
                              icon="ℹ️"
                            />
                          </div>

                          {stone.note ? (
                            <div className="mt-3">
                              <DetailBlock
                                title="Genel Not"
                                value={stone.note}
                                tone="slate"
                                icon="📝"
                              />
                            </div>
                          ) : (
                            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-400">
                              Bu taş için henüz genel not eklenmemiş.
                            </div>
                          )}

                          <PhotoGallery
                            stone={stone}
                            stonePhotos={stonePhotos}
                            uploadingStoneId={uploadingStoneId}
                            deletingPhotoId={deletingPhotoId}
                            onUpload={uploadStonePhotos}
                            onDeletePhoto={deletePhoto}
                            onSelectPhoto={(photo) => openLightbox(stonePhotos, photo)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-l-4 border-emerald-500 bg-emerald-50/50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-base font-black text-slate-950">
                            Taş Kaydını Düzenle
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-600">
                            Kullanım, kombin, uyarı ve not alanlarını
                            güncelleyebilirsin. Fotoğraflar kayıt kartı
                            üzerinden ayrıca eklenir.
                          </p>
                        </div>

                        <button
                          onClick={cancelEdit}
                          className="rounded-xl bg-white px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          İptal
                        </button>
                      </div>

                      <FormFields data={editForm} onChange={updateEditField} />

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          Vazgeç
                        </button>

                        <button
                          onClick={() => updateStone(stone.id)}
                          disabled={updating}
                          className="rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updating ? "Güncelleniyor..." : "Güncelle"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeLightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div
            className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-violet-50 px-3 py-2">
              <div>
                <div className="text-sm font-black text-slate-950">
                  Fotoğraf Galerisi
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </div>
              </div>

              <button
                type="button"
                onClick={closeLightbox}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Kapat
              </button>
            </div>

            <div className="relative flex min-h-[320px] items-center justify-center bg-slate-950 p-4">
              {lightboxPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={showPrevPhoto}
                  className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-base font-black text-slate-900 shadow-lg transition hover:scale-105 hover:bg-white"
                >
                  ‹
                </button>
              )}

              <img
                src={activeLightboxPhoto.image_url}
                alt="Taş fotoğrafı"
                className="max-h-[62vh] w-full rounded-xl object-contain"
              />

              {lightboxPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={showNextPhoto}
                  className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-base font-black text-slate-900 shadow-lg transition hover:scale-105 hover:bg-white"
                >
                  ›
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-2 overflow-x-auto">
                {lightboxPhotos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className={`h-10 w-10 shrink-0 overflow-hidden rounded-2xl border-2 transition ${
                      index === lightboxIndex
                        ? "border-emerald-500 shadow-md"
                        : "border-slate-200 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={photo.image_url}
                      alt="Galeri küçük fotoğraf"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => deletePhoto(activeLightboxPhoto)}
                disabled={deletingPhotoId === activeLightboxPhoto.id}
                className="rounded-2xl border border-red-200 bg-red-50 px-2 py-1 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
              >
                {deletingPhotoId === activeLightboxPhoto.id
                  ? "Siliniyor..."
                  : "Bu Fotoğrafı Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

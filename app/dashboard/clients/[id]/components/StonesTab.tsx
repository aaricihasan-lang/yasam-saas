"use client";

import { runInEffect } from "@/lib/runInEffect";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  parseStoneNames,
  checkStoneWarnings,
  type StoneWarningResult,
} from "@/lib/stones/stoneWarningService";
import StoneWarningModal from "./StoneWarningModal";
import ClientCombinationsSection from "./ClientCombinationsSection";
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
  const t = useTranslations("clients.stones");
  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        <div className={boxClass("emerald")}>
          <SectionLabel icon="💎" title={t("form.nameLabel")} tone="emerald" />
          <input
            value={data.stoneName}
            onChange={(e) => onChange("stoneName", e.target.value)}
            placeholder={t("form.namePlaceholder")}
            className={inputClass("emerald")}
          />
        </div>

        <div className={boxClass("blue")}>
          <SectionLabel icon="📿" title={t("form.typeLabel")} tone="blue" />
          <input
            value={data.stoneType}
            onChange={(e) => onChange("stoneType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={inputClass("blue")}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="📅" title={t("form.dateLabel")} tone="violet" />
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
          <SectionLabel icon="📋" title={t("form.usageLabel")} tone="emerald" />
          <textarea
            value={data.usageArea}
            onChange={(e) => onChange("usageArea", e.target.value)}
            placeholder={t("form.usagePlaceholder")}
            rows={3}
            className={`${inputClass("emerald")} resize-none leading-5`}
          />
        </div>

        <div className={boxClass("violet")}>
          <SectionLabel icon="🧩" title={t("form.combinationLabel")} tone="violet" />
          <textarea
            value={data.combinationText}
            onChange={(e) => onChange("combinationText", e.target.value)}
            placeholder={t("form.combinationPlaceholder")}
            rows={3}
            className={`${inputClass("violet")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className={boxClass("amber")}>
          <SectionLabel icon="⚠️" title={t("form.warningLabel")} tone="amber" />
          <textarea
            value={data.warningText}
            onChange={(e) => onChange("warningText", e.target.value)}
            placeholder={t("form.warningPlaceholder")}
            rows={3}
            className={`${inputClass("amber")} resize-none leading-5`}
          />
        </div>

        <div className={boxClass("blue")}>
          <SectionLabel icon="ℹ️" title={t("form.otherLabel")} tone="blue" />
          <textarea
            value={data.otherNotes}
            onChange={(e) => onChange("otherNotes", e.target.value)}
            placeholder={t("form.otherPlaceholder")}
            rows={3}
            className={`${inputClass("blue")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className={`mt-3 ${boxClass("emerald")}`}>
        <SectionLabel icon="📝" title={t("form.noteLabel")} tone="emerald" />
        <textarea
          value={data.note}
          onChange={(e) => onChange("note", e.target.value)}
          placeholder={t("form.notePlaceholder")}
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
  const t = useTranslations("clients.stones");
  return (
    <div className={`mt-3 ${boxClass("rose")}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SectionLabel icon="📷" title={t("photoPicker.title")} tone="rose" />

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-rose-200 bg-white px-2 py-1 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-50">
            {t("photoPicker.select")}
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
              {t("photoPicker.clear")}
            </button>
          )}
        </div>
      </div>

      {selectedPreviews.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-rose-200 bg-white/70 p-3 text-xs font-semibold text-slate-400">
          {t("photoPicker.hint")}
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
                alt={t("photoPicker.previewAlt", { n: index + 1 })}
                className="h-20 w-full object-cover"
              />

              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-2 top-2 rounded-full bg-red-600/90 px-2 py-1 text-[10px] font-black text-white shadow-sm"
              >
                {t("item.delete")}
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
  const t = useTranslations("clients.stones");
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">
            {t("gallery.title")}
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {t("gallery.count", { count: stonePhotos.length })}
          </div>
        </div>

        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-white px-2 py-1 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">
          {uploadingStoneId === stone.id ? t("gallery.uploading") : t("gallery.add")}
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
          {t("gallery.empty")}
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
                  alt={stone.stone_name || t("photoAlt")}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </button>

              <button
                type="button"
                onClick={() => onDeletePhoto(photo)}
                disabled={deletingPhotoId === photo.id}
                className="absolute right-2 top-2 rounded-full bg-red-600/90 px-2.5 py-1.5 text-xs font-black text-white opacity-100 shadow-sm transition group-hover:opacity-100 disabled:opacity-50 md:opacity-0"
              >
                {deletingPhotoId === photo.id ? "..." : t("item.delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StonesTab({ clientId }: StonesTabProps) {
  const t = useTranslations("clients.stones");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  // Mutlak tarih (global sözleşme: tüm locale'lerde DD.MM.YYYY); boş tarihte sistem etiketi (DISPLAY-only).
  const fmtDate = useCallback(
    (date: string | null) =>
      date ? formatDateAbsolute(date) : t("noDate"),
    [t],
  );
  const [tenantId, setTenantId] = useState<string | null>(null);
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
  const [showForm, setShowForm] = useState(false);
  const [warningCheckState, setWarningCheckState] = useState<{
    warnings: StoneWarningResult[];
    proceed: () => void;
  } | null>(null);

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
        title: t("toast.failTitle"),
        message: t("toast.onlyImages"),
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

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  async function loadStones() {
    if (!clientId || !tenantId) return;

    setLoading(true);
    setErrorMessage("");

    const stToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/stones`, {
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(stToken ? { "x-session-token": stToken } : {}),
      },
    });

    if (!res.ok) {
      console.error("Taş kayıtları yüklenemedi");
      setErrorMessage(t("error.loadStones"));
      setLoading(false);
      return;
    }

    const json = (await res.json()) as { stones?: ClientStone[] };
    // Sıralama korunur: stone_date desc (null'lar sonda), sonra created_at desc.
    const list = (json.stones ?? []).slice().sort((a, b) => {
      const sd = (b.stone_date ?? "").localeCompare(a.stone_date ?? "");
      if (sd !== 0) return sd;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    setStones(list);
    setLoading(false);
  }

  async function loadPhotos() {
    if (!clientId || !tenantId) return;

    setPhotosLoading(true);
    setErrorMessage("");

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/stone-photos`, {
      headers: {
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; photos?: StonePhoto[] };

    if (!res.ok || !json.ok) {
      console.error("Taş fotoğrafları yüklenemedi:", json.error);
      setErrorMessage(t("error.loadPhotos") + ": " + (json.error ?? ""));
      setPhotosLoading(false);
      return;
    }

    setPhotos((json.photos || []) as StonePhoto[]);
    setPhotosLoading(false);
  }

  async function refreshAll() {
    await loadStones();
    await loadPhotos();
  }

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      void refreshAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  useEffect(() => {
    return () => {
      selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedPreviews]);

  async function uploadFilesForStone(stoneId: string, files: File[]) {
    for (const file of files) {
      const cleanName = safeFileName(file.name);
      const filePath = `${tenantId}/${clientId}/${stoneId}/${Date.now()}-${Math.random()
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
          title: t("toast.failTitle"),
          message: t("toast.uploadFailed") + ": " + uploadError.message,
          type: "error",
        });
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STONE_PHOTO_BUCKET)
        .getPublicUrl(filePath);

      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const insertRes = await fetch(`/api/clients/${clientId}/stone-photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({
          stone_id: stoneId,
          image_url: publicUrlData.publicUrl,
          file_path: filePath,
        }),
      });
      const insertJson = (await insertRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!insertRes.ok || !insertJson.ok) {
        console.error("Foto kaydı veritabanına yazılamadı:", insertJson.error);
        showToast({
          title: t("toast.failTitle"),
          message: t("toast.photoInsertFailed") + ": " + (insertJson.error ?? ""),
          type: "error",
        });

        await supabase.storage.from(STONE_PHOTO_BUCKET).remove([filePath]);
      }
    }
  }

  async function addStone() {
    if (!clientId) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.noClient"),
        type: "error",
      });
      return;
    }

    if (isFormEmpty(form, selectedFiles.length)) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.emptyForm"),
        type: "error",
      });
      return;
    }

    // Doğaltaş uyarı kontrolü: kayıttan önce taş adlarını kontrol et
    if (tenantId && form.stoneName.trim()) {
      const names = parseStoneNames(form.stoneName);
      if (names.length > 0) {
        const warnings = await checkStoneWarnings(names);
        if (warnings.length > 0) {
          setWarningCheckState({ warnings, proceed: doAddStone });
          return;
        }
      }
    }

    await doAddStone();
  }

  async function doAddStone() {
    setSaving(true);
    setErrorMessage("");

    const addToken = readSessionToken();
    const addRes = await fetch(`/api/clients/${clientId}/stones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(addToken ? { "x-session-token": addToken } : {}),
      },
      body: JSON.stringify(formToPayload(form)),
    });
    const data = addRes.ok
      ? ((await addRes.json()) as { stone?: { id?: string } }).stone ?? null
      : null;

    if (!data?.id) {
      console.error("Taş kaydı eklenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.addFailed"),
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
    setShowForm(false);
    await refreshAll();

    setSaving(false);

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.added"),
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
        title: t("toast.failTitle"),
        message: t("toast.emptyUpdate"),
        type: "error",
      });
      return;
    }

    // Doğaltaş uyarı kontrolü: güncellemeden önce taş adlarını kontrol et
    if (tenantId && editForm.stoneName.trim()) {
      const names = parseStoneNames(editForm.stoneName);
      if (names.length > 0) {
        const warnings = await checkStoneWarnings(names);
        if (warnings.length > 0) {
          setWarningCheckState({ warnings, proceed: () => doUpdateStone(id) });
          return;
        }
      }
    }

    await doUpdateStone(id);
  }

  async function doUpdateStone(id: string) {
    setUpdating(true);
    setErrorMessage("");

    const updToken = readSessionToken();
    const updRes = await fetch(`/api/clients/${clientId}/stones`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(updToken ? { "x-session-token": updToken } : {}),
      },
      body: JSON.stringify({ id, ...formToPayload(editForm) }),
    });

    if (!updRes.ok) {
      console.error("Taş kaydı güncellenemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.updateFailed"),
        type: "error",
      });
      setUpdating(false);
      return;
    }

    cancelEdit();
    await refreshAll();
    setUpdating(false);

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.updated"),
      type: "success",
    });
  }

  async function deleteStone(id: string) {
    const ok = await deleteConfirm({
      title: t("delete.stone.title"),
      message: t("delete.stone.message"),
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

    const delToken = readSessionToken();
    const delRes = await fetch(`/api/clients/${clientId}/stones?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(delToken ? { "x-session-token": delToken } : {}),
      },
    });

    if (!delRes.ok) {
      console.error("Taş kaydı silinemedi");
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.deleteFailed"),
        type: "error",
      });
      return;
    }

    if (editingId === id) {
      cancelEdit();
    }

    await refreshAll();

    showToast({
      title: t("toast.successTitle"),
      message: t("toast.deleted"),
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
    const ok = await deleteConfirm({
      title: t("delete.photo.title"),
      message: t("delete.photo.message"),
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

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/stone-photos`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ photoId: photo.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      console.error("Foto kaydı silinemedi:", json.error);
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.photoDeleteFailed") + ": " + (json.error ?? ""),
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
      title: t("toast.successTitle"),
      message: t("toast.photoDeleted"),
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
                {t("header.badge")}
              </div>

              <h2 className="text-base font-black tracking-tight text-slate-950">
                {t("header.title")}
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-5 text-slate-600">
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-emerald-700">
                    {stones.length}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.records")}
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-violet-700">
                    {totalWithPhoto}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.photoStones")}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-white px-3 py-2 text-center shadow-md">
                  <div className="text-base font-black text-blue-700">
                    {photos.length}
                  </div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("stats.photos")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={showForm
                  ? "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                  : "w-full rounded-2xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"}
              >
                {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
              </button>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 via-violet-400 to-rose-400" />
        </div>

      </div>

      {showForm && (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-md shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white px-4 py-3">
            <div>
              <h3 className="text-base font-black text-slate-950">{t("newForm.title")}</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
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
                className="btn-primary hover:-translate-y-0.5 hover:scale-[1.02]"
              >
                {saving
                  ? selectedFiles.length > 0
                    ? t("newForm.savingWithPhotos")
                    : t("newForm.saving")
                  : t("newForm.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/50">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-950">
              {t("list.title")}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={refreshAll}
            disabled={loading || photosLoading}
            className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || photosLoading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
            {t("list.loadingRecords")}
          </div>
        ) : stones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <div className="text-base font-black text-slate-800">
              {t("empty.title")}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("empty.hint")}
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
                                alt={stone.stone_name || t("photoAlt")}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                            </button>
                          ) : (
                            <div className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm font-black text-slate-400">
                              {t("card.noPhoto")}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                                {stone.stone_type || t("card.noType")}
                              </div>

                              <h4 className="text-base font-black tracking-tight text-slate-950">
                                {stone.stone_name || t("card.noName")}
                              </h4>

                              <p className="mt-1 text-xs font-bold text-slate-500">
                                {t("card.stoneDate", { date: fmtDate(stone.stone_date) })}
                              </p>

                              <p className="mt-1 text-xs font-bold text-slate-500">
                                {t("card.recordDate", { date: fmtDate(stone.created_at) })}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2.5">
                              <label className="cursor-pointer rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">
                                {uploadingStoneId === stone.id
                                  ? t("gallery.uploading")
                                  : t("gallery.add")}
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
                                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
                              >
                                {t("item.edit")}
                              </button>

                              <button
                                onClick={() => deleteStone(stone.id)}
                                className="ml-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 shadow-sm transition hover:bg-red-100"
                              >
                                {t("item.delete")}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <DetailBlock
                              title={t("detail.usage")}
                              value={stone.usage_area}
                              tone="emerald"
                              icon="📋"
                            />
                            <DetailBlock
                              title={t("detail.combination")}
                              value={stone.combination_text}
                              tone="violet"
                              icon="🧩"
                            />
                            <DetailBlock
                              title={t("detail.warning")}
                              value={stone.warning_text}
                              tone="amber"
                              icon="⚠️"
                            />
                            <DetailBlock
                              title={t("detail.other")}
                              value={stone.other_notes}
                              tone="blue"
                              icon="ℹ️"
                            />
                          </div>

                          {stone.note ? (
                            <div className="mt-3">
                              <DetailBlock
                                title={t("detail.note")}
                                value={stone.note}
                                tone="slate"
                                icon="📝"
                              />
                            </div>
                          ) : (
                            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-400">
                              {t("card.noNote")}
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
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-base font-black text-slate-950">
                            {t("editForm.title")}
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-600">
                            {t("editForm.subtitle")}
                          </p>
                        </div>

                        <button
                          onClick={cancelEdit}
                          className="self-start rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 sm:shrink-0"
                        >
                          {t("cancelTop")}
                        </button>
                      </div>

                      <FormFields data={editForm} onChange={updateEditField} />

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          {t("cancel")}
                        </button>

                        <button
                          onClick={() => updateStone(stone.id)}
                          disabled={updating}
                          className="btn-primary px-4 py-2 text-sm"
                        >
                          {updating ? t("editForm.updating") : t("editForm.update")}
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

      {/* Danışana özel kayıtlı kombinasyonlar (Kombinasyon Oluştur → Danışana Özel Kaydet) */}
      <ClientCombinationsSection clientId={clientId} />

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
                  {t("lightbox.title")}
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
                {t("close")}
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
                alt={t("photoAlt")}
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
                      alt={t("lightbox.thumbAlt")}
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
                  ? t("lightbox.deleting")
                  : t("lightbox.deletePhoto")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doğaltaş uyarı modalı: kayıt/güncelleme öncesi uyarıları gösterir */}
      {warningCheckState && (
        <StoneWarningModal
          warnings={warningCheckState.warnings}
          onConfirm={() => {
            const proceed = warningCheckState.proceed;
            setWarningCheckState(null);
            proceed();
          }}
          onCancel={() => setWarningCheckState(null)}
        />
      )}
    </div>
  );
}

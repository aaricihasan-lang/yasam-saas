"use client";

import { runInEffect } from "@/lib/runInEffect";
import { CameraCaptureButton } from "@/components/media/CameraCaptureButton";
import { looksLikeImageFile, optimizeImageFile } from "@/lib/media/imageOptimize";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { STONE_PHOTO_MAX_BYTES, applySignedPhotoUrls, shouldRefreshSignedUrls } from "@/lib/clients/stonePhotoStorage";
import { todayInZone } from "@/lib/time/reportTime";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";
const STONE_PHOTO_BUCKET = "stone-photos";
// DYA-07: signed READ URL yenileme aralığı (TTL 3600 sn'nin altında → sayfa uzun süre
// açık kalsa bile URL süresi dolmadan yenilenir).
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;

type ClientStone = {
  id: string;
  /** DY-03: satır sürümü (atomik CAS). */
  row_version?: number;
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
  // Kart/thumbnail için küçük (transform) signed URL; yoksa image_url'e düşülür (geriye uyumlu).
  thumb_url?: string;
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

// Form varsayılanı: İstanbul takvim günü (UTC 00:00–03:00 "dün" hatası yok).
function todayISO() {
  return todayInZone();
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
      ? "focus:border-slate-400 focus:ring-slate-100"
      : tone === "blue"
        ? "focus:border-slate-400 focus:ring-slate-100"
        : tone === "violet"
          ? "focus:border-slate-400 focus:ring-slate-100"
          : tone === "amber"
            ? "focus:border-slate-400 focus:ring-slate-100"
            : tone === "rose"
              ? "focus:border-slate-400 focus:ring-slate-100"
              : "focus:border-slate-400 focus:ring-slate-100";

  return `w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 ${focus}`;
}

function boxClass(
  tone: "emerald" | "blue" | "violet" | "amber" | "rose" | "slate" = "slate"
) {
  const base = "rounded-lg border p-3";

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
      ? "border-slate-200 bg-white text-slate-500"
      : tone === "violet"
        ? "border-slate-200 bg-white text-slate-500"
        : tone === "amber"
          ? "border-slate-200 bg-white text-slate-500"
          : tone === "rose"
            ? "border-slate-200 bg-white text-slate-500"
            : tone === "slate"
              ? "border-slate-200 bg-white text-slate-500"
              : "border-slate-200 bg-white text-slate-500";

  return (
    <label className={`${dyp.kLabel} mb-1.5 flex items-center gap-2`}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border text-sm ${toneClass}`}
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
      ? "border-slate-200 bg-white text-slate-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : tone === "rose"
          ? "border-slate-200 bg-white text-slate-800"
          : tone === "violet"
            ? "border-slate-200 bg-white text-slate-800"
            : tone === "blue"
              ? "border-slate-200 bg-white text-slate-800"
              : "border-slate-200 bg-white text-slate-800";

  const iconClass =
    tone === "emerald"
      ? "bg-white text-slate-500"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : tone === "rose"
          ? "bg-white text-slate-500"
          : tone === "violet"
            ? "bg-white text-slate-500"
            : tone === "blue"
              ? "bg-white text-slate-500"
              : "bg-slate-100 text-slate-700";

  return (
    <div className={`${tone === "amber" ? dyp.kAlertWarn : dyp.kField} ${toneClass}`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md border border-[#e3e7ee] text-sm ${iconClass}`}
        >
          {icon}
        </span>
        <div className={dyp.kFieldTitle}>{title}</div>
      </div>
      <div className={`${dyp.kFieldText} whitespace-pre-wrap`}>{value}</div>
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
        <div className={`${dyp.kField} ${boxClass("emerald")}`}>
          <SectionLabel icon="💎" title={t("form.nameLabel")} tone="emerald" />
          <input
            value={data.stoneName}
            onChange={(e) => onChange("stoneName", e.target.value)}
            placeholder={t("form.namePlaceholder")}
            className={`${dyp.kInput} ${inputClass("emerald")}`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("blue")}`}>
          <SectionLabel icon="📿" title={t("form.typeLabel")} tone="blue" />
          <input
            value={data.stoneType}
            onChange={(e) => onChange("stoneType", e.target.value)}
            placeholder={t("form.typePlaceholder")}
            className={`${dyp.kInput} ${inputClass("blue")}`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("violet")}`}>
          <SectionLabel icon="📅" title={t("form.dateLabel")} tone="violet" />
          <input
            type="date"
            value={data.stoneDate}
            onChange={(e) => onChange("stoneDate", e.target.value)}
            className={`${dyp.kInput} ${inputClass("violet")}`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className={`${dyp.kField} ${boxClass("emerald")}`}>
          <SectionLabel icon="📋" title={t("form.usageLabel")} tone="emerald" />
          <textarea
            value={data.usageArea}
            onChange={(e) => onChange("usageArea", e.target.value)}
            placeholder={t("form.usagePlaceholder")}
            rows={3}
            className={`${dyp.kInput} ${inputClass("emerald")} resize-none leading-5`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("violet")}`}>
          <SectionLabel icon="🧩" title={t("form.combinationLabel")} tone="violet" />
          <textarea
            value={data.combinationText}
            onChange={(e) => onChange("combinationText", e.target.value)}
            placeholder={t("form.combinationPlaceholder")}
            rows={3}
            className={`${dyp.kInput} ${inputClass("violet")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className={`${dyp.kAlertWarn} ${boxClass("amber")}`}>
          <SectionLabel icon="⚠️" title={t("form.warningLabel")} tone="amber" />
          <textarea
            value={data.warningText}
            onChange={(e) => onChange("warningText", e.target.value)}
            placeholder={t("form.warningPlaceholder")}
            rows={3}
            className={`${dyp.kInput} ${inputClass("amber")} resize-none leading-5`}
          />
        </div>

        <div className={`${dyp.kField} ${boxClass("blue")}`}>
          <SectionLabel icon="ℹ️" title={t("form.otherLabel")} tone="blue" />
          <textarea
            value={data.otherNotes}
            onChange={(e) => onChange("otherNotes", e.target.value)}
            placeholder={t("form.otherPlaceholder")}
            rows={3}
            className={`${dyp.kInput} ${inputClass("blue")} resize-none leading-5`}
          />
        </div>
      </div>

      <div className={`${dyp.kField} mt-3 ${boxClass("emerald")}`}>
        <SectionLabel icon="📝" title={t("form.noteLabel")} tone="emerald" />
        <textarea
          value={data.note}
          onChange={(e) => onChange("note", e.target.value)}
          placeholder={t("form.notePlaceholder")}
          rows={3}
          className={`${dyp.kInput} ${inputClass("emerald")} resize-none leading-5`}
        />
      </div>
    </>
  );
}

type CreatePhotoPickerProps = {
  selectedFiles: File[];
  selectedPreviews: string[];
  onSelect: (files: File[]) => void;
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
  // Tüm cihazlarda görünür (2026-10-14): galeri/dosya seçimi + destekleyen cihazlarda kamera.
  return (
    <div className={`${dyp.kField} mt-3 ${boxClass("rose")}`} data-testid="stone-create-photo-picker">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SectionLabel icon="📷" title={t("photoPicker.title")} tone="rose" />

        <div className="flex flex-wrap gap-2">
          <label className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} inline-flex min-h-[36px] items-center gap-2`}>
            {t("photoPicker.select")}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                onSelect(files);
              }}
            />
          </label>

          <CameraCaptureButton
            onFiles={onSelect}
            testId="stone-create-photo-camera"
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} inline-flex min-h-[36px] items-center gap-2`}
          >
            {t("photoPicker.camera")}
          </CameraCaptureButton>

          {selectedFiles.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
            >
              {t("photoPicker.clear")}
            </button>
          )}
        </div>
      </div>

      {selectedPreviews.length === 0 ? (
        <div className={`${dyp.kEmpty} mt-2`}>
          {t("photoPicker.hint")}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7">
          {selectedPreviews.map((preview, index) => (
            <div
              key={preview}
              className={`relative overflow-hidden rounded-lg border border-[#e3e7ee] bg-white`}
            >
              <img
                src={preview}
                alt={t("photoPicker.previewAlt", { n: index + 1 })}
                className="h-20 w-full object-cover"
              />

              <button
                type="button"
                onClick={() => onRemove(index)}
                className={`${dyp.kBtnDangerSolid} ${dyp.kBtnSm} absolute right-2 top-2`}
              >
                {t("item.delete")}
              </button>

              <div className={`${dyp.kMeta} truncate px-2 py-1`}>
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
  onUpload: (stoneId: string, files: File[]) => void;
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
    <div className={`${dyp.kField} mt-3`}>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className={dyp.kFieldTitle}>
            {t("gallery.title")}
          </div>
          <div className={`${dyp.kMeta} mt-1`}>
            {t("gallery.count", { count: stonePhotos.length })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} inline-flex min-h-[36px] w-fit items-center gap-2`}>
            {uploadingStoneId === stone.id ? t("gallery.uploading") : t("gallery.add")}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              disabled={uploadingStoneId === stone.id}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                onUpload(stone.id, files);
              }}
            />
          </label>
          <CameraCaptureButton
            onFiles={(files) => onUpload(stone.id, files)}
            disabled={uploadingStoneId === stone.id}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} inline-flex min-h-[36px] w-fit items-center gap-2`}
          >
            {t("photoPicker.camera")}
          </CameraCaptureButton>
        </div>
      </div>

      {stonePhotos.length === 0 ? (
        <div className={dyp.kEmpty}>
          {t("gallery.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {stonePhotos.map((photo) => (
            <div
              key={photo.id}
              className={`group relative overflow-hidden rounded-lg border border-[#e3e7ee] bg-white`}
            >
              <button
                type="button"
                onClick={() => onSelectPhoto(photo)}
                className="block h-20 w-full overflow-hidden"
              >
                <img
                  src={photo.thumb_url || photo.image_url}
                  alt={stone.stone_name || t("photoAlt")}
                  loading="lazy"
                  decoding="async"
                  // B1 güvenlik ağı: transform (thumb) servis edilemezse (plan/kota) tam
                  // görsele DÜŞ → kart asla kırık kalmaz (tek sefer; döngü yok).
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (photo.image_url && img.src !== photo.image_url) img.src = photo.image_url;
                  }}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </button>

              <button
                type="button"
                onClick={() => onDeletePhoto(photo)}
                disabled={deletingPhotoId === photo.id}
                className={`${dyp.kBtnDangerSolid} ${dyp.kBtnSm} absolute right-2 top-2 opacity-100 group-hover:opacity-100 md:opacity-0`}
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
  // DY-03: düzenlenen kaydın açıldığı andaki sürümü.
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<StoneFormState>(emptyForm);

  const [lightboxPhotos, setLightboxPhotos] = useState<StonePhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(false);
  // B3: signed READ URL'lerin son imzalanma anı (gereksiz yeniden imzalama/yeniden indirme önlenir)
  // + eşzamanlı yenileme kilidi (duplicate request/race önler).
  const lastSignedAtRef = useRef<number | null>(null);
  const refreshingSignedRef = useRef(false);
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

  // Galeri ve kamera aynı yoldan gelir; yeni seçimler mevcut seçime EKLENİR (kamera ile
  // art arda çekim / galeri + kamera karışımı mümkün). Boş MIME'lı Android dosyaları uzantıdan tanınır.
  function handleCreatePhotoSelection(files: File[]) {
    if (files.length === 0) return;

    const imageFiles = files.filter(looksLikeImageFile);

    if (imageFiles.length !== files.length) {
      showToast({
        title: t("toast.failTitle"),
        message: t("toast.onlyImages"),
        type: "error",
      });
    }

    if (imageFiles.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...imageFiles]);
    setSelectedPreviews((prev) => [...prev, ...imageFiles.map((file) => URL.createObjectURL(file))]);
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
    const authHeaders: Record<string, string> = {
      "x-user-id": userId ?? "",
      ...(sessionToken ? { "x-session-token": sessionToken } : {}),
    };

    // B4: metadata (GET) ve signed-URL (POST) çağrıları BAĞIMSIZ (signed-urls kendi
    // authoritative sorgusunu yapar) → SERİ yerine PARALEL. Kimlik/tenant/ownership
    // kontrolleri her iki route'ta da SUNUCUDA aynen korunur.
    const [res, sres] = await Promise.all([
      fetch(`/api/clients/${clientId}/stone-photos`, { headers: authHeaders }),
      fetch(`/api/clients/${clientId}/stone-photos/signed-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({}),
      }).catch(() => null),
    ]);

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; photos?: StonePhoto[] };

    if (!res.ok || !json.ok) {
      console.error("Taş fotoğrafları yüklenemedi:", json.error);
      setErrorMessage(t("error.loadPhotos") + ": " + (json.error ?? ""));
      setPhotosLoading(false);
      return;
    }

    const loaded = (json.photos || []) as StonePhoto[];

    // DYA-07: görsel okuma artık kalıcı public URL DEĞİL — YALNIZ kısa ömürlü signed URL.
    // Sunucu, danışanın client_stone_photos metadata'sından imzalar. signed-urls çağrısı
    // GEÇİCİ olarak başarısız olursa: eski public URL veya geçersiz relative file_path'e
    // DÜŞÜLMEZ (bucket private olduğunda kırık görsel gösterilmez). Bunun yerine mevcut
    // fotoğraf durumu KORUNUR ve hata gösterilir → veri kalıcı kaybolmuş gibi görünmez,
    // yeniden denenebilir. Yetki kaybında sunucu 401/403 döner → signed URL verilmez.
    let signedById: Record<string, string> | null = null;
    let thumbById: Record<string, string> = {};
    if (sres) {
      const sjson = (await sres.json().catch(() => ({}))) as {
        ok?: boolean;
        byId?: Record<string, string>;
        thumbById?: Record<string, string>;
      };
      if (sres.ok && sjson.ok && sjson.byId) {
        signedById = sjson.byId;
        thumbById = sjson.thumbById ?? {};
      }
    }

    if (signedById === null) {
      // Geçici hata: mevcut fotoğraflar CLOBBER EDİLMEZ (kalıcı kayıp görünümü olmaz).
      setErrorMessage(t("error.loadPhotos"));
      setPhotosLoading(false);
      return;
    }

    // signed URL olmayan kayıtların image_url'i BOŞ bırakılır (stale/geçersiz URL değil).
    // B1: kart için thumb_url (küçük), lightbox için image_url (tam) doldurulur.
    setPhotos(applySignedPhotoUrls(loaded, signedById, thumbById));
    lastSignedAtRef.current = Date.now();
    setPhotosLoading(false);
  }

  // DYA-07: yalnız signed READ URL'lerini tazeler (kayıt listesini yeniden çekmez).
  // Süre dolması (uzun açık sayfa) için. Başarısızlıkta mevcut URL'ler KORUNUR (clobber yok);
  // yalnız gelen taze URL'ler güncellenir. B3: eşzamanlı yenileme kilidi (duplicate/race önler);
  // başarıda son-imzalama anı güncellenir. Eski isteğin yeni durumu ezmesini önlemek için
  // güncelleme functional setState ile yapılır (yalnız gelen id'ler değişir).
  async function refreshSignedUrls() {
    if (!clientId || !tenantId) return;
    if (refreshingSignedRef.current) return; // eşzamanlı yenilemeyi engelle
    refreshingSignedRef.current = true;
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    try {
      const sres = await fetch(`/api/clients/${clientId}/stone-photos/signed-urls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({}),
      });
      const sjson = (await sres.json().catch(() => ({}))) as {
        ok?: boolean;
        byId?: Record<string, string>;
        thumbById?: Record<string, string>;
      };
      if (sres.ok && sjson.ok && sjson.byId) {
        const byId = sjson.byId;
        const thumbById = sjson.thumbById ?? {};
        setPhotos((prev) =>
          prev.map((p) =>
            byId[p.id]
              ? { ...p, image_url: byId[p.id], thumb_url: thumbById[p.id] ?? p.thumb_url }
              : p,
          ),
        );
        lastSignedAtRef.current = Date.now();
      }
    } catch {
      /* geçici hata → mevcut URL'ler korunur */
    } finally {
      refreshingSignedRef.current = false;
    }
  }

  // B3: signed URL'leri YALNIZ TTL eşiğine (≈%80) ulaşıldıysa yeniler. Sırf pencereye/sekmeye
  // dönüldü diye <img src>/cache anahtarını değiştirip tüm fotoğrafları yeniden indirmeyi önler.
  function maybeRefreshSignedUrls() {
    if (!shouldRefreshSignedUrls(lastSignedAtRef.current, Date.now())) return;
    void refreshSignedUrls();
  }

  async function refreshAll() {
    // B4: taş listesi ve fotoğraf yüklemesi BAĞIMSIZ → paralel (farklı state; sıra bağımlılığı yok).
    await Promise.all([loadStones(), loadPhotos()]);
  }

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      void refreshAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  // DYA-07: signed READ URL süre-dolması yönetimi (veri erişim katmanı; UI değişmez).
  // B3: interval + focus/visibility yalnız EŞİĞE ulaşıldıysa yeniler (gereksiz yeniden indirme yok).
  useEffect(() => {
    if (!clientId || !tenantId) return;
    const interval = setInterval(() => { maybeRefreshSignedUrls(); }, SIGNED_URL_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") maybeRefreshSignedUrls(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  useEffect(() => {
    return () => {
      selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedPreviews]);

  async function uploadFilesForStone(stoneId: string, files: File[]) {
    // DYA-07: SUNUCU-YETKİLİ signed upload. Tarayıcı stone-photos üzerinde anon
    // .upload()/.getPublicUrl() KULLANMAZ; obje yolu SUNUCUDA üretilir. Akış:
    //   1) prepare → { path, token }  (ownership + MIME + boyut sunucuda doğrulanır)
    //   2) uploadToSignedUrl(path, token, file)
    //   3) POST /stone-photos → obje varlığı sunucuda doğrulanır + DB satırı yazılır
    // Yüklemeden önce kalite koruyan optimizasyon (lib/media/imageOptimize): animasyon/PNG
    // korunur, EXIF yönü uygulanır; 10 MB'a sığmayan dosya sessizce gönderilmez.
    for (const original of files) {
      const optimized = await optimizeImageFile(original, { profile: "photo", maxBytes: STONE_PHOTO_MAX_BYTES });
      if (optimized.reason === "heic-undecodable" || optimized.tooLarge) {
        showToast({
          title: t("toast.failTitle"),
          message: t(optimized.tooLarge ? "toast.photoTooLarge" : "toast.photoHeic", { name: original.name }),
          type: "error",
        });
        continue;
      }
      const file = optimized.file;
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const authHeaders = {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      };

      // 1) PREPARE — signed upload capability (path SUNUCUDAN).
      const prepRes = await fetch(`/api/clients/${clientId}/stone-photos/prepare`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ stoneId, mimeType: file.type, size: file.size }),
      });
      const prepJson = (await prepRes.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; demo?: boolean; path?: string; token?: string;
      };

      if (prepJson.demo) continue; // demo hesap: storage mutation yok
      if (!prepRes.ok || !prepJson.ok || !prepJson.path || !prepJson.token) {
        console.error("Foto yükleme hazırlanamadı:", prepJson.error);
        showToast({
          title: t("toast.failTitle"),
          message: t("toast.uploadFailed") + ": " + (prepJson.error ?? ""),
          type: "error",
        });
        continue;
      }

      // 2) UPLOAD — tarayıcı signed token ile yükler (anon ALL policy'ye BAĞLI DEĞİL).
      const { error: uploadError } = await supabase.storage
        .from(STONE_PHOTO_BUCKET)
        .uploadToSignedUrl(prepJson.path, prepJson.token, file);

      if (uploadError) {
        console.error("Foto yüklenemedi:", uploadError);
        showToast({
          title: t("toast.failTitle"),
          message: t("toast.uploadFailed") + ": " + uploadError.message,
          type: "error",
        });
        continue;
      }

      // 3) FINALIZE + DB kaydı — sunucu obje varlığını + path ownership'i doğrular.
      const insertRes = await fetch(`/api/clients/${clientId}/stone-photos`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          stone_id: stoneId,
          file_path: prepJson.path,
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
    setEditingVersion(stone.row_version ?? null);
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
      body: JSON.stringify({ id, row_version: editingVersion, ...formToPayload(editForm) }),
    });

    if (updRes.status === 409 || updRes.status === 428) {
      // DY-03: başka sekme/cihaz kaydı değiştirdi → hiçbir şey yazılmadı; güncel liste yüklenir.
      showToast({ title: t("toast.failTitle"), message: t("toast.recordConflict"), type: "warning" });
      cancelEdit();
      await refreshAll();
      setUpdating(false);
      return;
    }

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

    // DYA-07: taş fotoğrafı storage temizliği SUNUCUDA yapılır (stones DELETE →
    // deleteStonePhotos, service_role + path-ownership guard). Tarayıcı artık anon
    // .remove() ÇAĞIRMAZ (private-ready + cross-tenant silme engeli).
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
      // D1 (DY-04): 404 = kayıt artık yok → listeyi sunucuyla eşitle (bayat satır kalmaz).
      if (delRes.status === 404) await refreshAll();
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

  async function uploadStonePhotos(stoneId: string, files: File[]) {
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

    // DYA-07: storage temizliği SUNUCUDA (stone-photos DELETE → service_role +
    // path-ownership guard). Tarayıcı anon .remove() ÇAĞIRMAZ.
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
      <div className={`overflow-hidden`}>
        <div className={dyp.kHeader}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`${dyp.kEyebrow} mb-2 inline-flex`}>
                {t("header.badge")}
              </div>

              <h2 className={dyp.kTitle}>
                {t("header.title")}
              </h2>

              <p className={`${dyp.kDesc} mt-2 max-w-3xl`}>
                {t("header.subtitle")}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="grid grid-cols-3 gap-2">
                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {stones.length}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.records")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {totalWithPhoto}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.photoStones")}
                  </div>
                </div>

                <div className={dyp.kStat}>
                  <div className={dyp.kStatValue}>
                    {photos.length}
                  </div>
                  <div className={dyp.kStatLabel}>
                    {t("stats.photos")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={showForm
                  ? `${dyp.kBtnSecondary} w-full`
                  : `${dyp.kBtnPrimary} w-full`}
              >
                {showForm ? t("toggleFormClose") : t("toggleFormOpen")}
              </button>
            </div>
          </div>

          <div className={`mt-3 h-px bg-[#e3e7ee]`} />
        </div>

      </div>

      {showForm && (
        <div className={`${dyp.kForm} overflow-hidden`} style={{ padding: 0 }}>
          <div className={`${dyp.kModalHead} flex items-center justify-between`}>
            <div>
              <h3 className={dyp.kSubtitle}>{t("newForm.title")}</h3>
              <p className={`${dyp.kDesc} mt-0.5`}>{t("newForm.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
            >
              {t("cancel")}
            </button>
          </div>
          <div className="p-4">
            {errorMessage && (
              <div className={`${dyp.kAlertDanger} mb-3`}>
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
                className={dyp.kBtnSave}
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

      <div className={dyp.kCard}>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className={dyp.kSubtitle}>
              {t("list.title")}
            </h3>
            <p className={`${dyp.kDesc} mt-1`}>
              {t("list.subtitle")}
            </p>
          </div>

          <button
            onClick={refreshAll}
            disabled={loading || photosLoading}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} w-fit`}
          >
            {loading || photosLoading ? t("list.loading") : t("list.refresh")}
          </button>
        </div>

        {loading ? (
          <div className={dyp.kEmpty}>
            {t("list.loadingRecords")}
          </div>
        ) : stones.length === 0 ? (
          <div className={dyp.kEmpty}>
            <div className={dyp.kSubtitle}>
              {t("empty.title")}
            </div>
            <p className={`${dyp.kDesc} mt-2`}>
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
                  className={`${dyp.kCard} overflow-hidden`} style={{ padding: 0 }}
                >
                  {!isEditing ? (
                    <div className="p-4">
                      <div className="grid gap-2 lg:grid-cols-[145px_1fr]">
                        <div>
                          {coverPhoto ? (
                            <button
                              type="button"
                              onClick={() => openLightbox(stonePhotos, coverPhoto)}
                              className={`block h-32 w-full overflow-hidden rounded-lg border border-[#e3e7ee]`}
                            >
                              <img
                                src={coverPhoto.thumb_url || coverPhoto.image_url}
                                alt={stone.stone_name || t("photoAlt")}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (coverPhoto.image_url && img.src !== coverPhoto.image_url)
                                    img.src = coverPhoto.image_url;
                                }}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                            </button>
                          ) : (
                            <div className={`${dyp.kField} ${dyp.kMeta} flex h-32 w-full items-center justify-center text-center`}>
                              {t("card.noPhoto")}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className={`${dyp.kChipTeal} mb-2 inline-flex`}>
                                {stone.stone_type || t("card.noType")}
                              </div>

                              <h4 className={dyp.kSubtitle}>
                                {stone.stone_name || t("card.noName")}
                              </h4>

                              <p className={`${dyp.kMeta} mt-1`}>
                                {t("card.stoneDate", { date: fmtDate(stone.stone_date) })}
                              </p>

                              <p className={`${dyp.kMeta} mt-1`}>
                                {t("card.recordDate", { date: fmtDate(stone.created_at) })}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2.5">
                              <label className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}>
                                {uploadingStoneId === stone.id
                                  ? t("gallery.uploading")
                                  : t("gallery.add")}
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingStoneId === stone.id}
                                  onChange={(event) => {
                                    const files = Array.from(event.target.files || []);
                                    event.target.value = "";
                                    uploadStonePhotos(stone.id, files);
                                  }}
                                />
                              </label>
                              <CameraCaptureButton
                                onFiles={(files) => uploadStonePhotos(stone.id, files)}
                                disabled={uploadingStoneId === stone.id}
                                className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                              >
                                {t("photoPicker.camera")}
                              </CameraCaptureButton>

                              <button
                                onClick={() => startEdit(stone)}
                                className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                              >
                                {t("item.edit")}
                              </button>

                              <button
                                onClick={() => deleteStone(stone.id)}
                                className={`${dyp.kBtnDanger} ${dyp.kBtnSm} ml-1`}
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
                            <div className={`${dyp.kEmpty} mt-3`}>
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
                    <div className={`border-l-2 border-[#0f6e6e] bg-[#f7f9fb] p-4`}>
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h4 className={dyp.kSubtitle}>
                            {t("editForm.title")}
                          </h4>
                          <p className={`${dyp.kDesc} mt-1`}>
                            {t("editForm.subtitle")}
                          </p>
                        </div>

                        <button
                          onClick={cancelEdit}
                          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} self-start sm:shrink-0`}
                        >
                          {t("cancelTop")}
                        </button>
                      </div>

                      <FormFields data={editForm} onChange={updateEditField} />

                      {/* Fotoğraf yönetimi — düzenleme ekranından erişilebilir (spec §10).
                          Mevcut güvenli upload/read/delete mekanizması (PhotoGallery) yeniden
                          kullanılır; yeni paralel uploader YOK. */}
                      <div className="mt-4">
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

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className={dyp.kBtnSecondary}
                        >
                          {t("cancel")}
                        </button>

                        <button
                          onClick={() => updateStone(stone.id)}
                          disabled={updating}
                          className={dyp.kBtnSave}
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
          className={`${dyp.kOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`}
          onClick={closeLightbox}
        >
          <div
            className={`${dyp.kModal} relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${dyp.kModalHead} flex items-center justify-between gap-2`}>
              <div>
                <div className={dyp.kSubtitle}>
                  {t("lightbox.title")}
                </div>
                <div className={`${dyp.kMeta} mt-1`}>
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </div>
              </div>

              <button
                type="button"
                onClick={closeLightbox}
                className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
              >
                {t("close")}
              </button>
            </div>

            <div className="relative flex min-h-[320px] items-center justify-center bg-slate-950 p-4">
              {lightboxPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={showPrevPhoto}
                  className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#d4dae3] bg-white/95 text-base font-bold text-[#0f1d36] transition hover:bg-white"
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
                  className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#d4dae3] bg-white/95 text-base font-bold text-[#0f1d36] transition hover:bg-white"
                >
                  ›
                </button>
              )}
            </div>

            <div className={`${dyp.kModalFoot} flex flex-col gap-2 md:flex-row md:items-center md:justify-between`}>
              <div className="flex gap-2 overflow-x-auto">
                {lightboxPhotos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className={`h-10 w-10 shrink-0 overflow-hidden rounded-md border-2 transition ${
                      index === lightboxIndex
                        ? "border-[#0f6e6e]"
                        : "border-slate-200 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={photo.thumb_url || photo.image_url}
                      alt={t("lightbox.thumbAlt")}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (photo.image_url && img.src !== photo.image_url) img.src = photo.image_url;
                      }}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => deletePhoto(activeLightboxPhoto)}
                disabled={deletingPhotoId === activeLightboxPhoto.id}
                className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}
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

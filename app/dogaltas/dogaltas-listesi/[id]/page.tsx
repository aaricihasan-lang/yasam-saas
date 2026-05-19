"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const STONE_BUCKET = "stone-photos";

const CHAKRA_OPTIONS = [
  "Kök Çakra",
  "Sakral Çakra",
  "Solar Pleksus",
  "Kalp Çakrası",
  "Boğaz Çakrası",
  "Üçüncü Göz",
  "Taç Çakra",
];

const WARNING_OPTIONS = [
  "Çocuklar",
  "Hamileler",
  "Tansiyon",
  "Kalp Rahatsızlığı",
  "Epilepsi",
  "Alerji",
  "Böbrek",
  "Uyku",
  "Psikolojik Hassasiyet",
  "Uzman Kontrolü",
];

const ASSIGNMENT_SECTIONS = [
  "Elementler",
  "Mineraller",
  "Etkili Organlar",
  "Astrolojik Atama",
  "Çakra Atama",
  "Burçlar",
  "Mizaçlar",
  "Kan Grupları",
];

type StoneRecord = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
};

type EditableTextField =
  | "stone_name"
  | "short_description"
  | "general_info"
  | "source_note"
  | "physical_effects"
  | "spiritual_effects"
  | "other_effects"
  | "warning_text"
  | "feng_shui"
  | "meditation"
  | "care"
  | "application";

type ActiveEditor =
  | {
      mode: "text";
      field: EditableTextField;
      title: string;
      badge: string;
      value: string;
      multiline: boolean;
    }
  | {
      mode: "checkbox";
      field: "chakras" | "warning_tags";
      title: string;
      badge: string;
      selected: string[];
      options: string[];
    }
  | {
      mode: "assignments";
      title: string;
      badge: string;
      values: Record<string, string>;
    };

type ActiveReader = {
  title: string;
  badge: string;
  text: string;
};

type StoneImageItem = {
  id: string;
  name: string;
  url?: string;
  file_path?: string;
  displayable: boolean;
};

function isWebImageUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAssignments(raw: unknown): Record<string, string[][]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Record<string, string[][]> = {};

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const rows = value
        .map((row) => {
          if (Array.isArray(row)) {
            return row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
          }
          if (typeof row === "string" && row.trim()) return [row.trim()];
          return [];
        })
        .filter((row) => row.length > 0);
      if (rows.length > 0) result[key] = rows;
      return;
    }

    if (typeof value === "string" && value.trim()) {
      result[key] = [[value.trim()]];
    }
  });

  return result;
}

function normalizeImages(raw: unknown): StoneImageItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (typeof item === "string") {
      const path = item.trim();
      return {
        id: `legacy-${index}`,
        name: path.split(/[/\\]/).pop() || `Görsel ${index + 1}`,
        file_path: path || undefined,
        displayable: false,
      };
    }

    if (!item || typeof item !== "object") {
      return {
        id: `unknown-${index}`,
        name: `Görsel ${index + 1}`,
        displayable: false,
      };
    }

    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const filePath =
      typeof record.file_path === "string" ? record.file_path.trim() : "";
    const displayable = isWebImageUrl(url);

    return {
      id: String(record.id ?? `img-${index}`),
      name: String(
        record.name ?? filePath.split(/[/\\]/).pop() ?? url ?? `Görsel ${index + 1}`,
      ),
      url: displayable ? url : undefined,
      file_path: filePath || undefined,
      displayable,
    };
  });
}

function toSafeStone(data: Record<string, unknown> | null | undefined): StoneRecord | null {
  if (!data || data.id == null) return null;

  const stringField = (value: unknown) =>
    typeof value === "string" ? value : value != null ? String(value) : "";

  return {
    id: String(data.id),
    tenant_id: stringField(data.tenant_id),
    stone_name: stringField(data.stone_name) || "İsimsiz Taş",
    short_description: stringField(data.short_description),
    general_info: stringField(data.general_info),
    source_note: stringField(data.source_note),
    physical_effects: stringField(data.physical_effects),
    spiritual_effects: stringField(data.spiritual_effects),
    other_effects: stringField(data.other_effects),
    warning_text: stringField(data.warning_text),
    warning_tags: Array.isArray(data.warning_tags)
      ? data.warning_tags.map((tag) => String(tag)).filter(Boolean)
      : [],
    feng_shui: stringField(data.feng_shui),
    meditation: stringField(data.meditation),
    care: stringField(data.care),
    application: stringField(data.application),
    chakras: Array.isArray(data.chakras)
      ? data.chakras.map((chakra) => String(chakra)).filter(Boolean)
      : [],
    assignments: normalizeAssignments(data.assignments),
    images: normalizeImages(data.images),
    created_at: stringField(data.created_at) || new Date().toISOString(),
    updated_at: data.updated_at != null ? stringField(data.updated_at) : null,
  };
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_42%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-6 px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[34px] border-[3px] border-cyan-400/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(34,211,238,0.16)] backdrop-blur-xl";
const uiProfileCard =
  "rounded-[34px] border-[3px] border-violet-300/45 bg-gradient-to-br from-white/80 via-cyan-50/70 to-violet-50/70 p-6 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl";
const uiImageArea =
  "flex min-h-[260px] items-center justify-center rounded-[28px] border-[3px] border-dashed border-cyan-300 bg-white/70 shadow-inner";
const uiStatBox =
  "rounded-2xl border-2 border-cyan-200 bg-white/85 p-4 text-center shadow-md";
const uiInfoCard =
  "w-full rounded-[30px] border-[3px] border-cyan-300/45 bg-white/78 p-6 text-left shadow-[0_0_38px_rgba(34,211,238,0.13)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-violet-400 hover:shadow-[0_0_48px_rgba(139,92,246,0.18)]";
const uiContentBox =
  "mt-4 min-h-[130px] rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-5 text-base leading-7 text-slate-700 shadow-inner";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiThumb =
  "overflow-hidden rounded-2xl border-2 border-cyan-200 shadow-md transition-all duration-300 hover:scale-[1.03]";

function toneClass(tone: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky" | "amber") {
  const toneMap = {
    slate:
      "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black tracking-wide text-slate-700",
    cyan: "inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black tracking-wide text-cyan-700",
    violet:
      "inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black tracking-wide text-violet-700",
    emerald:
      "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black tracking-wide text-emerald-700",
    rose: "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black tracking-wide text-red-600",
    sky: "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black tracking-wide text-sky-700",
    amber:
      "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black tracking-wide text-amber-700",
  };

  return toneMap[tone];
}

function shortPreview(text: string | null | undefined, limit = 180) {
  if (!text || !text.trim()) return "Henüz bilgi girilmedi.";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function rowsToText(rows: string[][] | unknown) {
  if (!Array.isArray(rows)) return "";

  return rows
    .map((row) => {
      if (Array.isArray(row)) return row.map((cell) => String(cell ?? "")).join(" / ");
      if (typeof row === "string") return row;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function textToRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean)
    );
}

function assignmentsToValues(assignments: Record<string, string[][]> | null | undefined) {
  const safeAssignments = normalizeAssignments(assignments);
  const result: Record<string, string> = {};

  ASSIGNMENT_SECTIONS.forEach((section) => {
    result[section] = rowsToText(safeAssignments[section]);
  });

  Object.entries(safeAssignments).forEach(([key, rows]) => {
    if (!(key in result)) result[key] = rowsToText(rows);
  });

  return result;
}

function valuesToAssignments(values: Record<string, string>) {
  const result: Record<string, string[][]> = {};

  Object.entries(values).forEach(([key, value]) => {
    const rows = textToRows(value);
    if (rows.length > 0) result[key] = rows;
  });

  return result;
}

function TextBlock({
  title,
  badge,
  text,
  tone = "slate",
  editEnabled,
  onOpenEdit,
  onOpenRead,
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky" | "amber";
  editEnabled: boolean;
  onOpenEdit: () => void;
  onOpenRead: () => void;
}) {
  if (editEnabled) {
    return (
      <button
        type="button"
        onClick={onOpenEdit}
        className={uiInfoCard}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={toneClass(tone)}>{badge}</div>

            <h2 className="mt-2 truncate text-2xl font-black text-slate-950">
              {title}
            </h2>

            <p className="mt-2 line-clamp-1 text-base leading-7 text-slate-700">
              {shortPreview(text, 90)}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-black text-cyan-700 shadow-sm">
            Düzenle
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenRead}
      className={uiInfoCard}
    >
      <div className={toneClass(tone)}>{badge}</div>

      <h2 className="mt-2 text-2xl font-black text-slate-950">{title}</h2>

      <div className={uiContentBox}>
        <p className={`line-clamp-5 whitespace-pre-wrap ${!text?.trim() ? uiEmptyText : ""}`}>
          {shortPreview(text, 420)}
        </p>
      </div>

      <p className="mt-4 text-sm font-black text-cyan-700">
        Tam okumak için tıklayın
      </p>
    </button>
  );
}

export default function StoneDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { confirm } = useConfirm();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [stone, setStone] = useState<StoneRecord | null>(null);
  const stoneRef = useRef<StoneRecord | null>(null);

  useEffect(() => {
    stoneRef.current = stone;
  }, [stone]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null);
  const [activeReader, setActiveReader] = useState<ActiveReader | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(
    null
  );
  const [imageBusy, setImageBusy] = useState(false);

  function handleExitEditMode() {
    setEditEnabled(false);
    setActiveEditor(null);
    setActiveReader(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function commitStoneRecord(raw: Record<string, unknown> | null | undefined) {
    const safe = toSafeStone(raw);
    setStone(safe);
    return safe;
  }

  async function loadStone() {
    if (!id) return;

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { data, error } = await supabase
        .from("stones")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      setLoading(false);

      if (error) {
        setStone(null);
        setErrorMessage(`Kayıt okunurken hata oluştu\n${error.message}`);
        return;
      }

      if (!data) {
        setStone(null);
        setErrorMessage(`Kayıt bulunamadı.\nID: ${id}`);
        return;
      }

      const safe = commitStoneRecord(data as Record<string, unknown>);
      if (!safe) {
        setErrorMessage(`Kayıt okunurken hata oluştu\nGeçersiz kayıt verisi`);
      }
    } catch (err) {
      setLoading(false);
      setStone(null);
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Kayıt okunurken hata oluştu\n${message}`);
    }
  }

  useEffect(() => {
    runInEffect(() => {
      loadStone();
    });
  }, [id]);

  function openReader(title: string, badge: string, text: string | null | undefined) {
    if (editEnabled) return;

    setActiveReader({
      title,
      badge,
      text: text && text.trim() ? text : "Henüz bilgi girilmedi.",
    });
  }

  function openTextEditor(
    field: EditableTextField,
    title: string,
    badge: string,
    multiline = true
  ) {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      mode: "text",
      field,
      title,
      badge,
      value: String(stone[field] || ""),
      multiline,
    });
  }

  function openCheckboxEditor(
    field: "chakras" | "warning_tags",
    title: string,
    badge: string,
    options: string[]
  ) {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      mode: "checkbox",
      field,
      title,
      badge,
      selected: stone[field] || [],
      options,
    });
  }

  function openAssignmentsEditor() {
    if (!stone || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      mode: "assignments",
      title: "Atamalar",
      badge: "ATAMA",
      values: assignmentsToValues(stone.assignments),
    });
  }

  function toggleSelected(option: string) {
    if (!activeEditor || activeEditor.mode !== "checkbox") return;

    setActiveEditor({
      ...activeEditor,
      selected: activeEditor.selected.includes(option)
        ? activeEditor.selected.filter((item) => item !== option)
        : [...activeEditor.selected, option],
    });
  }

  async function saveEditor() {
    if (!stone || !activeEditor) return;

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (activeEditor.mode === "text") {
      if (activeEditor.field === "stone_name" && !activeEditor.value.trim()) {
        setSaving(false);
        setErrorMessage("Taş adı boş bırakılamaz.");
        return;
      }

      payload[activeEditor.field] = activeEditor.value.trim()
        ? activeEditor.value.trim()
        : null;
    }

    if (activeEditor.mode === "checkbox") {
      payload[activeEditor.field] = activeEditor.selected;
    }

    if (activeEditor.mode === "assignments") {
      payload.assignments = valuesToAssignments(activeEditor.values);
    }

    const { data, error } = await supabase
      .from("stones")
      .update(payload)
      .eq("tenant_id", TENANT_ID)
      .eq("id", stone.id)
      .select("*")
      .maybeSingle();

    setSaving(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    if (!data) {
      setErrorMessage("Kayıt güncellenemedi: kayıt bulunamadı.");
      return;
    }

    commitStoneRecord(data as Record<string, unknown>);
    setActiveEditor(null);
  }

  async function deleteStone() {
    if (!stone) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", TENANT_ID)
      .eq("id", stone.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Kayıt silinemedi: ${error.message}`);
      return;
    }

    router.push("/dogaltas/dogaltas-listesi");
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    event.target.value = "";
    const currentStone = stoneRef.current;
    if (!currentStone || files.length === 0) return;

    setImageBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    const additions: { id: string; name: string; url: string; file_path: string }[] = [];
    const baseImages = [...(currentStone.images || [])];

    for (const file of files) {
      const cleanName = safeFileName(file.name);
      const filePath = `catalog/${TENANT_ID}/${currentStone.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from(STONE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setImageBusy(false);
        setErrorMessage(`Görsel yüklenemedi: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(STONE_BUCKET).getPublicUrl(filePath);

      additions.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        url: publicUrlData.publicUrl,
        file_path: filePath,
      });
    }

    const nextImages = [...baseImages, ...additions];

    const { data, error } = await supabase
      .from("stones")
      .update({
        images: nextImages,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", TENANT_ID)
      .eq("id", currentStone.id)
      .select("*")
      .maybeSingle();

    setImageBusy(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    if (!data) {
      setErrorMessage("Kayıt güncellenemedi: kayıt bulunamadı.");
      return;
    }

    commitStoneRecord(data as Record<string, unknown>);
  }

  async function handleDeleteImage(image: {
    id: string;
    name: string;
    url?: string;
    file_path?: string;
  }) {
    const currentStone = stoneRef.current;
    if (!currentStone) return;

    const confirmed = await confirm({
      title: "Fotoğrafı sil",
      message: `${image.name} silinsin mi? Bu işlem geri alınamaz.`,
      tone: "danger",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
    });
    if (!confirmed) return;

    setImageBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (image.file_path) {
      const { error: removeError } = await supabase.storage.from(STONE_BUCKET).remove([image.file_path]);
      if (removeError) {
        setImageBusy(false);
        setErrorMessage(`Depolama temizlenemedi: ${removeError.message}`);
        return;
      }
    }

    const nextImages = (currentStone.images || []).filter((img) => img.id !== image.id);

    const { data, error } = await supabase
      .from("stones")
      .update({
        images: nextImages.length > 0 ? nextImages : [],
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", TENANT_ID)
      .eq("id", currentStone.id)
      .select("*")
      .maybeSingle();

    setImageBusy(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    if (!data) {
      setErrorMessage("Kayıt güncellenemedi: kayıt bulunamadı.");
      return;
    }

    if (previewImage?.url && image.url && previewImage.url === image.url) {
      setPreviewImage(null);
    }

    commitStoneRecord(data as Record<string, unknown>);
  }

  const safeStone = useMemo(
    () => (stone ? toSafeStone(stone as unknown as Record<string, unknown>) : null),
    [stone],
  );

  const hasAssignments = useMemo(() => {
    if (!safeStone?.assignments) return false;
    return Object.values(safeStone.assignments).some(
      (rows) => Array.isArray(rows) && rows.length > 0,
    );
  }, [safeStone]);

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          Kayıt yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !stone) {
    const isReadError = errorMessage.startsWith("Kayıt okunurken hata oluştu");

    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-[48px]">💎</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-950">
            {isReadError ? "Kayıt okunurken hata oluştu" : "Kayıt bulunamadı"}
          </h1>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-6 text-slate-500">
            {isReadError
              ? errorMessage.replace(/^Kayıt okunurken hata oluştu\n?/, "")
              : errorMessage || "Bu doğaltaş kaydı görüntülenemedi."}
          </p>

          <Link
            href="/dogaltas/dogaltas-listesi"
            className="mt-6 inline-flex rounded-2xl border-2 border-cyan-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-cyan-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  if (!safeStone) return null;

  const safeChakras = Array.isArray(safeStone.chakras) ? safeStone.chakras : [];
  const safeImages = Array.isArray(safeStone.images) ? safeStone.images : [];
  const safeWarningTags = Array.isArray(safeStone.warning_tags) ? safeStone.warning_tags : [];

  const images = normalizeImages(safeImages);
  const imagesWithUrl = images.filter((img) => img.displayable && img.url);
  const imagesNotWebFormat = images.filter((img) => !img.displayable);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-cyan-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-cyan-700">
              💎 DOĞALTAŞ DETAY
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openTextEditor("stone_name", "Taş Adı", "BAŞLIK", false)}
                className="block w-full rounded-2xl border-2 border-cyan-200 bg-white/90 px-4 py-2 text-left text-5xl font-black tracking-tight text-slate-950 shadow-md transition hover:border-violet-300 xl:text-6xl"
              >
                {safeStone.stone_name}
              </button>
            ) : (
              <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
                {safeStone.stone_name}
              </h1>
            )}

            <p className="mt-3 text-lg font-medium text-slate-600">
              Oluşturma: {formatDate(safeStone.created_at)}
              {safeStone.updated_at
                ? ` · Güncelleme: ${formatDate(safeStone.updated_at)}`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/dogaltas-listesi"
              className="rounded-2xl border-2 border-cyan-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md hover:bg-cyan-50"
            >
              Listeye Dön
            </Link>

            <button
              type="button"
              onClick={() => {
                if (editEnabled) {
                  handleExitEditMode();
                } else {
                  setEditEnabled(true);
                  setActiveEditor(null);
                  setActiveReader(null);
                  setErrorMessage("");
                  setSuccessMessage("");
                }
              }}
              className={
                editEnabled
                  ? "rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white shadow-md hover:bg-emerald-700"
                  : "rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-md hover:bg-violet-700"
              }
            >
              {editEnabled ? "Kaydet" : "Düzenle"}
            </button>

            <button
              type="button"
              onClick={() => setShowDeletePopup(true)}
              className="rounded-2xl bg-red-500 px-6 py-4 font-black text-white shadow-md hover:bg-red-600"
            >
              Sil
            </button>
          </div>
        </header>

        {editEnabled && (
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/90 px-5 py-3 text-sm font-black text-violet-800 shadow-sm">
            Düzenleme açık: Klasörler küçültüldü. Düzenlemek istediğiniz klasörü seçin.
          </div>
        )}

        {(errorMessage || successMessage) && (
          <div
            className={`rounded-2xl border-2 px-5 py-3 text-sm font-black ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
          <aside className="space-y-6">
            <div className={`${uiProfileCard} text-center`}>
              {imagesWithUrl.length > 0 ? (
                <>
                  <div className={`relative overflow-hidden ${uiImageArea}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: imagesWithUrl[0].url!,
                          name: imagesWithUrl[0].name,
                        })
                      }
                      className="flex w-full items-center justify-center p-2"
                    >
                      <img
                        src={imagesWithUrl[0].url}
                        alt={imagesWithUrl[0].name}
                        className="max-h-[220px] w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                    {editEnabled && (
                      <button
                        type="button"
                        disabled={imageBusy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteImage(imagesWithUrl[0]);
                        }}
                        className="absolute right-2 top-2 z-10 rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white shadow-sm ring-1 ring-rose-700 transition hover:bg-rose-700 disabled:opacity-50"
                      >
                        Sil
                      </button>
                    )}
                    <h2 className="border-t border-cyan-200/80 bg-white/70 px-3 pb-3 pt-3 text-xl font-black text-slate-950">
                      {safeStone.stone_name}
                    </h2>
                  </div>

                  {imagesWithUrl.length > 1 && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {imagesWithUrl.slice(1).map((img) => (
                        <div key={img.id} className="relative h-14 w-14 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({ url: img.url!, name: img.name })
                            }
                            className={`flex h-14 w-14 ${uiThumb}`}
                          >
                            <img
                              src={img.url}
                              alt={img.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                          {editEnabled && (
                            <button
                              type="button"
                              disabled={imageBusy}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleDeleteImage(img);
                              }}
                              className="absolute -right-1 -top-1 z-10 rounded-md bg-rose-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm ring-1 ring-rose-700 hover:bg-rose-700 disabled:opacity-50"
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={uiImageArea}>
                  <div>
                    <div className="text-[62px]">💎</div>
                    <h2 className="mt-2 text-[20px] font-black text-slate-950">
                      {safeStone.stone_name}
                    </h2>
                    <p className="mt-2 px-3 text-[12px] leading-5 text-slate-500">
                      Gerçek görsel için Supabase Storage bağlantısı gerekli.
                    </p>
                  </div>
                </div>
              )}

              {imagesNotWebFormat.length > 0 && (
                <div className="mt-4 space-y-2 text-left">
                  <p className="text-[12px] font-black text-slate-700">
                    Web&apos;de gösterilemeyen görseller
                  </p>
                  {imagesNotWebFormat.map((image) => (
                    <div
                      key={image.id}
                      className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100"
                    >
                      <span className="block min-w-0 truncate">{image.name}</span>
                      <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                        Görsel yolu web formatında değil
                      </span>
                      {editEnabled && (
                        <button
                          type="button"
                          disabled={imageBusy}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteImage(image);
                          }}
                          className="mt-2 shrink-0 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white ring-1 ring-rose-700 transition hover:bg-rose-700 disabled:opacity-50"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editEnabled && (
                <div className="mt-4">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={imageBusy}
                  />
                  <button
                    type="button"
                    disabled={imageBusy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      photoInputRef.current?.click();
                    }}
                    className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_8px_20px_rgba(8,145,178,0.22)] ring-1 ring-cyan-700 transition hover:bg-cyan-700 disabled:opacity-50"
                  >
                    Fotoğraf Ekle
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => openCheckboxEditor("chakras", "Çakralar", "ÇAKRA", CHAKRA_OPTIONS)}
              className={uiInfoCard}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-slate-950">Çakralar</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Seç
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {safeChakras.length === 0 ? (
                  <span className="text-[13px] text-slate-400">-</span>
                ) : (
                  safeChakras.slice(0, editEnabled ? 3 : 99).map((chakra) => (
                    <span
                      key={chakra}
                      className={toneClass("violet")}
                    >
                      {chakra}
                    </span>
                  ))
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => openCheckboxEditor("warning_tags", "Uyarı Etiketleri", "UYARI ETİKETLERİ", WARNING_OPTIONS)}
              className={uiInfoCard}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-slate-950">Uyarı Etiketleri</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Seç
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {safeWarningTags.length === 0 ? (
                  <span className="text-[13px] text-slate-400">-</span>
                ) : (
                  safeWarningTags.slice(0, editEnabled ? 3 : 99).map((tag) => (
                    <span
                      key={tag}
                      className={toneClass("rose")}
                    >
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={openAssignmentsEditor}
              className={uiInfoCard}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-slate-950">Atamalar</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Düzenle
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {hasAssignments ? (
                  Object.entries(safeStone.assignments).map(([title, rows]) => {
                    const safeRows = Array.isArray(rows) ? rows : [];
                    if (safeRows.length === 0) return null;

                    return (
                      <div key={title} className="rounded-2xl bg-slate-50/70 p-3">
                        <p className="text-[12px] font-black text-slate-700">{title}</p>
                        <div className="mt-1 space-y-1">
                          {safeRows.slice(0, editEnabled ? 2 : 99).map((row, index) => {
                            const cells = Array.isArray(row)
                              ? row.map((cell) => String(cell ?? ""))
                              : [String(row ?? "")];

                            return (
                              <p
                                key={`${title}-${index}`}
                                className="text-[12px] leading-5 text-slate-500"
                              >
                                • {cells.filter(Boolean).join(" / ")}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <span className="text-[13px] text-slate-400">-</span>
                )}
              </div>
            </button>
          </aside>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TextBlock
              title="Kısa Açıklama"
              badge="GENEL BİLGİ"
              text={safeStone.short_description}
              tone="cyan"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("short_description", "Kısa Açıklama", "GENEL BİLGİ")}
              onOpenRead={() => openReader("Kısa Açıklama", "GENEL BİLGİ", safeStone.short_description)}
            />

            <TextBlock
              title="Genel Taş Açıklaması"
              badge="DETAYLI BİLGİ"
              text={safeStone.general_info}
              tone="cyan"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("general_info", "Genel Taş Açıklaması", "DETAYLI BİLGİ")}
              onOpenRead={() => openReader("Genel Taş Açıklaması", "DETAYLI BİLGİ", safeStone.general_info)}
            />

            <TextBlock
              title="Kaynak Notu"
              badge="KAYNAK"
              text={safeStone.source_note}
              tone="slate"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("source_note", "Kaynak Notu", "KAYNAK")}
              onOpenRead={() => openReader("Kaynak Notu", "KAYNAK", safeStone.source_note)}
            />

            <TextBlock
              title="Fiziksel Etkiler"
              badge="BEDENSEL ETKİ"
              text={safeStone.physical_effects}
              tone="emerald"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("physical_effects", "Fiziksel Etkiler", "BEDENSEL ETKİ")}
              onOpenRead={() => openReader("Fiziksel Etkiler", "BEDENSEL ETKİ", safeStone.physical_effects)}
            />

            <TextBlock
              title="Ruhsal Etkiler"
              badge="RUHSAL ETKİ"
              text={safeStone.spiritual_effects}
              tone="violet"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("spiritual_effects", "Ruhsal Etkiler", "RUHSAL ETKİ")}
              onOpenRead={() => openReader("Ruhsal Etkiler", "RUHSAL ETKİ", safeStone.spiritual_effects)}
            />

            <TextBlock
              title="Diğer Etkiler"
              badge="TAMAMLAYICI NOT"
              text={safeStone.other_effects}
              tone="amber"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("other_effects", "Diğer Etkiler", "TAMAMLAYICI NOT")}
              onOpenRead={() => openReader("Diğer Etkiler", "TAMAMLAYICI NOT", safeStone.other_effects)}
            />

            <div className="lg:col-span-2">
              <TextBlock
                title="Uyarılar ve Hassasiyetler"
                badge="KLİNİK NOT"
                text={safeStone.warning_text}
                tone="rose"
                editEnabled={editEnabled}
                onOpenEdit={() => openTextEditor("warning_text", "Uyarılar ve Hassasiyetler", "KLİNİK NOT")}
                onOpenRead={() =>
                  openReader("Uyarılar ve Hassasiyetler", "KLİNİK NOT", safeStone.warning_text)
                }
              />
            </div>

            <section className={`${uiInfoCard} lg:col-span-2`}>
              <div className={toneClass("cyan")}>KULLANIM ALANLARI</div>

              <h2 className="mt-2 text-2xl font-black text-slate-950">
                Kullanım / Uygulama Notları
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["Feng Shui", "feng_shui", safeStone.feng_shui],
                  ["Meditasyon", "meditation", safeStone.meditation],
                  ["Bakım", "care", safeStone.care],
                  ["Uygulama", "application", safeStone.application],
                ].map(([title, key, text]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() =>
                      editEnabled
                        ? openTextEditor(
                            key as EditableTextField,
                            String(title),
                            "KULLANIM ALANI"
                          )
                        : openReader(String(title), "KULLANIM ALANI", String(text || ""))
                    }
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-4 text-left shadow-inner transition hover:border-cyan-300 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-black text-slate-950">{title}</h3>
                      {editEnabled ? (
                        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[9px] font-black text-cyan-700 ring-1 ring-cyan-100">
                          Düzenle
                        </span>
                      ) : (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-slate-400 ring-1 ring-slate-100">
                          Oku
                        </span>
                      )}
                    </div>

                    <p className={`mt-2 line-clamp-2 text-base leading-7 text-slate-700 ${!String(text || "").trim() ? uiEmptyText : ""}`}>
                      {shortPreview(String(text || ""), 80)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </section>
      </div>

      {activeReader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm">
          <div className="w-full max-w-[920px] rounded-[30px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)] ring-1 ring-white">
            <header className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-cyan-700 ring-1 ring-cyan-100">
                  {activeReader.badge}
                </div>

                <h2 className="text-[24px] font-black text-slate-950">
                  {activeReader.title}
                </h2>

                <p className="mt-1 text-[12px] font-bold text-slate-400">
                  {safeStone.stone_name} kaydı okunuyor.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveReader(null)}
                className="rounded-2xl bg-slate-950 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)] transition hover:bg-slate-800"
              >
                Kapat
              </button>
            </header>

            <div className="max-h-[62vh] overflow-y-auto rounded-[24px] bg-slate-50/80 p-5 text-[15px] leading-8 text-slate-700 ring-1 ring-slate-100">
              <div className="whitespace-pre-wrap">{activeReader.text}</div>
            </div>
          </div>
        </div>
      )}

      {activeEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm">
          <div className="w-full max-w-[920px] rounded-[30px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)] ring-1 ring-white">
            <header className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-cyan-700 ring-1 ring-cyan-100">
                  {activeEditor.badge}
                </div>

                <h2 className="text-[24px] font-black text-slate-950">
                  {activeEditor.title}
                </h2>

                <p className="mt-1 text-[12px] font-bold text-slate-400">
                  {safeStone.stone_name} kaydı düzenleniyor.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveEditor(null)}
                  disabled={saving}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  Vazgeç
                </button>

                <button
                  type="button"
                  onClick={saveEditor}
                  disabled={saving}
                  className="rounded-2xl bg-emerald-600 px-6 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)] transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet / Güncelle"}
                </button>
              </div>
            </header>

            {activeEditor.mode === "checkbox" && (
              <div className="grid max-h-[56vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {activeEditor.options.map((option) => {
                  const checked = activeEditor.selected.includes(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleSelected(option)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-[13px] font-black ring-1 transition ${
                        checked
                          ? "bg-cyan-50 text-cyan-800 ring-cyan-200"
                          : "bg-slate-50 text-slate-600 ring-slate-100 hover:bg-white"
                      }`}
                    >
                      <span>{option}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg text-[13px] ${
                          checked
                            ? "bg-cyan-600 text-white"
                            : "bg-white text-slate-300 ring-1 ring-slate-200"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeEditor.mode === "assignments" && (
              <div className="grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {Object.entries(activeEditor.values).map(([section, value]) => (
                  <div key={section} className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
                    <label className="text-[13px] font-black text-slate-800">
                      {section}
                    </label>

                    <textarea
                      value={value}
                      onChange={(event) =>
                        setActiveEditor({
                          ...activeEditor,
                          values: {
                            ...activeEditor.values,
                            [section]: event.target.value,
                          },
                        })
                      }
                      className="mt-3 h-[105px] w-full resize-none rounded-2xl border border-cyan-100 bg-white p-3 text-[12px] leading-6 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                      placeholder="Her satıra bir kayıt yazın. Örn: Demir / 20"
                    />
                  </div>
                ))}
              </div>
            )}

            {activeEditor.mode === "text" &&
              (activeEditor.multiline ? (
                <textarea
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-[430px] max-h-[62vh] w-full resize-none rounded-[24px] border border-cyan-100 bg-white p-5 text-[15px] leading-8 text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                  placeholder={`${activeEditor.title} yazın...`}
                  autoFocus
                />
              ) : (
                <input
                  value={activeEditor.value}
                  onChange={(event) =>
                    setActiveEditor({ ...activeEditor, value: event.target.value })
                  }
                  className="h-16 w-full rounded-2xl border border-cyan-100 bg-white px-5 text-[24px] font-black text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100/70"
                  placeholder={`${activeEditor.title} yazın...`}
                  autoFocus
                />
              ))}
          </div>
        </div>
      )}

      {showDeletePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
              ⚠️
            </div>

            <h2 className="mt-4 text-[22px] font-black text-slate-950">
              Taşı Sil
            </h2>

            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
              <b>{safeStone.stone_name}</b> kaydını silmek istediğinizden emin misiniz?
            </p>

            <p className="mt-2 text-[12px] font-bold text-rose-600">
              Bu işlem geri alınamaz.
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeletePopup(false)}
                disabled={deleteLoading}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={deleteStone}
                disabled={deleteLoading}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-6"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white transition hover:bg-white/20"
          >
            ×
          </button>

          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-[0_35px_90px_rgba(0,0,0,0.55)]"
            loading="lazy"
            decoding="async"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

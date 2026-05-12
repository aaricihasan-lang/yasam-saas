"use client";

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

function toneClass(tone: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky") {
  const toneMap = {
    slate: "bg-slate-50 text-slate-700",
    cyan: "bg-cyan-50 text-cyan-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700",
  };

  return toneMap[tone];
}

function shortPreview(text: string | null | undefined, limit = 180) {
  if (!text || !text.trim()) return "Henüz bilgi girilmedi.";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function rowsToText(rows: string[][] | undefined) {
  return (rows || []).map((row) => row.join(" / ")).join("\n");
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
  const result: Record<string, string> = {};

  ASSIGNMENT_SECTIONS.forEach((section) => {
    result[section] = rowsToText(assignments?.[section]);
  });

  if (assignments) {
    Object.entries(assignments).forEach(([key, rows]) => {
      if (!(key in result)) result[key] = rowsToText(rows);
    });
  }

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
  tone?: "slate" | "cyan" | "violet" | "emerald" | "rose" | "sky";
  editEnabled: boolean;
  onOpenEdit: () => void;
  onOpenRead: () => void;
}) {
  if (editEnabled) {
    return (
      <button
        type="button"
        onClick={onOpenEdit}
        className="w-full rounded-[18px] border border-white bg-white/88 p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.028)] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:bg-white hover:ring-cyan-200"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-black ${toneClass(tone)}`}>
              {badge}
            </div>

            <h2 className="truncate text-[16px] font-black text-slate-950">
              {title}
            </h2>

            <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-400">
              {shortPreview(text, 90)}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
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
      className="w-full rounded-[22px] border border-white bg-white/88 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:bg-white hover:ring-2 hover:ring-cyan-100"
    >
      <div className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-black ${toneClass(tone)}`}>
        {badge}
      </div>

      <h2 className="text-[17px] font-black text-slate-950">{title}</h2>

      <div className="mt-3 min-h-[76px] rounded-[16px] border border-slate-100 bg-slate-50/65 p-3 text-[12px] leading-6 text-slate-650">
        <p className="line-clamp-5 whitespace-pre-wrap">
          {shortPreview(text, 420)}
        </p>
      </div>

      <p className="mt-3 text-[10px] font-black text-cyan-600">
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
  stoneRef.current = stone;

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
  const [savedAckVisible, setSavedAckVisible] = useState(false);
  const savedAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSavedAck() {
    if (savedAckTimerRef.current) {
      clearTimeout(savedAckTimerRef.current);
    }
    setSavedAckVisible(true);
    savedAckTimerRef.current = setTimeout(() => {
      setSavedAckVisible(false);
      savedAckTimerRef.current = null;
    }, 2200);
  }

  function handleExitEditMode() {
    setEditEnabled(false);
    setActiveEditor(null);
    setActiveReader(null);
    setErrorMessage("");
    setSuccessMessage("");
    setSavedAckVisible(false);
    if (savedAckTimerRef.current) {
      clearTimeout(savedAckTimerRef.current);
      savedAckTimerRef.current = null;
    }
  }

  async function loadStone() {
    if (!id) return;

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("stones")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("id", id)
      .single();

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıt alınamadı: ${error.message}`);
      return;
    }

    setStone(data as StoneRecord);
  }

  useEffect(() => {
    loadStone();
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

    let payload: Record<string, unknown> = {
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
      .single();

    setSaving(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    setStone(data as StoneRecord);
    setActiveEditor(null);
    showSavedAck();
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
      .single();

    setImageBusy(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    setStone(data as StoneRecord);
    showSavedAck();
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
      .single();

    setImageBusy(false);

    if (error) {
      setErrorMessage(`Kayıt güncellenemedi: ${error.message}`);
      return;
    }

    if (previewImage?.url && image.url && previewImage.url === image.url) {
      setPreviewImage(null);
    }

    setStone(data as StoneRecord);
    showSavedAck();
  }

  const images = stone?.images || [];

  const imagesWithUrl = useMemo(
    () => images.filter((img) => img.url && String(img.url).trim()),
    [images]
  );

  const hasAssignments = useMemo(() => {
    if (!stone?.assignments) return false;
    return Object.values(stone.assignments).some((rows) => rows.length > 0);
  }, [stone?.assignments]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] text-slate-500">
        <div className="rounded-[24px] bg-white/80 px-7 py-5 text-[14px] font-black shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-1 ring-white">
          Kayıt yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !stone) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)]">
        <div className="max-w-[500px] rounded-[26px] bg-white/86 p-7 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-1 ring-white">
          <div className="text-[48px]">💎</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-950">Kayıt bulunamadı</h1>
          <p className="mt-3 text-[13px] leading-6 text-slate-500">
            {errorMessage || "Bu doğaltaş kaydı görüntülenemedi."}
          </p>

          <Link
            href="/dogaltas/dogaltas-listesi"
            className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-[13px] font-black text-white"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  if (!stone) return null;

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#edf7ff_0%,#f5f0ff_42%,#f6fffb_100%)] text-slate-950">
      <div className={`mx-auto max-w-[1260px] px-6 py-5${editEnabled ? " pb-24" : ""}`}>
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 inline-flex rounded-full bg-white/70 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-white">
              💎 DOĞALTAŞ DETAY
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openTextEditor("stone_name", "Taş Adı", "BAŞLIK", false)}
                className="block max-w-[620px] rounded-2xl bg-white/80 px-4 py-2 text-left text-[32px] font-black tracking-tight shadow-sm ring-1 ring-cyan-100 transition hover:bg-white hover:ring-cyan-200"
              >
                {stone.stone_name}
              </button>
            ) : (
              <h1 className="text-[32px] font-black tracking-tight">
                {stone.stone_name}
              </h1>
            )}

            <p className="mt-2 text-[13px] font-medium text-slate-500">
              Oluşturma: {formatDate(stone.created_at)}
              {stone.updated_at ? ` · Güncelleme: ${formatDate(stone.updated_at)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/dogaltas-listesi"
              className="rounded-2xl bg-white/85 px-5 py-3 text-[13px] font-black text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.045)] ring-1 ring-white transition hover:bg-white"
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
              className={`rounded-2xl px-6 py-3 text-[13px] font-black shadow-[0_14px_30px_rgba(15,23,42,0.11)] transition ${
                editEnabled
                  ? "bg-cyan-600 text-white hover:bg-cyan-700"
                  : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              {editEnabled ? "Düzenlemeyi Kapat" : "Düzenle"}
            </button>

            <button
              type="button"
              onClick={() => setShowDeletePopup(true)}
              className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_30px_rgba(225,29,72,0.18)] transition hover:bg-rose-700"
            >
              Sil
            </button>
          </div>
        </header>

        {editEnabled && (
          <div className="mb-4 rounded-2xl bg-cyan-50 px-5 py-3 text-[12px] font-black text-cyan-700 ring-1 ring-cyan-100">
            Düzenleme açık: Klasörler küçültüldü. Düzenlemek istediğiniz klasörü seçin.
          </div>
        )}

        {(errorMessage || successMessage) && (
          <div
            className={`mb-4 rounded-2xl px-5 py-3 text-[13px] font-black ring-1 ${
              errorMessage
                ? "bg-rose-50 text-rose-700 ring-rose-100"
                : "bg-emerald-50 text-emerald-700 ring-emerald-100"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[26px] border border-white bg-white/86 p-5 text-center shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
              {imagesWithUrl.length > 0 ? (
                <>
                  <div className="relative overflow-hidden rounded-[22px] border border-cyan-100 bg-cyan-50/60">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewImage({
                          url: imagesWithUrl[0].url!,
                          name: imagesWithUrl[0].name,
                        })
                      }
                      className="flex w-full min-h-[160px] items-center justify-center p-2"
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
                    <h2 className="border-t border-cyan-100/80 bg-white/60 px-2 pb-3 pt-3 text-[18px] font-black text-slate-950">
                      {stone.stone_name}
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
                            className="flex h-14 w-14 overflow-hidden rounded-xl ring-1 ring-slate-100 transition hover:ring-cyan-200"
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
                <div className="flex min-h-[190px] items-center justify-center rounded-[22px] border border-dashed border-cyan-200 bg-cyan-50/60">
                  <div>
                    <div className="text-[62px]">💎</div>
                    <h2 className="mt-2 text-[20px] font-black text-slate-950">
                      {stone.stone_name}
                    </h2>
                    <p className="mt-2 px-3 text-[12px] leading-5 text-slate-500">
                      Gerçek görsel için Supabase Storage bağlantısı gerekli.
                    </p>
                  </div>
                </div>
              )}

              {imagesWithUrl.length === 0 && (
                <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-left text-[11px] font-bold leading-5 text-amber-700 ring-1 ring-amber-100">
                  Şu an eski kayıtta yalnızca resim adı saklandı. Fotoğrafın kendisi veritabanına yüklenmediği için burada görüntülenemez.
                </div>
              )}

              {imagesWithUrl.length === 0 && images.length > 0 && (
                <div className="mt-4 space-y-2 text-left">
                  <p className="text-[12px] font-black text-slate-700">Kayıtlı Resim Adları</p>
                  {images.map((image) => (
                    <div
                      key={image.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100"
                    >
                      <span className="min-w-0 truncate">{image.name}</span>
                      {editEnabled && (
                        <button
                          type="button"
                          disabled={imageBusy}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteImage(image);
                          }}
                          className="shrink-0 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white ring-1 ring-rose-700 transition hover:bg-rose-700 disabled:opacity-50"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {imagesWithUrl.length > 0 &&
                images.some((img) => !img.url?.trim()) && (
                  <>
                    <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-left text-[11px] font-bold leading-5 text-amber-700 ring-1 ring-amber-100">
                      Şu an eski kayıtta yalnızca resim adı saklandı. Fotoğrafın kendisi veritabanına yüklenmediği için burada görüntülenemez.
                    </div>

                    <div className="mt-4 space-y-2 text-left">
                      <p className="text-[12px] font-black text-slate-700">Kayıtlı Resim Adları</p>
                      {images
                        .filter((img) => !img.url?.trim())
                        .map((image) => (
                          <div
                            key={image.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100"
                          >
                            <span className="min-w-0 truncate">{image.name}</span>
                            {editEnabled && (
                              <button
                                type="button"
                                disabled={imageBusy}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleDeleteImage(image);
                                }}
                                className="shrink-0 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white ring-1 ring-rose-700 transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </>
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
              className={`w-full rounded-[18px] bg-white/82 p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.03)] ring-1 ring-white transition ${
                editEnabled ? "hover:bg-white hover:ring-cyan-100" : "hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-black text-slate-950">Çakralar</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Seç
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(stone.chakras || []).length === 0 ? (
                  <span className="text-[13px] text-slate-400">-</span>
                ) : (
                  (stone.chakras || []).slice(0, editEnabled ? 3 : 99).map((chakra) => (
                    <span
                      key={chakra}
                      className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700 ring-1 ring-violet-100"
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
              className={`w-full rounded-[18px] bg-white/82 p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.03)] ring-1 ring-white transition ${
                editEnabled ? "hover:bg-white hover:ring-cyan-100" : "hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-black text-slate-950">Uyarı Etiketleri</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Seç
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(stone.warning_tags || []).length === 0 ? (
                  <span className="text-[13px] text-slate-400">-</span>
                ) : (
                  (stone.warning_tags || []).slice(0, editEnabled ? 3 : 99).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700 ring-1 ring-rose-100"
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
              className={`w-full rounded-[24px] bg-white/82 p-4 text-left shadow-[0_18px_45px_rgba(15,23,42,0.035)] ring-1 ring-white transition ${
                editEnabled ? "hover:bg-white hover:ring-cyan-100" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-black text-slate-950">Atamalar</h3>
                {editEnabled && (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                    Düzenle
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {hasAssignments && stone.assignments ? (
                  Object.entries(stone.assignments).map(([title, rows]) =>
                    rows.length > 0 ? (
                      <div key={title} className="rounded-2xl bg-slate-50/70 p-3">
                        <p className="text-[12px] font-black text-slate-700">{title}</p>
                        <div className="mt-1 space-y-1">
                          {rows.slice(0, editEnabled ? 2 : 99).map((row, index) => (
                            <p key={`${title}-${index}`} className="text-[12px] leading-5 text-slate-500">
                              • {row.join(" / ")}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )
                ) : (
                  <span className="text-[13px] text-slate-400">-</span>
                )}
              </div>
            </button>
          </aside>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <TextBlock
              title="Kısa Açıklama"
              badge="GENEL BİLGİ"
              text={stone.short_description}
              tone="cyan"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("short_description", "Kısa Açıklama", "GENEL BİLGİ")}
              onOpenRead={() => openReader("Kısa Açıklama", "GENEL BİLGİ", stone.short_description)}
            />

            <TextBlock
              title="Genel Taş Açıklaması"
              badge="DETAYLI BİLGİ"
              text={stone.general_info}
              tone="violet"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("general_info", "Genel Taş Açıklaması", "DETAYLI BİLGİ")}
              onOpenRead={() => openReader("Genel Taş Açıklaması", "DETAYLI BİLGİ", stone.general_info)}
            />

            <TextBlock
              title="Kaynak Notu"
              badge="KAYNAK"
              text={stone.source_note}
              tone="slate"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("source_note", "Kaynak Notu", "KAYNAK")}
              onOpenRead={() => openReader("Kaynak Notu", "KAYNAK", stone.source_note)}
            />

            <TextBlock
              title="Fiziksel Etkiler"
              badge="BEDENSEL ETKİ"
              text={stone.physical_effects}
              tone="sky"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("physical_effects", "Fiziksel Etkiler", "BEDENSEL ETKİ")}
              onOpenRead={() => openReader("Fiziksel Etkiler", "BEDENSEL ETKİ", stone.physical_effects)}
            />

            <TextBlock
              title="Ruhsal Etkiler"
              badge="RUHSAL ETKİ"
              text={stone.spiritual_effects}
              tone="emerald"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("spiritual_effects", "Ruhsal Etkiler", "RUHSAL ETKİ")}
              onOpenRead={() => openReader("Ruhsal Etkiler", "RUHSAL ETKİ", stone.spiritual_effects)}
            />

            <TextBlock
              title="Diğer Etkiler"
              badge="TAMAMLAYICI NOT"
              text={stone.other_effects}
              tone="slate"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("other_effects", "Diğer Etkiler", "TAMAMLAYICI NOT")}
              onOpenRead={() => openReader("Diğer Etkiler", "TAMAMLAYICI NOT", stone.other_effects)}
            />

            <TextBlock
              title="Uyarılar ve Hassasiyetler"
              badge="KLİNİK NOT"
              text={stone.warning_text}
              tone="rose"
              editEnabled={editEnabled}
              onOpenEdit={() => openTextEditor("warning_text", "Uyarılar ve Hassasiyetler", "KLİNİK NOT")}
              onOpenRead={() => openReader("Uyarılar ve Hassasiyetler", "KLİNİK NOT", stone.warning_text)}
            />

            <section className="rounded-[22px] border border-white bg-white/90 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.03)]">
              <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
                KULLANIM ALANLARI
              </div>

              <h2 className="text-[17px] font-black text-slate-950">
                Kullanım / Uygulama Notları
              </h2>

              <div className="mt-3 grid grid-cols-1 gap-2">
                {[
                  ["Feng Shui", "feng_shui", stone.feng_shui],
                  ["Meditasyon", "meditation", stone.meditation],
                  ["Bakım", "care", stone.care],
                  ["Uygulama", "application", stone.application],
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
                    className={`rounded-[16px] bg-slate-50/80 p-3 text-left ring-1 ring-slate-100 transition ${
                      editEnabled ? "hover:bg-white hover:ring-cyan-100" : "hover:bg-white hover:ring-cyan-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[13px] font-black text-slate-800">{title}</h3>
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

                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">
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
                  {stone.stone_name} kaydı okunuyor.
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
                  {stone.stone_name} kaydı düzenleniyor.
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
              <b>{stone.stone_name || "İsimsiz taş"}</b> kaydını silmek istediğinizden emin misiniz?
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

      {editEnabled && (
        <div className="fixed bottom-0 left-0 right-0 z-[45] border-t border-slate-200/90 bg-white/92 px-5 py-3 shadow-[0_-10px_36px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-[1260px] flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-[11px] font-semibold leading-snug text-slate-500">
              Değişiklikler otomatik kaydedilir.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {savedAckVisible && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
                  Kaydedildi ✓
                </span>
              )}
              <button
                type="button"
                onClick={handleExitEditMode}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-[12px] font-black text-white shadow-[0_8px_20px_rgba(15,23,42,0.12)] ring-1 ring-slate-900 transition hover:bg-slate-800"
              >
                Düzenlemeyi Kapat
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

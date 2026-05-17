"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type MineralRecord = {
  id: string;
  tenant_id: string;
  mineral_name: string;
  general_info: string | null;
  organ_effects: string | null;
  deficiency_symptoms: string | null;
  excess_symptoms: string | null;
  overdose: string | null;
  physiology: string | null;
  physical_effects: string | null;
  mental_spiritual_effects: string | null;
  related_stones: string | null;
  stone_count: number | null;
  proportional: number | null;
  created_at: string;
  updated_at: string | null;
};

type EditableField =
  | "mineral_name"
  | "general_info"
  | "organ_effects"
  | "deficiency_symptoms"
  | "excess_symptoms"
  | "overdose"
  | "physiology"
  | "physical_effects"
  | "mental_spiritual_effects"
  | "related_stones";

type ActiveEditor = {
  field: EditableField;
  title: string;
  badge: string;
  value: string;
  multiline: boolean;
};

type ActiveReader = {
  title: string;
  badge: string;
  text: string;
  special?: "related_stones";
};

type RelatedStone = {
  order: number;
  name: string;
  percent: number | null;
  raw: string;
};

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

function shortPreview(text: string | null | undefined, limit = 260) {
  if (!text || !text.trim()) return "Henüz bilgi girilmedi.";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function parsePercent(value: string) {
  const match = value.match(/%+\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `%${String(Number(value.toFixed(2))).replace(".", ",")}`;
}

function parseRelatedStones(value: string | null | undefined): RelatedStone[] {
  if (!value || !value.trim()) return [];

  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const clean = line.replace(/^\d+\.\s*/, "").trim();
      const [namePart, percentPart] = clean.split("—").map((item) => item.trim());
      const percent = percentPart ? parsePercent(percentPart) : parsePercent(clean);

      return {
        order: index + 1,
        name: namePart || clean,
        percent,
        raw: line,
      };
    });
}

function relatedPower(percent: number | null) {
  if (percent === null) {
    return {
      label: "Belirsiz",
      className: "bg-slate-50 text-slate-600 ring-slate-100",
    };
  }

  if (percent >= 30) {
    return {
      label: "Çok güçlü",
      className: "bg-rose-50 text-rose-700 ring-rose-100",
    };
  }

  if (percent >= 10) {
    return {
      label: "Güçlü",
      className: "bg-amber-50 text-amber-700 ring-amber-100",
    };
  }

  return {
    label: "Destekleyici",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
}

function relatedStoneCount(value: string | null | undefined) {
  return parseRelatedStones(value).length;
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)]";
const pageContent = "relative z-10 w-full px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 p-6 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiProfileCard =
  "rounded-[32px] border-[3px] border-amber-300/50 bg-gradient-to-br from-white/80 via-amber-50/70 to-emerald-50/70 p-6 shadow-[0_0_40px_rgba(245,158,11,0.16)] backdrop-blur-xl";
const uiStatBox =
  "rounded-2xl border-2 border-emerald-200 bg-white/80 p-4 text-center shadow-md";
const uiWarningBox =
  "rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center font-black text-red-600 shadow-sm";
const uiInfoCard =
  "w-full rounded-[28px] border-[3px] border-emerald-300/45 bg-white/75 p-5 text-left shadow-[0_0_35px_rgba(16,185,129,0.12)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-[0_0_45px_rgba(245,158,11,0.18)]";
const uiContentBox =
  "mt-4 min-h-[120px] rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-5 text-base leading-7 text-slate-700 shadow-inner";
const uiEmptyText = "text-slate-400 italic font-medium";

function toneClass(
  tone: "slate" | "cyan" | "violet" | "emerald" | "rose" | "amber" | "sky" | "red" | "purple"
) {
  const toneMap = {
    slate: "bg-slate-100 text-slate-700",
    cyan: "bg-cyan-100 text-cyan-700",
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
    red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700",
  };

  return `inline-flex items-center rounded-full px-3 py-1 text-xs font-black tracking-wide ${toneMap[tone]}`;
}

function RelatedStonesCard({
  text,
  editEnabled,
  onRead,
  onEdit,
}: {
  text: string | null | undefined;
  editEnabled: boolean;
  onRead: () => void;
  onEdit: () => void;
}) {
  const stones = parseRelatedStones(text);
  const topStones = stones.slice(0, 6);

  return (
    <button
      type="button"
      onClick={editEnabled ? onEdit : onRead}
      className={`${uiInfoCard} lg:col-span-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={toneClass("emerald")}>{stones.length} TAŞ</div>

          <h2 className="mt-2 text-xl font-black text-slate-950">
            Bu Minerali İçeren Taşlar
          </h2>
        </div>

        <span className="shrink-0 rounded-full border-2 border-emerald-200 bg-white/90 px-3 py-1 text-xs font-black text-emerald-700 shadow-sm">
          {editEnabled ? "Düzenle" : "Oku"}
        </span>
      </div>

      {stones.length === 0 ? (
        <div className={uiContentBox}>
          <p className={uiEmptyText}>Henüz bilgi girilmedi.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {topStones.map((stone) => {
            const power = relatedPower(stone.percent);

            return (
              <div
                key={`${stone.order}-${stone.name}`}
                className="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-slate-900">
                      {stone.order}. {stone.name}
                    </p>
                    <p className="mt-1 text-[11px] font-black text-slate-500">
                      {formatPercent(stone.percent)}
                    </p>
                  </div>

                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ring-1 ${power.className}`}>
                    {power.label}
                  </span>
                </div>
              </div>
            );
          })}

          {stones.length > 6 && (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-3 text-sm font-black text-amber-800 shadow-sm">
              + {stones.length - 6} taş daha var. Tam liste için tıklayın.
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function DetailCard({
  title,
  badge,
  text,
  tone = "slate",
  editEnabled,
  onRead,
  onEdit,
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "slate" | "cyan" | "violet" | "emerald" | "rose" | "amber" | "sky" | "red" | "purple";
  editEnabled: boolean;
  onRead: () => void;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={editEnabled ? onEdit : onRead}
      className={uiInfoCard}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={toneClass(tone)}>{badge}</div>

          <h2 className="mt-2 text-xl font-black text-slate-950">{title}</h2>
        </div>

        <span className="shrink-0 rounded-full border-2 border-emerald-200 bg-white/90 px-3 py-1 text-xs font-black text-emerald-700 shadow-sm">
          {editEnabled ? "Düzenle" : "Oku"}
        </span>
      </div>

      <div className={uiContentBox}>
        <p className={`line-clamp-5 whitespace-pre-wrap ${!text?.trim() ? uiEmptyText : ""}`}>
          {shortPreview(text)}
        </p>
      </div>
    </button>
  );
}

export default function MineralDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [mineral, setMineral] = useState<MineralRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null);
  const [activeReader, setActiveReader] = useState<ActiveReader | null>(null);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function handleExitEditMode() {
    setEditEnabled(false);
    setActiveEditor(null);
    setActiveReader(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function loadMineral() {
    if (!id) return;

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("minerals")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("id", id)
      .single();

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineral alınamadı: ${error.message}`);
      return;
    }

    setMineral(data as MineralRecord);
  }

  useEffect(() => {
    runInEffect(() => {
      loadMineral();
    });
  }, [id]);

  const filledCount = useMemo(() => {
    if (!mineral) return 0;

    return [
      mineral.general_info,
      mineral.organ_effects,
      mineral.deficiency_symptoms,
      mineral.excess_symptoms,
      mineral.overdose,
      mineral.physiology,
      mineral.physical_effects,
      mineral.mental_spiritual_effects,
      mineral.related_stones,
    ].filter((item) => item && item.trim().length > 0).length;
  }, [mineral]);

  function openReader(
    title: string,
    badge: string,
    text: string | null | undefined,
    special?: "related_stones"
  ) {
    if (editEnabled) return;

    setActiveReader({
      title,
      badge,
      text: text && text.trim() ? text : "Henüz bilgi girilmedi.",
      special,
    });
  }

  function openEditor(field: EditableField, title: string, badge: string, multiline = true) {
    if (!mineral || !editEnabled) return;

    setErrorMessage("");
    setSuccessMessage("");
    setActiveEditor({
      field,
      title,
      badge,
      value: String(mineral[field] || ""),
      multiline,
    });
  }

  async function saveEditor() {
    if (!mineral || !activeEditor) return;

    if (activeEditor.field === "mineral_name" && !activeEditor.value.trim()) {
      setErrorMessage("Mineral adı boş bırakılamaz.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload = {
      [activeEditor.field]: activeEditor.value.trim() ? activeEditor.value.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("minerals")
      .update(payload)
      .eq("tenant_id", TENANT_ID)
      .eq("id", mineral.id)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      setErrorMessage(`Mineral güncellenemedi: ${error.message}`);
      return;
    }

    setMineral(data as MineralRecord);
    setActiveEditor(null);
    setSuccessMessage("Alan başarıyla güncellendi.");
  }

  async function deleteMineral() {
    if (!mineral) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("minerals")
      .delete()
      .eq("tenant_id", TENANT_ID)
      .eq("id", mineral.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Mineral silinemedi: ${error.message}`);
      return;
    }

    router.push("/dogaltas/mineral-listesi");
  }

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>Mineral yükleniyor...</div>
      </main>
    );
  }

  if (errorMessage && !mineral) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-5xl">⚗️</div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Mineral bulunamadı</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {errorMessage || "Bu mineral kaydı görüntülenemedi."}
          </p>

          <Link
            href="/dogaltas/mineral-listesi"
            className="mt-6 inline-flex rounded-2xl bg-white px-6 py-3 font-black text-slate-800 border-2 border-slate-200 shadow-md hover:bg-slate-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  if (!mineral) return null;

  const relatedCount = relatedStoneCount(mineral.related_stones);
  const relatedStones = parseRelatedStones(mineral.related_stones);
  const veryStrongCount = relatedStones.filter((stone) => (stone.percent || 0) >= 30).length;

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={toneClass("emerald")}>⚗️ MİNERAL DETAY</span>
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openEditor("mineral_name", "Mineral Adı", "BAŞLIK", false)}
                className="rounded-2xl border-2 border-amber-200 bg-white/90 px-4 py-2 text-left text-4xl font-black tracking-tight text-slate-950 shadow-md transition hover:border-emerald-300"
              >
                {mineral.mineral_name}
              </button>
            ) : (
              <h1 className="text-4xl font-black tracking-tight text-slate-950">
                {mineral.mineral_name}
              </h1>
            )}

            <p className="mt-2 text-sm font-semibold text-slate-500">
              Oluşturma: {formatDate(mineral.created_at)}
              {mineral.updated_at ? ` · Güncelleme: ${formatDate(mineral.updated_at)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/mineral-listesi"
              className="rounded-2xl bg-white px-6 py-3 font-black text-slate-800 border-2 border-slate-200 shadow-md hover:bg-slate-50"
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
                  ? "rounded-2xl bg-emerald-600 px-6 py-3 font-black text-white shadow-md hover:bg-emerald-700"
                  : "rounded-2xl bg-slate-950 px-6 py-3 font-black text-white shadow-md hover:bg-emerald-700"
              }
            >
              {editEnabled ? "Kaydet" : "Düzenle"}
            </button>

            <button
              type="button"
              onClick={() => setShowDeletePopup(true)}
              className="rounded-2xl bg-red-500 px-6 py-3 font-black text-white shadow-md hover:bg-red-600"
            >
              Sil
            </button>
          </div>
        </header>

        {editEnabled && (
          <div className="mb-6 rounded-2xl border-2 border-amber-200 bg-amber-50/90 px-5 py-3 text-sm font-black text-amber-800 shadow-sm">
            Düzenleme açık: Değiştirmek istediğiniz karta tıklayın.
          </div>
        )}

        {(errorMessage || successMessage) && (
          <div
            className={`mb-6 rounded-2xl border-2 px-5 py-3 text-sm font-black ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
          <aside className="space-y-6">
            <div className={uiProfileCard}>
              <div className="flex min-h-[200px] items-center justify-center rounded-[24px] border-2 border-dashed border-amber-200/80 bg-white/60">
                <div className="text-center">
                  <div className="text-6xl">⚗️</div>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">
                    {mineral.mineral_name}
                  </h2>
                  <p className="mt-2 px-3 text-sm leading-6 text-slate-500">
                    Mineral bilgi bankası kaydı.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">{filledCount}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">Dolu Bölüm</div>
                </div>

                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">{relatedCount}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">İçeren Taş</div>
                </div>

                <div className={`col-span-2 ${uiWarningBox}`}>
                  <div className="text-2xl font-black">{veryStrongCount}</div>
                  <div className="mt-1 text-xs font-bold">Çok Güçlü Kaynak</div>
                </div>
              </div>
            </div>

            <div className={uiInfoCard}>
              <h3 className="text-xl font-black text-slate-950">Kısa Özet</h3>
              <div className={uiContentBox}>
                <p className={`whitespace-pre-wrap ${!mineral.general_info?.trim() ? uiEmptyText : ""}`}>
                  {shortPreview(mineral.general_info, 220)}
                </p>
              </div>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RelatedStonesCard
              text={mineral.related_stones}
              editEnabled={editEnabled}
              onRead={() =>
                openReader(
                  "Bu Minerali İçeren Taşlar",
                  `${relatedCount} TAŞ`,
                  mineral.related_stones,
                  "related_stones"
                )
              }
              onEdit={() => openEditor("related_stones", "Bu Minerali İçeren Taşlar", "İÇEREN TAŞLAR")}
            />

            <DetailCard
              title="Açıklama / Genel Bilgi"
              badge="GENEL BİLGİ"
              text={mineral.general_info}
              tone="emerald"
              editEnabled={editEnabled}
              onRead={() => openReader("Açıklama / Genel Bilgi", "GENEL BİLGİ", mineral.general_info)}
              onEdit={() => openEditor("general_info", "Açıklama / Genel Bilgi", "GENEL BİLGİ")}
            />

            <DetailCard
              title="Organ Etkileri"
              badge="ORGAN"
              text={mineral.organ_effects}
              tone="cyan"
              editEnabled={editEnabled}
              onRead={() => openReader("Organ Etkileri", "ORGAN", mineral.organ_effects)}
              onEdit={() => openEditor("organ_effects", "Organ Etkileri", "ORGAN")}
            />

            <DetailCard
              title="Eksiklik Belirtileri"
              badge="EKSİKLİK"
              text={mineral.deficiency_symptoms}
              tone="amber"
              editEnabled={editEnabled}
              onRead={() => openReader("Eksiklik Belirtileri", "EKSİKLİK", mineral.deficiency_symptoms)}
              onEdit={() => openEditor("deficiency_symptoms", "Eksiklik Belirtileri", "EKSİKLİK")}
            />

            <DetailCard
              title="Fazlalık Belirtileri"
              badge="FAZLALIK"
              text={mineral.excess_symptoms}
              tone="red"
              editEnabled={editEnabled}
              onRead={() => openReader("Fazlalık Belirtileri", "FAZLALIK", mineral.excess_symptoms)}
              onEdit={() => openEditor("excess_symptoms", "Fazlalık Belirtileri", "FAZLALIK")}
            />

            <DetailCard
              title="Doz Aşımı"
              badge="DOZ"
              text={mineral.overdose}
              tone="rose"
              editEnabled={editEnabled}
              onRead={() => openReader("Doz Aşımı", "DOZ", mineral.overdose)}
              onEdit={() => openEditor("overdose", "Doz Aşımı", "DOZ")}
            />

            <DetailCard
              title="Fizyoloji"
              badge="FİZYOLOJİ"
              text={mineral.physiology}
              tone="violet"
              editEnabled={editEnabled}
              onRead={() => openReader("Fizyoloji", "FİZYOLOJİ", mineral.physiology)}
              onEdit={() => openEditor("physiology", "Fizyoloji", "FİZYOLOJİ")}
            />

            <DetailCard
              title="Fiziksel Etkiler"
              badge="FİZİKSEL"
              text={mineral.physical_effects}
              tone="sky"
              editEnabled={editEnabled}
              onRead={() => openReader("Fiziksel Etkiler", "FİZİKSEL", mineral.physical_effects)}
              onEdit={() => openEditor("physical_effects", "Fiziksel Etkiler", "FİZİKSEL")}
            />

            <DetailCard
              title="Zihinsel / Ruhsal Etkiler"
              badge="ZİHİNSEL"
              text={mineral.mental_spiritual_effects}
              tone="purple"
              editEnabled={editEnabled}
              onRead={() => openReader("Zihinsel / Ruhsal Etkiler", "ZİHİNSEL", mineral.mental_spiritual_effects)}
              onEdit={() => openEditor("mental_spiritual_effects", "Zihinsel / Ruhsal Etkiler", "ZİHİNSEL")}
            />
          </section>
        </section>
      </div>

      {activeReader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5 py-5 backdrop-blur-sm">
          <div className="w-full max-w-[980px] rounded-[30px] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)] ring-1 ring-white">
            <header className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-cyan-700 ring-1 ring-cyan-100">
                  {activeReader.badge}
                </div>

                <h2 className="text-[24px] font-black text-slate-950">
                  {activeReader.title}
                </h2>

                <p className="mt-1 text-[12px] font-bold text-slate-400">
                  {mineral.mineral_name} kaydı okunuyor.
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

            {activeReader.special === "related_stones" ? (
              <div className="max-h-[62vh] overflow-y-auto rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-100">
                <div className="grid grid-cols-[0.4fr_1.6fr_0.8fr_1fr] gap-3 border-b border-slate-200 px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  <div>Sıra</div>
                  <div>Taş</div>
                  <div>Oran</div>
                  <div>Güç</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {parseRelatedStones(activeReader.text).map((stone) => {
                    const power = relatedPower(stone.percent);

                    return (
                      <div
                        key={`${stone.order}-${stone.name}`}
                        className="grid grid-cols-[0.4fr_1.6fr_0.8fr_1fr] gap-3 px-3 py-3"
                      >
                        <div className="text-[13px] font-black text-slate-400">
                          {stone.order}
                        </div>

                        <div className="text-[14px] font-black text-slate-900">
                          {stone.name}
                        </div>

                        <div className="text-[13px] font-black text-slate-600">
                          {formatPercent(stone.percent)}
                        </div>

                        <div>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black ring-1 ${power.className}`}>
                            {power.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="max-h-[62vh] overflow-y-auto rounded-[24px] bg-slate-50/80 p-5 text-[15px] leading-8 text-slate-700 ring-1 ring-slate-100">
                <div className="whitespace-pre-wrap">{activeReader.text}</div>
              </div>
            )}
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
                  {mineral.mineral_name} kaydı düzenleniyor.
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

            {activeEditor.multiline ? (
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
            )}
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
              Minerali Sil
            </h2>

            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
              <b>{mineral.mineral_name}</b> kaydını silmek istediğinizden emin misiniz?
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
                onClick={deleteMineral}
                disabled={deleteLoading}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

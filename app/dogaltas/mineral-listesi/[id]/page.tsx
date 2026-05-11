"use client";

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

function toneClass(tone: "slate" | "cyan" | "violet" | "emerald" | "rose" | "amber" | "sky") {
  const toneMap = {
    slate: "bg-slate-50 text-slate-700",
    cyan: "bg-cyan-50 text-cyan-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  };

  return toneMap[tone];
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
      className="w-full rounded-[22px] border border-white bg-white/88 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:bg-white hover:ring-2 hover:ring-cyan-100 xl:col-span-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
            {stones.length} TAŞ
          </div>

          <h2 className="text-[17px] font-black text-slate-950">
            Bu Minerali İçeren Taşlar
          </h2>
        </div>

        <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
          {editEnabled ? "Düzenle" : "Oku"}
        </span>
      </div>

      {stones.length === 0 ? (
        <div className="mt-3 min-h-[82px] rounded-[16px] border border-slate-100 bg-slate-50/70 p-3 text-[12px] leading-6 text-slate-600">
          Henüz bilgi girilmedi.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            <div className="rounded-2xl bg-cyan-50/70 p-3 text-[12px] font-black text-cyan-700 ring-1 ring-cyan-100">
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
  tone?: "slate" | "cyan" | "violet" | "emerald" | "rose" | "amber" | "sky";
  editEnabled: boolean;
  onRead: () => void;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={editEnabled ? onEdit : onRead}
      className="w-full rounded-[22px] border border-white bg-white/88 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:bg-white hover:ring-2 hover:ring-cyan-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-black ${toneClass(tone)}`}>
            {badge}
          </div>

          <h2 className="text-[17px] font-black text-slate-950">{title}</h2>
        </div>

        <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
          {editEnabled ? "Düzenle" : "Oku"}
        </span>
      </div>

      <div className="mt-3 min-h-[82px] rounded-[16px] border border-slate-100 bg-slate-50/70 p-3 text-[12px] leading-6 text-slate-600">
        <p className="line-clamp-5 whitespace-pre-wrap">{shortPreview(text)}</p>
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
    loadMineral();
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
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-500">
        <div className="rounded-[24px] bg-white/80 px-7 py-5 text-[14px] font-black shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-1 ring-white">
          Mineral yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !mineral) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)]">
        <div className="max-w-[500px] rounded-[26px] bg-white/86 p-7 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)] ring-1 ring-white">
          <div className="text-[48px]">⚗️</div>
          <h1 className="mt-3 text-[22px] font-black text-slate-950">Mineral bulunamadı</h1>
          <p className="mt-3 text-[13px] leading-6 text-slate-500">
            {errorMessage || "Bu mineral kaydı görüntülenemedi."}
          </p>

          <Link
            href="/dogaltas/mineral-listesi"
            className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-[13px] font-black text-white"
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
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
      <div className="mx-auto max-w-[1320px] px-5 py-4">
        <header className="mb-4 flex flex-col gap-3 rounded-[24px] bg-white/76 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.04)] ring-1 ring-white/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                ⚗️ MİNERAL DETAY
              </span>
            </div>

            {editEnabled ? (
              <button
                type="button"
                onClick={() => openEditor("mineral_name", "Mineral Adı", "BAŞLIK", false)}
                className="rounded-2xl bg-white/80 px-4 py-2 text-left text-[30px] font-black tracking-tight shadow-sm ring-1 ring-cyan-100 transition hover:bg-white hover:ring-cyan-200"
              >
                {mineral.mineral_name}
              </button>
            ) : (
              <h1 className="text-[30px] font-black tracking-tight">
                {mineral.mineral_name}
              </h1>
            )}

            <p className="mt-2 text-[12px] font-medium text-slate-500">
              Oluşturma: {formatDate(mineral.created_at)}
              {mineral.updated_at ? ` · Güncelleme: ${formatDate(mineral.updated_at)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dogaltas/mineral-listesi"
              className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
            >
              Listeye Dön
            </Link>

            <button
              type="button"
              onClick={() => {
                setEditEnabled((current) => !current);
                setActiveEditor(null);
                setActiveReader(null);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className={`rounded-2xl px-6 py-3 text-[13px] font-black shadow-[0_14px_30px_rgba(15,23,42,0.11)] transition ${
                editEnabled
                  ? "bg-cyan-600 text-white hover:bg-cyan-700"
                  : "bg-slate-950 text-white hover:bg-slate-800"
              }`}
            >
              {editEnabled ? "Düzenleme Açık" : "Düzenle"}
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
            Düzenleme açık: Değiştirmek istediğiniz karta tıklayın.
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

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[26px] border border-white bg-white/86 p-5 text-center shadow-[0_16px_40px_rgba(15,23,42,0.035)]">
              <div className="flex min-h-[180px] items-center justify-center rounded-[22px] border border-dashed border-emerald-200 bg-emerald-50/60">
                <div>
                  <div className="text-[58px]">⚗️</div>
                  <h2 className="mt-2 text-[22px] font-black text-slate-950">
                    {mineral.mineral_name}
                  </h2>
                  <p className="mt-2 px-3 text-[12px] leading-5 text-slate-500">
                    Mineral bilgi bankası kaydı.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-slate-100">
                  <div className="text-[18px] font-black text-slate-950">
                    {filledCount}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">
                    Dolu Bölüm
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-slate-100">
                  <div className="text-[18px] font-black text-slate-950">
                    {relatedCount}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">
                    İçeren Taş
                  </div>
                </div>

                <div className="col-span-2 rounded-2xl bg-rose-50 p-3 text-center ring-1 ring-rose-100">
                  <div className="text-[18px] font-black text-rose-700">
                    {veryStrongCount}
                  </div>
                  <div className="text-[10px] font-bold text-rose-500">
                    Çok Güçlü Kaynak
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] bg-white/82 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.035)] ring-1 ring-white">
              <h3 className="text-[15px] font-black text-slate-950">
                Kısa Özet
              </h3>

              <p className="mt-3 rounded-2xl bg-slate-50/80 p-3 text-[12px] leading-6 text-slate-500 ring-1 ring-slate-100">
                {shortPreview(mineral.general_info, 220)}
              </p>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
              tone="cyan"
              editEnabled={editEnabled}
              onRead={() => openReader("Açıklama / Genel Bilgi", "GENEL BİLGİ", mineral.general_info)}
              onEdit={() => openEditor("general_info", "Açıklama / Genel Bilgi", "GENEL BİLGİ")}
            />

            <DetailCard
              title="Organ Etkileri"
              badge="ORGAN"
              text={mineral.organ_effects}
              tone="emerald"
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
              tone="rose"
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
              tone="slate"
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

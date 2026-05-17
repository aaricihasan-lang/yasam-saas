"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type MineralForm = {
  mineral_name: string;
  general_info: string;
  organ_effects: string;
  deficiency_symptoms: string;
  excess_symptoms: string;
  overdose: string;
  physiology: string;
  physical_effects: string;
  mental_spiritual_effects: string;
  related_stones: string;
};

type MineralSection = {
  key: keyof Omit<MineralForm, "mineral_name">;
  label: string;
  placeholder: string;
};

const mineralSections: MineralSection[] = [
  {
    key: "general_info",
    label: "Açıklama / Genel Bilgi",
    placeholder: "Mineralin genel tanımı, temel görevi, sistemdeki yeri...",
  },
  {
    key: "organ_effects",
    label: "Organ Etkileri",
    placeholder: "Satır satır organ etkilerini yazın...",
  },
  {
    key: "deficiency_symptoms",
    label: "Eksiklik Belirtileri",
    placeholder: "Eksiklikte görülebilecek belirtiler...",
  },
  {
    key: "excess_symptoms",
    label: "Fazlalık Belirtileri",
    placeholder: "Fazlalıkta görülebilecek belirtiler...",
  },
  {
    key: "overdose",
    label: "Doz Aşımı",
    placeholder: "Aşırı alım / toksisite / dikkat notları...",
  },
  {
    key: "physiology",
    label: "Fizyoloji",
    placeholder: "Mineralin fizyolojik mekanizması...",
  },
  {
    key: "physical_effects",
    label: "Fiziksel Etkiler",
    placeholder: "Bedensel etkiler, desteklediği sistemler...",
  },
  {
    key: "mental_spiritual_effects",
    label: "Zihinsel / Ruhsal Etkiler",
    placeholder: "Zihinsel, duygusal veya ruhsal düzeyde etkiler...",
  },
  {
    key: "related_stones",
    label: "Bu Minerali İçeren Taşlar",
    placeholder:
      "Word’den listeyi buraya yapıştırın.\nÖrn: SAFİR (%50), YAKUT (%47), TOPAZ (%29), Ametist (Binde 1)\n\nBu Alanı Kaydet dediğinizde %1 ve üzeri taşlar büyükten küçüğe otomatik sıralanır.",
  },
];

const emptyForm: MineralForm = {
  mineral_name: "",
  general_info: "",
  organ_effects: "",
  deficiency_symptoms: "",
  excess_symptoms: "",
  overdose: "",
  physiology: "",
  physical_effects: "",
  mental_spiritual_effects: "",
  related_stones: "",
};

const uiCard =
  "rounded-[30px] border-[3px] border-emerald-400/40 bg-white/65 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-[0_0_50px_rgba(245,158,11,0.20)]";
const uiInput =
  "w-full rounded-2xl border-2 border-emerald-200 bg-white/90 px-5 py-4 text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";

function normalizePercent(value: string) {
  return Number(value.replace(",", ".").replace("%", "").trim());
}

function parseRatio(rawRatio: string) {
  const text = rawRatio.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

  const percentMatch = text.match(/%+\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (percentMatch) {
    return normalizePercent(percentMatch[1]);
  }

  const millionMatch = text.match(/milyonda\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (millionMatch) {
    return normalizePercent(millionMatch[1]) / 10000;
  }

  const hundredThousandMatch = text.match(/yüz\s*binde\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (hundredThousandMatch) {
    return normalizePercent(hundredThousandMatch[1]) / 1000;
  }

  const tenThousandMatch = text.match(/on\s*binde\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (tenThousandMatch) {
    return normalizePercent(tenThousandMatch[1]) / 100;
  }

  const thousandMatch = text.match(/binde\s*([0-9]+(?:[,.][0-9]+)?)/);
  if (thousandMatch) {
    return normalizePercent(thousandMatch[1]) / 10;
  }

  return null;
}

function formatPercent(value: number) {
  return `%${String(Number(value.toFixed(2))).replace(".", ",")}`;
}

function smartSortRelatedStones(input: string) {
  const cleaned = input
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/;+/, ",")
    .trim();

  const regex =
    /([^,()]+?)\s*\(([^)]*(?:%|binde|milyonda)[^)]*)\)/gi;

  const results: { name: string; percent: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[1]
      .replace(/[-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const percent = parseRatio(match[2]);

    if (!name || percent === null || Number.isNaN(percent)) continue;
    if (percent < 1) continue;

    results.push({
      name,
      percent,
    });
  }

  const uniqueMap = new Map<string, { name: string; percent: number }>();

  results.forEach((item) => {
    const key = item.name.toLocaleLowerCase("tr-TR");
    const current = uniqueMap.get(key);

    if (!current || item.percent > current.percent) {
      uniqueMap.set(key, item);
    }
  });

  const sorted = Array.from(uniqueMap.values()).sort(
    (a, b) => b.percent - a.percent || a.name.localeCompare(b.name, "tr")
  );

  if (sorted.length === 0) {
    return input.trim();
  }

  return sorted
    .map((item, index) => `${index + 1}. ${item.name} — ${formatPercent(item.percent)}`)
    .join("\n");
}

export default function MineralBankasiPage() {
  const [form, setForm] = useState<MineralForm>(emptyForm);
  const [activeSection, setActiveSection] =
    useState<MineralSection["key"]>("general_info");
  const [expandedEditor, setExpandedEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeSectionInfo = useMemo(
    () => mineralSections.find((section) => section.key === activeSection)!,
    [activeSection]
  );

  function updateField<K extends keyof MineralForm>(key: K, value: MineralForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setActiveSection("general_info");
    setExpandedEditor(false);
    setMessage("");
    setErrorMessage("");
  }

  function closeSectionEditor() {
    if (activeSection === "related_stones") {
      const sortedText = smartSortRelatedStones(form.related_stones);

      setForm((current) => ({
        ...current,
        related_stones: sortedText,
      }));

      setExpandedEditor(false);
      setMessage("Bu Minerali İçeren Taşlar alanı %1 ve üzeri olacak şekilde büyükten küçüğe sıralandı. Genel kayıt için ana Kaydet butonuna basın.");
      setErrorMessage("");
      return;
    }

    setExpandedEditor(false);
    setMessage(`${activeSectionInfo.label} alanı geçici olarak kaydedildi. Genel kayıt için ana Kaydet butonuna basın.`);
    setErrorMessage("");
  }

  async function saveMineral() {
    setMessage("");
    setErrorMessage("");

    if (!form.mineral_name.trim()) {
      setErrorMessage("Mineral adı boş bırakılamaz.");
      return;
    }

    setSaving(true);

    const relatedStonesValue =
      form.related_stones.trim() ? smartSortRelatedStones(form.related_stones) : "";

    const payload = {
      tenant_id: TENANT_ID,
      mineral_name: form.mineral_name.trim(),
      general_info: form.general_info.trim() || null,
      organ_effects: form.organ_effects.trim() || null,
      deficiency_symptoms: form.deficiency_symptoms.trim() || null,
      excess_symptoms: form.excess_symptoms.trim() || null,
      overdose: form.overdose.trim() || null,
      physiology: form.physiology.trim() || null,
      physical_effects: form.physical_effects.trim() || null,
      mental_spiritual_effects: form.mental_spiritual_effects.trim() || null,
      related_stones: relatedStonesValue || null,
      stone_count: 0,
      proportional: 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("minerals").insert(payload);

    setSaving(false);

    if (error) {
      setErrorMessage(`Mineral kaydedilemedi: ${error.message}`);
      return;
    }

    setMessage(`${form.mineral_name.trim()} başarıyla kaydedildi.`);
    setForm(emptyForm);
    setActiveSection("general_info");
    setExpandedEditor(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f5dc_35%,#ecfccb_100%)] text-slate-950">
      <div className="absolute left-0 top-0 h-[500px] w-[500px] bg-amber-300/20 blur-[150px]" />
      <div className="absolute right-0 top-0 h-[500px] w-[500px] bg-emerald-300/20 blur-[150px]" />

      <div className="relative w-full px-6 py-6 xl:px-10 2xl:px-14">
        <header className={`${uiCard} mb-4 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href="/dogaltas"
                className="inline-flex rounded-2xl border border-white/40 bg-white/60 px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:translate-x-0.5 hover:border-amber-400/60"
              >
                ← Geri
              </Link>

              <span className="inline-flex rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-amber-800 ring-1 ring-amber-100">
                ⚗️ MİNERAL BANKASI
              </span>
            </div>

            <h1 className="bg-gradient-to-r from-emerald-700 to-amber-600 bg-clip-text text-5xl font-black text-transparent">
              Mineral Kayıt Ekranı
            </h1>

            <p className="mt-2 text-base text-slate-600">
              Mineral adı girin, bölüm seçin, metin alanına tıklayınca geniş ekranda yazın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dogaltas/mineral-listesi"
              className="rounded-2xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:translate-x-0.5 hover:border-amber-400/60"
            >
              Mineral Listesi
            </Link>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:translate-x-0.5 hover:border-amber-400/60"
            >
              Yeni Mineral
            </button>

            <button
              type="button"
              onClick={saveMineral}
              disabled={saving}
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-amber-500 px-6 py-2.5 text-sm font-black text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </header>

        {(message || errorMessage) && (
          <div
            className={`mb-3 rounded-2xl px-5 py-3 text-[13px] font-black ring-1 ${
              errorMessage
                ? "bg-rose-50 text-rose-700 ring-rose-100"
                : "bg-emerald-50 text-emerald-700 ring-emerald-100"
            }`}
          >
            {errorMessage || message}
          </div>
        )}

        <section className={`${uiCard} mb-4 p-5`}>
          <label className="mb-2 block text-xs font-black tracking-[0.16em] text-emerald-800">
            MİNERAL ADI
          </label>

          <input
            value={form.mineral_name}
            onChange={(event) => updateField("mineral_name", event.target.value)}
            placeholder="Örn: Bakır"
            className={`${uiInput} text-lg font-black`}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
          <aside className={`${uiCard} p-4`}>
            <h2 className="mb-3 px-2 text-lg font-black text-slate-950">
              Kayıt Bölümleri
            </h2>

            <div className="grid grid-cols-1 gap-2">
              {mineralSections.map((section) => {
                const active = activeSection === section.key;
                const filled = form[section.key].trim().length > 0;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => {
                      setActiveSection(section.key);
                      setExpandedEditor(false);
                    }}
                    className={`w-full rounded-2xl px-3 py-3 text-left transition-all duration-300 hover:translate-x-2 ${
                      active
                        ? "scale-[1.02] bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg"
                        : "border border-white/40 bg-white/60 text-slate-700 hover:border-amber-300/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">
                        {section.label}
                      </span>

                      {filled && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black ring-1 ${
                            active
                              ? "bg-white/20 text-white ring-white/30"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          }`}
                        >
                          dolu
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            className={`${uiCard} min-h-[600px] bg-gradient-to-br from-white/70 to-emerald-50 p-5`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-800 ring-1 ring-emerald-100">
                  AKTİF BÖLÜM
                </div>

                <h2 className="text-2xl font-black text-slate-950">
                  {activeSectionInfo.label}
                </h2>
              </div>

              <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-sm font-black text-slate-600 shadow-sm">
                {form[activeSection].length} karakter
              </span>
            </div>

            <button
              type="button"
              onClick={() => setExpandedEditor(true)}
              className={`${uiInput} w-full text-left text-base leading-7 text-slate-600`}
            >
              <p className="min-h-[420px] whitespace-pre-wrap">
                {form[activeSection].trim()
                  ? form[activeSection].slice(0, 420)
                  : activeSectionInfo.placeholder}
                {form[activeSection].length > 420 ? "..." : ""}
              </p>

              <div className="mt-3 flex justify-end">
                <span className="rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 px-4 py-1.5 text-xs font-black text-white shadow-md">
                  Yazmak için tıkla
                </span>
              </div>
            </button>
          </section>
        </section>
      </div>

      {expandedEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 px-5 py-5 backdrop-blur-sm">
          <div className={`${uiCard} w-full max-w-[980px] bg-gradient-to-br from-white/80 to-emerald-50/90 p-5`}>
            <header className="mb-4 flex flex-col gap-3 border-b border-emerald-200/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-1 inline-flex rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-amber-800 ring-1 ring-amber-100">
                  {activeSection === "related_stones" ? "AKILLI TAŞ SIRALAMA" : "MİNERAL METNİ"}
                </div>

                <h2 className="text-[24px] font-black text-slate-950">
                  {activeSectionInfo.label}
                </h2>

                <p className="mt-1 text-sm font-bold text-slate-600">
                  {activeSection === "related_stones"
                    ? "%1 ve üzeri taşlar büyükten küçüğe otomatik sıralanır."
                    : `${form.mineral_name.trim() || "Yeni mineral"} kaydı düzenleniyor.`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedEditor(false)}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200"
                >
                  Kapat
                </button>

                <button
                  type="button"
                  onClick={closeSectionEditor}
                  className="rounded-2xl bg-gradient-to-r from-emerald-500 to-amber-500 px-6 py-3 text-[13px] font-black text-white shadow-lg transition hover:brightness-110"
                >
                  {activeSection === "related_stones" ? "Sırala ve Kaydet" : "Bu Alanı Kaydet"}
                </button>
              </div>
            </header>

            <textarea
              value={form[activeSection]}
              onChange={(event) => updateField(activeSection, event.target.value)}
              placeholder={activeSectionInfo.placeholder}
              className={`${uiInput} h-[430px] max-h-[62vh] resize-none text-[15px] leading-8`}
              autoFocus
            />
          </div>
        </div>
      )}
    </main>
  );
}

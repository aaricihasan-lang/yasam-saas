"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { createMineral } from "@/lib/dogaltas/dogaltasApi";
import { useToast } from "@/components/ui/ToastProvider";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";

type MineralForm = {
  name: string;
  kategori: string;
  aciklama: string;
  organ_etkileri: string;
  fiziksel: string;
  zihinsel: string;
  cakralar: string;
  fizyoloji: string;
  eksiklik_belirtileri: string;
  fazlalik_belirtileri: string;
  doz_asimi: string;
  iceren_taslar: string;
};

type MineralSection = {
  key: keyof Omit<MineralForm, "name" | "kategori">;
  label: string;
  placeholder: string;
};

const mineralSections: MineralSection[] = [
  {
    key: "aciklama",
    label: "Açıklama",
    placeholder: "Mineralin genel tanımı ve temel görevi...",
  },
  {
    key: "fiziksel",
    label: "Fiziksel",
    placeholder: "Her satıra bir fiziksel etki yazın...",
  },
  {
    key: "zihinsel",
    label: "Zihinsel",
    placeholder: "Her satıra bir zihinsel etki yazın...",
  },
  {
    key: "fizyoloji",
    label: "Fizyoloji",
    placeholder: "Fizyolojik etkiler (satır satır)...",
  },
  {
    key: "eksiklik_belirtileri",
    label: "Eksiklik belirtileri",
    placeholder: "Eksiklik belirtileri (satır satır)...",
  },
  {
    key: "doz_asimi",
    label: "Doz aşımı",
    placeholder: "Doz aşımı / toksisite notları (satır satır)...",
  },
  {
    key: "iceren_taslar",
    label: "İçeren taşlar",
    placeholder: "Her satıra bir taş adı yazın...",
  },
  {
    key: "organ_etkileri",
    label: "Organ etkileri",
    placeholder: "Organ etkileri (satır satır)...",
  },
  {
    key: "cakralar",
    label: "Çakralar",
    placeholder: "Çakra ilişkileri (satır satır)...",
  },
  {
    key: "fazlalik_belirtileri",
    label: "Fazlalık belirtileri",
    placeholder: "Fazlalık belirtileri (satır satır)...",
  },
];

const emptyForm: MineralForm = {
  name: "",
  kategori: "",
  aciklama: "",
  organ_etkileri: "",
  fiziksel: "",
  zihinsel: "",
  cakralar: "",
  fizyoloji: "",
  eksiklik_belirtileri: "",
  fazlalik_belirtileri: "",
  doz_asimi: "",
  iceren_taslar: "",
};

const uiCard =
  "rounded-[30px] border-[3px] border-emerald-400/40 bg-white/65 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-500 hover:shadow-[0_0_50px_rgba(245,158,11,0.20)]";
const uiInput =
  "w-full rounded-xl border-2 border-emerald-200 bg-white/90 px-4 py-2 text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";

function linesToArray(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function slugifySourceId(name: string) {
  return (
    name
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mineral"
  );
}

export default function MineralBankasiPage() {
  const [form, setForm] = useState<MineralForm>(emptyForm);
  const [activeSection, setActiveSection] = useState<MineralSection["key"]>("aciklama");
  const [expandedEditor, setExpandedEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { showToast } = useToast();

  const activeSectionInfo = useMemo(
    () => mineralSections.find((section) => section.key === activeSection)!,
    [activeSection],
  );

  function updateField<K extends keyof MineralForm>(key: K, value: MineralForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setActiveSection("aciklama");
    setExpandedEditor(false);
    setMessage("");
    setErrorMessage("");
  }

  function closeSectionEditor() {
    setExpandedEditor(false);
    setMessage(`${activeSectionInfo.label} alanı kaydedildi. Genel kayıt için Kaydet butonuna basın.`);
    setErrorMessage("");
  }

  async function saveMineral() {
    setMessage("");
    setErrorMessage("");

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      setErrorMessage("Mineral adı boş bırakılamaz.");
      return;
    }

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    setSaving(true);

    const payload = {
      tenant_id: tenantId,
      source_id: slugifySourceId(nameTrim),
      name: nameTrim,
      aciklama: form.aciklama.trim() || null,
      organ_etkileri: linesToArray(form.organ_etkileri),
      fiziksel: linesToArray(form.fiziksel),
      zihinsel: linesToArray(form.zihinsel),
      cakralar: linesToArray(form.cakralar),
      fizyoloji: linesToArray(form.fizyoloji),
      eksiklik_belirtileri: linesToArray(form.eksiklik_belirtileri),
      fazlalik_belirtileri: linesToArray(form.fazlalik_belirtileri),
      doz_asimi: linesToArray(form.doz_asimi),
      iceren_taslar: linesToArray(form.iceren_taslar),
      kategori: form.kategori.trim() || "",
    };

    const { ok, error } = await createMineral(payload);

    setSaving(false);

    if (!ok) {
      // Teknik ayrıntı inline kalır; kalıcı ve belirgin uyarı toast ile gösterilir.
      setErrorMessage(`Mineral kaydedilemedi: ${error ?? "Bilinmeyen hata"}`);
      showToast({
        type: "error",
        title: "Kayıt başarısız",
        message: "Kayıt oluşturulamadı. Lütfen tekrar deneyin.",
      });
      return;
    }

    // ÖNEMLİ: resetForm() inline message'ı anında temizliyordu → kullanıcı onayı
    // göremiyordu. Onay artık toast ile (provider seviyesinde, 4 sn) gösterilir;
    // form reset/kapanış mesajı yok etmez.
    showToast({
      type: "success",
      title: "Kaydedildi",
      message: "Mineral kaydı başarıyla oluşturuldu.",
    });
    resetForm();
    setShowForm(false);
  }

  return (
    <DogaltasSectionShell
      eyebrow="DOĞALTAŞ · MİNERAL BANKASI"
      title="Mineral Kayıt Ekranı"
      subtitle="Yeni mineral kaydı minerals tablosuna eklenir. Liste alanları satır satır yazılır."
      icon="⚗️"
      actions={
        <>
          <Link
            href="/dogaltas/mineral-listesi"
            className="rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:translate-x-0.5 hover:border-amber-400/60"
          >
            Mineral Listesi
          </Link>

          {showForm ? (
            <>
              <button
                type="button"
                onClick={() => { resetForm(); setShowForm(false); }}
                className="rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:translate-x-0.5 hover:border-amber-400/60"
              >
                Formu Kapat
              </button>
              <button
                type="button"
                onClick={saveMineral}
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-amber-500 px-5 py-2 text-sm font-black text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-amber-500 px-5 py-2 text-sm font-black text-white shadow-lg transition hover:brightness-110"
            >
              + Yeni Kayıt
            </button>
          )}
        </>
      }
    >
      <BfcacheRefreshHandler />

        {(message || errorMessage) && (
          <div
            className={`mb-2 rounded-2xl px-4 py-2 text-[13px] font-black ring-1 ${
              errorMessage
                ? "bg-rose-50 text-rose-700 ring-rose-100"
                : "bg-emerald-50 text-emerald-700 ring-emerald-100"
            }`}
          >
            {errorMessage || message}
          </div>
        )}

        {!showForm && (
          <div className={`${uiCard} flex flex-col items-center gap-4 py-14 text-center`}>
            <span className="text-5xl">⚗️</span>
            <div>
              <h2 className="text-lg font-black text-slate-800">Mineral Kayıt Ekranı</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Yeni mineral kaydı oluşturmak için aşağıdaki butona basın.
                Mevcut mineralleri Mineral Listesi'nden görüntüleyebilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-amber-500 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-110"
            >
              + Yeni Kayıt Oluştur
            </button>
          </div>
        )}

        {showForm && <section className={`${uiCard} mb-2 grid grid-cols-1 gap-2 p-3 md:grid-cols-2`}>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-black tracking-[0.16em] text-emerald-800">
              MİNERAL ADI
            </span>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Örn: KROM"
              className={`${uiInput} text-lg font-black`}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-black tracking-[0.16em] text-emerald-800">
              KATEGORİ
            </span>
            <input
              value={form.kategori}
              onChange={(event) => updateField("kategori", event.target.value)}
              placeholder="Örn: İz mineral"
              className={uiInput}
            />
          </label>
        </section>}

        {showForm && <section className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_1fr]">
          <aside className={`${uiCard} p-2.5`}>
            <h2 className="mb-1.5 px-1 text-sm font-black text-slate-950">Kayıt Bölümleri</h2>

            <div className="grid grid-cols-1 gap-1">
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
                    className={`w-full rounded-xl px-3 py-1.5 text-left transition-all duration-300 hover:translate-x-1 ${
                      active
                        ? "scale-[1.01] bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md"
                        : "border border-white/40 bg-white/60 text-slate-700 hover:border-amber-300/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">{section.label}</span>
                      {filled ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black ring-1 ${
                            active
                              ? "bg-white/20 text-white ring-white/30"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          }`}
                        >
                          dolu
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={`${uiCard} bg-gradient-to-br from-white/70 to-emerald-50 p-3`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-800 ring-1 ring-emerald-100">
                  AKTİF BÖLÜM
                </div>
                <h2 className="text-lg font-black text-slate-950">{activeSectionInfo.label}</h2>
              </div>
              <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                {form[activeSection].length} karakter
              </span>
            </div>

            <button
              type="button"
              onClick={() => setExpandedEditor(true)}
              className={`${uiInput} w-full text-left text-sm leading-7 text-slate-600`}
            >
              <p className="min-h-[140px] whitespace-pre-wrap">
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
        </section>}

      {expandedEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 px-5 py-5 backdrop-blur-sm">
          <div className={`${uiCard} w-full max-w-[980px] bg-gradient-to-br from-white/80 to-emerald-50/90 p-5`}>
            <header className="mb-4 flex flex-col gap-3 border-b border-emerald-200/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[24px] font-black text-slate-950">{activeSectionInfo.label}</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {form.name.trim() || "Yeni mineral"} · Satır satır liste alanları desteklenir.
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
                  Bu Alanı Kaydet
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
      ) : null}
    </DogaltasSectionShell>
  );
}

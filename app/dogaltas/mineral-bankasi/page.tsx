"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import { createMineral, checkDuplicate } from "@/lib/dogaltas/dogaltasApi";
import { DuplicateWarningModal } from "@/app/dogaltas/components/DuplicateWarningModal";
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

type MineralSectionKey = keyof Omit<MineralForm, "name" | "kategori">;

// Bölüm etiket/placeholder'ları i18n katalogundan (stones.minerals.bank.sections)
// gelir; DB alan anahtarı (key) aşağıdaki dizide sabit ve sıralıdır.
const mineralSectionKeys: MineralSectionKey[] = [
  "aciklama",
  "fiziksel",
  "zihinsel",
  "fizyoloji",
  "eksiklik_belirtileri",
  "doz_asimi",
  "iceren_taslar",
  "organ_etkileri",
  "cakralar",
  "fazlalik_belirtileri",
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
  const t = useTranslations("stones.minerals.bank");
  const tRoot = useTranslations("stones.minerals");
  const tc = useTranslations("stones.common");
  const sectionLabel = (key: MineralSectionKey) => t(`sections.${key}.label`);
  const sectionPlaceholder = (key: MineralSectionKey) => t(`sections.${key}.placeholder`);
  const [form, setForm] = useState<MineralForm>(emptyForm);
  const [activeSection, setActiveSection] = useState<MineralSectionKey>("aciklama");
  const [expandedEditor, setExpandedEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();
  // Modül-bazlı çift kayıt uyarısı (DT-P1-1)
  const [dupModal, setDupModal] = useState<{ label: string; id: string } | null>(null);

  // F-017: kaydedilmemiş değişiklik koruması (native beforeunload; iç-nav hack yok).
  const isDirty = useMemo(() => {
    if (!showForm || saving) return false;
    return JSON.stringify(form) !== JSON.stringify(emptyForm);
  }, [showForm, saving, form]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
  const [dupChecking, setDupChecking] = useState(false);

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
    setMessage(t("sectionSavedMessage", { label: sectionLabel(activeSection) }));
    setErrorMessage("");
  }

  async function saveMineral(forceCreate = false) {
    setMessage("");
    setErrorMessage("");

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      setErrorMessage(tRoot("validation.nameRequired"));
      return;
    }

    // Modül-bazlı çift kayıt kontrolü (yalnız ilk denemede; çift-tık koruması).
    if (!forceCreate) {
      if (dupChecking || dupModal || saving) return;
      setDupChecking(true);
      const dup = await checkDuplicate("mineral", nameTrim);
      setDupChecking(false);
      if (dup.ok && dup.exists && dup.match) {
        setDupModal({ label: dup.match.label, id: dup.match.id });
        return;
      }
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
      setErrorMessage(t("saveFailedPrefix", { error: error ?? tRoot("unknownError") }));
      showToast({
        type: "error",
        title: t("toastSaveFailedTitle"),
        message: t("toastSaveFailedMessage"),
      });
      return;
    }

    // ÖNEMLİ: resetForm() inline message'ı anında temizliyordu → kullanıcı onayı
    // göremiyordu. Onay artık toast ile (provider seviyesinde, 4 sn) gösterilir;
    // form reset/kapanış mesajı yok etmez.
    showToast({
      type: "success",
      title: t("toastSavedTitle"),
      message: t("toastSavedMessage"),
    });
    resetForm();
    setShowForm(false);
  }

  return (
    <DogaltasSectionShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      icon="⚗️"
      contentClassName="pb-40 sm:pb-24"
      actions={
        <>
          <Link
            href="/dogaltas/mineral-listesi"
            className="btn-soft"
          >
            {t("listLink")}
          </Link>

          {/* FAZ-3A(2A): Form kapalıyken tek giriş noktası intro CTA'dır; header'da ikinci
              "+ Yeni Kayıt" gösterilmez. Kaydet header'dan alt işlem çubuğuna taşındı (2D). */}
          {showForm && (
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false); }}
              className="btn-soft"
            >
              {t("closeForm")}
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
              <h2 className="text-lg font-black text-slate-800">{t("title")}</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                {t("introDescription")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-primary"
            >
              {t("createButton")}
            </button>
          </div>
        )}

        {showForm && <section className={`${uiCard} mb-2 grid grid-cols-1 gap-2 p-3 md:grid-cols-2`}>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-black tracking-[0.16em] text-emerald-800">
              {t("nameLabel")}
            </span>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder={t("namePlaceholder")}
              className={`${uiInput} text-lg font-black`}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-black tracking-[0.16em] text-emerald-800">
              {t("categoryLabel")}
            </span>
            <input
              value={form.kategori}
              onChange={(event) => updateField("kategori", event.target.value)}
              placeholder={t("categoryPlaceholder")}
              className={uiInput}
            />
          </label>
        </section>}

        {showForm && <section className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_1fr]">
          <aside className={`${uiCard} p-2.5`}>
            <h2 className="mb-1.5 px-1 text-sm font-black text-slate-950">{t("sectionsHeading")}</h2>

            <div className="grid grid-cols-1 gap-1">
              {mineralSectionKeys.map((key) => {
                const active = activeSection === key;
                const filled = form[key].trim().length > 0;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveSection(key);
                      setExpandedEditor(false);
                    }}
                    className={`w-full rounded-xl px-3 py-1.5 text-left transition-all duration-300 hover:translate-x-1 ${
                      active
                        ? "scale-[1.01] bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md"
                        : "border border-white/40 bg-white/60 text-slate-700 hover:border-amber-300/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">{sectionLabel(key)}</span>
                      {filled ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black ring-1 ${
                            active
                              ? "bg-white/20 text-white ring-white/30"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          }`}
                        >
                          {t("filledBadge")}
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
                  {t("activeSectionBadge")}
                </div>
                <h2 className="text-lg font-black text-slate-950">{sectionLabel(activeSection)}</h2>
              </div>
              <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                {t("charCount", { n: form[activeSection].length })}
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
                  : sectionPlaceholder(activeSection)}
                {form[activeSection].length > 420 ? "..." : ""}
              </p>
              <div className="mt-3 flex justify-end">
                <span className="rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 px-4 py-1.5 text-xs font-black text-white shadow-md">
                  {t("writeHint")}
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
                <h2 className="text-[24px] font-black text-slate-950">{sectionLabel(activeSection)}</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {form.name.trim() || t("newMineralFallback")} · {t("editorSubtitle")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedEditor(false)}
                  className="btn-soft"
                >
                  {tc("close")}
                </button>
                <button
                  type="button"
                  onClick={closeSectionEditor}
                  className="btn-primary"
                >
                  {t("saveSection")}
                </button>
              </div>
            </header>
            <textarea
              value={form[activeSection]}
              onChange={(event) => updateField(activeSection, event.target.value)}
              placeholder={sectionPlaceholder(activeSection)}
              className={`${uiInput} h-[430px] max-h-[62vh] resize-none text-[15px] leading-8`}
              autoFocus
            />
          </div>
        </div>
      ) : null}

      <DuplicateWarningModal
        open={!!dupModal}
        label={dupModal?.label ?? ""}
        busy={saving}
        onOpenExisting={() => {
          if (dupModal) router.push(`/dogaltas/mineral-listesi/${dupModal.id}`);
        }}
        onCreateAnyway={() => {
          setDupModal(null);
          void saveMineral(true);
        }}
        onCancel={() => setDupModal(null)}
      />

      {/* FAZ-3A(2D): Kaydet alt işlem çubuğuna taşındı. Mobilde birincil Kaydet tam
          genişlik ve belirgin; Temizle ikincil. Masaüstünde tek satır. Safe-area padding. */}
      {showForm && <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-300/50 bg-gradient-to-br from-slate-100 via-blue-50 to-violet-50 px-5 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:px-8 2xl:px-10">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden text-sm font-semibold text-slate-500 sm:block">
            {t("unsavedWarning")}
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <button type="button" onClick={resetForm} className="btn-soft w-full sm:w-auto">
              {tc("clear")}
            </button>
            <button
              type="button"
              onClick={() => void saveMineral()}
              disabled={saving || dupChecking}
              className="btn-primary w-full sm:w-auto"
            >
              {dupChecking ? t("checking") : saving ? tc("saving") : tc("save")}
            </button>
          </div>
        </div>
      </div>}
    </DogaltasSectionShell>
  );
}

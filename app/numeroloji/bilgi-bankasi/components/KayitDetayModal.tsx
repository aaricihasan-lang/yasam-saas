"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { numApiErrorCode } from "../../helpers/numApiClient";
import { ANALIZ_TURU_LABELS } from "../helpers/bilgiBankaLabels";
import {
  normalizeStoneList,
  stonesToTextarea,
  updateKnowledgeRecordById,
  updateStoneAssignmentById,
  type BilgiBankaListeSatir,
} from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";
import { kbValueDisplay, type KbValueT } from "../helpers/kbValueDisplay";
import { KULVAR_SECTION_TEMPLATE, isKulvarAnalysisType, type KulvarSectionKey } from "../helpers/knowledgeSections";
import { EMPTY_KULVAR_BODIES, bodiesFromRecord, sectionsFromBodies, type KulvarBodies } from "../helpers/kulvarFormLogic";
import { useKulvarSources } from "../helpers/useKulvarSources";
import { KulvarSectionEditor } from "./KulvarSectionEditor";
import { KulvarSourceManager } from "./KulvarSourceManager";
import { KulvarSourceReadonlyList } from "./KulvarSourceReadonlyList";

type KayitTuru = BilgiBankaListeSatir["kayitTuru"];

// I18N: seçenek değerleri kanonik analiz türü kodudur; görünen ad numerology.knowledge.shared.analysisTypes.<kod>
// (TR katalog değerleri ANALIZ_TURU_LABELS ile birebir).
const ANALIZ_TURU_OPTIONS = Object.keys(ANALIZ_TURU_LABELS).map((value) => ({ value }));

// i18n-ignore: "Ateş | AZ Destek" vb. Bilgi Bankası eşleşme anahtarıdır (DB value); çevrilmez, aynen gösterilir.
const ELEMENT_DEGER_OPTIONS = (["Ateş", "Su", "Toprak", "Hava"] as const).flatMap((el) => [
  `${el} | AZ Destek`,
  `${el} | FAZLA Destek`,
]);

// NKB-V2-H: kompakt premium alanlar (önceki dev boyutlar küçültüldü; iç sabit-yükseklik/scroll kaldırıldı).
const modalFieldBase =
  "w-full rounded-xl border-2 border-violet-200/90 bg-white px-4 font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/50";

const modalSelectClass = `h-11 ${modalFieldBase} text-sm font-semibold`;
const modalInputClass = `h-11 ${modalFieldBase} text-sm font-semibold placeholder:text-slate-400`;
// Düzenleme textarea'sı: makul min-height; ayrı scrollbar zorlayan sabit büyük yükseklik yok.
const modalTextareaClass = `${modalFieldBase} min-h-[120px] resize-y rounded-xl py-2.5 text-sm font-medium leading-7 text-slate-700 placeholder:text-slate-400`;
const modalLabelClass = "mb-1.5 block text-sm font-black text-slate-800";
const modalReadonlyClass =
  "mt-1.5 flex min-h-[2.75rem] items-center rounded-xl border-2 border-violet-200/90 bg-violet-50/30 px-4 text-sm font-semibold text-slate-800";
// Salt-okuma açıklama/bölüm: min-height YOK, iç overflow YOK → metin doğal aksar, modal body scroll eder.
const modalSectionViewClass =
  "mt-1.5 whitespace-pre-wrap rounded-xl border-2 border-violet-200/90 bg-violet-50/30 p-4 text-sm font-medium leading-7 text-slate-700";

const modalPrimaryBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-black text-white shadow-md ring-2 ring-violet-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const modalSecondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border-2 border-violet-200/90 bg-white px-5 text-sm font-black text-violet-900 shadow-sm ring-2 ring-violet-100/50 transition hover:border-violet-300 hover:bg-violet-50/80";
const modalCloseBtn =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300/90 bg-slate-50 px-4 text-sm font-black text-slate-800 shadow-sm ring-2 ring-slate-200/60 transition hover:border-slate-400 hover:bg-white";

type ModalFormState = {
  analizTuruKey: string;
  deger: string;
  source: string;
  description: string;
  kulvarBodies: KulvarBodies;
  reason: string;
  stonesText: string;
};

function kayitTuruBadge(tur: KayitTuru) {
  if (tur === "aciklama") {
    return "bg-violet-100 text-violet-900 ring-violet-200/80";
  }
  return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
}

type KbT = ReturnType<typeof useTranslations>;

/** Kayıt türü rozeti: numerology.knowledge.list.recordTypes.<kayitTuru> (TR birebir: "Açıklama Kaydı" / "Doğaltaş Atama"). */
function kayitTuruLabel(t: KbT, tur: KayitTuru) {
  return t(`list.recordTypes.${tur}`);
}

/**
 * I18N — EN'de sunucu hata ayrıntısı: numApiClient'ın sakladığı dil-bağımsız `code` → katalog
 * (önce numerology.knowledge.apiErrors, sonra common.apiErrors). Kod yoksa null (çağıran genel metni gösterir).
 * TR'de kullanılmaz (sunucu metni birebir).
 */
function enApiErrorDetail(t: KbT, tApi: KbT, serverText: string): string | null {
  const code = numApiErrorCode(serverText);
  if (!code) return null;
  if (t.has(`apiErrors.${code}`)) return t(`apiErrors.${code}`);
  if (code === "NETWORK") return tApi("network");
  if (tApi.has(`codes.${code}`)) return tApi(`codes.${code}`);
  return null;
}

function rowToForm(row: BilgiBankaListeSatir): ModalFormState {
  const kulvarBodies = isKulvarAnalysisType(row.analizTuruKey)
    ? bodiesFromRecord({ content_sections: row.content_sections, description: row.description ?? null })
    : { ...EMPTY_KULVAR_BODIES };
  return {
    analizTuruKey: row.analizTuruKey,
    deger: row.deger,
    source: row.source ?? "",
    description: row.description ?? "",
    kulvarBodies,
    reason: row.reason ?? "",
    stonesText: stonesToTextarea(row.stones ?? []),
  };
}

function formSnapshot(row: BilgiBankaListeSatir, form: ModalFormState): string {
  if (row.kayitTuru === "aciklama") {
    if (isKulvarAnalysisType(form.analizTuruKey)) {
      return JSON.stringify({
        analizTuruKey: form.analizTuruKey,
        deger: form.deger.trim(),
        source: form.source.trim(),
        kulvarBodies: form.kulvarBodies,
      });
    }
    return JSON.stringify({
      analizTuruKey: form.analizTuruKey,
      deger: form.deger.trim(),
      source: form.source.trim(),
      description: form.description.trim(),
    });
  }
  return JSON.stringify({
    analizTuruKey: form.analizTuruKey,
    deger: form.deger.trim(),
    reason: form.reason.trim(),
    stonesText: form.stonesText.trim(),
  });
}

function isCakraOmurga(tur: string) {
  return tur === "cakra-omurga";
}

function isElement(tur: string) {
  return tur === "element";
}

export function KayitDetayModal({
  row,
  onClose,
  onSaved,
}: {
  row: BilgiBankaListeSatir;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("numerology.knowledge");
  const tApi = useTranslations("common.apiErrors");
  // I18N: TR'de satır etiketi / sunucu metni birebir; EN'de katalog.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  // I18N-F1-R5: kanonik değer (DB eşleşme anahtarı) DEĞİŞMEZ; yalnız görünen etiket ekran dilinde.
  const kbView = (v: string): string => (isSourceLocale ? v : kbValueDisplay(v, ((k, x) => t(`valueDisplay.${k}` as never, x as never)) as KbValueT));
  const turGoster = (key: string, fallback: string): string =>
    isSourceLocale ? fallback : t.has(`shared.analysisTypes.${key}`) ? t(`shared.analysisTypes.${key}`) : fallback;
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<ModalFormState>(() => rowToForm(row));
  const [baseline, setBaseline] = useState(() => formSnapshot(row, rowToForm(row)));
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const isKulvarRecord = row.kayitTuru === "aciklama" && isKulvarAnalysisType(row.analizTuruKey);
  const { sources, links, loading, reload } = useKulvarSources(row.recordId, isKulvarRecord);

  const dirty = editMode && formSnapshot(row, form) !== baseline;

  const requestClose = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: t("detail.close"),
        message: t("detail.unsavedMessage"),
        tone: "warning",
        confirmText: t("detail.close"),
        cancelText: t("shared.cancel"),
      });
      if (!ok) return;
    }
    onClose();
  }, [dirty, confirm, onClose, t]);

  // Kayıt değişince formu tazele + modal body'yi en üste al.
  useEffect(() => {
    const next = rowToForm(row);
    setForm(next);
    setBaseline(formSnapshot(row, next));
    setEditMode(false);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [row]);

  // Arka sayfa scroll kilidi (modal açıkken); unmount'ta eski değer geri gelir.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC ile kapat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  function handleAnalizChange(analizTuruKey: string) {
    setForm((prev) => ({
      ...prev,
      analizTuruKey,
      deger: prev.analizTuruKey === analizTuruKey ? prev.deger : "",
    }));
  }

  function renderDegerField(readonly: boolean) {
    if (readonly) {
      return <div className={modalReadonlyClass}>{form.deger || "—"}</div>;
    }
    if (isCakraOmurga(form.analizTuruKey)) {
      return (
        <select id="detay-deger" value={form.deger} onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))} className={modalSelectClass}>
          <option value="">{t("form.selectPlaceholder")}</option>
          {CHAKRA_VALUE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{kbView(opt)}</option>
          ))}
        </select>
      );
    }
    if (isElement(form.analizTuruKey)) {
      return (
        <select id="detay-deger" value={form.deger} onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))} className={modalSelectClass}>
          <option value="">{t("form.selectPlaceholder")}</option>
          {ELEMENT_DEGER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{kbView(opt)}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        id="detay-deger"
        type="text"
        value={form.deger}
        onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))}
        placeholder={t("form.valuePlaceholder")}
        className={modalInputClass}
      />
    );
  }

  async function handleKaydet() {
    if (!form.analizTuruKey) {
      showToast({ message: t("form.chooseAnalysisType"), type: "warning" });
      return;
    }
    if (!form.deger.trim()) {
      showToast({ message: t("form.fillValue"), type: "warning" });
      return;
    }

    setKaydediliyor(true);
    let error: string | null = null;

    if (row.kayitTuru === "aciklama") {
      const res = isKulvarAnalysisType(form.analizTuruKey)
        ? await updateKnowledgeRecordById(row.recordId, {
            analysisType: form.analizTuruKey,
            value: form.deger,
            source: form.source,
            content_sections: sectionsFromBodies(form.kulvarBodies),
          })
        : await updateKnowledgeRecordById(row.recordId, {
            analysisType: form.analizTuruKey,
            value: form.deger,
            source: form.source,
            description: form.description,
          });
      error = res.error;
    } else {
      const res = await updateStoneAssignmentById(row.recordId, {
        analysisType: form.analizTuruKey,
        value: form.deger,
        reason: form.reason,
        stones: normalizeStoneList(form.stonesText),
      });
      error = res.error;
    }

    setKaydediliyor(false);

    if (error) {
      const detail = isSourceLocale ? error : enApiErrorDetail(t, tApi, error);
      showToast({ message: detail ? t("detail.updateFailed", { error: detail }) : t("detail.updateFailedGeneric"), type: "error" });
      return;
    }

    showToast({ message: t("detail.updated"), type: "success" });
    setEditMode(false);
    setBaseline(formSnapshot(row, form));
    await onSaved();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bilgi-detay-baslik"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        aria-label={t("detail.close")}
        onClick={() => void requestClose()}
      />
      <div className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border-2 border-violet-200/80 bg-white shadow-2xl ring-1 ring-purple-200">
        {/* Header — sabit */}
        <div className="shrink-0 border-b border-violet-100/90 bg-gradient-to-r from-violet-50/95 via-white to-indigo-50/80 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700/80">{t("detail.eyebrow")}</p>
              <h2 id="bilgi-detay-baslik" className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
                {t("detail.title")}
              </h2>
              <span className={`mt-2 inline-block rounded-lg px-3 py-1 text-xs font-bold ring-1 ${kayitTuruBadge(row.kayitTuru)}`}>
                {kayitTuruLabel(t, row.kayitTuru)}
              </span>
            </div>
            <button type="button" onClick={() => void requestClose()} className={modalCloseBtn}>
              {t("detail.close")}
            </button>
          </div>
        </div>

        {/* Body — TEK dikey scroll alanı */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            <div>
              <label htmlFor="detay-analiz-turu" className={modalLabelClass}>{t("detail.analysisType")}</label>
              {editMode ? (
                <select id="detay-analiz-turu" value={form.analizTuruKey} onChange={(e) => handleAnalizChange(e.target.value)} className={modalSelectClass}>
                  {ANALIZ_TURU_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(`shared.analysisTypes.${opt.value}`)}</option>
                  ))}
                </select>
              ) : (
                <div className={modalReadonlyClass}>{turGoster(row.analizTuruKey, row.analizTuru)}</div>
              )}
            </div>

            <div>
              <label htmlFor="detay-deger" className={modalLabelClass}>{t("detail.value")}</label>
              {renderDegerField(!editMode)}
            </div>

            {row.kayitTuru === "aciklama" ? (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-kaynak" className={modalLabelClass}>{t("detail.source")}</label>
                  {editMode ? (
                    <input
                      id="detay-kaynak"
                      type="text"
                      value={form.source}
                      onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                      placeholder={t("form.sourcePlaceholder")}
                      className={modalInputClass}
                    />
                  ) : (
                    <div className={`${modalReadonlyClass} whitespace-pre-wrap`}>{form.source.trim() || "—"}</div>
                  )}
                </div>
                {isKulvarAnalysisType(form.analizTuruKey) ? (
                  <div className="lg:col-span-2">
                    <label className={modalLabelClass}>{t("form.structuredSections")}</label>
                    {editMode ? (
                      <KulvarSectionEditor
                        bodies={form.kulvarBodies}
                        onChange={(k: KulvarSectionKey, v: string) =>
                          setForm((p) => ({ ...p, kulvarBodies: { ...p.kulvarBodies, [k]: v } }))
                        }
                        disabled={kaydediliyor}
                        idPrefix="detay-kulvar"
                      />
                    ) : KULVAR_SECTION_TEMPLATE.some((s) => (form.kulvarBodies[s.key] ?? "").trim() !== "") ? (
                      <div className="grid gap-3">
                        {KULVAR_SECTION_TEMPLATE.filter((s) => (form.kulvarBodies[s.key] ?? "").trim() !== "").map((s) => (
                          <div key={s.key} className="min-w-0">
                            {/* I18N: bölüm etiketi kanonik şablondur; TR'de şablon etiketi aynen, EN'de shared.sectionLabels.<key>. */}
                            <p className="text-sm font-black text-violet-800">{isSourceLocale ? s.label : t(`shared.sectionLabels.${s.key}`)}</p>
                            <div className={modalSectionViewClass}>{form.kulvarBodies[s.key]}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={modalReadonlyClass}>—</div>
                    )}
                  </div>
                ) : (
                  <div className="lg:col-span-2">
                    <label htmlFor="detay-aciklama" className={modalLabelClass}>{t("detail.description")}</label>
                    {editMode ? (
                      <textarea
                        id="detay-aciklama"
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                        rows={8}
                        placeholder={t("detail.descriptionPlaceholder")}
                        className={modalTextareaClass}
                      />
                    ) : (
                      <div className={modalSectionViewClass}>{form.description.trim() || "—"}</div>
                    )}
                  </div>
                )}
                {isKulvarAnalysisType(form.analizTuruKey) ? (
                  <div className="lg:col-span-2">
                    <label className={modalLabelClass}>{t("form.sources")}</label>
                    {editMode ? (
                      <KulvarSourceManager
                        recordId={row.recordId}
                        recordAnalysisType={form.analizTuruKey}
                        sources={sources}
                        links={links}
                        loading={loading}
                        reload={reload}
                      />
                    ) : (
                      <KulvarSourceReadonlyList links={links} sources={sources} />
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-oneri" className={modalLabelClass}>{t("detail.reason")}</label>
                  {editMode ? (
                    <textarea
                      id="detay-oneri"
                      value={form.reason}
                      onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                      rows={5}
                      placeholder={t("detail.reasonPlaceholder")}
                      className={modalTextareaClass}
                    />
                  ) : (
                    <div className={modalSectionViewClass}>{form.reason.trim() || "—"}</div>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-taslar" className={modalLabelClass}>{t("detail.stones")}</label>
                  {editMode ? (
                    <>
                      <textarea
                        id="detay-taslar"
                        value={form.stonesText}
                        onChange={(e) => setForm((p) => ({ ...p, stonesText: e.target.value }))}
                        rows={6}
                        placeholder={t("detail.stonesPlaceholder")}
                        className={modalTextareaClass}
                      />
                      <p className="mt-1.5 text-xs font-medium text-slate-500">{t("detail.stonesHint")}</p>
                    </>
                  ) : form.stonesText.trim() ? (
                    <ul className="mt-1.5 space-y-1.5 rounded-xl border-2 border-emerald-100/80 bg-emerald-50/50 p-4">
                      {normalizeStoneList(form.stonesText).map((tas) => (
                        <li key={tas} className="text-sm font-medium text-slate-800">{tas}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className={modalReadonlyClass}>—</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer — sabit */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t-2 border-violet-100/90 bg-violet-50/30 px-5 py-3.5 sm:px-7">
          <div>
            {editMode ? (
              <button type="button" disabled={kaydediliyor} onClick={() => void handleKaydet()} className={modalPrimaryBtn}>
                {kaydediliyor ? t("shared.saving") : t("shared.save")}
              </button>
            ) : (
              <button type="button" onClick={() => setEditMode(true)} className={modalPrimaryBtn}>
                {t("detail.edit")}
              </button>
            )}
          </div>
          <button type="button" onClick={() => void requestClose()} className={modalSecondaryBtn}>
            {t("detail.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ANALIZ_TURU_LABELS } from "../helpers/bilgiBankaLabels";
import {
  normalizeStoneList,
  stonesToTextarea,
  updateKnowledgeRecordById,
  updateStoneAssignmentById,
  type BilgiBankaListeSatir,
} from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";
import { KULVAR_SECTION_TEMPLATE, isKulvarAnalysisType, type KulvarSectionKey } from "../helpers/knowledgeSections";
import { EMPTY_KULVAR_BODIES, bodiesFromRecord, sectionsFromBodies, type KulvarBodies } from "../helpers/kulvarFormLogic";
import { useKulvarSources } from "../helpers/useKulvarSources";
import { KulvarSectionEditor } from "./KulvarSectionEditor";
import { KulvarSourceManager } from "./KulvarSourceManager";
import { KulvarSourceReadonlyList } from "./KulvarSourceReadonlyList";

type KayitTuru = BilgiBankaListeSatir["kayitTuru"];

const ANALIZ_TURU_OPTIONS = Object.entries(ANALIZ_TURU_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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

function kayitTuruLabel(tur: KayitTuru) {
  return tur === "aciklama" ? "Açıklama Kaydı" : "Doğaltaş Atama";
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
        title: "Kapat",
        message: "Kaydedilmemiş değişiklikler var. Kapatmak istediğinize emin misiniz?",
        tone: "warning",
        confirmText: "Kapat",
        cancelText: "Vazgeç",
      });
      if (!ok) return;
    }
    onClose();
  }, [dirty, confirm, onClose]);

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
          <option value="">Seçiniz...</option>
          {CHAKRA_VALUE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    if (isElement(form.analizTuruKey)) {
      return (
        <select id="detay-deger" value={form.deger} onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))} className={modalSelectClass}>
          <option value="">Seçiniz...</option>
          {ELEMENT_DEGER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
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
        placeholder="Örn. 19, 11, 33/6, 22…"
        className={modalInputClass}
      />
    );
  }

  async function handleKaydet() {
    if (!form.analizTuruKey) {
      showToast({ message: "Analiz türü seçin.", type: "warning" });
      return;
    }
    if (!form.deger.trim()) {
      showToast({ message: "Değer alanını doldurun.", type: "warning" });
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
      showToast({ message: `Kayıt güncellenemedi: ${error}`, type: "error" });
      return;
    }

    showToast({ message: "Kayıt güncellendi", type: "success" });
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
        aria-label="Kapat"
        onClick={() => void requestClose()}
      />
      <div className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border-2 border-violet-200/80 bg-white shadow-2xl ring-1 ring-purple-200">
        {/* Header — sabit */}
        <div className="shrink-0 border-b border-violet-100/90 bg-gradient-to-r from-violet-50/95 via-white to-indigo-50/80 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700/80">Bilgi bankası</p>
              <h2 id="bilgi-detay-baslik" className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
                Kayıt detayı
              </h2>
              <span className={`mt-2 inline-block rounded-lg px-3 py-1 text-xs font-bold ring-1 ${kayitTuruBadge(row.kayitTuru)}`}>
                {kayitTuruLabel(row.kayitTuru)}
              </span>
            </div>
            <button type="button" onClick={() => void requestClose()} className={modalCloseBtn}>
              Kapat
            </button>
          </div>
        </div>

        {/* Body — TEK dikey scroll alanı */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            <div>
              <label htmlFor="detay-analiz-turu" className={modalLabelClass}>Analiz türü</label>
              {editMode ? (
                <select id="detay-analiz-turu" value={form.analizTuruKey} onChange={(e) => handleAnalizChange(e.target.value)} className={modalSelectClass}>
                  {ANALIZ_TURU_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <div className={modalReadonlyClass}>{row.analizTuru}</div>
              )}
            </div>

            <div>
              <label htmlFor="detay-deger" className={modalLabelClass}>Değer</label>
              {renderDegerField(!editMode)}
            </div>

            {row.kayitTuru === "aciklama" ? (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-kaynak" className={modalLabelClass}>Bilgi kaynağı</label>
                  {editMode ? (
                    <input
                      id="detay-kaynak"
                      type="text"
                      value={form.source}
                      onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                      placeholder="Örn. Eğitim notu, kitap, uzman yorumu…"
                      className={modalInputClass}
                    />
                  ) : (
                    <div className={`${modalReadonlyClass} whitespace-pre-wrap`}>{form.source.trim() || "—"}</div>
                  )}
                </div>
                {isKulvarAnalysisType(form.analizTuruKey) ? (
                  <div className="lg:col-span-2">
                    <label className={modalLabelClass}>Yapılandırılmış bölümler</label>
                    {editMode ? (
                      <KulvarSectionEditor
                        bodies={form.kulvarBodies}
                        onChange={(k: KulvarSectionKey, v: string) =>
                          setForm((p) => ({ ...p, kulvarBodies: { ...p.kulvarBodies, [k]: v } }))
                        }
                        disabled={kaydediliyor}
                        idPrefix="detay-kulvar"
                      />
                    ) : KULVAR_SECTION_TEMPLATE.some((t) => (form.kulvarBodies[t.key] ?? "").trim() !== "") ? (
                      <div className="grid gap-3">
                        {KULVAR_SECTION_TEMPLATE.filter((t) => (form.kulvarBodies[t.key] ?? "").trim() !== "").map((t) => (
                          <div key={t.key} className="min-w-0">
                            <p className="text-sm font-black text-violet-800">{t.label}</p>
                            <div className={modalSectionViewClass}>{form.kulvarBodies[t.key]}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={modalReadonlyClass}>—</div>
                    )}
                  </div>
                ) : (
                  <div className="lg:col-span-2">
                    <label htmlFor="detay-aciklama" className={modalLabelClass}>Açıklama metni</label>
                    {editMode ? (
                      <textarea
                        id="detay-aciklama"
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                        rows={8}
                        placeholder="Numeroloji açıklama ve yorum metnini buraya yazın…"
                        className={modalTextareaClass}
                      />
                    ) : (
                      <div className={modalSectionViewClass}>{form.description.trim() || "—"}</div>
                    )}
                  </div>
                )}
                {isKulvarAnalysisType(form.analizTuruKey) ? (
                  <div className="lg:col-span-2">
                    <label className={modalLabelClass}>Kaynaklar</label>
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
                  <label htmlFor="detay-oneri" className={modalLabelClass}>Öneri açıklaması</label>
                  {editMode ? (
                    <textarea
                      id="detay-oneri"
                      value={form.reason}
                      onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                      rows={5}
                      placeholder="Doğaltaş öneri ve kullanım açıklaması…"
                      className={modalTextareaClass}
                    />
                  ) : (
                    <div className={modalSectionViewClass}>{form.reason.trim() || "—"}</div>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-taslar" className={modalLabelClass}>Taş listesi</label>
                  {editMode ? (
                    <>
                      <textarea
                        id="detay-taslar"
                        value={form.stonesText}
                        onChange={(e) => setForm((p) => ({ ...p, stonesText: e.target.value }))}
                        rows={6}
                        placeholder="Her satıra bir taş veya virgülle ayırarak yazın…"
                        className={modalTextareaClass}
                      />
                      <p className="mt-1.5 text-xs font-medium text-slate-500">Virgül, nokta veya satır sonu ile ayırabilirsiniz.</p>
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
                {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
              </button>
            ) : (
              <button type="button" onClick={() => setEditMode(true)} className={modalPrimaryBtn}>
                Güncelle
              </button>
            )}
          </div>
          <button type="button" onClick={() => void requestClose()} className={modalSecondaryBtn}>
            Kapat
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

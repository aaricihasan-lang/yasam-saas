"use client";

import { useEffect, useState } from "react";
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

type KayitTuru = BilgiBankaListeSatir["kayitTuru"];

const ANALIZ_TURU_OPTIONS = Object.entries(ANALIZ_TURU_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const ELEMENT_DEGER_OPTIONS = (["Ateş", "Su", "Toprak", "Hava"] as const).flatMap((el) => [
  `${el} | AZ`,
  `${el} | FAZLA`,
]);

const modalFieldBase =
  "w-full rounded-2xl border-2 border-violet-200/90 bg-white px-6 font-medium text-slate-900 shadow-md outline-none ring-1 ring-purple-200 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/50";

const modalSelectClass = `h-16 ${modalFieldBase} text-lg`;

const modalInputClass = `h-16 ${modalFieldBase} text-lg placeholder:text-slate-400`;

const modalTextareaClass = `${modalFieldBase} min-h-[220px] resize-y py-5 text-lg leading-relaxed placeholder:text-slate-400`;

const modalLabelClass = "mb-3 block text-base font-bold text-slate-800";

const modalReadonlyClass =
  "mt-2 rounded-2xl border border-violet-100/90 bg-violet-50/30 px-5 py-4 text-lg leading-relaxed text-slate-800";

const modalPrimaryBtn =
  "inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-10 py-3 text-base font-black uppercase tracking-wide text-white shadow-[0_12px_32px_-8px_rgba(91,33,182,0.45)] ring-2 ring-violet-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";

const modalSecondaryBtn =
  "inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-200/90 bg-white px-8 py-3 text-base font-black uppercase tracking-wide text-violet-900 shadow-md ring-2 ring-violet-100/50 transition hover:border-violet-300 hover:bg-violet-50/80";

const modalCloseBtn =
  "inline-flex min-h-[3.25rem] shrink-0 items-center justify-center rounded-2xl border-2 border-slate-300/90 bg-slate-50 px-8 py-3 text-base font-black text-slate-800 shadow-md ring-2 ring-slate-200/60 transition hover:border-slate-400 hover:bg-white";

type ModalFormState = {
  analizTuruKey: string;
  deger: string;
  source: string;
  description: string;
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
  return {
    analizTuruKey: row.analizTuruKey,
    deger: row.deger,
    source: row.source ?? "",
    description: row.description ?? "",
    reason: row.reason ?? "",
    stonesText: stonesToTextarea(row.stones ?? []),
  };
}

function formSnapshot(row: BilgiBankaListeSatir, form: ModalFormState): string {
  if (row.kayitTuru === "aciklama") {
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

  useEffect(() => {
    const next = rowToForm(row);
    setForm(next);
    setBaseline(formSnapshot(row, next));
    setEditMode(false);
  }, [row]);

  const dirty = editMode && formSnapshot(row, form) !== baseline;

  async function requestClose() {
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
  }

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
        <select
          id="detay-deger"
          value={form.deger}
          onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))}
          className={modalSelectClass}
        >
          <option value="">Seçiniz...</option>
          {CHAKRA_VALUE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (isElement(form.analizTuruKey)) {
      return (
        <select
          id="detay-deger"
          value={form.deger}
          onChange={(e) => setForm((p) => ({ ...p, deger: e.target.value }))}
          className={modalSelectClass}
        >
          <option value="">Seçiniz...</option>
          {ELEMENT_DEGER_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
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
      const res = await updateKnowledgeRecordById(row.recordId, {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bilgi-detay-baslik"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-md"
        aria-label="Kapat"
        onClick={() => void requestClose()}
      />
      <div className="relative z-10 flex max-h-[min(92vh,920px)] w-[92vw] max-w-[1100px] flex-col overflow-hidden rounded-[32px] border-2 border-violet-200/80 bg-white shadow-2xl ring-1 ring-purple-200">
        <div className="shrink-0 border-b border-violet-100/90 bg-gradient-to-r from-violet-50/95 via-white to-indigo-50/80 px-8 py-8 sm:px-12 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-700/80">
                Bilgi bankası
              </p>
              <h2 id="bilgi-detay-baslik" className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Kayıt detayı
              </h2>
              <p className="mt-2 text-base font-medium text-slate-500 sm:text-lg">
                {editMode
                  ? "Kaydı düzenleyin ve Kaydet ile güncelleyin"
                  : "Kayıt bilgilerini görüntüleyin veya güncelleyin"}
              </p>
              <span
                className={`mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold ring-1 ${kayitTuruBadge(row.kayitTuru)}`}
              >
                {kayitTuruLabel(row.kayitTuru)}
              </span>
            </div>
            <button type="button" onClick={() => void requestClose()} className={modalCloseBtn}>
              Kapat
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8 sm:px-12 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <label htmlFor="detay-analiz-turu" className={modalLabelClass}>
                Analiz türü
              </label>
              {editMode ? (
                <select
                  id="detay-analiz-turu"
                  value={form.analizTuruKey}
                  onChange={(e) => handleAnalizChange(e.target.value)}
                  className={modalSelectClass}
                >
                  {ANALIZ_TURU_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={modalReadonlyClass}>{row.analizTuru}</div>
              )}
            </div>

            <div>
              <label htmlFor="detay-deger" className={modalLabelClass}>
                Değer
              </label>
              {renderDegerField(!editMode)}
            </div>

            {row.kayitTuru === "aciklama" ? (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-kaynak" className={modalLabelClass}>
                    Bilgi kaynağı
                  </label>
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
                    <div className={`${modalReadonlyClass} whitespace-pre-wrap`}>
                      {form.source.trim() || "—"}
                    </div>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-aciklama" className={modalLabelClass}>
                    Açıklama metni
                  </label>
                  {editMode ? (
                    <textarea
                      id="detay-aciklama"
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      rows={10}
                      placeholder="Numeroloji açıklama ve yorum metnini buraya yazın…"
                      className={modalTextareaClass}
                    />
                  ) : (
                    <div className={`${modalReadonlyClass} whitespace-pre-wrap`}>
                      {form.description.trim() || "—"}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-oneri" className={modalLabelClass}>
                    Öneri açıklaması
                  </label>
                  {editMode ? (
                    <textarea
                      id="detay-oneri"
                      value={form.reason}
                      onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                      rows={6}
                      placeholder="Doğaltaş öneri ve kullanım açıklaması…"
                      className={modalTextareaClass}
                    />
                  ) : (
                    <div className={`${modalReadonlyClass} whitespace-pre-wrap`}>
                      {form.reason.trim() || "—"}
                    </div>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="detay-taslar" className={modalLabelClass}>
                    Taş listesi
                  </label>
                  {editMode ? (
                    <>
                      <textarea
                        id="detay-taslar"
                        value={form.stonesText}
                        onChange={(e) => setForm((p) => ({ ...p, stonesText: e.target.value }))}
                        rows={8}
                        placeholder="Her satıra bir taş veya virgülle ayırarak yazın…"
                        className={modalTextareaClass}
                      />
                      <p className="mt-2 text-sm font-medium text-slate-500">
                        Virgül, nokta veya satır sonu ile ayırabilirsiniz.
                      </p>
                    </>
                  ) : form.stonesText.trim() ? (
                    <ul className="mt-2 space-y-2 rounded-2xl border-2 border-emerald-100/80 bg-emerald-50/50 p-5">
                      {normalizeStoneList(form.stonesText).map((tas) => (
                        <li key={tas} className="text-lg font-medium text-slate-800">
                          {tas}
                        </li>
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

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-t-2 border-violet-100/90 bg-violet-50/30 px-8 py-6 sm:px-12 sm:py-8">
          <div>
            {editMode ? (
              <button
                type="button"
                disabled={kaydediliyor}
                onClick={() => void handleKaydet()}
                className={modalPrimaryBtn}
              >
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
    </div>
  );
}

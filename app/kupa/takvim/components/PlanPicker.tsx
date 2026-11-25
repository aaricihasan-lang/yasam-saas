"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useToast } from "@/components/ui/ToastProvider";
import {
  kupaBtnGhost,
  kupaBtnPrimary,
  kupaBtnSuccess,
  kupaInput,
} from "@/app/kupa/components/KupaShell";
import { CUPPING_PLAN_YEAR_MIN, CUPPING_PLAN_YEAR_MAX } from "@/lib/cupping/calendarTypes";
import { updateCalendarPlan, type CuppingCalendarPlan } from "@/app/kupa/lib/api";
import { useSystemNames } from "../lib/useSystemNames";

/**
 * FAZ 5 / AŞAMA 3 — Plan kontrolü: aktif plan seçimi + Yeni Takvim + ad/açıklama + sil.
 * WT6: "+ Yeni Takvim" artık ad/açıklama formu AÇMAZ → yıl + ay seçim penceresi (çağıranda,
 *   onNewCalendar). Eski "Düzenle" yalnız takvim ADI/AÇIKLAMASINI değiştirdiği için gün düzenleme
 *   ile karışıyordu → "Ad / Açıklama" olarak adlandırıldı (gün düzenleme: "Bu Ayı Düzenle").
 * Düşük sürtünme: mobilde üstte plan seçici. Yıl invariantı korunur — seçili günleri olan
 * planın yılı DEĞİŞTİRİLEMEZ (sessiz gün taşıma/silme YOK).
 */
function defaultYear(): number {
  // İstemci tarafı; plan yılı için makul varsayılan. (Harici bağımlılık yok.)
  return new Date().getFullYear();
}

export function PlanPicker({
  plans,
  activePlanId,
  currentDayCount,
  hasPendingChanges = false,
  disabled = false,
  onSelect,
  onNewCalendar,
  onPlanUpdated,
  onDelete,
}: {
  plans: CuppingCalendarPlan[];
  activePlanId: string | null;
  currentDayCount: number;
  /** Takvimde kaydedilmemiş gün değişikliği var mı (yıl kilidi + yeni plan onayı için). */
  hasPendingChanges?: boolean;
  /** Kayıt sürerken plan kontrolleri kilitli. */
  disabled?: boolean;
  onSelect: (planId: string) => void;
  /** WT6: "+ Yeni Takvim" → yıl/ay seçim penceresi (çağıran açar). */
  onNewCalendar: () => void;
  /** Ad/açıklama/yıl güncellendi → çağıran YERİNDE günceller (gün taslağı sıfırlanmaz). */
  onPlanUpdated: (plan: CuppingCalendarPlan) => void;
  onDelete: (plan: CuppingCalendarPlan) => void;
}) {
  const { showToast } = useToast();
  const t = useTranslations("cupping.calendar.plan");
  const tc = useTranslations("cupping.common");
  const sysNames = useSystemNames();
  const errText = useKupaErrorText();
  const active = plans.find((p) => p.id === activePlanId) ?? null;
  const [mode, setMode] = useState<"none" | "edit">("none");
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(defaultYear());
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  // Yıl invariantı: kayıtlı VEYA kaydedilmemiş günü olan planın yılı değiştirilemez (taslaktaki
  //   günler eski yıla aittir; yıl değişirse kaydedilemez hale gelirdi).
  const yearLocked = mode === "edit" && (currentDayCount > 0 || hasPendingChanges);

  function openEdit() {
    if (!active) return;
    // I18N A8: alan EKRANDA GÖRÜNEN adla dolar (EN ekranda sistem adı "2027 Hijama Calendar"; ham TR değil).
    setName(sysNames.planName(active));
    setYear(active.year);
    setDescription(active.description ?? "");
    setMode("edit");
  }

  async function save() {
    if (!name.trim()) {
      showToast({ message: t("nameRequired"), type: "warning" });
      return;
    }
    if (!Number.isInteger(year) || year < CUPPING_PLAN_YEAR_MIN || year > CUPPING_PLAN_YEAR_MAX) {
      showToast({ message: t("yearRange", { min: String(CUPPING_PLAN_YEAR_MIN), max: String(CUPPING_PLAN_YEAR_MAX) }), type: "warning" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "edit" && active) {
        // Yıl yalnız gün yoksa gönderilir (invariant); açıklama her zaman.
        // I18N A8: ad YALNIZ kullanıcı görünen adı DEĞİŞTİRDİYSE gönderilir. Değişmediyse kayıtlı ad zaten aynıdır
        //   (bugünkü gönderimle DB sonucu birebir); böylece EN ekranda çevrilmiş sistem adı DB'ye yazılmaz ve
        //   name_is_default (kolon varsa) korunur. Ad gönderilirse taslak DB tetiği bayrağı FALSE yapar.
        const body: Parameters<typeof updateCalendarPlan>[1] = {
          description: description.trim() || null,
        };
        if (name.trim() !== sysNames.planName(active)) body.name = name.trim();
        if (!yearLocked && year !== active.year) body.year = year;
        const updated = await updateCalendarPlan(active.id, body);
        onPlanUpdated(updated);
        showToast({ message: t("updated"), type: "success" });
      }
      setMode("none");
    } catch (e) {
      showToast({ message: errText(e, t("failed")), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("active")}</span>
          <select
            className={kupaInput}
            value={activePlanId ?? ""}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
            disabled={disabled}
          >
            {activePlanId ? null : (
              <option value="" disabled>
                {t("choose")}
              </option>
            )}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {sysNames.planName(p)} ({p.year})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className={`${kupaBtnPrimary} min-h-[40px]`} onClick={onNewCalendar} disabled={disabled}>
            {/* FINAL-A1: yıl için takvim varsa YENİSİ oluşturulmaz, mevcut açılır → etiket bunu söyler. */}
            {t("createOpen")}
          </button>
          {active ? (
            <>
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={openEdit} disabled={disabled}>
                {t("editMeta")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                onClick={() => onDelete(active)}
                disabled={disabled}
              >
                {tc("delete")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {active && mode === "none" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="font-bold text-slate-800">{sysNames.planName(active)}</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{active.year}</span>
          {active.description ? <span className="text-slate-500">{active.description}</span> : null}
        </div>
      ) : null}

      {mode !== "none" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">{t("metaTitle")}</h3>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("name")}</span>
              <input className={kupaInput} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("year")}</span>
              {yearLocked ? (
                <>
                  <input className={`${kupaInput} bg-slate-50 text-slate-500`} value={year} readOnly aria-readonly />
                  <span className="text-xs text-slate-400">{t("yearLocked")}</span>
                </>
              ) : (
                <input
                  type="number"
                  className={kupaInput}
                  value={year}
                  min={CUPPING_PLAN_YEAR_MIN}
                  max={CUPPING_PLAN_YEAR_MAX}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("description")}</span>
              <input className={kupaInput} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={() => setMode("none")} disabled={busy}>
                {tc("cancel")}
              </button>
              <button type="button" className={`${kupaBtnSuccess} min-h-[40px]`} onClick={save} disabled={busy}>
                {busy ? tc("saving") : tc("save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

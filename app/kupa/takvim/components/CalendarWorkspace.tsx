"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnSuccess, kupaCard } from "@/app/kupa/components/KupaShell";
import { CUPPING_PLAN_DAYS_MAX_BATCH, type CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import { gregorianToHijri, toYmd } from "@/lib/cupping/hijri";
import {
  listCalendarPlans,
  getCalendarPlan,
  addCalendarPlanDays,
  updateCalendarDay,
  deleteCalendarDay,
  deleteCalendarPlan,
  updateCalendarPlan,
  listAdviceTemplates,
  type CuppingAdviceTemplate,
  type CuppingCalendarPlan,
  type CuppingPlanDayInput,
} from "@/app/kupa/lib/api";
import { MonthCalendar, MONTHS_TR, type CuppingDayStyleView } from "./MonthCalendar";
import { MonthNav } from "./MonthNav";
import { PlanPicker } from "./PlanPicker";
import { BulkDateSelector } from "./BulkDateSelector";
import { OutputAdviceSection } from "./OutputAdviceSection";
import { ClientAdviceSection } from "./ClientAdviceSection";
import { CalendarViewToggle, type CalendarView } from "./CalendarViewToggle";
import { AnnualCalendarOverview } from "./AnnualCalendarOverview";
import { DayEditPanel, type DayStyleDraft } from "./DayEditPanel";

/** İstemci-yerel bugün "YYYY-MM-DD" (nötr; yalnız "bugün" halkası için). */
function todayYmd(): string {
  const d = new Date();
  return toYmd({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
}

/** Kayıtlı gün satırının otoriter stili (server → client). */
type SavedDay = { id: string; colorKey: CuppingDayColorKey | null; label: string | null; note: string | null };

/** Boş taslak stili (renk yok, açıklama yok). */
const EMPTY_STYLE: DayStyleDraft = { colorKey: null, label: "", note: "" };

/** Metin normalizasyonu: boş/whitespace → null (kaydetme/karşılaştırma için tek ölçü). */
function nz(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** Taslak stili → API yazma payload'u (renk + kısa açıklama + detay notu). */
function toWritePayload(s: DayStyleDraft): { color_key: CuppingDayColorKey | null; user_label: string | null; note: string | null } {
  return { color_key: s.colorKey, user_label: nz(s.label), note: nz(s.note) };
}

/** Taslak stili kayıtlı stilden farklı mı? (PATCH gerekliliği; boş↔null eşdeğer). */
function styleDiffers(d: DayStyleDraft, saved: SavedDay): boolean {
  return d.colorKey !== saved.colorKey || nz(d.label) !== (saved.label ?? null) || nz(d.note) !== (saved.note ?? null);
}

/** Sınırlı eşzamanlılık havuzu (yüzlerce eşzamanlı istek atmaz). */
async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<{ okCount: number; failCount: number }> {
  let okCount = 0;
  let failCount = 0;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
        okCount++;
      } catch {
        failCount++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return { okCount, failCount };
}

/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 + 5 — UZMAN-SAHİPLİ takvim çalışma alanı.
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Takvim tamamen uzmanındır. Sistem HAZIR gün üretmez. Yeni plan
 *   SIFIR seçili günle başlar; uzman her günü kendisi işaretler. Seçili bir güne kontrollü
 *   paletten renk + kendi kısa açıklaması eklenebilir (opsiyonel; anlam platformca sabitlenmez).
 *   Aylık + Yıllık AYNI planı/taslağı gösterir (renk/açıklama dâhil). Renk/açıklama nihai kaydı
 *   ana "Değişiklikleri Kaydet" ile olur (tek kalıcılık yolu; kaydedilmemiş uyarısı stili de kapsar).
 */
export function CalendarWorkspace() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [plans, setPlans] = useState<CuppingCalendarPlan[]>([]);
  const [templates, setTemplates] = useState<CuppingAdviceTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [plan, setPlan] = useState<CuppingCalendarPlan | null>(null);
  // ymd -> kayıtlı satır (id + otoriter stil). Silme/PATCH için gün-id gerekir.
  const [savedDays, setSavedDays] = useState<Map<string, SavedDay>>(new Map());
  // Seçim (yıl geneli). Bir gün seçili ⇔ draft.has(ymd).
  const [draft, setDraft] = useState<Set<string>>(new Set());
  // Taslak stili (renk + kısa açıklama + detay notu) — seçili günler için; kayıttan türetilir.
  const [draftStyle, setDraftStyle] = useState<Map<string, DayStyleDraft>>(new Map());
  const [month, setMonth] = useState(1);
  const [view, setView] = useState<CalendarView>("monthly");
  const [editYmd, setEditYmd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = useMemo(() => todayYmd(), []);

  // Kayıtlı gün kümesi (yalnız ymd) — Aylık + Yıllık görünüme geçirilir (durum türetimi).
  const savedSet = useMemo(() => new Set(savedDays.keys()), [savedDays]);

  const additions = useMemo(() => [...draft].filter((d) => !savedDays.has(d)), [draft, savedDays]);
  const removals = useMemo(() => [...savedDays.keys()].filter((d) => !draft.has(d)), [savedDays, draft]);
  // Kayıtlı + hâlâ seçili günlerde renk/açıklama değişikliği (PATCH gerektirir).
  const styleChanges = useMemo(
    () =>
      [...draft].filter((d) => {
        const saved = savedDays.get(d);
        return saved ? styleDiffers(draftStyle.get(d) ?? EMPTY_STYLE, saved) : false;
      }),
    [draft, savedDays, draftStyle],
  );
  const dirty = additions.length > 0 || removals.length > 0 || styleChanges.length > 0;

  // Aylık + Yıllık görünüme geçirilen stil erişimcisi (taslak = tek doğruluk).
  const styleOf = useCallback(
    (ymd: string): CuppingDayStyleView | undefined => {
      const s = draftStyle.get(ymd);
      if (!s) return undefined;
      return { colorKey: s.colorKey, label: nz(s.label) };
    },
    [draftStyle],
  );

  const refreshTemplates = useCallback(async () => {
    try {
      setTemplates(await listAdviceTemplates());
    } catch {
      /* şablon listesi hatası takvimi bloklamaz */
    }
  }, []);

  const loadPlanInto = useCallback(async (id: string) => {
    setPlanLoading(true);
    setError(null);
    try {
      const { plan: p, days } = await getCalendarPlan(id);
      setPlan(p);
      const map = new Map<string, SavedDay>();
      const styles = new Map<string, DayStyleDraft>();
      for (const d of days) {
        map.set(d.gregorian_date, {
          id: d.id,
          colorKey: d.color_key,
          label: d.user_label,
          note: d.note,
        });
        styles.set(d.gregorian_date, {
          colorKey: d.color_key,
          label: d.user_label ?? "",
          note: d.note ?? "",
        });
      }
      setSavedDays(map);
      setDraft(new Set(map.keys()));
      setDraftStyle(styles);
      setEditYmd(null);
      // Plan yılı bu yıla eşitse mevcut ayı aç; değilse Ocak.
      const nowY = new Date().getFullYear();
      setMonth(p.year === nowY ? new Date().getMonth() + 1 : 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Takvim yüklenemedi.");
    } finally {
      setPlanLoading(false);
    }
  }, []);

  const refreshPlansList = useCallback(
    async (selectId?: string) => {
      const list = await listCalendarPlans();
      setPlans(list);
      const target = selectId ?? activeId ?? (list.length > 0 ? list[0].id : null);
      if (target && (selectId || target !== activeId || !plan)) {
        setActiveId(target);
        await loadPlanInto(target);
      } else if (!target) {
        setActiveId(null);
        setPlan(null);
        setSavedDays(new Map());
        setDraft(new Set());
        setDraftStyle(new Map());
      }
    },
    [activeId, plan, loadPlanInto],
  );

  // İlk yükleme.
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list] = await Promise.all([listCalendarPlans(), refreshTemplates()]);
        setPlans(list);
        if (list.length > 0) {
          setActiveId(list[0].id);
          await loadPlanInto(list[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Takvimler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kaydedilmemiş değişiklik varken sekme kapanışı/yenileme uyarısı (tarayıcı standardı).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Toplu ekleme — RENK ZORUNLU; seçilen renk YALNIZ bu işlemle YENİ eklenen günlere uygulanır.
  //   Zaten seçili/kayıtlı günlerin stili SESSİZCE EZİLMEZ (yalnız draft'ta olmayanlara atanır).
  const addBulk = useCallback((dates: string[], colorKey: CuppingDayColorKey) => {
    const newlyAdded = dates.filter((d) => !draft.has(d));
    if (newlyAdded.length === 0) {
      showToast({ message: "Eklenecek yeni gün yok (seçilen günler zaten takvimde).", type: "info" });
      return;
    }
    setDraft((prev) => {
      const next = new Set(prev);
      for (const d of newlyAdded) next.add(d);
      return next;
    });
    setDraftStyle((prev) => {
      const next = new Map(prev);
      for (const d of newlyAdded) next.set(d, { colorKey, label: "", note: "" });
      return next;
    });
    showToast({ message: `${newlyAdded.length} yeni gün seçtiğiniz renkle eklendi. Kaydetmeyi unutmayın.`, type: "info" });
  }, [draft, showToast]);

  // Düzenleme panelinden gelen stil uygulaması (taslağa yazar; gün seçili kalır).
  const applyDayStyle = useCallback((ymd: string, style: DayStyleDraft) => {
    setDraft((prev) => (prev.has(ymd) ? prev : new Set(prev).add(ymd)));
    setDraftStyle((prev) => {
      const next = new Map(prev);
      next.set(ymd, style);
      return next;
    });
    setEditYmd(null);
  }, []);

  // "Gün Seçimini Kaldır" (panelden): seçimi ve stilini birlikte bırakır.
  const deselectDay = useCallback((ymd: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      next.delete(ymd);
      return next;
    });
    setDraftStyle((prev) => {
      if (!prev.has(ymd)) return prev;
      const next = new Map(prev);
      next.delete(ymd);
      return next;
    });
    setEditYmd(null);
  }, []);

  async function confirmDiscardIfDirty(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: "Kaydedilmemiş Değişiklikler",
      message: "Kaydedilmemiş gün seçimleriniz var. Devam ederseniz bu değişiklikler kaybolur.",
      confirmText: "Kaydetmeden Devam Et",
      cancelText: "Vazgeç",
      tone: "danger",
    });
  }

  async function handleSelectPlan(id: string) {
    if (id === activeId) return;
    if (!(await confirmDiscardIfDirty())) return;
    setActiveId(id);
    await loadPlanInto(id);
  }

  async function handleSave() {
    if (!plan || !dirty) return;
    setSaving(true);
    try {
      let failCount = 0;
      // 1) Eklemeler — PER-DAY stil (renk + kısa açıklama + detay notu) TEK istekte kalıcı olur.
      //    Toplu POST max batch'e göre parçalanır; sunucu çakışmayı idempotent atlar.
      const dayInputs: CuppingPlanDayInput[] = additions.map((d) => ({
        date: d,
        ...toWritePayload(draftStyle.get(d) ?? EMPTY_STYLE),
      }));
      for (let i = 0; i < dayInputs.length; i += CUPPING_PLAN_DAYS_MAX_BATCH) {
        const chunk = dayInputs.slice(i, i + CUPPING_PLAN_DAYS_MAX_BATCH);
        if (chunk.length > 0) await addCalendarPlanDays(plan.id, { days: chunk });
      }
      // 2) Stil değişiklikleri — kayıtlı+seçili günlerde renk/açıklama PATCH (SINIRLI eşzamanlılık).
      const styleTargets = styleChanges
        .map((d) => ({ id: savedDays.get(d)?.id, style: draftStyle.get(d) ?? EMPTY_STYLE }))
        .filter((t): t is { id: string; style: DayStyleDraft } => !!t.id);
      const styleRes = await runPool(styleTargets, 4, (t) => updateCalendarDay(t.id, toWritePayload(t.style)));
      failCount += styleRes.failCount;
      // 3) Silmeler — mevcut gün-id ile (bir günü takvimden çıkarmak o satırı siler).
      const removeIds = removals.map((d) => savedDays.get(d)?.id).filter((v): v is string => !!v);
      const delRes = await runPool(removeIds, 4, (id) => deleteCalendarDay(id));
      failCount += delRes.failCount;
      // 4) Otoriter durumu yeniden yükle (başarı da olsa kısmi de olsa TEK doğruluk kaynağı server).
      await loadPlanInto(plan.id);
      if (failCount > 0) {
        showToast({ message: "Bazı değişiklikler kaydedilemedi. Güncel durum yeniden yüklendi.", type: "warning" });
      } else {
        showToast({ message: "Takvim kaydedildi.", type: "success" });
      }
    } catch (e) {
      // Kısmi hata: sahte başarı YOK → otoriter durumu yeniden yükle.
      await loadPlanInto(plan.id).catch(() => {});
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi. Güncel durum yeniden yüklendi.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePlan(p: CuppingCalendarPlan) {
    if (!(await confirmDiscardIfDirty())) return;
    const ok = await confirm({
      title: "Takvimi Sil",
      message: `"${p.name}" takvimini ve seçili günlerini silmek istiyor musunuz? Bu işlem geri alınamaz.`,
      confirmText: "Takvimi Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteCalendarPlan(p.id);
      // Silinen aktifse: draft/saved temizle, listeyi tazele ve başka plan seç.
      setActiveId(null);
      setPlan(null);
      setSavedDays(new Map());
      setDraft(new Set());
      setDraftStyle(new Map());
      await refreshPlansList();
      showToast({ message: "Takvim silindi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  async function handleAttachTemplate(templateId: string | null) {
    if (!plan) return;
    const updated = await updateCalendarPlan(plan.id, { advice_template_id: templateId });
    setPlan(updated);
  }

  // Düzenleme paneli için tam Gregoryen + Hicrî tarih metni (motor: lib/cupping/hijri).
  const editContext = useMemo(() => {
    if (!editYmd) return null;
    const y = Number(editYmd.slice(0, 4));
    const m = Number(editYmd.slice(5, 7));
    const d = Number(editYmd.slice(8, 10));
    const h = gregorianToHijri(editYmd);
    return {
      gregText: `${d} ${MONTHS_TR[m - 1]} ${y}`,
      hijriText: h?.formatted ?? "",
      initial: draftStyle.get(editYmd) ?? EMPTY_STYLE,
    };
  }, [editYmd, draftStyle]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className={`${kupaCard}`}><p className="py-8 text-center text-sm text-slate-400">Yükleniyor…</p></div>;
  }
  if (error && plans.length === 0) {
    return <div className={`${kupaCard}`}><p className="py-8 text-center text-sm text-rose-600">{error}</p></div>;
  }

  // Boş durum — premium ilk-kez.
  if (plans.length === 0) {
    return (
      <div className={`${kupaCard} flex flex-col items-center gap-4 py-10 text-center`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-3xl" aria-hidden>🗓️</span>
        <div>
          <h2 className="text-lg font-black text-slate-900">İlk Hacamat Takviminizi Oluşturun</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Yılı seçin, ardından uygulama günlerinizi takvim üzerinden kendiniz işaretleyin.
          </p>
        </div>
        <FirstPlanButton onCreated={(id) => refreshPlansList(id)} />
      </div>
    );
  }

  return (
    // Mobilde alt sabit kaydet barı içeriği örtmesin diye alt boşluk (lg'de gerek yok).
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      {/* Header açıklama — takvim UZMAN-SAHİPLİDİR (hazır gün YOK) */}
      <div className={`${kupaCard}`}>
        <p className="text-sm leading-relaxed text-slate-600">
          Bu takvim sizin çalışma planınızdır. Uygulama günlerinizi kendi yaklaşımınıza göre siz
          belirlersiniz.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Yaşam Sistemi takvime hazır uygulama günü eklemez. Bir güne dokunduğunuzda açılan panelden
          kendi renginizi seçersiniz (her yeni gün için renk zorunludur); kısa açıklama opsiyoneldir.
        </p>
      </div>

      {/* Plan kontrolü */}
      <div className={`${kupaCard}`}>
        <PlanPicker
          plans={plans}
          activePlanId={activeId}
          currentDayCount={savedDays.size}
          onSelect={handleSelectPlan}
          onPlansChanged={refreshPlansList}
          onDelete={handleDeletePlan}
        />
      </div>

      {planLoading ? (
        <div className={`${kupaCard}`}><p className="py-6 text-center text-sm text-slate-400">Takvim yükleniyor…</p></div>
      ) : plan ? (
        <>
          {/* Görünüm anahtarı + kaydet durumu (AYNI plan/taslak; iki görünüm) */}
          <div className={`${kupaCard} flex flex-col gap-4`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CalendarViewToggle view={view} onChange={setView} />
            </div>
            {/* Kaydet/durum barı — MOBİL/TABLET: ekran altına SABİT (uzun kart listesinde her zaman
                erişilir; güvenli-alan payı). MASAÜSTÜ (lg): mevcut sticky davranış korunur. */}
            <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(120,80,40,0.10)] backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:sticky lg:inset-x-auto lg:bottom-2 lg:z-10 lg:rounded-xl lg:border lg:pb-3 lg:shadow-sm">
              <span className="flex flex-col gap-0.5 text-sm" aria-live="polite">
                {dirty ? (
                  <>
                    <span className="font-medium text-amber-700">Kaydedilmemiş değişiklikler var</span>
                    <span className="text-xs text-amber-500">
                      {[
                        additions.length > 0 ? `${additions.length} kaydedilecek` : "",
                        styleChanges.length > 0 ? `${styleChanges.length} güncellenecek` : "",
                        removals.length > 0 ? `${removals.length} kaldırılacak` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-slate-500">Tüm değişiklikler kaydedildi</span>
                )}
              </span>
              <button
                type="button"
                className={`${kupaBtnSuccess} min-h-[44px]`}
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
              </button>
            </div>
          </div>

          {view === "monthly" ? (
            <>
              {/* Aylık Düzenleme — TEK ay görünür (kalıcı 12-buton duvarı YOK) */}
              <div className={`${kupaCard} flex flex-col gap-4`}>
                <MonthNav year={plan.year} month={month} onChange={setMonth} />
                <MonthCalendar
                  year={plan.year}
                  month={month}
                  selected={draft}
                  saved={savedSet}
                  today={today}
                  styleOf={styleOf}
                  onEditDay={setEditYmd}
                />
                {/* Sade legend — yalnız uzman-seçim durumları (pastel; çalışma alanını ezmez). */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-indigo-300 bg-indigo-50" aria-hidden />
                    Seçili
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-dashed border-indigo-400 bg-indigo-50/70" aria-hidden />
                    Kaydedilecek
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-indigo-200 bg-indigo-50/40 opacity-70" aria-hidden />
                    Kaldırılacak
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>✎</span>
                    Eklemek/düzenlemek için güne dokunun (renk seçimi zorunlu)
                  </span>
                </div>
              </div>

              {/* Toplu gün seçimi (uzmanın KENDİ ölçütü; hazır/önerilen değer YOK) */}
              <BulkDateSelector year={plan.year} onAddDates={addBulk} />

              {/* Çıktı bilgilendirme notları */}
              <div className={`${kupaCard}`}>
                <OutputAdviceSection
                  plan={plan}
                  templates={templates}
                  onTemplatesChanged={refreshTemplates}
                  onAttach={handleAttachTemplate}
                />
              </div>

              {/* Danışana özel (opsiyonel, katlanır, lazy) */}
              <ClientAdviceSection templates={templates} />
            </>
          ) : (
            /* Yıllık Özet — AYNI plan/taslak; 12 minik ay; ay tıklaması Aylık'ı açar */
            <div className={`${kupaCard}`}>
              <AnnualCalendarOverview
                year={plan.year}
                title={plan.name}
                description={plan.description}
                selected={draft}
                saved={savedSet}
                today={today}
                styleOf={styleOf}
                onMonthClick={(m) => {
                  setMonth(m);
                  setView("monthly");
                }}
              />
            </div>
          )}
        </>
      ) : null}

      {/* Gün düzenleme paneli (renk + kısa açıklama + detay notu) — seçili gün için */}
      {editContext ? (
        <DayEditPanel
          key={editYmd}
          gregText={editContext.gregText}
          hijriText={editContext.hijriText}
          initial={editContext.initial}
          isSelected={editYmd ? draft.has(editYmd) : false}
          onApply={(style) => editYmd && applyDayStyle(editYmd, style)}
          onDeselect={() => editYmd && deselectDay(editYmd)}
          onClose={() => setEditYmd(null)}
        />
      ) : null}

      {/* Sakin açıklayıcı dipnot — kişisel çalışma planı; randevu sistemi değildir. */}
      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Not: Bu takvim kişisel çalışma planınızdır; randevu sistemi değildir. Uygulama günlerini
        kendi yaklaşımınıza göre siz belirlersiniz; Yaşam Sistemi takvime hazır gün eklemez. Renklerin
        anlamını siz belirlersiniz.
      </p>
    </div>
  );
}

function FirstPlanButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const y = new Date().getFullYear();
      const { createCalendarPlan } = await import("@/app/kupa/lib/api");
      const res = await createCalendarPlan({ name: `${y} Hacamat Takvimi`, year: y });
      if (!res.plan) {
        // Demo hesabı (persist=0).
        showToast({ message: "Takvim oluşturuldu.", type: "success" });
        return;
      }
      // OTORİTER durumu getir (yeni plan SIFIR seçili günle açılır; hazır gün YOK).
      onCreated(res.plan.id);
      showToast({ message: "Takvim oluşturuldu.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Oluşturulamadı.", type: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={`${kupaBtnPrimary} min-h-[44px]`} onClick={create} disabled={busy}>
      {busy ? "Oluşturuluyor…" : "Takvim Oluştur"}
    </button>
  );
}

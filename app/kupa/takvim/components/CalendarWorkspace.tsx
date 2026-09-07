"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnSuccess, kupaCard } from "@/app/kupa/components/KupaShell";
import { CUPPING_PLAN_DAYS_MAX_BATCH } from "@/lib/cupping/calendarTypes";
import { toYmd } from "@/lib/cupping/hijri";
import {
  listCalendarPlans,
  getCalendarPlan,
  addCalendarPlanDays,
  deleteCalendarDay,
  deleteCalendarPlan,
  updateCalendarPlan,
  listAdviceTemplates,
  type CuppingAdviceTemplate,
  type CuppingCalendarPlan,
} from "@/app/kupa/lib/api";
import { MonthCalendar } from "./MonthCalendar";
import { MonthNav } from "./MonthNav";
import { PlanPicker } from "./PlanPicker";
import { BulkDateSelector } from "./BulkDateSelector";
import { OutputAdviceSection } from "./OutputAdviceSection";
import { ClientAdviceSection } from "./ClientAdviceSection";

/** İstemci-yerel bugün "YYYY-MM-DD" (nötr; yalnız "bugün" halkası için). */
function todayYmd(): string {
  const d = new Date();
  return toYmd({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
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

export function CalendarWorkspace() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [plans, setPlans] = useState<CuppingCalendarPlan[]>([]);
  const [templates, setTemplates] = useState<CuppingAdviceTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [plan, setPlan] = useState<CuppingCalendarPlan | null>(null);
  const [savedDays, setSavedDays] = useState<Map<string, string>>(new Map()); // ymd -> dayId
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(1);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = useMemo(() => todayYmd(), []);

  const savedSet = useMemo(() => new Set(savedDays.keys()), [savedDays]);
  const additions = useMemo(() => [...draft].filter((d) => !savedDays.has(d)), [draft, savedDays]);
  const removals = useMemo(() => [...savedDays.keys()].filter((d) => !draft.has(d)), [savedDays, draft]);
  const dirty = additions.length > 0 || removals.length > 0;

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
      const map = new Map<string, string>();
      for (const d of days) map.set(d.gregorian_date, d.id);
      setSavedDays(map);
      setDraft(new Set(map.keys()));
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

  const toggleDay = useCallback((ymd: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }, []);

  const addBulk = useCallback((dates: string[]) => {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const d of dates) next.add(d);
      return next;
    });
    showToast({ message: `${dates.length} gün taslak seçime eklendi. Kaydetmeyi unutmayın.`, type: "info" });
  }, [showToast]);

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
      // 1) Eklemeler — toplu POST (max batch parçalanır; sunucu çakışmayı idempotent atlar).
      for (let i = 0; i < additions.length; i += CUPPING_PLAN_DAYS_MAX_BATCH) {
        const chunk = additions.slice(i, i + CUPPING_PLAN_DAYS_MAX_BATCH);
        if (chunk.length > 0) await addCalendarPlanDays(plan.id, { dates: chunk });
      }
      // 2) Silmeler — mevcut gün-id ile, SINIRLI eşzamanlılık.
      const removeIds = removals.map((d) => savedDays.get(d)!).filter(Boolean);
      const { failCount } = await runPool(removeIds, 4, (id) => deleteCalendarDay(id));
      // 3) Otoriter durumu yeniden yükle (başarı da olsa kısmi de olsa TEK doğruluk kaynağı server).
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
    <div className="flex flex-col gap-4">
      {/* Header açıklama + Kozmik referans (yalnız NAVİGASYON; veri aktarımı YOK) */}
      <div className={`${kupaCard}`}>
        <p className="text-sm leading-relaxed text-slate-600">
          Bu takvim sizin çalışma planınızdır. Uygulama günlerinizi kendi yaklaşımınıza göre siz belirlersiniz.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Yaşam Sistemi belirli günleri otomatik olarak doğru veya uygun gün olarak işaretlemez.
        </p>
        <Link href="/cosmic-calendar/hacamat" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 no-underline hover:text-amber-800">
          Kozmik Yaşam Hacamat Takvimine Bak
          <span aria-hidden>→</span>
        </Link>
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
          {/* Takvim + kaydet */}
          <div className={`${kupaCard} flex flex-col gap-4`}>
            <MonthNav year={plan.year} month={month} onChange={setMonth} />
            <MonthCalendar
              year={plan.year}
              month={month}
              selected={draft}
              savedSet={savedSet}
              today={today}
              onToggle={toggleDay}
            />
            {/* Kaydet aksiyon barı (mobilde sticky) */}
            <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-slate-600" aria-live="polite">
                {draft.size} gün seçili
                {dirty ? (
                  <span className="ml-2 text-xs font-medium text-amber-700">
                    ({additions.length} eklenecek, {removals.length} kaldırılacak)
                  </span>
                ) : null}
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

          {/* Toplu gün seçimi */}
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
      ) : null}

      {/* Sakin açıklayıcı dipnot */}
      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Not: Bu takvim kişisel çalışma planınızdır; randevu sistemi değildir ve hiçbir günü tıbbi/geleneksel olarak
        &quot;doğru gün&quot; şeklinde önermez.
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
      const plan = await createCalendarPlan({ name: `${y} Hacamat Takvimi`, year: y });
      onCreated(plan.id);
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useCalendarNames } from "../lib/useCalendarNames";
import { useSystemNames } from "../lib/useSystemNames";
import { defaultPlanNameForSave } from "../lib/systemNames";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import { buildNameListLines } from "@/lib/ui/deleteConfirmMessage";
import { kupaBtnPrimary, kupaBtnSuccess, kupaBtnGhost, kupaCard } from "@/app/kupa/components/KupaShell";
import { CUPPING_PLAN_DAYS_MAX_BATCH, type CuppingDayColorKey } from "@/lib/cupping/calendarTypes";
import { gregorianToHijri, toYmd } from "@/lib/cupping/hijri";
import {
  listCalendarPlans,
  getCalendarPlan,
  createCalendarPlan,
  addCalendarPlanDays,
  updateCalendarDay,
  deleteCalendarDay,
  deleteCalendarPlan,
  updateCalendarPlan,
  downloadCalendarPlanWord,
  listAdviceTemplates,
  type CuppingAdviceTemplate,
  type CuppingCalendarPlan,
  type CuppingCalendarPlanDay,
  type CuppingPlanDayInput,
} from "@/app/kupa/lib/api";
import { useUnsavedChangesGuard } from "@/app/kupa/lib/useUnsavedChangesGuard";
import { MonthCalendar, type CuppingDayStyleView } from "./MonthCalendar";
import { MonthNav } from "./MonthNav";
import { PlanPicker } from "./PlanPicker";
import { BulkDateSelector } from "./BulkDateSelector";
import { OutputAdviceSection } from "./OutputAdviceSection";
import { ClientAdviceSection } from "./ClientAdviceSection";
import { CalendarViewToggle, type CalendarView } from "./CalendarViewToggle";
import { AnnualCalendarOverview } from "./AnnualCalendarOverview";
import { DayEditPanel, type DayStyleDraft } from "./DayEditPanel";
import { DayInfoPanel } from "./DayInfoPanel";
import { NewCalendarDialog } from "./NewCalendarDialog";
import { pickPlanForYear } from "@/lib/cupping/calendarPlanResolve";
import { anyDirty, templateSelectionDirty } from "@/app/kupa/lib/formDirty";

/** useSyncExternalStore için değişmeyen abonelik (yalnız istemci/SSR ayrımı). */
const subscribeNoop = () => () => {};

/** İstemci-yerel bugün "YYYY-MM-DD" (nötr; yalnız "bugün" halkası için). */
function todayYmd(): string {
  const d = new Date();
  return toYmd({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
}

/** Kayıtlı gün satırının otoriter stili (server → client). */
type SavedDay = { id: string; colorKey: CuppingDayColorKey | null; label: string | null; note: string | null };

/** Boş taslak stili (renk yok, açıklama yok). */
const EMPTY_STYLE: DayStyleDraft = { colorKey: null, label: "", note: "" };

/**
 * Kart stili — MOBİL/TABLET (<lg): fullBleed shell ile birlikte TAM GENİŞLİK bant (yan kenarlık +
 *   köşe yuvarlama YOK → ekranın yatay alanını gerçekten kullanır; iç p-4 okuma payı korunur).
 *   MASAÜSTÜ (lg): kupaCard varsayılanları (rounded-2xl + tam kenarlık + p-4) AYNEN geçerli —
 *   `max-lg:` yalnız <lg'de uygulanır, desktop DEĞİŞMEZ. overflow-x-hidden HACK'i YOK.
 */
const edgeCard = kupaCard + " max-lg:rounded-none max-lg:border-x-0";

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

/** Sınırlı eşzamanlılık havuzu (yüzlerce eşzamanlı istek atmaz). Başarısız öğeleri döndürür. */
async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<{ failed: T[]; lastError: unknown }> {
  const failed: T[] = [];
  let lastError: unknown = null;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
      } catch (e) {
        failed.push(items[i]);
        lastError = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return { failed, lastError };
}

/** Sunucu gün satırları → kayıtlı harita + taslak stil haritası (tek dönüşüm noktası). */
function deriveServerState(days: CuppingCalendarPlanDay[]): { saved: Map<string, SavedDay>; styles: Map<string, DayStyleDraft> } {
  const saved = new Map<string, SavedDay>();
  const styles = new Map<string, DayStyleDraft>();
  for (const d of days) {
    saved.set(d.gregorian_date, { id: d.id, colorKey: d.color_key, label: d.user_label, note: d.note });
    styles.set(d.gregorian_date, { colorKey: d.color_key, label: d.user_label ?? "", note: d.note ?? "" });
  }
  return { saved, styles };
}

/** Kaydedilemeyen taslak öğeleri (kayıt sonrası sunucu durumunun ÜSTÜNE geri yazılır). */
type PendingFailures = {
  adds: Set<string>;
  styles: Set<string>;
  removals: Set<string>;
  styleSnap: Map<string, DayStyleDraft>;
  /** Bağlı şablon değişikliği kaydedilemediyse taslaktaki seçim (sunucu durumunun üstüne geri yazılır). */
  template?: { id: string | null };
};

/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 + 5 — UZMAN-SAHİPLİ takvim çalışma alanı.
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Takvim tamamen uzmanındır. Sistem HAZIR gün üretmez. Yeni plan
 *   SIFIR seçili günle başlar; uzman her günü kendisi işaretler. Seçili bir güne kontrollü
 *   paletten renk + kendi kısa açıklaması eklenebilir (opsiyonel; anlam platformca sabitlenmez).
 *   Aylık + Yıllık AYNI planı/taslağı gösterir (renk/açıklama dâhil). Renk/açıklama nihai kaydı
 *   ana "Değişiklikleri Kaydet" ile olur (tek kalıcılık yolu; kaydedilmemiş uyarısı stili de kapsar).
 *
 * WT6 — GÖRÜNTÜLEME ve DÜZENLEME AYRI:
 *   - Varsayılan GÖRÜNTÜLEME modu: Aylık + Yıllık takvim KAYDEDİLMİŞ takvimin salt-okunur yüzeyidir;
 *     güne dokunmak yalnız gün bilgisini (DayInfoPanel) açar — taslak değişmez, yazma isteği gitmez.
 *     Toplu seçim ve kaydet barı gösterilmez.
 *   - DÜZENLEME modu yalnız açık iki yoldan açılır: "Bu Ayı Düzenle" veya "+ Yeni Takvim → yıl/ay".
 *     Yeni Takvim, yıl için zaten takvim varsa YENİSİNİ ÜRETMEZ (duplicate yok): mevcut takvim o ayda,
 *     işaretli günleri/renkleri/notlarıyla açılır. "Düzenlemeyi Bitir" kaydedilmemiş değişiklik varsa sorar.
 *
 * FINAL-A1 — BAĞLI BİLGİLENDİRME ŞABLONU da gün taslağıyla AYNI kalıcılık yolundadır: seçim yalnız
 *   taslağı (templateDraft) değiştirir, DB'ye yalnız "Değişiklikleri Kaydet" ile yazılır. Görüntüleme
 *   modunda seçim KİLİTLİDİR (yazma isteği gitmez); Düzenlemeyi Bitir / Vazgeç → taslak kayıtlıya döner.
 *   Açık şablon / danışan-notu formları da sayfa geneli kaydedilmemiş-değişiklik korumasına katılır.
 */
export function CalendarWorkspace() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("cupping.calendar.ws");
  const tc = useTranslations("cupping.common");
  const sysNames = useSystemNames();
  const errText = useKupaErrorText();
  const names = useCalendarNames();

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
  // Bağlı bilgilendirme şablonu TASLAĞI (null = şablon yok). Kalıcı değer: plan.advice_template_id.
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  // Alt bölümlerdeki açık şablon / danışan-notu formlarının kirli durumu (yalnız çıkış koruması).
  const [adviceFormDirty, setAdviceFormDirty] = useState(false);
  const [clientFormDirty, setClientFormDirty] = useState(false);
  const [month, setMonth] = useState(1);
  const [view, setView] = useState<CalendarView>("monthly");
  const [editYmd, setEditYmd] = useState<string | null>(null);
  // WT6: görüntüleme (false) ↔ düzenleme (true) modu; gün bilgisi paneli; Yeni Takvim penceresi.
  const [editing, setEditing] = useState(false);
  const [infoYmd, setInfoYmd] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const today = useMemo(() => todayYmd(), []);
  // Yarış korumaları: en son plan yüklemesi kazanır (eski yanıt yeni planın üstüne yazılmaz);
  //   kayıt sürerken ikinci kayıt/taslak düzenlemesi başlatılmaz (çift tık + yarım durum yok).
  const loadSeqRef = useRef(0);
  // En son İSTENEN plan (yükleme sürerken de). Seçim kısa devresi buna göre yapılır; aksi halde
  //   yavaş bir yükleme sürerken önceki plana geri dönmek yeni yüklemeyi atlar ve eski yanıt kazanırdı.
  const requestedIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const planRef = useRef<CuppingCalendarPlan | null>(null);
  // Mobil sabit kaydet barı document.body'ye PORTAL edilir (kart backdrop-filter'ı fixed'i hapsetmez).
  //   SSR'da false, istemcide true (hydration-güvenli; effect içinde setState yok).
  const portalReady = useSyncExternalStore(subscribeNoop, () => true, () => false);

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
  const templateChanged = !!plan && templateSelectionDirty(templateDraft, plan.advice_template_id);
  const dirty = additions.length > 0 || removals.length > 0 || styleChanges.length > 0 || templateChanged;
  // Sayfa geneli çıkış koruması: takvim taslağı + açık (kaydedilmemiş) şablon/danışan formları.
  const pageDirty = anyDirty(dirty, adviceFormDirty, clientFormDirty);

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

  /**
   * Sunucu durumunu taslağa uygular (TEK uygulama noktası).
   *   keepMonth: aynı planın yeniden yüklenmesinde (kayıt sonrası) kullanıcının bulunduğu ay KORUNUR.
   *   failures: kaydedilemeyen taslak öğeleri sunucu durumunun üstüne geri yazılır (sessiz kayıp YOK).
   */
  const applyServerState = useCallback(
    (p: CuppingCalendarPlan, days: CuppingCalendarPlanDay[], opts: { keepMonth: boolean; failures?: PendingFailures }) => {
      const { saved, styles } = deriveServerState(days);
      const nextDraft = new Set(saved.keys());
      const f = opts.failures;
      if (f) {
        for (const d of f.adds) {
          nextDraft.add(d);
          const st = f.styleSnap.get(d);
          if (st) styles.set(d, st);
        }
        for (const d of f.styles) {
          const st = f.styleSnap.get(d);
          if (st) styles.set(d, st);
        }
        for (const d of f.removals) {
          nextDraft.delete(d);
          styles.delete(d);
        }
      }
      setPlan(p);
      planRef.current = p;
      setActiveId(p.id);
      activeIdRef.current = p.id;
      setSavedDays(saved);
      setDraft(nextDraft);
      setDraftStyle(styles);
      setTemplateDraft(f?.template ? f.template.id : (p.advice_template_id ?? null));
      setEditYmd(null);
      if (!opts.keepMonth) {
        // Plan yılı bu yıla eşitse mevcut ayı aç; değilse Ocak.
        const nowY = new Date().getFullYear();
        setMonth(p.year === nowY ? new Date().getMonth() + 1 : 1);
      }
    },
    [],
  );

  /**
   * Planı yükler. silent=true → "Takvim yükleniyor…" ile alt bölümler (şablon/danışan formları,
   * toplu seçim) SÖKÜLMEZ (kayıt sonrası yarım form kaybı yok). Eski yanıtlar yok sayılır.
   * Başarısızlıkta mevcut taslak/aktif plan DEĞİŞMEZ ve hata fırlatılır (çağıran bildirir).
   */
  const loadPlanInto = useCallback(
    async (id: string, opts?: { silent?: boolean; keepMonth?: boolean; failures?: PendingFailures }): Promise<boolean> => {
      const seq = ++loadSeqRef.current;
      requestedIdRef.current = id;
      if (!opts?.silent) setPlanLoading(true);
      setError(null);
      try {
        const { plan: p, days } = await getCalendarPlan(id);
        if (seq !== loadSeqRef.current) return false;
        applyServerState(p, days, { keepMonth: !!opts?.keepMonth, failures: opts?.failures });
        return true;
      } finally {
        if (seq === loadSeqRef.current) setPlanLoading(false);
      }
    },
    [applyServerState],
  );

  /** Aktif planı ve tüm taslak durumunu boşaltır (plan kalmadığında güvenli boş durum). */
  const clearActivePlan = useCallback(() => {
    loadSeqRef.current++;
    requestedIdRef.current = null;
    setActiveId(null);
    activeIdRef.current = null;
    setPlan(null);
    planRef.current = null;
    setSavedDays(new Map());
    setDraft(new Set());
    setDraftStyle(new Map());
    setTemplateDraft(null);
    setEditYmd(null);
  }, []);

  /** Plan listesini tazeler; selectId verilirse o plan otoriter durumuyla açılır. */
  const refreshPlansList = useCallback(
    async (selectId?: string) => {
      const list = await listCalendarPlans();
      setPlans(list);
      if (selectId) await loadPlanInto(selectId);
    },
    [loadPlanInto],
  );

  // İlk yükleme.
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list] = await Promise.all([listCalendarPlans(), refreshTemplates()]);
        setPlans(list);
        if (list.length > 0) await loadPlanInto(list[0].id);
      } catch (e) {
        setError(errText(e, t("loadError")));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Toplu ekleme — RENK ZORUNLU; seçilen renk YALNIZ bu işlemle YENİ eklenen günlere uygulanır.
  //   Zaten seçili/kayıtlı günlerin stili SESSİZCE EZİLMEZ (yalnız draft'ta olmayanlara atanır).
  const addBulk = useCallback((dates: string[], colorKey: CuppingDayColorKey) => {
    if (savingRef.current) return;
    const newlyAdded = dates.filter((d) => !draft.has(d));
    if (newlyAdded.length === 0) {
      showToast({ message: t("bulkNone"), type: "info" });
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
    showToast({ message: t("bulkAdded", { count: String(newlyAdded.length) }), type: "info" });
  }, [draft, showToast, t]);

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

  const confirmDiscard = useCallback(
    () =>
      confirm({
        title: t("discardTitle"),
        message: t("discardMessage"),
        confirmText: t("discardConfirm"),
        cancelText: tc("cancel"),
        tone: "danger",
      }),
    [confirm, t, tc],
  );

  // Plan değişimi/silme/yeni takvim alt formları da söker → açık formlar dâhil (pageDirty).
  async function confirmDiscardIfDirty(): Promise<boolean> {
    if (savingRef.current) return false;
    if (!pageDirty) return true;
    return confirmDiscard();
  }

  // Uygulama içi gezinme (breadcrumb/menü linki) + geri tuşu + yenileme koruması.
  useUnsavedChangesGuard(pageDirty, confirmDiscard);

  // Gün düzenleme paneli kayıt sürerken açılmaz (kayıt anındaki taslak sabit kalır).
  const openDayEditor = useCallback((ymd: string) => {
    if (savingRef.current) return;
    setEditYmd(ymd);
  }, []);

  // WT6: görüntüleme modunda güne dokunma → yalnız BİLGİ (yazma yok, taslak değişmez).
  const openDayInfo = useCallback((ymd: string) => {
    setInfoYmd(ymd);
  }, []);

  /** Taslağı kayıtlı duruma geri döndürür (düzenlemeden kaydetmeden çıkış). */
  const revertDraftToSaved = useCallback(() => {
    setDraft(new Set(savedDays.keys()));
    setDraftStyle(() => {
      const m = new Map<string, DayStyleDraft>();
      for (const [ymd, d] of savedDays) m.set(ymd, { colorKey: d.colorKey, label: d.label ?? "", note: d.note ?? "" });
      return m;
    });
    setTemplateDraft(planRef.current?.advice_template_id ?? null);
    setEditYmd(null);
  }, [savedDays]);

  /** "Bu Ayı Düzenle" — görüntülenen ayı düzenleme modunda açar (aylık görünüm). */
  function startEditingCurrentMonth() {
    if (!plan || savingRef.current) return;
    setInfoYmd(null);
    setView("monthly");
    setEditing(true);
  }

  /** "Düzenlemeyi Bitir" — kaydedilmemiş değişiklik varsa açık onay; onayda taslak kayıtlıya döner. */
  async function finishEditing() {
    if (savingRef.current) return;
    if (dirty) {
      if (!(await confirmDiscard())) return;
      revertDraftToSaved();
    }
    setEditYmd(null);
    setEditing(false);
  }

  /**
   * "+ Yeni Takvim → yıl/ay": yıl için takvim VARSA onu açar (duplicate ÜRETMEZ, kayıtlı günler
   * gelir); YOKSA yıl için tek takvim oluşturur (sunucu reuse_year ile ikinci kez korur). Ardından
   * seçilen ay DÜZENLEME modunda açılır.
   */
  async function openMonthForEditing(year: number, month: number) {
    if (openingRef.current || savingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const existing = pickPlanForYear(plans, year, activeIdRef.current);
      // Aynı açık takvim → alt formlar sökülmez; yalnız takvim taslağı (gün/şablon) atılacağı için o sorulur.
      const sameOpen = !!existing && existing.id === activeIdRef.current;
      if (sameOpen ? dirty && !(await confirmDiscard()) : !(await confirmDiscardIfDirty())) return;
      if (existing) {
        if (existing.id !== activeIdRef.current) {
          await loadPlanInto(existing.id);
        } else if (dirty) {
          revertDraftToSaved();
        }
      } else {
        // I18N-F1-R3: varsayılan plan ADI DB'ye HER ZAMAN Türkçe sabit yazılır (i18n öncesiyle birebir; Word çıktısına
        // basılır). Gösterimde sistem adı ekran dilinde üretilir (useSystemNames) — kullanıcının yazdığı ad aynen kalır.
        // I18N A8: use_default_name → sunucu aynı kanonik adı yazar ve kolon varsa name_is_default=true işaretler.
        const res = await createCalendarPlan({ name: defaultPlanNameForSave(year), use_default_name: true, year, reuse_year: true });
        if (!res.plan) {
          // Demo hesabı (persist=0): sahte takvim/gün gösterilmez.
          showToast({ message: t("demoNoSave"), type: "info" });
          setNewOpen(false);
          return;
        }
        await refreshPlansList(res.plan.id);
        showToast({ message: res.reused ? t("opened", { year: String(year) }) : t("created", { year: String(year) }), type: "success" });
      }
      setMonth(month);
      setView("monthly");
      setInfoYmd(null);
      setEditing(true);
      setNewOpen(false);
    } catch (e) {
      showToast({ message: errText(e, t("openFailed")), type: "error" });
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }

  async function handleSelectPlan(id: string) {
    if (id === (requestedIdRef.current ?? activeId)) return;
    if (!(await confirmDiscardIfDirty())) return;
    try {
      await loadPlanInto(id);
      setEditing(false);
    } catch (e) {
      showToast({ message: errText(e, t("planLoadFailed")), type: "error" });
    }
  }

  /** Plan ad/açıklama/yıl güncellendi → YERİNDE güncelle; gün taslağı ASLA sıfırlanmaz. */
  function handlePlanUpdated(updated: CuppingCalendarPlan) {
    setPlans((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    if (planRef.current?.id === updated.id) {
      setPlan(updated);
      planRef.current = updated;
    }
  }

  async function handleSave() {
    const current = planRef.current;
    if (!current || !dirty || savingRef.current) return;
    // Kaydetme 3+ KAYITLI günü silecekse → sistem geneli 3 aşamalı toplu silme onayı.
    // İptal → hiçbir şey kaydedilmez, taslak olduğu gibi kalır.
    const savedRemovals = removals.filter((d) => !!savedDays.get(d)?.id);
    if (requiresBulkDeleteGuard(savedRemovals.length)) {
      savingRef.current = true;
      let confirmed = false;
      try {
        confirmed = await runBulkDeleteConfirm(confirm, {
          count: savedRemovals.length,
          noun: t("bulkDeleteNoun"),
          detail: [
            t("bulkDeleteDetail"),
            buildNameListLines(savedRemovals, savedRemovals.length).join("\n"),
          ].join("\n"),
        });
      } finally {
        savingRef.current = false;
      }
      if (!confirmed) return;
    }
    savingRef.current = true;
    setSaving(true);
    setEditYmd(null);
    const planId = current.id;
    // Kayıt anındaki taslağın anlık görüntüsü (başarısız öğeler buradan geri yazılır).
    const styleSnap = new Map(draftStyle);
    const failures: PendingFailures = { adds: new Set(), styles: new Set(), removals: new Set(), styleSnap };
    let lastError: unknown = null;
    try {
      // 1) Eklemeler — PER-DAY stil (renk + kısa açıklama + detay notu) TEK istekte kalıcı olur.
      //    Toplu POST max batch'e göre parçalanır; sunucu çakışmayı idempotent atlar.
      const dayInputs: CuppingPlanDayInput[] = additions.map((d) => ({
        date: d,
        ...toWritePayload(styleSnap.get(d) ?? EMPTY_STYLE),
      }));
      for (let i = 0; i < dayInputs.length; i += CUPPING_PLAN_DAYS_MAX_BATCH) {
        const chunk = dayInputs.slice(i, i + CUPPING_PLAN_DAYS_MAX_BATCH);
        if (chunk.length === 0) continue;
        try {
          await addCalendarPlanDays(planId, { days: chunk });
        } catch (e) {
          lastError = e;
          for (const c of chunk) failures.adds.add(c.date);
        }
      }
      // 2) Stil değişiklikleri — kayıtlı+seçili günlerde renk/açıklama PATCH (SINIRLI eşzamanlılık).
      const styleTargets = styleChanges
        .map((d) => ({ ymd: d, id: savedDays.get(d)?.id, style: styleSnap.get(d) ?? EMPTY_STYLE }))
        .filter((t): t is { ymd: string; id: string; style: DayStyleDraft } => !!t.id);
      const styleRes = await runPool(styleTargets, 4, (t) => updateCalendarDay(t.id, toWritePayload(t.style)));
      for (const t of styleRes.failed) failures.styles.add(t.ymd);
      if (styleRes.failed.length) lastError = styleRes.lastError;
      // 3) Silmeler — mevcut gün-id ile (bir günü takvimden çıkarmak o satırı siler).
      const removeTargets = removals
        .map((d) => ({ ymd: d, id: savedDays.get(d)?.id }))
        .filter((t): t is { ymd: string; id: string } => !!t.id);
      const delRes = await runPool(removeTargets, 4, (t) => deleteCalendarDay(t.id));
      for (const t of delRes.failed) failures.removals.add(t.ymd);
      if (delRes.failed.length) lastError = delRes.lastError;
      // 4) Bağlı bilgilendirme şablonu — YALNIZ değiştiyse ve YALNIZ bu açık kayıtla yazılır.
      if (templateChanged) {
        const nextTemplate = templateDraft || null;
        try {
          await updateCalendarPlan(planId, { advice_template_id: nextTemplate });
        } catch (e) {
          lastError = e;
          failures.template = { id: nextTemplate };
        }
      }

      const failCount = failures.adds.size + failures.styles.size + failures.removals.size + (failures.template ? 1 : 0);
      // 5) Otoriter durumu SESSİZCE yeniden yükle (ay + alt formlar korunur); kaydedilemeyen
      //    öğeler taslakta KALIR. Yeniden yükleme başarısızsa taslağa HİÇ dokunulmaz (tekrar
      //    kaydetmek idempotenttir: eklemeler çakışmada atlanır, silinmiş gün tekrar silinmez).
      let reloaded = false;
      try {
        reloaded = await loadPlanInto(planId, { silent: true, keepMonth: true, failures });
      } catch {
        reloaded = false;
      }
      if (failCount === 0 && reloaded) {
        showToast({ message: t("saved"), type: "success" });
      } else if (failCount === 0) {
        showToast({
          message: t("savedUnverified"),
          type: "warning",
        });
      } else {
        const reason = errText(lastError, t("saveFailedShort"));
        showToast({
          message: t("saveFailedCount", { count: String(failCount), reason }),
          type: "error",
        });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // FAZ 6 — AKTİF planın Word (.docx) raporunu indir. scope: undefined → YILLIK (12 ay); 1–12 → yalnız o AY.
  //   Yalnız açık plan; kaydedilmemiş taslakla ÜRETME (sahte/eski rapor olmaz) → önce kaydetmesini iste.
  async function handleWordDownload(scopeMonth?: number) {
    if (!plan || wordBusy) return;
    if (dirty) {
      showToast({ message: t("saveFirst"), type: "warning" });
      return;
    }
    setWordBusy(true);
    try {
      const { blob, filename } = await downloadCalendarPlanWord(plan.id, scopeMonth);
      // İndirmeyi tarayıcıya İLET: blob URL + geçici gizli bağlantı. URL hemen iptal EDİLMEZ
      //   (bazı tarayıcılarda indirmeyi bozar); geçici DOM bağlantısı hata halinde de temizlenir,
      //   URL makul gecikmeyle serbest bırakılır (kalıcı Blob URL birikimi olmaz).
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        a.remove();
        // ~1 dk sonra serbest bırak (indirme başlatıldıktan sonra; erken revoke indirmeyi kesebilir).
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      // Tarayıcının dosyayı diske yazdığını DOĞRULAYAMAYIZ → yalnız "başlatıldı" denir (kesin başarı iddiası yok).
      showToast({ message: t("wordStarted"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, t("wordFailed")), type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  async function handleDeletePlan(p: CuppingCalendarPlan) {
    if (!(await confirmDiscardIfDirty())) return;
    const ok = await confirm({
      title: t("deleteTitle"),
      message: t("deleteMessage", { name: sysNames.planName(p) }),
      confirmText: t("deleteTitle"),
      cancelText: tc("cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteCalendarPlan(p.id);
    } catch (e) {
      showToast({ message: errText(e, t("deleteFailed")), type: "error" });
      return;
    }
    // Silme kesinleşti. Liste tazelenemezse yerelden düş (silinen plan ekranda kalmaz).
    let list: CuppingCalendarPlan[];
    try {
      list = await listCalendarPlans();
    } catch {
      list = plans.filter((x) => x.id !== p.id);
    }
    setPlans(list);
    if (activeIdRef.current === p.id || !activeIdRef.current) {
      // Silinen aktif plandı → DETERMİNİSTİK geçiş: kalan ilk plan; plan kalmadıysa boş durum.
      clearActivePlan();
      const next = list[0];
      if (next) {
        try {
          await loadPlanInto(next.id);
        } catch (e) {
          showToast({ message: errText(e, t("planLoadFailed")), type: "error" });
        }
      }
    }
    showToast({ message: t("deleted"), type: "success" });
  }

  // Şablon seçimi YALNIZ taslağı değiştirir (YAZMA YOK); görüntüleme modunda / kayıt sürerken yok sayılır.
  const selectTemplateDraft = useCallback(
    (templateId: string | null) => {
      if (!editing || savingRef.current) return;
      setTemplateDraft(templateId || null);
    },
    [editing],
  );

  // Şablon silindi: sunucu bağlı planlarda advice_template_id'yi NULL'lar (FK ON DELETE SET NULL) →
  //   yerel plan aynalanır (ek yazma YOK); taslak silinen şablonu gösteriyorsa kayıtlı değere döner.
  const handleTemplateDeleted = useCallback((templateId: string) => {
    const cur = planRef.current;
    let savedNow = cur?.advice_template_id ?? null;
    if (cur && cur.advice_template_id === templateId) {
      const next = { ...cur, advice_template_id: null };
      planRef.current = next;
      setPlan(next);
      savedNow = null;
    }
    setPlans((prev) => prev.map((x) => (x.advice_template_id === templateId ? { ...x, advice_template_id: null } : x)));
    setTemplateDraft((d) => (d === templateId ? savedNow : d));
  }, []);

  // WT6: gün bilgisi paneli — YALNIZ KAYITLI durum (taslak değil) gösterilir.
  const infoContext = useMemo(() => {
    if (!infoYmd) return null;
    const y = Number(infoYmd.slice(0, 4));
    const m = Number(infoYmd.slice(5, 7));
    const d = Number(infoYmd.slice(8, 10));
    const h = gregorianToHijri(infoYmd);
    const saved = savedDays.get(infoYmd);
    return {
      gregText: `${d} ${names.months[m - 1]} ${y}`,
      hijriText: names.hijriText(h),
      info: saved ? { colorKey: saved.colorKey, label: saved.label, note: saved.note } : null,
    };
  }, [infoYmd, savedDays, names]);

  // Düzenleme paneli için tam Gregoryen + Hicrî tarih metni (motor: lib/cupping/hijri).
  const editContext = useMemo(() => {
    if (!editYmd) return null;
    const y = Number(editYmd.slice(0, 4));
    const m = Number(editYmd.slice(5, 7));
    const d = Number(editYmd.slice(8, 10));
    const h = gregorianToHijri(editYmd);
    return {
      gregText: `${d} ${names.months[m - 1]} ${y}`,
      hijriText: names.hijriText(h),
      initial: draftStyle.get(editYmd) ?? EMPTY_STYLE,
    };
  }, [editYmd, draftStyle, names]);

  /** Kaydet/durum barı içeriği — tek tanım; masaüstünde kart içinde, mobilde ekrana sabit. */
  function saveBar(variant: "inline" | "fixed") {
    const shell =
      variant === "fixed"
        ? "fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-3 pt-2.5 pb-[calc(0.625rem_+_env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(120,80,40,0.10)] backdrop-blur"
        : "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm";
    return (
      <div className={shell} data-kupa-savebar={variant}>
        <span className="flex min-w-0 flex-col gap-0.5 text-sm" aria-live="polite">
          {saving ? (
            <span className="font-medium text-slate-600">{tc("saving")}</span>
          ) : dirty ? (
            <>
              <span className="font-medium leading-tight text-amber-700">{t("dirty")}</span>
              <span className="text-xs text-amber-600">
                {[
                  additions.length > 0 ? t("countAdd", { count: String(additions.length) }) : "",
                  styleChanges.length > 0 ? t("countUpdate", { count: String(styleChanges.length) }) : "",
                  removals.length > 0 ? t("countRemove", { count: String(removals.length) }) : "",
                  templateChanged ? t("templateChange") : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          ) : (
            <span className="font-medium text-slate-500">{t("allSaved")}</span>
          )}
        </span>
        <button
          type="button"
          className={`${kupaBtnSuccess} min-h-[44px] shrink-0`}
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? tc("saving") : t("saveChanges")}
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className={`${edgeCard}`}><p className="py-8 text-center text-sm text-slate-400">{tc("loading")}</p></div>;
  }
  if (error && plans.length === 0) {
    return <div className={`${edgeCard}`}><p className="py-8 text-center text-sm text-rose-600">{error}</p></div>;
  }

  // Boş durum — premium ilk-kez.
  if (plans.length === 0) {
    return (
      <div className={`${edgeCard} flex flex-col items-center gap-4 py-10 text-center`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-3xl" aria-hidden>🗓️</span>
        <div>
          <h2 className="text-lg font-black text-slate-900">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t("emptyBody")}</p>
        </div>
        <button type="button" className={`${kupaBtnPrimary} min-h-[44px]`} onClick={() => setNewOpen(true)}>
          {t("create")}
        </button>
        {newOpen ? (
          <NewCalendarDialog
            plans={plans}
            activePlanId={activeId}
            busy={opening}
            onCancel={() => setNewOpen(false)}
            onConfirm={(y, m) => void openMonthForEditing(y, m)}
          />
        ) : null}
      </div>
    );
  }

  return (
    // Mobilde alt sabit kaydet barı içeriği örtmesin diye alt boşluk (lg'de gerek yok).
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      {/* Header açıklama — takvim UZMAN-SAHİPLİDİR (hazır gün YOK) */}
      <div className={`${edgeCard}`}>
        <p className="text-sm leading-relaxed text-slate-600">{t("introOwn")}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {t.rich("introHow", { strong: (c) => <strong>{c}</strong> })}
        </p>
      </div>

      {/* Plan kontrolü */}
      <div className={`${edgeCard}`}>
        <PlanPicker
          plans={plans}
          activePlanId={activeId}
          currentDayCount={savedDays.size}
          hasPendingChanges={dirty}
          disabled={saving}
          onSelect={handleSelectPlan}
          onNewCalendar={() => {
            if (!savingRef.current) setNewOpen(true);
          }}
          onPlanUpdated={handlePlanUpdated}
          onDelete={handleDeletePlan}
        />
      </div>

      {planLoading ? (
        <div className={`${edgeCard}`}><p className="py-6 text-center text-sm text-slate-400">{t("planLoading")}</p></div>
      ) : plan ? (
        <>
          {/* Görünüm anahtarı + kaydet durumu (AYNI plan/taslak; iki görünüm) */}
          <div className={`${edgeCard} flex flex-col gap-4`}>
            {/* WT6: mod çubuğu — görüntüleme ↔ düzenleme AÇIK ayrım */}
            {editing ? (
              <div
                data-testid="kupa-edit-banner"
                className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-bold text-amber-900">
                  {t("editingBanner", { month: names.months[month - 1], year: String(plan.year) })}
                  <span className="block text-xs font-medium text-amber-800">
                    {t.rich("editingHint", { strong: (c) => <strong>{c}</strong> })}
                  </span>
                </span>
                <button type="button" className={`${kupaBtnGhost} min-h-[44px] shrink-0`} onClick={() => void finishEditing()} disabled={saving}>
                  {t("finishEditing")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-slate-600">
                  {t("viewing")} <span className="text-xs font-medium text-slate-400">{t("readOnly")}</span>
                </span>
                <button
                  type="button"
                  data-testid="kupa-edit-month"
                  className={`${kupaBtnPrimary} min-h-[44px] shrink-0`}
                  onClick={startEditingCurrentMonth}
                  disabled={planLoading}
                >
                  {t("editMonth", { month: names.months[month - 1] })}
                </button>
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {editing ? <span /> : <CalendarViewToggle view={view} onChange={setView} />}
              {/* Word İndir — kapsam AÇIK: Yıllık (12 ay) veya yalnız SEÇİLİ AY. Yalnız aktif plan;
                  kaydedilmemiş taslakta uyarır (üretmez). Yıllık indirme istemeden aylığa dönüşmez. */}
              <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
                <span className="text-xs font-medium text-slate-400 sm:mr-1">{t("wordLabel")}</span>
                <button
                  type="button"
                  className={`${kupaBtnGhost} min-h-[44px]`}
                  onClick={() => handleWordDownload()}
                  disabled={wordBusy || planLoading}
                  title={dirty ? t("saveFirst") : t("wordAnnualTitle")}
                >
                  <span aria-hidden>⤓</span>
                  {wordBusy ? t("wordPreparing") : t("wordAnnual")}
                </button>
                <button
                  type="button"
                  className={`${kupaBtnGhost} min-h-[44px]`}
                  onClick={() => handleWordDownload(month)}
                  disabled={wordBusy || planLoading}
                  title={dirty ? t("saveFirst") : t("wordMonthTitle", { month: names.months[month - 1], year: String(plan.year) })}
                >
                  <span aria-hidden>⤓</span>
                  {wordBusy ? t("wordPreparing") : t("wordMonth", { month: names.months[month - 1] })}
                </button>
              </div>
            </div>
            {/* Kaydet/durum barı — MASAÜSTÜ (lg): kart içinde. MOBİL/TABLET: aşağıdaki PORTAL. */}
            {editing ? <div className="hidden lg:block">{saveBar("inline")}</div> : null}
          </div>

          {/* Aylık bölümler görünüm değişiminde SÖKÜLMEZ (yarım şablon/danışan formu korunur). */}
          <div className={view === "monthly" ? "flex flex-col gap-4" : "hidden"}>
              {/* Aylık Düzenleme — TEK ay görünür (kalıcı 12-buton duvarı YOK) */}
              <div className={`${edgeCard} flex flex-col gap-4`}>
                <MonthNav year={plan.year} month={month} onChange={setMonth} />
                <MonthCalendar
                  year={plan.year}
                  month={month}
                  selected={draft}
                  saved={savedSet}
                  today={today}
                  styleOf={styleOf}
                  onEditDay={editing ? openDayEditor : openDayInfo}
                  readOnly={!editing}
                />
                {/* Sade legend — yalnız uzman-seçim durumları (pastel; çalışma alanını ezmez). */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-indigo-300 bg-indigo-50" aria-hidden />
                    {t("legendSelected")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-dashed border-indigo-400 bg-indigo-50/70" aria-hidden />
                    {t("legendPendingAdd")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded border border-indigo-200 bg-indigo-50/40 opacity-70" aria-hidden />
                    {t("legendPendingRemove")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>{editing ? "✎" : "ⓘ"}</span>
                    {editing
                      ? t("hintEdit")
                      : t("hintView")}
                  </span>
                </div>
              </div>

              {/* Toplu gün seçimi (uzmanın KENDİ ölçütü; hazır/önerilen değer YOK) */}
              {editing ? <BulkDateSelector year={plan.year} onAddDates={addBulk} /> : null}

              {/* Çıktı bilgilendirme notları */}
              <div className={`${edgeCard}`}>
                <OutputAdviceSection
                  templates={templates}
                  selectedTemplateId={templateDraft}
                  templatePending={templateChanged}
                  readOnly={!editing || saving}
                  onTemplatesChanged={refreshTemplates}
                  onSelectTemplate={selectTemplateDraft}
                  onTemplateDeleted={handleTemplateDeleted}
                  onFormDirtyChange={setAdviceFormDirty}
                />
              </div>

              {/* Danışana özel (opsiyonel, katlanır, lazy) */}
              <ClientAdviceSection templates={templates} onFormDirtyChange={setClientFormDirty} />
          </div>
          {view === "annual" ? (
            /* Yıllık Özet — AYNI plan/taslak; 12 minik ay; ay tıklaması Aylık'ı açar */
            <div className={`${edgeCard}`}>
              <AnnualCalendarOverview
                year={plan.year}
                title={sysNames.planName(plan)}
                description={plan.description}
                selected={draft}
                saved={savedSet}
                today={today}
                styleOf={styleOf}
                onMonthClick={(m) => {
                  setMonth(m);
                  setView("monthly");
                }}
                onDayClick={openDayInfo}
              />
            </div>
          ) : null}
          {/* MOBİL/TABLET sabit kaydet barı — body'ye portal (ekrana gerçekten sabit; hiçbir
              kontrolün üstüne binmez: sayfa altında pb boşluğu ayrılır). */}
          {portalReady && editing ? createPortal(<div className="lg:hidden">{saveBar("fixed")}</div>, document.body) : null}
        </>
      ) : null}

      {/* WT6: gün bilgisi (salt okunur) */}
      {infoContext && !editing ? (
        <DayInfoPanel
          gregText={infoContext.gregText}
          hijriText={infoContext.hijriText}
          info={infoContext.info}
          onClose={() => setInfoYmd(null)}
        />
      ) : null}

      {newOpen ? (
        <NewCalendarDialog
          plans={plans}
          activePlanId={activeId}
          busy={opening}
          onCancel={() => setNewOpen(false)}
          onConfirm={(y, m) => void openMonthForEditing(y, m)}
        />
      ) : null}

      {/* Gün düzenleme paneli (renk + kısa açıklama + detay notu) — yalnız DÜZENLEME modunda */}
      {editContext && editing ? (
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
        {t("footerNote")}
      </p>
    </div>
  );
}

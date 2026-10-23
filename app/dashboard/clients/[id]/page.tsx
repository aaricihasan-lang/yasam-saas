"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTimeAbsolute } from "@/lib/i18n/format";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { groupClientDetailTabs, resolveClientDetailTab, visibleClientDetailTabs } from "@/lib/danisan/clientDetailTabs";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { installDemoReadOnlyFetchGuard, DEMO_READONLY_MESSAGE } from "@/lib/demo/demoReadOnlyFetchGuard";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import { invalidateDanisanListCache, removeClientFromDanisanListCache } from "@/lib/danisan/listCache";
import { computeBurc } from "@/lib/danisan/burc";
import { summarizeUnpaid } from "@/lib/danisan/chargePayment";
import NotesTab from "./components/NotesTab";
import WordReportDialog, { type WordReportRequest } from "./components/WordReportDialog";
import { BirthDateInput } from "@/components/ui/BirthDateInput";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri, ELEMENT_ORDER } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate, todayInZone } from "@/lib/time/reportTime";
import { runInEffect } from "@/lib/runInEffect";
import {
  countAppointments,
  deriveAppointmentStatus,
  isAppointmentInFuture,
} from "@/lib/danisan/appointmentRules";
import type { DeletePreview } from "@/lib/danisan/deletePreview";
import { CalendarRange, ChevronDown, FileText, PencilLine, Trash2, type LucideIcon } from "lucide-react";
import { DypBackdrop } from "@/app/_premium/danisan-yolculugu/DypBackdrop";
import { DYP_INFO_ICONS, DYP_TAB_ICONS, dyp, stripLeadingGlyph } from "@/app/_premium/danisan-yolculugu/DypUi";

// ─── Lazy sekmeler ───────────────────────────────────────────────────────────
// Ağır sekmeler (özellikle html2canvas/jsPDF içeren Analizler ve 4 fetch yapan
// Yolculuk) yalnızca açıldığında yüklenir → detay ilk açılışı hafifler.
const TabSkeleton = () => (
  <div className="animate-pulse space-y-3" aria-busy="true">
    <div className="h-8 w-44 rounded-lg bg-slate-200" />
    <div className="h-24 w-full rounded-xl bg-slate-100" />
    <div className="h-24 w-full rounded-xl bg-slate-100" />
  </div>
);
const StonesTab = dynamic(() => import("./components/StonesTab"), { loading: TabSkeleton, ssr: false });
const SessionsTab = dynamic(() => import("./components/SessionsTab"), { loading: TabSkeleton, ssr: false });
const UcretlendirmeTab = dynamic(() => import("./components/UcretlendirmeTab"), { loading: TabSkeleton, ssr: false });
const HomeworkTab = dynamic(() => import("./components/HomeworkTab"), { loading: TabSkeleton, ssr: false });
const AnalizlerTab = dynamic(() => import("./components/AnalizlerTab"), { loading: TabSkeleton, ssr: false });
const YolculukTab = dynamic(() => import("./components/YolculukTab"), { loading: TabSkeleton, ssr: false });
const ClientMemoryTab = dynamic(() => import("./components/ClientMemoryTab"), { loading: TabSkeleton, ssr: false });
const HumanDesignTab = dynamic(() => import("./components/HumanDesignTab"), { loading: TabSkeleton, ssr: false });
const BeslenmeTab = dynamic(() => import("./components/BeslenmeTab"), { loading: TabSkeleton, ssr: false });
const AnamnezTab = dynamic(() => import("./components/AnamnezTab"), { loading: TabSkeleton, ssr: false });
const MemoryPicker = dynamic(() => import("@/components/yasam-hafizasi/MemoryPicker"), { ssr: false });
// KVKK onam (INFRA bileşeni): başlıkta rozet + Genel sekmesinde kayıt paneli.
const ClientConsentPanel = dynamic(() => import("@/components/kvkk/ClientConsentPanel"), { ssr: false });
// Astroloji Aşama 7B: yalnız durum rozeti (yetkisizde hiçbir şey çizmez; Astroloji verisi aktarılmaz).
const AstrologyClientStatus = dynamic(() => import("@/components/astrology/AstrologyClientStatus"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
type Client = {
  id: string;
  ad?: string;
  soyad?: string;
  telefon?: string;
  dogum?: string;
  gorusme?: string;
  burc?: string;
  kan?: string;
  mizac?: string;
};

type ClientNote = {
  id?: string;
  tenant_id?: string;
  client_id?: string;
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  notlar?: string | null;
};

type AppointmentStatus = "bekliyor" | "tamamlandi" | "iptal";

type Appointment = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status?: AppointmentStatus | string | null;
};

type PlanningMode = "auto" | "manual";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTR(date: string | undefined) {
  if (!date) return "-";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDateTimeTR(value: string) {
  return formatDateTimeAbsolute(value);
}

// i18n translator tipi — modül-seviyesi saf fonksiyonlara t geçirmek için.
type T = ReturnType<typeof useTranslations>;

/** Notlar/genel bilgi yükleme durumu — "ready" olmadan düzenleme/kayıt KAPALI (veri kaybı koruması). */
type NotesState = "loading" | "ready" | "error";

type DeletePreviewResponse = DeletePreview & { ok?: boolean };

/** İndirme yedek adı için danışan adı slug'ı (sunucu Content-Disposition öncelikli). */
function nameSlugTR(rawName: string): string {
  return rawName.toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Randevu tarih/saatinin geçmişte olup olmadığı (YEREL kullanıcı günü; UTC kayması yok).
// - Geçmiş takvim günü → geçmiş.
// - Bugün: geçmiş SAAT → geçmiş (WEB-06); ileri saat → geçmiş değil.
// - Saatsiz bugün ("YYYY-MM-DD") → geçmiş değil.
// dateStr: "YYYY-MM-DD" veya "YYYY-MM-DDTHH:mm" (datetime-local).
function isPastCalendarDay(dateStr: string): boolean {
  if (!dateStr) return false;
  const s = dateStr.trim();
  const dayPart = s.slice(0, 10);
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  const todayStr = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  if (dayPart < todayStr) return true;   // geçmiş gün
  if (dayPart > todayStr) return false;  // gelecek gün
  // Aynı gün: saat bileşeni varsa geçmiş saati kontrol et; yoksa geçmiş sayma.
  if (s.length <= 10) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t < n.getTime();
}

function getLeftBorderClass(status: string | null | undefined, appointmentDate: string) {
  const normalized = status || "bekliyor";
  if (normalized === "iptal") return "border-l-[#b42318]";
  if (normalized === "tamamlandi") return "border-l-[#17703f]";
  if (normalized === "bekliyor") {
    return new Date(appointmentDate) < new Date()
      ? "border-l-[#c58a1a]"
      : "border-l-[#2c5aa0]";
  }
  return "border-l-[#8592a6]";
}

// Canonical randevu statü kodu → görünen etiket + renkler (kod DEĞİŞMEZ).
// FA-44: geçmiş + "bekliyor" → türetilmiş "Sonuç girilmedi" (amber); DB statüsü DEĞİŞMEZ.
function getAppointmentStatusInfo(item: Appointment, t: T) {
  const derived = deriveAppointmentStatus(item.status, item.appointment_date);
  if (derived === "tamamlandi") return { label: t("appt.status.tamamlandi"), bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
  if (derived === "iptal")      return { label: t("appt.status.iptal"),      bg: "#fee2e2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" };
  if (derived === "sonuc_girilmedi") return { label: t("appt.status.sonucGirilmedi"), bg: "#fffbeb", color: "#b45309", border: "#fde68a", dot: "#f59e0b" };
  return { label: t("appt.status.yaklasan"), bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
}

// ─── Shared style strings ─────────────────────────────────────────────────────
// Premium görünüm (owner PASS referansı, 2026-10-23) — yalnız sınıf; .skin kapsamı yüzeyi tamamlar.
const inputCls =
  "w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-[14.5px] outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const textareaCls =
  "w-full min-h-[64px] rounded-xl border border-slate-300 px-3.5 py-3 text-[14.5px] resize-y outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const labelCls = dyp.fieldLabel;
// Sekmeye özel Word butonu — Android dahil tüm cihazlarda ve telefon genişliğinde görünür
// (2026-10-14 owner kararı; HD ve Astroloji kendi kurallarını korur). Analiz modalındaki "Word Al" ayrı bileşende ve etkilenmez.
const wordBtnCls = dyp.wordBtn;

// Soyad her zaman Türkçe locale ile BÜYÜK harf normalize edilir (i→İ, ı→I).
// Kayıt anında savunmacı: trim + büyük harf. Yazım sırasında boşluk korunur.
function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value);
}

function normalizeSurname(value: string) {
  return value.trim().toLocaleUpperCase("tr-TR");
}

// ─── Main component ───────────────────────────────────────────────────────────
function ClientDetailPageInner() {
  const t = useTranslations("clients.detail");
  // D1 (DY-040): danışan silme onayının "Vazgeç" metni ortak çeviriden (EN arayüzde İngilizce).
  const tConfirm = useTranslations("common.confirmDialog");
  // Canonical değer → yerelleştirilmiş görünen etiket (data DEĞİŞMEZ).
  // Bilinmeyen/eşleşmeyen değer ham (canonical) döner → veri sızmaz, kırılmaz.
  const localize = (group: string, v: string | null | undefined): string | undefined => {
    if (!v) return undefined;
    return t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v;
  };
  const { confirm } = useConfirm();
  const deleteConfirm = useDeleteConfirm();
  const { showToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.id as string;
  useBfcacheRefresh();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  // D1 (DY-03): Genel Bilgi sürümü (sunucu client_version) — PATCH'te base_version olarak gönderilir.
  const [clientVersion, setClientVersion] = useState<string | null>(null);
  // D1 (DY-039): danışan yüklenemedi ayrımı — "bulunamadı/erişilemez" (404/403) ≠ ağ/sunucu hatası.
  const [clientLoadError, setClientLoadError] = useState<"notFound" | "failed" | null>(null);
  const [clientReloadKey, setClientReloadKey] = useState(0);
  // Deep-link: ilk render'da ?tab= (yalnız geçerli sekme) başlangıç sekmesini belirler.
  // useSearchParams App Router'da dinamik render sırasında SUNUCUDA da erişilebilir → sunucu
  // ve istemci AYNI sekmeyi görür (hydration mismatch YOK). Böylece window'a bağlı eski
  // yaklaşımın "sunucu 'genel' render eder → hydration kilitlenir" hatası ortadan kalkar.
  // Bilinmeyen/boş ?tab= güvenli şekilde "genel"e düşer. (Sekme tıklamaları setActiveTab ile
  // korunur; başlangıç sekmesi URL'den gelir.) Suspense sarmalayıcısı prerender build kuralını
  // karşılar (bkz. dosya sonundaki default export).
  const [activeTab, setActiveTab] = useState<string>(() =>
    resolveClientDetailTab(searchParams.get("tab")),
  );
  // Bir kez açılan sekme DOM'da tutulur (tekrar mount → tekrar fetch olmaz).
  const [openedTabs, setOpenedTabs] = useState<Set<string>>(() => new Set(["genel", activeTab]));
  const [loading, setLoading] = useState(true);
  const [deletingClient, setDeletingClient] = useState(false);
  // Beslenme sekmesi Danışan Yolculuğu (clients) erişimi olan uzmana da GÖRÜNÜR; gerçek
  // güvenlik server-side client guard'dır (API'ler clients-scoped, tenant+client fail-closed).
  // Bu owner probe'u YALNIZ plan YÖNETİMİ capability'si için tutulur: owner=super-admin →
  // "Yeni Plan" + plan editörü; uzman → plan yalnız salt-okunur liste (editör AŞAMA 2). §22
  const [isBeslenmeOwner, setIsBeslenmeOwner] = useState(false);

  // Sekme görünürlüğü TEK KAYNAK (lib/danisan/clientDetailTabs) + merkezî izin (hasModulePermission).
  // İzinler canlı DB'den kesinleşene kadar izin-bağımlı sekmeler (Yaşam Hafızası) fail-closed gizli.
  const [permUser, setPermUser] = useState<YasamUser | null>(null);
  const [permResolved, setPermResolved] = useState(false);
  useEffect(() => {
    let alive = true;
    const cached = readYasamUser();
    void syncYasamUserFromDb(cached)
      .then((fresh) => { if (alive) setPermUser(fresh ?? cached ?? null); })
      .catch(() => { if (alive) setPermUser(cached ?? null); })
      .finally(() => { if (alive) setPermResolved(true); });
    return () => { alive = false; };
  }, []);
  const visibleTabs = useMemo(
    () => visibleClientDetailTabs(permUser ? (key) => hasModulePermission(permUser, key) : null),
    [permUser],
  );
  const canSeeTab = useCallback((id: string) => visibleTabs.some((tab) => tab.id === id), [visibleTabs]);
  // Demo vitrin hesabı: gerçek sayfa + salt-okunur (sunucu 403 asıl koruma; istemci kapısı UX içindir).
  const isDemo = permUser?.is_demo_account === true;
  useEffect(() => {
    if (!isDemo) return;
    return installDemoReadOnlyFetchGuard(() =>
      showToast({ title: t("demo.readOnlyTitle"), message: DEMO_READONLY_MESSAGE, type: "info" }),
    );
  }, [isDemo, showToast, t]);
  useEffect(() => {
    let alive = true;
    void checkBeslenmeAccess().then((ok) => { if (alive) setIsBeslenmeOwner(ok === true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const [noteId, setNoteId] = useState<string | null>(null);
  // DY-A: notes yükleme durumu + sürüm (CAS) + geç gelen yanıtları elemek için sıra sayacı.
  const [notesState, setNotesState] = useState<NotesState>("loading");
  const [notesVersion, setNotesVersion] = useState<string | null>(null);
  // DY-03: Genel Bilgi not alanlarının (sağlık notu / adres / öneriler) sürüm özeti (atomik CAS, zorunlu).
  const [generalNotesVersion, setGeneralNotesVersion] = useState<string | null>(null);
  const notesReqSeq = useRef(0);
  const notesLoading = notesState === "loading";
  const [saglikNotu, setSaglikNotu] = useState("");
  const [adres, setAdres] = useState("");
  const [oneriler, setOneriler] = useState("");
  const [editAd, setEditAd] = useState("");
  const [editSoyad, setEditSoyad] = useState("");
  const [editTelefon, setEditTelefon] = useState("");
  const [editKan, setEditKan] = useState("");
  const [editMizac, setEditMizac] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [generalSnap, setGeneralSnap] = useState<{
    ad: string; soyad: string; telefon: string; dogum: string;
    kan: string; mizac: string; saglikNotu: string; adres: string; oneriler: string;
  } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [tabWordBusy, setTabWordBusy] = useState(false);
  // BF-14 P2: Yaşam Hafızası teslim seçimi (report target). selectionGroupId yoksa çıktı değişmez.
  const [yhPickerOpen, setYhPickerOpen] = useState(false);
  const [yhSelectionGroupId, setYhSelectionGroupId] = useState<string | null>(null);
  const [drStart, setDrStart] = useState("");
  const [drEnd, setDrEnd] = useState("");
  const [drBusy, setDrBusy] = useState(false);
  const [drOpen, setDrOpen] = useState(false);
  // W1: Ücretlendirme tarih aralığı raporuna yalnız açıkça seçilirse eklenir (varsayılan kapalı).
  const [drCharges, setDrCharges] = useState(false);
  // W1 / DY-008: Word öncesi Tam Rapor / Özel Rapor penceresi.
  const [wordDialogOpen, setWordDialogOpen] = useState(false);
  const [consentRev, setConsentRev] = useState(0);
  // WT7: ödenmemiş ücret özeti (hero uyarısı). null = henüz bilinmiyor → uyarı gösterilmez.
  const [unpaidCharges, setUnpaidCharges] = useState<{ count: number; total: number } | null>(null);
  const [editDogum, setEditDogum] = useState("");
  // Satış öncesi kapanış: doğum alanı yarım/geçersizken kayıt YOK (eskiden "" → PATCH
  // dogum:null ile kayıtlı doğum tarihi sessizce siliniyordu).
  const [editDogumInvalid, setEditDogumInvalid] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingClientNotes, setSavingClientNotes] = useState(false);

  useEffect(() => { void getSyncedTenantId().then(setTenantId); }, []);

  // DY-A: Notlar/genel bilgiler — yalnız "ready" iken düzenlenebilir. Hata sessiz DEĞİL:
  // "error" durumunda Notlar sekmesi ve Genel "Düzenle" kapanır, "Yeniden dene" sunulur.
  // Sıra sayacı: geç gelen (eski) GET yanıtı yeni durumu ezmez.
  const applyNoteRow = useCallback((note: ClientNote | null | undefined, version: string | null | undefined, generalVersion?: string | null) => {
    setNoteId(note?.id || null);
    setSaglikNotu(note?.saglik_notu || "");
    setAdres(note?.adres || "");
    setOneriler(note?.oneriler || "");
    setNoteText(note?.notlar || "");
    setNotesVersion(typeof version === "string" ? version : null);
    setGeneralNotesVersion(typeof generalVersion === "string" ? generalVersion : null);
  }, []);

  const loadNotes = useCallback(async () => {
    const seq = ++notesReqSeq.current;
    setNotesState("loading");
    const token = readSessionToken();
    try {
      const notesRes = await fetch(`/api/clients/${clientId}/notes`, {
        headers: {
          "x-user-id": readYasamUser()?.id ?? "",
          ...(token ? { "x-session-token": token } : {}),
        },
      });
      if (seq !== notesReqSeq.current) return;
      if (!notesRes.ok) {
        console.error("Genel bilgiler okuma hatası:", notesRes.status);
        setNotesState("error");
        return;
      }
      const notesJson = (await notesRes.json().catch(() => null)) as
        | { ok?: boolean; note?: ClientNote | null; notlar_version?: string; general_version?: string }
        | null;
      if (seq !== notesReqSeq.current) return;
      if (!notesJson || notesJson.ok === false) {
        setNotesState("error");
        return;
      }
      applyNoteRow(notesJson.note ?? null, notesJson.notlar_version, notesJson.general_version);
      setNotesState("ready");
    } catch (err) {
      if (seq !== notesReqSeq.current) return;
      console.error("Notlar okuma hatası:", err);
      setNotesState("error");
    }
  }, [clientId, applyNoteRow]);

  // Aktif sekmeyi "açılmış" kümesine ekle (Tab butonları veya Yolculuk içi
  // onNavigate hangi yoldan gelirse gelsin). Açılan sekme mount kalır.
  useEffect(() => {
    setOpenedTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab]);

  // İzinler kesinleşince görünmeyen (izinsiz) sekme aktif kalamaz → Genel (deep-link dahil).
  useEffect(() => {
    if (!permResolved) return;
    runInEffect(() => {
      setActiveTab((cur) => resolveClientDetailTab(cur, visibleTabs));
    });
  }, [permResolved, visibleTabs]);

  // §4.2 Bildirim derin bağlantısı: sayfa zaten açıkken ?tab= değişirse (ör. zil →
  // "Danışan kartı") aktif sekme URL ile senkronlanır. Yalnız parametre DEĞİŞİMİNDE
  // (render sırasında önceki değerle karşılaştırma — React "prop değişiminde state ayarla"
  // deseni) → kullanıcının sekme tıklamaları ezilmez.
  const tabParam = searchParams.get("tab");
  const [prevTabParam, setPrevTabParam] = useState<string | null>(tabParam);
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam);
    if (tabParam) setActiveTab(resolveClientDetailTab(tabParam));
  }

  // ?randevu=<id> → Randevular sekmesinde ilgili randevu detayı açılır (AppointmentsTab).
  const deepLinkAppointmentId = searchParams.get("randevu");
  const clearAppointmentDeepLink = useCallback(() => {
    router.replace(`/dashboard/clients/${encodeURIComponent(clientId)}?tab=randevular`, { scroll: false });
  }, [router, clientId]);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;

    // Kritik yol: yalnızca TEMEL danışan bilgisi. Notlar (saglik/adres/oneriler/
    // notlar) ilk boyamayı bekletmeden ARKA PLANDA çekilir → detay anında açılır.
    async function fetchClient() {
      setLoading(true);

      setClientLoadError(null);

      const detailToken = readSessionToken();
      const uid = readYasamUser()?.id ?? "";
      // D1 (DY-039): ağ hatası eskiden yakalanmıyordu → iskelet ekranda takılı kalıyordu.
      const clientRes = await fetch(`/api/clients/${clientId}`, {
        headers: {
          "x-user-id": uid,
          ...(detailToken ? { "x-session-token": detailToken } : {}),
        },
      }).catch(() => null);

      if (cancelled) return;
      if (!clientRes || !clientRes.ok) {
        console.error("Danışan detay hatası");
        // Yanlış/eski danışan verisi gösterilmez: state temizlenir.
        setClient(null);
        setClientVersion(null);
        setClientLoadError(clientRes && (clientRes.status === 404 || clientRes.status === 403) ? "notFound" : "failed");
        setLoading(false);
        return;
      }

      const detailJson = (await clientRes.json().catch(() => null)) as { client?: Client; client_version?: string } | null;
      const data = detailJson?.client;
      if (cancelled) return;
      if (!data) {
        setClient(null);
        setClientVersion(null);
        setClientLoadError(detailJson ? "notFound" : "failed");
        setLoading(false);
        return;
      }

      setClient(data);
      setClientVersion(typeof detailJson?.client_version === "string" ? detailJson.client_version : null);
      setEditAd(data.ad || "");
      setEditSoyad(data.soyad || "");
      setEditTelefon(data.telefon || "");
      setEditDogum(data.dogum || "");
      setEditKan(data.kan || "");
      setEditMizac(data.mizac || "");
      setLoading(false); // temel bilgi geldi → hemen render

      // ── Notlar arka planda (kritik yolu bloklamaz; durum makinesi loadNotes'ta) ──
      void loadNotes();
    }

    if (clientId) fetchClient();
    const seqRef = notesReqSeq; // sayaç nesnesi (DOM ref değil) — cleanup'ta artırılır
    return () => {
      cancelled = true;
      seqRef.current++; // unmount/yeniden yükleme → uçuştaki notes yanıtı yok sayılır
    };
  }, [clientId, tenantId, loadNotes, clientReloadKey]);

  // WT7: hero "Ücret Alınmadı" uyarısı — sekme açılmadan da görünsün diye ücretler arka planda
  // bir kez okunur (yalnız payment_status='unpaid' sayılır; eski/Belirtilmemiş kayıt uyarı üretmez).
  useEffect(() => {
    if (!tenantId || !clientId) return;
    let cancelled = false;
    const token = readSessionToken();
    void fetch(`/api/clients/${clientId}/charges`, {
      headers: { "x-user-id": readYasamUser()?.id ?? "", ...(token ? { "x-session-token": token } : {}) },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { charges?: { payment_status?: unknown; amount?: unknown }[] } | null) => {
        if (!cancelled && j?.charges) setUnpaidCharges(summarizeUnpaid(j.charges));
      })
      .catch(() => { /* uyarı opsiyonel; sessiz */ });
    return () => { cancelled = true; };
  }, [clientId, tenantId]);

  // Ücretlendirme sekmesinde ekle/düzenle/ödendi işaretle/sil → uyarı anında güncellenir;
  // liste önbelleği bayatlar (liste rozeti dönüşte yeniden okunur).
  const unpaidRef = useRef<{ count: number; total: number } | null>(null);
  useEffect(() => { unpaidRef.current = unpaidCharges; }, [unpaidCharges]);
  const handleUnpaidChange = useCallback((s: { count: number; total: number }) => {
    const prev = unpaidRef.current;
    if (prev && prev.count === s.count && prev.total === s.total) return;
    if (prev) invalidateDanisanListCache();
    unpaidRef.current = s;
    setUnpaidCharges(s);
  }, []);

  async function saveAllGeneralInfo() {
    if (!tenantId || !client) return;
    // DY-A: notlar yüklenmeden (veya hata) genel bilgi kaydı YOK — boş alanlarla ezme riski.
    if (notesState !== "ready") return;
    if (!editAd.trim() || !normalizeSurname(editSoyad)) {
      showToast({ title: t("toast.failTitle"), message: t("toast.nameRequired"), type: "error" });
      return;
    }
    if (editDogumInvalid) {
      showToast({ title: t("toast.failTitle"), message: t("toast.invalidBirth"), type: "error" });
      return;
    }
    setSavingAll(true);

    const saveToken = readSessionToken();
    const clientRes = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(saveToken ? { "x-session-token": saveToken } : {}),
      },
      body: JSON.stringify({ ad: editAd.trim() || null, soyad: normalizeSurname(editSoyad) || null, telefon: editTelefon.trim() || null, dogum: editDogum || null, kan: editKan || null, mizac: editMizac || null, ...(clientVersion ? { base_version: clientVersion } : {}) }),
    }).catch(() => null);

    if (!clientRes) {
      showToast({ title: t("toast.failTitle"), message: t("toast.saveClientFailed"), type: "error" });
      setSavingAll(false);
      return;
    }

    // DY-03: sürüm eksik (428) → güncel kayıt okunup form yenilenir (hiçbir şey yazılmadı).
    if (clientRes.status === 428) {
      const fresh = await fetch(`/api/clients/${client.id}`, {
        headers: { "x-user-id": readYasamUser()?.id ?? "", ...(saveToken ? { "x-session-token": saveToken } : {}) },
      }).then((r) => r.json()).catch(() => null) as { client?: Client; client_version?: string } | null;
      if (fresh?.client) {
        setClient((prev) => (prev ? { ...prev, ...fresh.client } : (fresh.client as Client)));
        setClientVersion(typeof fresh.client_version === "string" ? fresh.client_version : null);
      }
      showToast({ title: t("toast.warningTitle"), message: t("toast.clientConflict"), type: "warning" });
      setSavingAll(false);
      return;
    }

    // D1 (DY-03): başka sekme/cihaz Genel Bilgi'yi değiştirdi → ezme YOK; güncel değerler forma yüklenir.
    if (clientRes.status === 409) {
      const conflict = (await clientRes.json().catch(() => ({}))) as { code?: string; client?: Client; client_version?: string };
      if (conflict.code === "CLIENT_CONFLICT" && conflict.client) {
        const fresh = conflict.client;
        setClient((prev) => (prev ? { ...prev, ...fresh } : fresh));
        setClientVersion(typeof conflict.client_version === "string" ? conflict.client_version : null);
        setEditAd(fresh.ad || "");
        setEditSoyad(fresh.soyad || "");
        setEditTelefon(fresh.telefon || "");
        setEditDogum(fresh.dogum || "");
        setEditKan(fresh.kan || "");
        setEditMizac(fresh.mizac || "");
      }
      showToast({ title: t("toast.warningTitle"), message: t("toast.clientConflict"), type: "warning" });
      setSavingAll(false);
      return;
    }

    if (!clientRes.ok) {
      // Sunucu doğrulaması (400) alan bazlı Türkçe mesaj döner → aynen göster.
      let serverMsg: string | null = null;
      if (clientRes.status === 400) {
        try { serverMsg = ((await clientRes.json()) as { error?: string }).error ?? null; } catch { serverMsg = null; }
      }
      showToast({ title: t("toast.failTitle"), message: serverMsg ?? t("toast.saveClientFailed"), type: "error" });
      setSavingAll(false);
      return;
    }

    // F7: burç doğum tarihinden türetilir (sunucu authoritative). Optimistik yerel
    // state'i AYNI canonical helper'la güncelle → düzenleme sonrası bayat burç kalmaz.
    setClient((prev) => prev ? { ...prev, ad: editAd.trim() || undefined, soyad: normalizeSurname(editSoyad) || undefined, telefon: editTelefon.trim() || undefined, dogum: editDogum || undefined, kan: editKan || undefined, mizac: editMizac || undefined, burc: computeBurc(editDogum || null) ?? undefined } : prev);
    const savedJson = (await clientRes.json().catch(() => ({}))) as { client_version?: string };
    if (typeof savedJson.client_version === "string") setClientVersion(savedJson.client_version);

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const notesRes = await fetch(`/api/clients/${clientId}/notes`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      // Yalnız 3 genel alan gönderilir; sunucu notlar'a DOKUNMAZ (alan-bazlı PATCH).
      // DY-03: general_base_version ZORUNLU (atomik CAS; eski sürümle kayıt 409).
      body: JSON.stringify({ saglik_notu: saglikNotu, adres, oneriler, general_base_version: generalNotesVersion }),
    });
    const notesJson = (await notesRes.json().catch(() => ({}))) as {
      ok?: boolean; error?: string; code?: string; note?: ClientNote | null; notlar_version?: string; general_version?: string;
    };

    if (notesRes.status === 409 || notesRes.status === 428) {
      // Başka sekme/cihaz genel bilgileri değiştirdi → ezme YOK; güncel değerler forma yüklenir.
      if (notesRes.status === 409 && notesJson.note !== undefined) {
        applyNoteRow(notesJson.note ?? null, notesJson.notlar_version, notesJson.general_version);
      } else {
        void loadNotes();
      }
      showToast({ title: t("toast.warningTitle"), message: t("toast.notesConflict"), type: "warning" });
      setSavingAll(false);
      return;
    }

    if (!notesRes.ok || !notesJson.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.notesSaveFailed") + ": " + (notesJson.error ?? ""), type: "error" });
      setSavingAll(false);
      return;
    }

    if (notesJson.note?.id) setNoteId(notesJson.note.id);
    if (typeof notesJson.notlar_version === "string") setNotesVersion(notesJson.notlar_version);
    if (typeof notesJson.general_version === "string") setGeneralNotesVersion(notesJson.general_version);
    invalidateDanisanListCache(); // ad/telefon vb. değişti → liste bayat
    showToast({ title: t("toast.successTitle"), message: t("toast.changesSaved"), type: "success" });
    setSavingAll(false);
    setIsEditingGeneral(false);
    setGeneralSnap(null);
  }

  function enterGeneralEdit() {
    setGeneralSnap({ ad: editAd, soyad: editSoyad, telefon: editTelefon, dogum: editDogum, kan: editKan, mizac: editMizac, saglikNotu, adres, oneriler });
    setIsEditingGeneral(true);
  }

  function cancelGeneralEdit() {
    if (generalSnap) {
      setEditAd(generalSnap.ad);
      setEditSoyad(generalSnap.soyad);
      setEditTelefon(generalSnap.telefon);
      setEditDogum(generalSnap.dogum);
      setEditKan(generalSnap.kan);
      setEditMizac(generalSnap.mizac);
      setSaglikNotu(generalSnap.saglikNotu);
      setAdres(generalSnap.adres);
      setOneriler(generalSnap.oneriler);
    }
    setIsEditingGeneral(false);
    setGeneralSnap(null);
  }

  async function saveClientNotes(notlarRaw: string): Promise<boolean> {
    if (!tenantId) return false;
    // DY-A: sunucu değeri okunmadan (loading/error) yazım YOK → mevcut notlar boş listeyle ezilemez.
    if (notesState !== "ready") return false;
    setSavingClientNotes(true);

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/notes`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      // Yalnız notlar + base_version (CAS); genel alanlar gönderilmez.
      body: JSON.stringify({ notlar: notlarRaw, base_version: notesVersion }),
    }).catch(() => null); // ağ hatası (offline/timeout) → hata toast'u; saving takılı kalmaz
    if (!res) {
      showToast({ title: t("toast.failTitle"), message: t("toast.noteSaveError"), type: "error" });
      setSavingClientNotes(false);
      return false;
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean; error?: string; code?: string; note?: ClientNote | null; notlar_version?: string; general_version?: string;
    };

    if (res.status === 428) {
      // DY-03: sürüm eksik → güncel notlar yüklenir, yazım yapılmadı.
      showToast({ title: t("toast.warningTitle"), message: t("toast.notesConflict"), type: "warning" });
      void loadNotes();
      setSavingClientNotes(false);
      return false;
    }

    if (res.status === 409 && json.code === "NOTES_CONFLICT") {
      // Başka sekme/cihaz notları değiştirdi → güncel sunucu değerini göster (yerel yazım yok).
      showToast({ title: t("toast.warningTitle"), message: t("toast.notesConflict"), type: "warning" });
      if (json.note !== undefined) {
        setNoteText(json.note?.notlar || "");
        setNotesVersion(typeof json.notlar_version === "string" ? json.notlar_version : null);
      } else {
        void loadNotes();
      }
      setSavingClientNotes(false);
      return false;
    }

    if (!res.ok || !json.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.noteSaveError") + ": " + (json.error ?? ""), type: "error" });
      setSavingClientNotes(false);
      return false;
    }

    if (json.note?.id) setNoteId(json.note.id);
    if (typeof json.notlar_version === "string") setNotesVersion(json.notlar_version);
    if (typeof json.general_version === "string") setGeneralNotesVersion(json.general_version);
    // Kaynak gerçekliği güncelle; başarı bildirimini NotesTab gösterir.
    setNoteText(json.note ? (json.note.notlar || "") : notlarRaw);
    setSavingClientNotes(false);
    return true;
  }

  async function generateWordReport(choice: WordReportRequest) {
    if (!tenantId || !client) return;
    setGeneratingReport(true);
    try {
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: JSON.stringify({ ...choice, ...(yhSelectionGroupId ? { selectionGroupId: yhSelectionGroupId } : {}) }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || t("error.reportFailed")); }
      // Dosya adı sunucudan (Content-Disposition, yerel tarih); yoksa yerel-gün yedeği.
      const nameSlug = nameSlugTR(`${client.ad ?? ""} ${client.soyad ?? ""}`.trim());
      await downloadFileResponse(res, `danisan-raporu-${nameSlug}-${reportFileDate()}.docx`);
      setWordDialogOpen(false);
      showToast({ title: t("toast.successTitle"), message: t("toast.reportStarted"), type: "success" });
    } catch (err) {
      showToast({ title: t("toast.errorTitle"), message: err instanceof Error ? err.message : t("toast.unknownError"), type: "error" });
    } finally { setGeneratingReport(false); }
  }

  async function generateDateRangeReport() {
    if (!tenantId || !client) return;
    if (!drStart || !drEnd) { showToast({ title: t("toast.warningTitle"), message: t("toast.dateRangeRequired"), type: "warning" }); return; }
    if (drStart > drEnd) { showToast({ title: t("toast.warningTitle"), message: t("toast.dateRangeOrder"), type: "warning" }); return; }
    setDrBusy(true);
    try {
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: JSON.stringify({ exportMode: "date-range", dateRange: { start: drStart, end: drEnd }, includeCharges: drCharges }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || t("error.reportFailed")); }
      const nameSlug = nameSlugTR(`${client.ad ?? ""} ${client.soyad ?? ""}`.trim());
      await downloadFileResponse(res, `danisan-tarih-araligi-${nameSlug}-${drStart}-${drEnd}.docx`);
      showToast({ title: t("toast.successTitle"), message: t("toast.dateRangeReportStarted"), type: "success" });
    } catch (err) {
      showToast({ title: t("toast.errorTitle"), message: err instanceof Error ? err.message : t("toast.unknownError"), type: "error" });
    } finally { setDrBusy(false); }
  }

  async function generateTabWordReport(tab: string) {
    if (!tenantId || !client) return;
    setTabWordBusy(true);
    try {
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: JSON.stringify({ exportMode: "tab", tabName: tab }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || t("error.reportFailed")); }
      const nameSlug = nameSlugTR(`${client.ad ?? ""} ${client.soyad ?? ""}`.trim());
      await downloadFileResponse(res, `danisan-${tab}-${nameSlug}-${reportFileDate()}.docx`);
      showToast({ title: t("toast.successTitle"), message: t("toast.reportStarted"), type: "success" });
    } catch (err) {
      showToast({ title: t("toast.errorTitle"), message: err instanceof Error ? err.message : t("toast.unknownError"), type: "error" });
    } finally { setTabWordBusy(false); }
  }

  // DY-A: silmeden önce birlikte silinecek kayıtların sayımı. Hata → null (silme ENGELLENMEZ;
  // onayda sabit tam liste gösterilir).
  async function fetchDeletePreview(): Promise<DeletePreviewResponse | null> {
    try {
      const token = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/delete-preview`, {
        headers: {
          "x-user-id": readYasamUser()?.id ?? "",
          ...(token ? { "x-session-token": token } : {}),
        },
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as DeletePreviewResponse | null;
      if (!json || json.ok === false || !Array.isArray(json.counts)) return null;
      return json;
    } catch {
      return null;
    }
  }

  function buildDeletePreviewMessage(clientName: string, preview: DeletePreviewResponse | null): string {
    const parts: string[] = [t("delete.message", { name: clientName || t("delete.thisClient") })];
    if (!preview) {
      parts.push(t("delete.previewFailed"));
    } else {
      const lines: string[] = [];
      for (const c of preview.counts) {
        if (typeof c.count !== "number" || c.count <= 0) continue;
        const label = t.has(`deletePreview.table.${c.key}`) ? t(`deletePreview.table.${c.key}`) : c.key;
        lines.push(`• ${label}: ${c.count}`);
      }
      if (preview.notes.noteCount > 0) lines.push(`• ${t("delete.notesLine", { count: preview.notes.noteCount })}`);
      const general = [
        preview.notes.saglikNotu ? t("delete.fieldSaglik") : null,
        preview.notes.adres ? t("delete.fieldAdres") : null,
        preview.notes.oneriler ? t("delete.fieldOneriler") : null,
      ].filter((x): x is string => !!x);
      if (general.length > 0) lines.push(`• ${t("delete.generalLine", { fields: general.join(", ") })}`);
      parts.push(lines.length > 0 ? `${t("delete.previewHeader")}\n${lines.join("\n")}` : t("delete.previewEmpty"));
      // AŞAMA 3C: danışana bağlı Human Design profili varsa açık uyarı (kalıcı silme kapsamında).
      const hdProfiles = preview.counts.find((c) => c.key === "hdProfiles")?.count;
      if (typeof hdProfiles === "number" && hdProfiles > 0) parts.push(t("delete.hdWarning"));
      if (preview.partial) parts.push(t("delete.previewPartial"));
    }
    parts.push(t("delete.unlinked"));
    return parts.join("\n\n");
  }

  const deleteBusyRef = useRef(false);

  async function handleDeleteClient() {
    // Senkron kilit: önizleme + onay + silme boyunca ikinci tık yok sayılır.
    if (!tenantId || deleteBusyRef.current) return;
    deleteBusyRef.current = true;
    try {
      const clientName = client ? `${client.ad ?? ""} ${client.soyad ?? ""}`.trim() : "";
      const preview = await fetchDeletePreview();

      // Geri alınamaz + danışan adını YAZARAK onay (ad yoksa "SİL").
      const ok = await deleteConfirm({
        title: t("delete.title"),
        message: buildDeletePreviewMessage(clientName, preview),
        confirmText: t("delete.confirm"),
        cancelText: tConfirm("cancel"),
        requireText: clientName || "SİL",
        requireTextLabel: clientName
          ? t("delete.requireLabel", { name: clientName })
          : t("delete.requireLabelFallback"),
      });
      if (!ok) return;

      setDeletingClient(true);

      // Alt kayıtlar DB FK cascade ile atomik silinir — service_role, tenant+client kapsamlı.
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const cascadeRes = await fetch(`/api/clients/${clientId}/cascade-delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
      });
      if (!cascadeRes.ok) {
        console.error("Danışan silme hatası");
        showToast({ title: t("toast.failTitle"), message: t("toast.deleteClientFailed"), type: "error" });
        return;
      }
      // F5: DB silme başarılı; storage temizliği kısmen başarısız olabilir (warnings).
      const cascadeJson = (await cascadeRes.json().catch(() => ({}))) as { warnings?: string[] };
      if (Array.isArray(cascadeJson.warnings) && cascadeJson.warnings.length > 0) {
        showToast({ title: t("toast.clientDeletedTitle"), message: t("toast.cleanupWarning"), type: "warning" });
      }

      // Cold refetch/skeleton yerine: silinen danışanı liste cache'inden in-place çıkar
      // (toplu silmeyle aynı davranış) → listeye dönünce güncel liste anında görünür.
      removeClientFromDanisanListCache(tenantId, clientId);
      router.push("/danisan-yolculugu/liste");
    } catch (err) {
      console.error("Danışan silme hatası:", err);
      showToast({ title: t("toast.failTitle"), message: t("toast.deleteClientFailed"), type: "error" });
    } finally {
      deleteBusyRef.current = false;
      setDeletingClient(false);
    }
  }

  // ── Loading / not-found states ──────────────────────────────────────────────
  if (loading) {
    return (
      <main className={dyp.page}>
        <DypBackdrop />
        <div className={`${dyp.wrap} ${dyp.wrapWide} animate-pulse`} aria-busy="true">
          {/* Hero iskeleti */}
          <div className="mb-3 flex items-center gap-3.5 rounded-[22px] border border-white/80 bg-white/80 p-3.5 shadow-lg">
            <div className="h-[68px] w-[68px] flex-shrink-0 rounded-[20px] bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-6 w-56 rounded bg-slate-200" />
              <div className="h-3 w-full max-w-md rounded bg-slate-100" />
            </div>
          </div>
          {/* Sekme + içerik iskeleti */}
          <div className="rounded-[20px] border border-white/78 bg-white/85 p-3.5 shadow-lg">
            <div className="mb-4 flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 w-24 rounded-xl bg-slate-200" />
              ))}
            </div>
            <div className="h-[240px] rounded-2xl bg-slate-100" />
          </div>
        </div>
      </main>
    );
  }

  if (!client) {
    // D1 (DY-039): silinmiş/erişilemeyen danışanda kullanıcı çıkışsız kalmaz → listeye güvenli dönüş.
    // Ağ/sunucu hatası "bulunamadı"dan ayrılır ve yeniden denenebilir. Danışan verisi gösterilmez.
    const loadFailed = clientLoadError === "failed";
    return (
      <main className={dyp.page}>
        <DypBackdrop />
        <div className={dyp.wrap}>
        <div
          role={loadFailed ? "alert" : "status"}
          data-testid="client-unavailable"
          className={`${dyp.panel} mx-auto mt-6 w-full max-w-lg`}
        >
          <h1 className="text-lg font-extrabold">{loadFailed ? t("loadFailed") : t("notFound")}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {loadFailed ? t("loadFailedHint") : t("notFoundHint")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/danisan-yolculugu/liste"
              data-testid="client-back-to-list"
              className="inline-flex min-h-[44px] items-center rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-700 px-5 py-2.5 text-sm font-black text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              {t("backToList")}
            </Link>
            {loadFailed ? (
              <button
                type="button"
                data-testid="client-retry"
                onClick={() => setClientReloadKey((k) => k + 1)}
                className="inline-flex min-h-[44px] items-center rounded-2xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
              >
                {t("retryLoad")}
              </button>
            ) : null}
          </div>
        </div>
        </div>
      </main>
    );
  }

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();

  return (
    <main className={dyp.page}>
      <DypBackdrop />
      <div className={`${dyp.wrap} ${dyp.wrapWide}`}>

      {/* Kimlik kartı (premium) — "Danışanı Sil" kartın sağ üstünde; işlev aynı. */}
      <section className={dyp.idCard}>
        <div className={dyp.idTop}>
        <div className={`${dyp.idAvatar} ${dyp.idAvatarDesk}`}>
          {fullName ? fullName.charAt(0).toUpperCase() : "D"}
        </div>

        <div className="relative z-10 flex-1 min-w-0">
          <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className={`${dyp.kChip} inline-flex`}>
              {t("hero.badge")}
            </span>
            {/* KVKK onam durumu rozeti; key değişince (panelde yeni kayıt) yeniden yüklenir. */}
            <ClientConsentPanel key={`consent-badge-${consentRev}`} clientId={client.id} variant="badge" />
            {unpaidCharges && unpaidCharges.count > 0 ? (
              <button
                type="button"
                data-testid="client-unpaid-warning"
                onClick={() => { if (canSeeTab("ucretlendirme")) setActiveTab("ucretlendirme"); }}
                title={t("hero.unpaidDetail", { count: unpaidCharges.count, total: formatTry(unpaidCharges.total) })}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-700"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {t("hero.unpaid")}
                <span className="font-bold text-red-600">
                  · {t("hero.unpaidDetail", { count: unpaidCharges.count, total: formatTry(unpaidCharges.total) })}
                </span>
              </button>
            ) : null}
            <AstrologyClientStatus clientId={client.id} />
          </div>
            <button
              onClick={handleDeleteClient}
              disabled={deletingClient}
              className={`${dyp.btnDanger} shrink-0`}
            >
              <Trash2 aria-hidden />
              {deletingClient ? t("deleting") : t("deleteClient")}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`${dyp.idAvatar} ${dyp.idAvatarMob}`}>
              {fullName ? fullName.charAt(0).toUpperCase() : "D"}
            </div>
            <div className="min-w-0">
              <h1 className={dyp.idName}>
                {fullName || t("unnamed")}
              </h1>
              <p className={`${dyp.idSub} hidden sm:block`}>
                {t("hero.subtitle")}
              </p>
            </div>
          </div>
        </div>
        </div>
          <div className={dyp.infoGrid}>
            <Info label={t("info.phone")}       value={client.telefon}              color="#2563eb" tint="#eaf2ff" icon={DYP_INFO_ICONS.phone} />
            <Info label={t("info.birthDate")}   value={formatDateTR(client.dogum)}  color="#7c3aed" tint="#f1ecff" icon={DYP_INFO_ICONS.birthDate} />
            <Info label={t("info.meetingDate")} value={formatDateTR(client.gorusme)} color="#db2777" tint="#fdeef6" icon={DYP_INFO_ICONS.meetingDate} />
            <Info label={t("info.zodiac")}      value={localize("burc", client.burc)}  color="#ea580c" tint="#fff3e6" icon={DYP_INFO_ICONS.zodiac} />
            <Info label={t("info.bloodType")}   value={client.kan}                  color="#dc2626" tint="#ffeef0" icon={DYP_INFO_ICONS.bloodType} />
            <Info label={t("info.temperament")} value={localize("mizac", client.mizac)} color="#16a34a" tint="#eafaf0" icon={DYP_INFO_ICONS.temperament} />
          </div>
      </section>

      {isDemo && <DemoModuleBanner message={t("demo.banner")} />}

      {/* Tabs section */}
      <section className={dyp.panel}>

        {/* Tab bar — her boyutta WRAP: mobilde de tüm sekmeler ilk bakışta
            keşfedilebilir (yatay scroll'a bağımlı gizli sekme yok). */}
        <div className="relative mb-2">
          <div
            role="tablist"
            aria-label={t("a11y.tabs")}
            className={dyp.tabs}
          >
            {/* Sekmeler TEK KAYNAKTAN (lib/danisan/clientDetailTabs): yeni sekme kayda eklenince hem gerçek
                uzman hem demo vitrin ekranında otomatik görünür; izin-bağımlı sekme (Yaşam Hafızası) yalnız
                izinli kullanıcıya render edilir. */}
            {/* Madde 20: Beslenme + Randevular kırılmaz tek grup → satır sonu aralarına düşmez, gerekirse
                birlikte alt satıra geçer (DOM sırası/role=tab aynı). */}
            {groupClientDetailTabs(visibleTabs).map((group) =>
              group.length === 1 ? (
                <Tab key={group[0]!.id} label={t(`tab.${group[0]!.labelKey}`)} id={group[0]!.id} activeTab={activeTab} setActiveTab={setActiveTab} color={group[0]!.color} />
              ) : (
                <div key={group.map((g) => g.id).join("+")} role="none" data-tab-group={group.map((g) => g.id).join("+")} className="inline-flex flex-nowrap items-center gap-2">
                  {group.map((tab) => (
                    <Tab key={tab.id} label={t(`tab.${tab.labelKey}`)} id={tab.id} activeTab={activeTab} setActiveTab={setActiveTab} color={tab.color} />
                  ))}
                </div>
              ),
            )}
            {/* "Yaşam Hafızası'ndan Seç" aksiyonu UAT sonrası UI'dan kaldırıldı
                (işlev tamamlanınca ayrı fazda geri değerlendirilecek). MemoryPicker
                plumbing (state + mount) dormant korunuyor; Yaşam Hafızası sekmesi
                ve arama/görüntüleme aynen çalışır. */}
            {/* Ana "Word Raporu": Android dahil tüm cihazlarda Word indirme açık (2026-10-14 owner kararı;
                HD ve Astroloji kendi kurallarını korur). */}
            <button
              onClick={() => setWordDialogOpen(true)}
              disabled={generatingReport}
              aria-label={t("a11y.fullWordReport")}
              className={`${dyp.tab} ${dyp.tabNeutral} disabled:opacity-60`}
            >
              <FileText aria-hidden />
              {generatingReport ? t("report.generating") : stripLeadingGlyph(t("report.wordReport"))}
            </button>
          </div>
        </div>

        {/* Date-range report — collapsible (Word özelliği: Android dahil tüm cihazlarda açık — 2026-10-14 owner kararı) */}
        <div className={`${dyp.dateRange} ${dyp.skin}`}>
          <button
            type="button"
            onClick={() => setDrOpen((v) => !v)}
            aria-expanded={drOpen}
            className={dyp.dateRangeBtn}
          >
            <CalendarRange aria-hidden />
            <span>{stripLeadingGlyph(t("dateRange.title"))}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-slate-500">
              {stripLeadingGlyph(drOpen ? t("dateRange.close") : t("dateRange.open"))}
              <ChevronDown className={`h-4 w-4 transition-transform ${drOpen ? "rotate-180" : ""}`} aria-hidden />
            </span>
          </button>
          {drOpen && (
            <div className={`${dyp.dateRangeBody} flex flex-wrap items-end gap-2.5`}>
              <div className="min-w-[130px] flex-1 sm:flex-none">
                <label className={labelCls}>{t("dateRange.startLabel")}</label>
                <input type="date" value={drStart} onChange={(e) => setDrStart(e.target.value)} className={`${inputCls} w-full sm:w-[150px]`} />
              </div>
              <div className="min-w-[130px] flex-1 sm:flex-none">
                <label className={labelCls}>{t("dateRange.endLabel")}</label>
                <input type="date" value={drEnd} onChange={(e) => setDrEnd(e.target.value)} className={`${inputCls} w-full sm:w-[150px]`} />
              </div>
              <label className="flex min-h-[42px] w-full cursor-pointer items-center gap-2 self-end text-[13px] font-bold text-slate-700 sm:w-auto">
                <input type="checkbox" checked={drCharges} onChange={(e) => setDrCharges(e.target.checked)} />
                {t("dateRange.includeCharges")}
              </label>
              <button
                onClick={generateDateRangeReport}
                disabled={drBusy || !drStart || !drEnd}
                className={`${dyp.kBtnPrimary} w-full self-end sm:w-auto`}
              >
                {drBusy ? t("report.generating") : t("dateRange.generate")}
              </button>
            </div>
          )}
        </div>

        {wordDialogOpen && <WordReportDialog
          open={wordDialogOpen}
          clientId={clientId}
          busy={generatingReport}
          onClose={() => setWordDialogOpen(false)}
          onGenerate={(choice) => void generateWordReport(choice)}
        />}

        {/* Tab content area — açılan sekme DOM'da kalır (tekrar fetch yok),
            aktif olmayan `hidden` ile gizlenir → sekme geçişi anında; ağır
            sekmeler (Taşlar/Seanslar/Ödevler/Analizler/Yolculuk) lazy yüklenir. */}
        <div className={`${dyp.content} ${dyp.skin}`}>

          {openedTabs.has("genel") && (
          <div role="tabpanel" id="tabpanel-genel" aria-labelledby="tab-genel" hidden={activeTab !== "genel"}>
          {(() => {
              // Salt okunur mod sınıfları
              const roCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[14px] bg-slate-50 text-slate-800 cursor-default select-text";
              const roAreaCls = "w-full min-h-[54px] rounded-xl border border-slate-200 p-2.5 text-[14px] bg-slate-50 text-slate-800 cursor-default resize-none select-text";
              const fldCls   = isEditingGeneral ? inputCls    : roCls;
              const areaCls  = isEditingGeneral ? textareaCls : roAreaCls;
              return (
                <>
                  {/* Başlık + Word + düzenle/vazgeç (tek satır) */}
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className={dyp.kEyebrow}>{t("general.badge")}</span>
                      <h2 className={`${dyp.kTitle} mt-0.5`}>
                        {isEditingGeneral ? t("general.editTitle") : t("general.title")}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void generateTabWordReport("genel")} disabled={tabWordBusy} className={wordBtnCls}>
                        <FileText className="h-4 w-4" aria-hidden />
                        {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.genel"))}
                      </button>
                      {!isEditingGeneral ? (
                        <button
                          onClick={enterGeneralEdit}
                          disabled={notesState !== "ready"}
                          title={notesState === "loading" ? t("general.notesLoadingTitle") : notesState === "error" ? t("notesState.error") : undefined}
                          className={dyp.editBtn}
                        >
                          <PencilLine aria-hidden />
                          {stripLeadingGlyph(t("general.editButton"))}
                        </button>
                      ) : (
                        <button
                          onClick={cancelGeneralEdit}
                          className={`${dyp.kBtnSecondary} inline-flex items-center gap-1.5`}
                        >
                          {t("general.cancelButton")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bilgi alanları */}
                  <div className="mb-1 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
                    <div>
                      <label className={labelCls}>{t("form.ad")}</label>
                      <input readOnly={!isEditingGeneral} value={editAd} onChange={(e) => setEditAd(e.target.value)} className={fldCls} placeholder={t("form.ad")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.soyad")}</label>
                      <input readOnly={!isEditingGeneral} value={editSoyad} onChange={(e) => setEditSoyad(e.target.value.toLocaleUpperCase("tr-TR"))} className={fldCls} placeholder={t("form.soyad")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.telefon")}</label>
                      <input readOnly={!isEditingGeneral} value={editTelefon} onChange={(e) => setEditTelefon(e.target.value)} className={fldCls} placeholder={t("form.telefonPlaceholder")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.dogum")}</label>
                      <BirthDateInput value={editDogum} onChange={isEditingGeneral ? setEditDogum : () => {}} onInvalidChange={setEditDogumInvalid} maxDate={todayInZone()} className={fldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.kan")}</label>
                      {/* Kan grubu <option> metni = canonical değerdir (value attr yok) → DEĞİŞMEZ. */}
                      <select disabled={!isEditingGeneral} value={editKan} onChange={(e) => setEditKan(e.target.value)} className={`${fldCls} disabled:opacity-100`}>
                        <option value="">{t("form.select")}</option>
                        <option>A Rh+</option><option>A Rh-</option>
                        <option>B Rh+</option><option>B Rh-</option>
                        <option>AB Rh+</option><option>AB Rh-</option>
                        <option>0 Rh+</option><option>0 Rh-</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.mizac")}</label>
                      {/* value=canonical mizaç kodu (DEĞİŞMEZ); görünen etiket i18n. */}
                      <select disabled={!isEditingGeneral} value={editMizac} onChange={(e) => setEditMizac(e.target.value)} className={`${fldCls} disabled:opacity-100`}>
                        <option value="">{t("form.select")}</option>
                        <option value="safra">{t("mizac.safra")}</option>
                        <option value="sovdavi">{t("mizac.sovdavi")}</option>
                        <option value="dem">{t("mizac.dem")}</option>
                        <option value="balgam">{t("mizac.balgam")}</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3.5">
                    {notesLoading && (
                      <p className="text-[11px] font-bold text-slate-400">{t("general.notesLoading")}</p>
                    )}
                    {notesState === "error" && (
                      <NotesErrorPanel message={t("notesState.error")} retryLabel={t("notesState.retry")} onRetry={() => void loadNotes()} />
                    )}
                    <div>
                      <label className={labelCls}>{t("form.saglikNotu")}</label>
                      <textarea readOnly={!isEditingGeneral} value={saglikNotu} onChange={(e) => setSaglikNotu(e.target.value)} className={areaCls} placeholder={t("form.saglikNotuPlaceholder")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.adres")}</label>
                      <textarea readOnly={!isEditingGeneral} value={adres} onChange={(e) => setAdres(e.target.value)} className={areaCls} placeholder={t("form.adresPlaceholder")} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("form.oneriler")}</label>
                      <textarea readOnly={!isEditingGeneral} value={oneriler} onChange={(e) => setOneriler(e.target.value)} className={areaCls} placeholder={t("form.onerilerPlaceholder")} />
                    </div>
                    {isEditingGeneral && (
                      <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
                        <button onClick={saveAllGeneralInfo} disabled={savingAll} className={dyp.kBtnSave}>
                          {savingAll ? t("general.saving") : t("general.save")}
                        </button>
                        <button onClick={cancelGeneralEdit} className={dyp.kBtnSecondary}>
                          {t("cancel")}
                        </button>
                      </div>
                    )}
                  </div>

                  <NumerolojikOzetKart ad={editAd} soyad={editSoyad} dogum={editDogum} />

                  <ClientConsentPanel
                    clientId={client.id}
                    source="dy_detay"
                    collapsible
                    className="mt-4"
                    onChange={() => setConsentRev((n) => n + 1)}
                  />
                </>
              );
            })()}
          </div>
          )}

          {openedTabs.has("notlar") && (
          <div role="tabpanel" id="tabpanel-notlar" aria-labelledby="tab-notlar" hidden={activeTab !== "notlar"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("notlar")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.notlar"))}
                </button>
              </div>
              {/* DY-A: sunucu notları okunmadan (loading/error) sekme düzenlenemez → boş listeyle ezme yok. */}
              {notesState === "ready" ? (
                <NotesTab initialNotlar={noteText} onPersist={saveClientNotes} saving={savingClientNotes} />
              ) : notesState === "loading" ? (
                <p className="text-[13px] font-bold text-slate-400" aria-busy="true">{t("notesState.loading")}</p>
              ) : (
                <NotesErrorPanel message={t("notesState.error")} retryLabel={t("notesState.retry")} onRetry={() => void loadNotes()} />
              )}
          </div>
          )}

          {openedTabs.has("randevular") && (
          <div role="tabpanel" id="tabpanel-randevular" aria-labelledby="tab-randevular" hidden={activeTab !== "randevular"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("randevular")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.randevular"))}
                </button>
              </div>
              <AppointmentsTab
                clientId={client.id}
                clientName={fullName || t("clientFallback")}
                tenantId={tenantId}
                confirm={confirm}
                showToast={showToast}
                onGorusmeChange={(date) => setClient((prev) => (prev ? { ...prev, gorusme: date } : prev))}
                initialAppointmentId={deepLinkAppointmentId}
                onInitialAppointmentHandled={clearAppointmentDeepLink}
              />
          </div>
          )}

          {openedTabs.has("taslar") && (
          <div role="tabpanel" id="tabpanel-taslar" aria-labelledby="tab-taslar" hidden={activeTab !== "taslar"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("taslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.taslar"))}
                </button>
              </div>
              <StonesTab clientId={client.id} />
          </div>
          )}

          {openedTabs.has("seanslar") && (
          <div role="tabpanel" id="tabpanel-seanslar" aria-labelledby="tab-seanslar" hidden={activeTab !== "seanslar"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("seanslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.seanslar"))}
                </button>
              </div>
              <SessionsTab
                clientId={client.id}
                onGorusmeChange={(date) =>
                  setClient((prev) =>
                    prev
                      ? { ...prev, gorusme: !prev.gorusme || date > prev.gorusme ? date : prev.gorusme }
                      : prev,
                  )
                }
              />
          </div>
          )}

          {openedTabs.has("ucretlendirme") && (
          <div role="tabpanel" id="tabpanel-ucretlendirme" aria-labelledby="tab-ucretlendirme" hidden={activeTab !== "ucretlendirme"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("ucretlendirme")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.ucretlendirme"))}
                </button>
              </div>
              <UcretlendirmeTab clientId={client.id} onUnpaidChange={handleUnpaidChange} />
          </div>
          )}

          {openedTabs.has("odevler") && (
          <div role="tabpanel" id="tabpanel-odevler" aria-labelledby="tab-odevler" hidden={activeTab !== "odevler"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("odevler")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.odevler"))}
                </button>
              </div>
              <HomeworkTab clientId={client.id} />
          </div>
          )}

          {openedTabs.has("analizler") && (
          <div role="tabpanel" id="tabpanel-analizler" aria-labelledby="tab-analizler" hidden={activeTab !== "analizler"}>
              <div className="mb-2 flex justify-end">
                <button onClick={() => void generateTabWordReport("analizler")} disabled={tabWordBusy} className={wordBtnCls}>
                  <FileText className="h-4 w-4" aria-hidden />
                  {tabWordBusy ? t("report.generating") : stripLeadingGlyph(t("tabWord.analizler"))}
                </button>
              </div>
              <AnalizlerTab clientId={client.id} clientName={fullName || t("clientFallback")} />
          </div>
          )}

          {openedTabs.has("anamnez") && (
          <div role="tabpanel" id="tabpanel-anamnez" aria-labelledby="tab-anamnez" hidden={activeTab !== "anamnez"}>
            <AnamnezTab clientId={client.id} onOpenConsent={() => setActiveTab("genel")} />
          </div>
          )}

          {openedTabs.has("yolculuk") && (
          <div role="tabpanel" id="tabpanel-yolculuk" aria-labelledby="tab-yolculuk" hidden={activeTab !== "yolculuk"}>
            <YolculukTab
              clientId={client.id}
              tenantId={tenantId}
              clientName={fullName || t("clientFallback")}
              clientPhone={client.telefon}
              clientLastSession={client.gorusme ? formatDateTR(client.gorusme) : undefined}
              clientAd={client.ad}
              clientSoyad={client.soyad}
              clientDogum={client.dogum}
              onNavigate={setActiveTab}
            />
          </div>
          )}
          {openedTabs.has("hafiza") && canSeeTab("hafiza") && (
          <div role="tabpanel" id="tabpanel-hafiza" aria-labelledby="tab-hafiza" hidden={activeTab !== "hafiza"}>
            <ClientMemoryTab clientId={client.id} clientName={fullName || t("clientFallback")} />
          </div>
          )}
          {openedTabs.has("humandesign") && canSeeTab("humandesign") && (
          <div role="tabpanel" id="tabpanel-humandesign" aria-labelledby="tab-humandesign" hidden={activeTab !== "humandesign"}>
            <HumanDesignTab clientId={client.id} />
          </div>
          )}
          {openedTabs.has("beslenme") && (
          <div role="tabpanel" id="tabpanel-beslenme" aria-labelledby="tab-beslenme" hidden={activeTab !== "beslenme"}>
            <BeslenmeTab clientId={client.id} clientName={fullName || t("clientFallback")} isOwner={isBeslenmeOwner} />
          </div>
          )}
        </div>
        {yhPickerOpen && client ? (
          <MemoryPicker
            open={yhPickerOpen}
            onClose={() => setYhPickerOpen(false)}
            targetKind="report"
            fixedClient={{ id: client.id, name: fullName || t("clientFallback") }}
            onConfirmed={({ selectionGroupId, total }) => {
              setYhSelectionGroupId(selectionGroupId);
              setYhPickerOpen(false);
              showToast({ title: t("toast.addedTitle"), message: t("toast.yhAdded", { count: total }), type: "success" });
            }}
          />
        ) : null}
      </section>
      </div>

    </main>
  );
}

// Suspense sarmalayıcı: useSearchParams kullanan client component'in prerender sırasında
// build hatası vermemesi için ZORUNLU (Next 16 "Missing Suspense boundary with useSearchParams").
// Fallback, sayfanın kendi loading iskeleti devralana kadar aynı gradient zemini gösterir.
function ClientDetailFallback() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 sm:p-3.5" aria-busy="true" />
  );
}

export default function ClientDetailPage() {
  return (
    <Suspense fallback={<ClientDetailFallback />}>
      <ClientDetailPageInner />
    </Suspense>
  );
}

// ─── AppointmentsTab ──────────────────────────────────────────────────────────
function AppointmentsTab({
  clientId, clientName, tenantId, confirm, showToast, onGorusmeChange,
  initialAppointmentId, onInitialAppointmentHandled,
}: {
  clientId: string;
  clientName: string;
  tenantId: string | null;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  showToast: ReturnType<typeof useToast>["showToast"];
  /** Sunucu son görüşme tarihini ilerlettiyse hero özetini tazeler. */
  onGorusmeChange?: (date: string) => void;
  /** §4.2 Bildirim derin bağlantısı (?randevu=<id>): yüklenince bu randevu seçilir. */
  initialAppointmentId?: string | null;
  /** Derin bağlantı işlendi (bulundu/bulunamadı) → üst bileşen URL parametresini temizler. */
  onInitialAppointmentHandled?: () => void;
}) {
  const t = useTranslations("clients.detail");
  const deleteConfirm = useDeleteConfirm();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [apptLoaded, setApptLoaded] = useState(false);
  const handledInitialRef = useRef<string | null>(null);
  const closeAppointmentModal = useCallback(() => setSelectedAppointment(null), []);
  useModalBehavior(selectedAppointment !== null, closeAppointmentModal);

  const [title, setTitle] = useState(() => t("appt.defaultTitle"));
  const [notes, setNotes] = useState("");
  // MOBİL-01/02: seans sayısı ve "kaç günde bir" ham string tutulur ki alan
  // boşaltılabilsin/çok haneli yazılabilsin; geçerli tam sayı blur + submit'te netleşir.
  const [sessionCount, setSessionCount] = useState("1");
  const [planningMode, setPlanningMode] = useState<PlanningMode>("auto");
  const [date, setDate] = useState("");
  const [dayInterval, setDayInterval] = useState("1");
  const [manualDates, setManualDates] = useState<string[]>([""]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    loadAppointments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  async function loadAppointments() {
    if (!tenantId) return;
    setLoading(true);
    const apptToken = readSessionToken();
    const apptRes = await fetch(`/api/clients/${clientId}/appointments`, {
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(apptToken ? { "x-session-token": apptToken } : {}),
      },
    });
    if (!apptRes.ok) { showToast({ title: t("toast.failTitle"), message: t("appt.loadFailed"), type: "error" }); setLoading(false); return; }
    const apptJson = (await apptRes.json()) as { appointments?: Appointment[] };
    setAppointments(apptJson.appointments ?? []);
    setApptLoaded(true);
    setLoading(false);
  }

  // §4.2 Derin bağlantı: liste yüklenince ?randevu=<id> eşleşirse detay modalı açılır; yoksa uyarı.
  useEffect(() => {
    if (!initialAppointmentId) {
      handledInitialRef.current = null;
      return;
    }
    if (!apptLoaded || handledInitialRef.current === initialAppointmentId) return;
    handledInitialRef.current = initialAppointmentId;
    const target = appointments.find((a) => a.id === initialAppointmentId) ?? null;
    runInEffect(() => {
      if (target) {
        setSelectedAppointment(target);
      } else {
        showToast({
          title: t("toast.warningTitle"),
          message: t.has("appt.notFound") ? t("appt.notFound") : "Randevu bulunamadı.",
          type: "warning",
        });
      }
      onInitialAppointmentHandled?.();
    });
  }, [initialAppointmentId, apptLoaded, appointments, showToast, t, onInitialAppointmentHandled]);

  // Ham string saklanır (boş/ara değerlere izin verilir). manualDates yalnız değer
  // geçerli pozitif tam sayıya çözüldüğünde yeniden boyutlanır → boşaltınca veri kaybı olmaz.
  function handleSessionCountChange(raw: string) {
    setSessionCount(raw);
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= 1) {
      setManualDates((old) => { const next = [...old]; while (next.length < n) next.push(""); return next.slice(0, n); });
    }
  }

  // Sayı inputu boş/geçersiz/<1 bırakılırsa blur'da 1'e normalize edilir.
  function normalizeCountInput(setter: (v: string) => void) {
    return (raw: string) => setter(String(Math.max(1, Math.floor(Number(raw)) || 1)));
  }

  function updateManualDate(index: number, value: string) {
    setManualDates((old) => { const next = [...old]; next[index] = value; return next; });
  }

  function resetForm() {
    setTitle(t("appt.defaultTitle"));
    setNotes("");
    setSessionCount("1");
    setPlanningMode("auto");
    setDate("");
    setDayInterval("1");
    setManualDates([""]);
    setEditingId(null);
    setShowForm(false);
  }

  // "İptal Et" → önce global confirm, sonra durum PATCH. Vazgeçilirse API çağrısı yok.
  async function requestCancelAppointment(id: string) {
    const ok = await confirm({
      title: t("appt.cancelConfirm.title"),
      message: t("appt.cancelConfirm.message"),
      confirmText: t("appt.cancelConfirm.confirm"),
      cancelText: t("cancel"),
      tone: "danger",
    });
    if (!ok) return;
    await updateAppointmentStatus(id, "iptal");
  }

  // "Tamamlandı" → önce global confirm, sonra durum PATCH. (Danışanın son görüşme tarihi de güncellenir.)
  async function requestCompleteAppointment(id: string) {
    // DY-A: gelecekteki randevu tamamlanamaz (sunucu da 409 döner) → önce uyar.
    const apt = appointments.find((a) => a.id === id);
    if (apt && isAppointmentInFuture(apt.appointment_date)) {
      showToast({ title: t("toast.warningTitle"), message: t("appt.futureComplete"), type: "warning" });
      return;
    }
    const ok = await confirm({
      title: t("appt.completeConfirm.title"),
      message: t("appt.completeConfirm.message"),
      confirmText: t("appt.completeConfirm.confirm"),
      cancelText: t("cancel"),
      tone: "success",
    });
    if (!ok) return;
    await updateAppointmentStatus(id, "tamamlandi");
  }

  // WEB-07: Randevu her statüde düzenlenebilir. Mevcut form edit modunda TEK kaydı günceller;
  // danışan sabit, durum değişmez, seri/tekrar kontrolleri gizlenir.
  function openEditAppointment(appt: Appointment) {
    const d = new Date(appt.appointment_date);
    const p = (x: number) => String(x).padStart(2, "0");
    setEditingId(appt.id);
    setTitle(appt.title ?? "");
    setNotes(appt.notes ?? "");
    setSessionCount("1");
    setPlanningMode("auto");
    setDayInterval("1");
    setManualDates([""]);
    setDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
    setSelectedAppointment(null);
    setShowForm(true);
  }

  async function createAppointments() {
    if (!tenantId) return;

    // ── EDIT modu: yalnız seçili TEK randevu güncellenir (title/notes/appointment_date) ──
    if (editingId) {
      if (!date) { showToast({ title: t("appt.missingTitle"), message: t("appt.dateRequired"), type: "warning" }); return; }
      if (isPastCalendarDay(date)) {
        const ok = await confirm({
          title: t("appt.pastConfirm.title"),
          message: t("appt.pastConfirm.message"),
          confirmText: t("appt.pastConfirm.confirm"),
          cancelText: t("cancel"),
          tone: "warning",
        });
        if (!ok) return;
      }
      // Satış öncesi kapanış: tamamlanmış randevu geleceğe taşınamaz (sunucu da 409 ile korur).
      const editing = appointments.find((a) => a.id === editingId);
      const newIso = new Date(date).toISOString();
      const dateChanged = !!editing && new Date(newIso).getTime() !== new Date(editing.appointment_date).getTime();
      if (editing?.status === "tamamlandi" && dateChanged && isAppointmentInFuture(newIso)) {
        showToast({ title: t("toast.failTitle"), message: t("appt.completedFutureMove"), type: "error" });
        return;
      }
      setSaving(true);
      const editToken = readSessionToken();
      const res = await fetch(`/api/appointments/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": readYasamUser()?.id ?? "",
          ...(editToken ? { "x-session-token": editToken } : {}),
        },
        body: JSON.stringify({ title: title || t("appt.defaultTitle"), notes: notes || null, appointment_date: new Date(date).toISOString() }),
      });
      if (!res.ok) {
        let serverMsg: string | null = null;
        if (res.status === 409 || res.status === 400) {
          try { serverMsg = ((await res.json()) as { error?: string }).error ?? null; } catch { serverMsg = null; }
        }
        showToast({ title: t("toast.failTitle"), message: serverMsg ?? t("appt.updateFailed"), type: "error" });
        setSaving(false);
        return;
      }
      resetForm();
      await loadAppointments();
      setSaving(false);
      showToast({ title: t("toast.successTitle"), message: t("appt.updated"), type: "success" });
      return;
    }

    const count = Math.max(1, Math.floor(Number(sessionCount)) || 1);
    let rows: { tenant_id: string; client_id: string; title: string; notes: string | null; appointment_date: string; status: AppointmentStatus }[] = [];

    if (planningMode === "auto") {
      if (!date) { showToast({ title: t("appt.missingTitle"), message: t("appt.startDateRequired"), type: "warning" }); return; }
      const interval = Math.max(1, Math.floor(Number(dayInterval)) || 1);
      const startDate = new Date(date);
      const baseTitle = title || t("appt.defaultTitle");
      rows = Array.from({ length: count }).map((_, i) => {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i * interval);
        return { tenant_id: tenantId, client_id: clientId, title: count > 1 ? `${baseTitle} ${i + 1}/${count}` : baseTitle, notes: notes || null, appointment_date: d.toISOString(), status: "bekliyor" };
      });
    } else {
      const filled = manualDates.slice(0, count);
      const emptyIdx = filled.findIndex((x) => !x);
      if (emptyIdx !== -1) { showToast({ title: t("appt.missingTitle"), message: t("appt.nthDateRequired", { n: emptyIdx + 1 }), type: "warning" }); return; }
      const baseTitle = title || t("appt.defaultTitle");
      rows = filled.map((d, i) => ({ tenant_id: tenantId, client_id: clientId, title: count > 1 ? `${baseTitle} ${i + 1}/${count}` : baseTitle, notes: notes || null, appointment_date: new Date(d).toISOString(), status: "bekliyor" }));
    }

    // Geçmiş takvim günü (dün ve öncesi) seçilmişse → uyarı + açık onay; form verisi korunur.
    const anyPast = planningMode === "auto"
      ? isPastCalendarDay(date)
      : manualDates.slice(0, count).some((d) => isPastCalendarDay(d));
    if (anyPast) {
      const ok = await confirm({
        title: t("appt.pastConfirm.title"),
        message: t("appt.pastConfirm.message"),
        confirmText: t("appt.pastConfirm.confirm"),
        cancelText: t("cancel"),
        tone: "warning",
      });
      if (!ok) return;
    }

    setSaving(true);
    const apptToken = readSessionToken();
    const apptHeaders = {
      "Content-Type": "application/json",
      "x-user-id": readYasamUser()?.id ?? "",
      ...(apptToken ? { "x-session-token": apptToken } : {}),
    };
    let apptErr = false;
    for (const row of rows) {
      const res = await fetch(`/api/clients/${clientId}/appointments`, {
        method: "POST",
        headers: apptHeaders,
        body: JSON.stringify({ title: row.title, notes: row.notes, appointment_date: row.appointment_date, status: row.status }),
      });
      if (!res.ok) { apptErr = true; break; }
    }
    if (apptErr) { showToast({ title: t("toast.failTitle"), message: t("appt.saveError"), type: "error" }); setSaving(false); return; }
    resetForm();
    await loadAppointments();
    setSaving(false);
  }

  async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
    const statusToken = readSessionToken();
    const statusRes = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(statusToken ? { "x-session-token": statusToken } : {}),
      },
      body: JSON.stringify({ status }),
    });
    const statusJson = (await statusRes.json().catch(() => ({}))) as { code?: string; gorusme?: string };
    if (!statusRes.ok) {
      const message = statusJson.code === "APPOINTMENT_IN_FUTURE" ? t("appt.futureComplete") : t("appt.statusUpdateFailed");
      showToast({ title: t("toast.failTitle"), message, type: "error" });
      return;
    }
    setSelectedAppointment((old) => old && old.id === id ? { ...old, status } : old);

    // Z-3 / DY-A: clients.gorusme ilerletmesi artık SUNUCUDA (İstanbul günü, yalnız geçmiş
    // randevu, asla geri almaz). Yanıtta yeni değer varsa hero + liste önbelleği tazelenir.
    if (typeof statusJson.gorusme === "string" && statusJson.gorusme) {
      onGorusmeChange?.(statusJson.gorusme);
      invalidateDanisanListCache();
    }

    await loadAppointments();
  }

  async function deleteAppointment(id: string) {
    const ok = await deleteConfirm({
      title: t("appt.delete.title"),
      message: t("appt.delete.message"),
    });
    if (!ok) return;
    const delToken = readSessionToken();
    const delRes = await fetch(`/api/appointments/${id}`, {
      method: "DELETE",
      headers: {
        "x-user-id": readYasamUser()?.id ?? "",
        ...(delToken ? { "x-session-token": delToken } : {}),
      },
    });
    if (!delRes.ok) { showToast({ title: t("toast.failTitle"), message: t("appt.deleteFailed"), type: "error" }); return; }
    setSelectedAppointment(null);
    await loadAppointments();
  }

  // FA-44: "Yaklaşan" = bekliyor && gelecekte; "Sonuç girilmedi" = bekliyor && geçmişte (türetilmiş).
  const apptCounts = countAppointments(appointments);
  const upcomingCount = apptCounts.upcoming;
  const pastCount = apptCounts.past;

  return (
    <div>
      {/* Header */}
      <div className={`${dyp.kHeader} mb-3.5 flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <span className={dyp.kEyebrow}>{t("appt.badge")}</span>
          <h2 className={`${dyp.kTitle} mt-1 mb-0.5`}>{t("appt.title")}</h2>
          <p className={dyp.kDesc}>{t("appt.subtitle", { name: clientName })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            <MiniStat label={t("appt.stat.total")}    value={appointments.length} color="#db2777" bg="#fdf2f8" />
            <MiniStat label={t("appt.stat.upcoming")} value={upcomingCount}        color="#16a34a" bg="#f0fdf4" />
            {apptCounts.noResult > 0 && (
              <MiniStat label={t("appt.stat.noResult")} value={apptCounts.noResult} color="#b45309" bg="#fffbeb" />
            )}
            <MiniStat label={t("appt.stat.past")}     value={pastCount}            color="#64748b" bg="#f8fafc" />
          </div>
          <button
            type="button"
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            className={showForm ? dyp.kBtnSecondary : dyp.kBtnPrimary}
          >
            {showForm ? t("appt.toggleClose") : t("appt.toggleOpen")}
          </button>
        </div>
      </div>

      {/* New appointment form */}
      {showForm && (
        <div className={`${dyp.kForm} mb-3.5`}>
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className={dyp.kEyebrow}>{editingId ? t("appt.form.editBadge") : t("appt.form.newBadge")}</span>
              <h3 className={`${dyp.kSubtitle} mt-1`}>{editingId ? t("appt.form.editTitle") : t("appt.form.newTitle")}</h3>
            </div>
            <button type="button" onClick={resetForm}
              className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}>
              {t("cancel")}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <label className={labelCls}>{t("appt.form.titleLabel")}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={t("appt.form.titlePlaceholder")} />
            </div>
            <div>
              <label className={labelCls}>{t("appt.form.noteLabel")}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${textareaCls} min-h-[90px]`} placeholder={t("appt.form.notePlaceholder")} />
            </div>
            {/* Seri/tekrar kontrolleri — edit modunda gizli (tek kayıt) */}
            {!editingId && (
            <>
            <div>
              <label className={labelCls}>{t("appt.form.sessionCount")}</label>
              <input type="number" min={1} step={1} value={sessionCount} onChange={(e) => handleSessionCountChange(e.target.value)} onBlur={(e) => normalizeCountInput(setSessionCount)(e.target.value)} className={inputCls} />
            </div>

            <div className={dyp.kField}>
              <label className={labelCls}>{t("appt.form.planningType")}</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setPlanningMode("auto")}
                  className={planningMode === "auto" ? dyp.kBtnPrimary : dyp.kBtnSecondary}>
                  {t("appt.form.autoInterval")}
                </button>
                <button onClick={() => setPlanningMode("manual")}
                  className={planningMode === "manual" ? dyp.kBtnPrimary : dyp.kBtnSecondary}>
                  {t("appt.form.manualDates")}
                </button>
              </div>
            </div>
            </>
            )}

            {(editingId || planningMode === "auto") && (
              <>
                <div>
                  <label className={labelCls}>{editingId ? t("appt.form.dateTime") : t("appt.form.startDate")}</label>
                  <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
                {!editingId && (
                <div>
                  <label className={labelCls}>{t("appt.form.everyNDays")}</label>
                  <input type="number" min={1} step={1} value={dayInterval} onChange={(e) => setDayInterval(e.target.value)} onBlur={(e) => normalizeCountInput(setDayInterval)(e.target.value)} className={inputCls} />
                </div>
                )}
              </>
            )}

            {!editingId && planningMode === "manual" && (
              <div className={dyp.kField}>
                <strong className={dyp.kFieldTitle}>{t("appt.form.appointmentDates")}</strong>
                {Array.from({ length: Math.max(1, Math.floor(Number(sessionCount)) || 1) }).map((_, i) => (
                  <div key={i} className="mt-2.5">
                    <label className={labelCls}>{t("appt.form.nthAppointment", { n: i + 1 })}</label>
                    <input type="datetime-local" value={manualDates[i] || ""} onChange={(e) => updateManualDate(i, e.target.value)} className={inputCls} />
                  </div>
                ))}
              </div>
            )}

            <button onClick={createAppointments} disabled={saving} className={`${dyp.kBtnSave} w-full`}>
              {saving ? t("appt.form.saving") : editingId ? t("appt.form.update") : t("appt.form.create")}
            </button>
          </div>
        </div>
      )}

      {/* Appointment list */}
      <div className={dyp.kCard}>
        <h3 className={`${dyp.kSubtitle} mb-3`}>{t("appt.listTitle")}</h3>

        {loading ? (
          <p className={dyp.kMeta}>{t("appt.loading")}</p>
        ) : appointments.length === 0 ? (
          <div className={dyp.kEmpty}>
            {t("appt.empty")}
          </div>
        ) : (
          <div className="grid gap-2.5">
            {appointments.map((item, index) => {
              const si = getAppointmentStatusInfo(item, t);
              const leftBorder = getLeftBorderClass(item.status, item.appointment_date);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedAppointment(item)}
                  className={`flex w-full items-start gap-2.5 rounded-xl border border-[#e3e7ee] border-l-4 bg-white p-3 text-left transition-colors hover:bg-[#f8f9fb] ${leftBorder}`}
                >
                  <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg border border-[#d4dae3] bg-[#f2f4f7] text-[12.5px] font-bold text-[#1f3050]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[14.5px] font-bold text-[#0f1d36]">{item.title || t("appt.titleFallback")}</div>
                      <span className="rounded-full px-2 py-1 text-[11px] font-black"
                        style={{ background: si.bg, color: si.color, border: `1px solid ${si.border}` }}>
                        {si.label}
                      </span>
                    </div>
                    <div className="mt-[3px] text-[13px] font-semibold text-[#2c5aa0]">{formatDateTimeTR(item.appointment_date)}</div>
                    {item.notes && (
                      <div className={`${dyp.kField} ${dyp.kFieldText} mt-1.5`}>{item.notes}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Appointment detail modal */}
      {selectedAppointment && (
        <div
          className={`${dyp.kOverlay} fixed inset-0 z-[100] flex items-center justify-center overscroll-contain p-3 sm:p-4`}
          onClick={() => setSelectedAppointment(null)}
        >
          {/* Mobil: kart viewport'a sığar; başlık ve aksiyon çubuğu sabit, yalnız içerik kayar
              → Tamamlandı / İptal / Sil her ekran boyunda erişilebilir (satış öncesi kapanış). */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="appt-modal-title"
            className={`${dyp.kModal} flex max-h-[calc(100dvh-1.5rem)] w-[min(560px,100%)] flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${dyp.kModalHead} flex shrink-0 items-start justify-between gap-3`}>
              <div className="min-w-0">
                <span className={dyp.kEyebrow}>{t("appt.modal.badge")}</span>
                <h3 id="appt-modal-title" className={`${dyp.kTitle} mt-1 break-words`}>{selectedAppointment.title || t("appt.titleFallback")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                aria-label={t("appt.modal.close")}
                className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg border border-[#d4dae3] bg-white text-[22px] font-semibold leading-none text-[#1f3050] hover:bg-[#f2f4f7]"
              >
                ×
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-[14px] sm:p-[18px]">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                <div className={`${dyp.kField} grid gap-1`}>
                  <span className={dyp.kMeta}>{t("appt.modal.client")}</span>
                  <strong className="text-[14px] text-[#0f1d36]">{clientName}</strong>
                </div>
                <div className={`${dyp.kField} grid gap-1`}>
                  <span className={dyp.kMeta}>{t("appt.modal.dateTime")}</span>
                  <strong className="text-[14px] text-[#0f1d36]">{formatDateTimeTR(selectedAppointment.appointment_date)}</strong>
                </div>
                <div className="grid gap-1 rounded-[10px] px-3 py-2.5"
                  style={{ borderColor: getAppointmentStatusInfo(selectedAppointment, t).border, background: getAppointmentStatusInfo(selectedAppointment, t).bg, border: `1px solid ${getAppointmentStatusInfo(selectedAppointment, t).border}` }}>
                  <span className={dyp.kMeta}>{t("appt.modal.status")}</span>
                  <strong className="text-[14px]" style={{ color: getAppointmentStatusInfo(selectedAppointment, t).color }}>
                    {getAppointmentStatusInfo(selectedAppointment, t).label}
                  </strong>
                </div>
              </div>

              <div className={dyp.kField}>
                <span className={`${dyp.kFieldTitle} mb-1.5 block`}>{t("appt.modal.note")}</span>
                <p className={`${dyp.kFieldText} whitespace-pre-wrap break-words`}>{selectedAppointment.notes || t("appt.modal.noNote")}</p>
              </div>
            </div>

            <div className={`${dyp.kModalFoot} grid shrink-0 gap-2.5`}>
              {/* WEB-07: Düzenle tüm statülerde açık (statü değişmeden title/notes/tarih güncellenir). */}
              <button type="button" onClick={() => openEditAppointment(selectedAppointment)}
                className={`${dyp.kBtnSecondary} w-full`}>
                {t("appt.modal.edit")}
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => void requestCompleteAppointment(selectedAppointment.id)} className={`${dyp.kBtnSave} min-h-[44px]`}>{t("appt.modal.complete")}</button>
                <button type="button" onClick={() => void requestCancelAppointment(selectedAppointment.id)} className={`${dyp.kBtnDanger} min-h-[44px]`}>{t("appt.modal.cancel")}</button>
                <button type="button" onClick={() => deleteAppointment(selectedAppointment.id)}
                  className={`${dyp.kBtnDangerSolid} min-h-[44px]`}>
                  {t("appt.modal.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function NotesErrorPanel({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div role="alert" className={`${dyp.kAlertDanger} flex flex-wrap items-center justify-between gap-2`}>
      <p className="text-[12.5px] font-semibold">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}
      >
        {retryLabel}
      </button>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value?: string; color?: string; tint?: string; icon: LucideIcon }) {
  return (
    <div
      className={dyp.infoTile}
    >
      <span className={dyp.infoIcon} aria-hidden><Icon strokeWidth={1.9} /></span>
      <span className={dyp.infoBody}>
        <span className={dyp.infoLabel}>{label}</span>
        <strong className={dyp.infoValue}>{value || "-"}</strong>
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number; color?: string; bg?: string }) {
  return (
    <div className={`${dyp.kStat} min-w-[74px]`}>
      <strong className={`${dyp.kStatValue} block`}>{value}</strong>
      <span className={dyp.kStatLabel}>{label}</span>
    </div>
  );
}

function Tab({ label, id, activeTab, setActiveTab }: {
  label: string; id: string; activeTab: string; setActiveTab: (id: string) => void; color?: string;
}) {
  const active = activeTab === id;
  const Icon = DYP_TAB_ICONS[id];
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${id}`}
      id={`tab-${id}`}
      onClick={() => setActiveTab(id)}
      className={`${dyp.tab} snap-start`}
    >
      {Icon ? <Icon aria-hidden strokeWidth={2} /> : null}
      {stripLeadingGlyph(label)}
    </button>
  );
}

// ─── NumerolojikOzetKart ──────────────────────────────────────────────────────
// Genel Bilgiler sekmesinde anlık numeroloji özeti.
// Saf hesaplama — DB çağrısı yok, hata olursa sessizce "—" gösterir.

function NumerolojikOzetKart({
  ad, soyad, dogum,
}: {
  ad: string;
  soyad: string;
  dogum: string;
}) {
  const t = useTranslations("clients.detail");
  // element canonical DATA anahtarı ("Hava" vb.) → yerelleştirilmiş etiket; DATA aynen kalır.
  const localizeEl = (v: string): string => (t.has(`element.${v}`) ? t(`element.${v}`) : v);
  if (!dogum.trim()) return null;

  const firstName = ad.trim();
  const lastName  = soyad.trim();
  const hasName   = Boolean(firstName || lastName);

  // ── Temel sayılar ─────────────────────────────────────────────────────────
  let hayatYolu     = "—";
  let kaderSayisi   = "—";
  let ruhSayisi     = "—";
  let kisilikSayisi = "—";
  let kisiselYil    = "—";

  try { hayatYolu   = calcHayatYolu(dogum).display; }  catch { /* sessiz */ }
  try { kisiselYil  = calcKisiselYil(dogum).display; } catch { /* sessiz */ }
  if (hasName) {
    try { kaderSayisi   = calcIfadeSayisi(firstName, lastName).display; } catch { /* sessiz */ }
    try { ruhSayisi     = calcAnaKulvar(firstName, lastName).display; }   catch { /* sessiz */ }
    try { kisilikSayisi = calcYanKulvar(firstName, lastName).display; }   catch { /* sessiz */ }
  }

  // ── Güncel yaş ────────────────────────────────────────────────────────────
  let guncelYas: number | null = null;
  try {
    const [y, m, d] = dogum.split("-").map(Number);
    if (y && m && d) {
      const today = new Date();
      const birth = new Date(y, m - 1, d);
      let age = today.getFullYear() - birth.getFullYear();
      const dm = today.getMonth() - birth.getMonth();
      if (dm < 0 || (dm === 0 && today.getDate() < birth.getDate())) age--;
      guncelYas = age >= 0 ? age : null;
    }
  } catch { /* sessiz */ }

  const coreItems = [
    { label: t("num.anaKulvar"),   value: ruhSayisi,     color: "#16a34a" },
    { label: t("num.yanKulvar"),   value: kisilikSayisi, color: "#db2777" },
    { label: t("num.ifadeSayisi"), value: kaderSayisi,   color: "#2563eb" },
    { label: t("num.hayatYolu"),   value: hayatYolu,     color: "#7c3aed" },
    { label: t("num.kisiselYil"),  value: kisiselYil,    color: "#ea580c" },
    ...(guncelYas != null ? [{ label: t("num.guncelYas"), value: String(guncelYas), color: "#64748b" }] : []),
  ];

  // ── Element dağılımı — parseBirthDate DD.MM.YYYY ister ───────────────────
  const dogumTR = isoToDDMMYYYY(dogum);

  let elementCounts: Partial<Record<string, number>> = {};
  let dominantElement = "";
  if (dogumTR) {
    try {
      const res = calcElementleri(dogumTR);
      ELEMENT_ORDER.forEach((e) => { elementCounts[e] = res.counts[e] ?? 0; });
      dominantElement = res.key || "";
    } catch { /* sessiz */ }
  }
  const hasElements = Object.keys(elementCounts).length > 0;

  // ── En yakın zirve yaşı ───────────────────────────────────────────────────
  let nearestPeakLabel = "";
  if (dogumTR) {
    try {
      const zirve = calcZirveYillari(dogumTR);
      if (zirve && zirve.peaks.length > 0) {
        // Yaşını bilmesek de tüm zirveleri göster — birincisini al
        const p = zirve.peaks[0];
        // Zirve yaşı: iki metot (Metot 1 — İlk Zirve Sayısına Göre · Metot 2 — Hayat Yoluna Göre).
        nearestPeakLabel = t("num.peakLabel", { index: p.index, age1: p.yasMetot1 ?? p.age, age2: p.yasMetot2 ?? p.age, topic: p.topic });
        // Varsa sonraki zirveleri de kontrol et — en küçük yaşlı birincisi zaten
      }
    } catch { /* sessiz */ }
  }

  return (
    <div className={`${dyp.kCardMuted} mt-4`}>
      {/* Başlık */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-base text-[#0f6e6e]">∞</span>
        <span className={dyp.kSubtitle}>{t("num.title")}</span>
        <span className={`${dyp.kChip} ml-auto inline-flex items-center`}>
          {t("num.readonly")}
        </span>
        {!hasName && (
          <span className={dyp.kMeta}>
            {t("num.needName")}
          </span>
        )}
      </div>

      {/* 5 temel sayı */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {coreItems.map(({ label, value }) => (
          <div
            key={label}
            className={`${dyp.kStat} flex flex-col items-center`}
          >
            <span className="text-[20px] font-extrabold leading-none text-[#13284b]">
              {value}
            </span>
            <span className={`${dyp.kStatLabel} mt-1.5 text-center leading-tight`}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Element dağılımı */}
      {hasElements && (
        <div className={`${dyp.kField} mt-2.5 flex flex-wrap items-center gap-1.5`}>
          <span className={dyp.kFieldTitle}>{t("num.element")}</span>
          {/* element adları ("Hava"/"Su"/"Ateş"/"Toprak") persisted DATA key'idir — DEĞİŞMEZ. */}
          {ELEMENT_ORDER.map((name) => {
            return (
              <span
                key={name}
                className={`${dyp.kChip} inline-flex items-center gap-1`}
              >
                {localizeEl(name)} <strong>{elementCounts[name] ?? 0}</strong>
              </span>
            );
          })}
          {dominantElement && (
            <span className={`${dyp.kMeta} ml-auto`}>
              {t("num.dominant")} {localizeEl(dominantElement)}
            </span>
          )}
        </div>
      )}

      {/* En yakın zirve */}
      {nearestPeakLabel && (
        <div className={`${dyp.kField} mt-1.5 flex items-center gap-1.5`}>
          <span className={dyp.kFieldTitle}>{t("num.peak")}</span>
          <span className="text-[12.5px] font-semibold text-[#1f3050]">{nearestPeakLabel}</span>
        </div>
      )}

      {/* Deeplink */}
      <div className="mt-3 flex justify-end">
        <Link
          href={buildAnalizHref(dogum, firstName, lastName)}
          className={`${dyp.kBtnSecondary} inline-flex items-center gap-1.5`}
        >
          {t("num.fullAnalysis")}
        </Link>
      </div>
    </div>
  );
}

function buildAnalizHref(dogum: string, ad: string, soyad: string): string {
  const p = new URLSearchParams();
  if (dogum) p.set("dogum", dogum);
  if (ad)    p.set("ad",   ad);
  if (soyad) p.set("soyad", soyad);
  return `/numeroloji/analiz?${p.toString()}`;
}

/** ISO "YYYY-MM-DD" → "DD.MM.YYYY" — parseBirthDate kullanan motor fonksiyonları için */
function isoToDDMMYYYY(iso: string): string {
  const p = iso.split("-");
  if (p.length !== 3 || p[0].length !== 4) return "";
  return `${p[2]}.${p[1]}.${p[0]}`;
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTime as formatDateTimeI18n } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { invalidateDanisanListCache, removeClientFromDanisanListCache } from "@/lib/danisan/listCache";
import { computeBurc } from "@/lib/danisan/burc";
import NotesTab from "./components/NotesTab";
import { DanisanSectionShell } from "@/app/danisan-yolculugu/components/DanisanSectionShell";
import { BirthDateInput } from "@/components/ui/BirthDateInput";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri, ELEMENT_ORDER } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";

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
const HomeworkTab = dynamic(() => import("./components/HomeworkTab"), { loading: TabSkeleton, ssr: false });
const AnalizlerTab = dynamic(() => import("./components/AnalizlerTab"), { loading: TabSkeleton, ssr: false });
const YolculukTab = dynamic(() => import("./components/YolculukTab"), { loading: TabSkeleton, ssr: false });
const ClientMemoryTab = dynamic(() => import("./components/ClientMemoryTab"), { loading: TabSkeleton, ssr: false });
const MemoryPicker = dynamic(() => import("@/components/yasam-hafizasi/MemoryPicker"), { ssr: false });

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

function formatDateTimeTR(value: string, locale: ActiveLocale) {
  return formatDateTimeI18n(value, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }, locale);
}

// i18n translator tipi — modül-seviyesi saf fonksiyonlara t geçirmek için.
type T = ReturnType<typeof useTranslations>;

function isPastDate(value: string) {
  return new Date(value).getTime() < new Date().getTime();
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
  if (normalized === "iptal") return "border-l-rose-500";
  if (normalized === "tamamlandi") return "border-l-emerald-500";
  if (normalized === "bekliyor") {
    return new Date(appointmentDate) < new Date()
      ? "border-l-amber-500"
      : "border-l-cyan-500";
  }
  return "border-l-violet-500";
}

// Canonical randevu statü kodu → görünen etiket + renkler (kod DEĞİŞMEZ).
function getAppointmentStatusInfo(item: Appointment, t: T) {
  const status = item.status || "bekliyor";
  if (status === "tamamlandi") return { label: t("appt.status.tamamlandi"), bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
  if (status === "iptal")      return { label: t("appt.status.iptal"),      bg: "#fee2e2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" };
  if (isPastDate(item.appointment_date)) return { label: t("appt.status.gecmis"), bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", dot: "#94a3b8" };
  return { label: t("appt.status.yaklasan"), bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
}

// ─── Shared style strings ─────────────────────────────────────────────────────
const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-slate-300 text-[14px] outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const textareaCls =
  "w-full min-h-[54px] rounded-xl border border-slate-300 p-2.5 text-[14px] resize-y outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const labelCls = "block mb-1 font-extrabold text-[13px] text-slate-700";
const wordBtnCls =
  "border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 min-h-[40px] lg:min-h-0 lg:py-1.5 rounded-xl font-extrabold text-[12px] cursor-pointer hidden md:inline-flex items-center gap-1 hover:bg-blue-100 transition-colors disabled:opacity-60";

// Soyad her zaman Türkçe locale ile BÜYÜK harf normalize edilir (i→İ, ı→I).
// Kayıt anında savunmacı: trim + büyük harf. Yazım sırasında boşluk korunur.
function normalizeSurname(value: string) {
  return value.trim().toLocaleUpperCase("tr-TR");
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const t = useTranslations("clients.detail");
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
  const clientId = params.id as string;
  useBfcacheRefresh();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState("genel");
  // Bir kez açılan sekme DOM'da tutulur (tekrar mount → tekrar fetch olmaz).
  const [openedTabs, setOpenedTabs] = useState<Set<string>>(() => new Set(["genel"]));
  const [loading, setLoading] = useState(true);
  const [deletingClient, setDeletingClient] = useState(false);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
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
  const [yhSelectionCount, setYhSelectionCount] = useState(0);
  const [drStart, setDrStart] = useState("");
  const [drEnd, setDrEnd] = useState("");
  const [drBusy, setDrBusy] = useState(false);
  const [drOpen, setDrOpen] = useState(false);
  const [editDogum, setEditDogum] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingClientNotes, setSavingClientNotes] = useState(false);

  useEffect(() => { void getSyncedTenantId().then(setTenantId); }, []);

  // Aktif sekmeyi "açılmış" kümesine ekle (Tab butonları veya Yolculuk içi
  // onNavigate hangi yoldan gelirse gelsin). Açılan sekme mount kalır.
  useEffect(() => {
    setOpenedTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab]);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;

    // Kritik yol: yalnızca TEMEL danışan bilgisi. Notlar (saglik/adres/oneriler/
    // notlar) ilk boyamayı bekletmeden ARKA PLANDA çekilir → detay anında açılır.
    async function fetchClient() {
      setLoading(true);

      const detailToken = readSessionToken();
      const uid = readYasamUser()?.id ?? "";
      const clientRes = await fetch(`/api/clients/${clientId}`, {
        headers: {
          "x-user-id": uid,
          ...(detailToken ? { "x-session-token": detailToken } : {}),
        },
      });

      if (cancelled) return;
      if (!clientRes.ok) {
        console.error("Danışan detay hatası");
        setClient(null);
        setLoading(false);
        return;
      }

      const data = ((await clientRes.json()) as { client?: Client }).client;
      if (cancelled) return;
      if (!data) {
        setClient(null);
        setLoading(false);
        return;
      }

      setClient(data);
      setEditAd(data.ad || "");
      setEditSoyad(data.soyad || "");
      setEditTelefon(data.telefon || "");
      setEditDogum(data.dogum || "");
      setEditKan(data.kan || "");
      setEditMizac(data.mizac || "");
      setLoading(false); // temel bilgi geldi → hemen render

      // ── Notlar arka planda (kritik yolu bloklamaz) ──
      setNotesLoading(true);
      fetch(`/api/clients/${clientId}/notes`, {
        headers: {
          "x-user-id": uid,
          ...(detailToken ? { "x-session-token": detailToken } : {}),
        },
      })
        .then(async (notesRes) => {
          if (cancelled) return;
          if (!notesRes.ok) {
            console.error("Genel bilgiler okuma hatası:", notesRes.status);
            return;
          }
          const notesJson = (await notesRes.json().catch(() => ({}))) as { note?: ClientNote | null };
          if (cancelled) return;
          const note = notesJson.note;
          if (note) {
            setNoteId(note.id || null);
            setSaglikNotu(note.saglik_notu || "");
            setAdres(note.adres || "");
            setOneriler(note.oneriler || "");
            setNoteText(note.notlar || "");
          }
        })
        .catch((err) => { if (!cancelled) console.error("Notlar okuma hatası:", err); })
        .finally(() => { if (!cancelled) setNotesLoading(false); });
    }

    if (clientId) fetchClient();
    return () => { cancelled = true; };
  }, [clientId, tenantId]);

  async function saveAllGeneralInfo() {
    if (!tenantId || !client) return;
    setSavingAll(true);

    const saveToken = readSessionToken();
    const clientRes = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": readYasamUser()?.id ?? "",
        ...(saveToken ? { "x-session-token": saveToken } : {}),
      },
      body: JSON.stringify({ ad: editAd.trim() || null, soyad: normalizeSurname(editSoyad) || null, telefon: editTelefon.trim() || null, dogum: editDogum || null, kan: editKan || null, mizac: editMizac || null }),
    });

    if (!clientRes.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.saveClientFailed"), type: "error" });
      setSavingAll(false);
      return;
    }

    // F7: burç doğum tarihinden türetilir (sunucu authoritative). Optimistik yerel
    // state'i AYNI canonical helper'la güncelle → düzenleme sonrası bayat burç kalmaz.
    setClient((prev) => prev ? { ...prev, ad: editAd.trim() || undefined, soyad: normalizeSurname(editSoyad) || undefined, telefon: editTelefon.trim() || undefined, dogum: editDogum || undefined, kan: editKan || undefined, mizac: editMizac || undefined, burc: computeBurc(editDogum || null) ?? undefined } : prev);

    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const notesRes = await fetch(`/api/clients/${clientId}/notes`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ saglik_notu: saglikNotu, adres, oneriler }),
    });
    const notesJson = (await notesRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: ClientNote | null };

    if (!notesRes.ok || !notesJson.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.notesSaveFailed") + ": " + (notesJson.error ?? ""), type: "error" });
      setSavingAll(false);
      return;
    }

    if (notesJson.note?.id) setNoteId(notesJson.note.id);
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
      body: JSON.stringify({ saglik_notu: saglikNotu, adres, oneriler, notlar: notlarRaw }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: ClientNote | null };

    if (!res.ok || !json.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.noteSaveError") + ": " + (json.error ?? ""), type: "error" });
      setSavingClientNotes(false);
      return false;
    }

    if (json.note?.id) setNoteId(json.note.id);
    // Kaynak gerçekliği güncelle; başarı bildirimini NotesTab gösterir.
    setNoteText(notlarRaw);
    setSavingClientNotes(false);
    return true;
  }

  async function generateWordReport() {
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
        body: JSON.stringify({ ...(yhSelectionGroupId ? { selectionGroupId: yhSelectionGroupId } : {}) }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || t("error.reportFailed")); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const rawName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
      const nameSlug = rawName.toLowerCase()
        .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
        .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
        .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `danisan-raporu-${nameSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
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
        body: JSON.stringify({ exportMode: "date-range", dateRange: { start: drStart, end: drEnd } }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || t("error.reportFailed")); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const rawName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
      const nameSlug = rawName.toLowerCase()
        .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
        .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
        .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `danisan-tarih-araligi-${nameSlug}-${drStart}-${drEnd}.docx`;
      link.click();
      URL.revokeObjectURL(url);
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const rawName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
      const nameSlug = rawName.toLowerCase()
        .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
        .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
        .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `danisan-${tab}-${nameSlug}-${new Date().toISOString().slice(0, 10)}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      showToast({ title: t("toast.successTitle"), message: t("toast.reportStarted"), type: "success" });
    } catch (err) {
      showToast({ title: t("toast.errorTitle"), message: err instanceof Error ? err.message : t("toast.unknownError"), type: "error" });
    } finally { setTabWordBusy(false); }
  }

  async function handleDeleteClient() {
    if (!tenantId || deletingClient) return;
    const clientName = client ? `${client.ad ?? ""} ${client.soyad ?? ""}`.trim() : "";

    const ok = await deleteConfirm({
      title: t("delete.title"),
      message: t("delete.message", { name: clientName || t("delete.thisClient") }),
      secondMessage: t("delete.secondMessage"),
    });
    if (!ok) return;

    setDeletingClient(true);

    // Alt kayıtları (notlar, seanslar, ödevler, randevular, analizler, taş fotoğrafları)
    // güvenli cascade API üzerinden sil — service_role, tenant+client kapsamlı.
    {
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
        setDeletingClient(false);
        return;
      }
      // F5: DB silme başarılı; storage temizliği kısmen başarısız olabilir (warnings).
      const cascadeJson = (await cascadeRes.json().catch(() => ({}))) as { warnings?: string[] };
      if (Array.isArray(cascadeJson.warnings) && cascadeJson.warnings.length > 0) {
        showToast({ title: t("toast.clientDeletedTitle"), message: t("toast.cleanupWarning"), type: "warning" });
      }
    }

    setDeletingClient(false);
    // Cold refetch/skeleton yerine: silinen danışanı liste cache'inden in-place çıkar
    // (toplu silmeyle aynı davranış) → listeye dönünce güncel liste anında görünür.
    removeClientFromDanisanListCache(tenantId, clientId);
    router.push("/danisan-yolculugu/liste");
  }

  // ── Loading / not-found states ──────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 sm:p-3.5 text-slate-950">
        <div className="mx-auto w-full max-w-[1600px] animate-pulse" aria-busy="true">
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
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 sm:p-3.5 text-slate-950">
        <div className="rounded-[18px] bg-white p-5 shadow-lg font-extrabold">
          {t("notFound")}
        </div>
      </main>
    );
  }

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 sm:p-3.5 text-slate-950">
      <div className="mx-auto w-full max-w-[1600px]">

      {/* Top bar */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2.5">
        <button
          onClick={handleDeleteClient}
          disabled={deletingClient}
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-extrabold text-red-600 shadow-sm transition-all hover:bg-red-100 disabled:opacity-60"
        >
          {deletingClient ? t("deleting") : t("deleteClient")}
        </button>
      </div>

      {/* Hero card */}
      <section className="relative mb-3 flex items-center gap-3.5 overflow-hidden rounded-[22px] border border-white/80 bg-white/88 p-3.5 shadow-lg">
        <div className="pointer-events-none absolute -top-[45px] right-[70px] h-[120px] w-[120px] rounded-full bg-violet-300 opacity-45 blur-[36px]" />
        <div className="pointer-events-none absolute -bottom-[40px] -right-[25px] h-[105px] w-[105px] rounded-full bg-pink-300 opacity-48 blur-[34px]" />

        <div className="relative z-10 flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-600 via-violet-600 to-pink-600 text-[28px] font-black text-white shadow-lg">
          {fullName ? fullName.charAt(0).toUpperCase() : "D"}
        </div>

        <div className="relative z-10 flex-1 min-w-0">
          <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-1.5 text-[11px] font-black text-indigo-700">
            {t("hero.badge")}
          </span>
          <h1 className="mt-1.5 text-[24px] font-black text-slate-950">
            {fullName || t("unnamed")}
          </h1>
          <p className="mt-1 hidden text-[12px] text-slate-500 sm:block">
            {t("hero.subtitle")}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(135px,1fr))]">
            <Info label={t("info.phone")}       value={client.telefon}              color="#2563eb" />
            <Info label={t("info.birthDate")}   value={formatDateTR(client.dogum)}  color="#7c3aed" />
            <Info label={t("info.meetingDate")} value={formatDateTR(client.gorusme)} color="#db2777" />
            <Info label={t("info.zodiac")}      value={localize("burc", client.burc)}  color="#ea580c" />
            <Info label={t("info.bloodType")}   value={client.kan}                  color="#dc2626" />
            <Info label={t("info.temperament")} value={localize("mizac", client.mizac)} color="#16a34a" />
          </div>
        </div>
      </section>

      {/* Tabs section */}
      <DanisanSectionShell desktopClassName="sm:rounded-[20px] sm:border sm:border-white/78 sm:bg-white/92 sm:px-3.5 sm:pb-[18px] sm:pt-3.5 sm:shadow-lg">

        {/* Tab bar — mobilde yatay scroll, masaüstünde wrap */}
        <div className="relative mb-4">
          {/* Mobil scroll göstergesi — sağ fade + "devamı var" ok ipucu */}
          <div
            className="pointer-events-none absolute right-0 top-0 z-10 flex h-full w-16 items-center justify-end bg-gradient-to-l from-white via-white/85 to-transparent pr-1 sm:hidden"
            aria-hidden
          >
            <span className="animate-pulse text-xl font-black leading-none text-violet-500">›</span>
          </div>
          <div
            role="tablist"
            aria-label={t("a11y.tabs")}
            className="flex snap-x scroll-smooth items-center gap-1.5 overflow-x-auto py-1 pb-1.5 pr-4 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible sm:pb-1 sm:pr-0"
          >
            <Tab label={t("tab.genel")}      id="genel"      activeTab={activeTab} setActiveTab={setActiveTab} color="#2563eb" />
            <Tab label={t("tab.notlar")}     id="notlar"     activeTab={activeTab} setActiveTab={setActiveTab} color="#7c3aed" />
            <Tab label={t("tab.randevular")} id="randevular" activeTab={activeTab} setActiveTab={setActiveTab} color="#db2777" />
            <Tab label={t("tab.taslar")}     id="taslar"     activeTab={activeTab} setActiveTab={setActiveTab} color="#0891b2" />
            <Tab label={t("tab.seanslar")}   id="seanslar"   activeTab={activeTab} setActiveTab={setActiveTab} color="#16a34a" />
            <Tab label={t("tab.odevler")}    id="odevler"    activeTab={activeTab} setActiveTab={setActiveTab} color="#dc2626" />
            <Tab label={t("tab.analizler")}  id="analizler"  activeTab={activeTab} setActiveTab={setActiveTab} color="#9333ea" />
            <Tab label={t("tab.yolculuk")}   id="yolculuk"   activeTab={activeTab} setActiveTab={setActiveTab} color="#4f46e5" />
            <Tab label={t("tab.hafiza")}     id="hafiza"     activeTab={activeTab} setActiveTab={setActiveTab} color="#7c3aed" />
            <button
              onClick={() => setYhPickerOpen(true)}
              aria-label={t("a11y.yhSelect")}
              className="hidden min-h-[42px] whitespace-nowrap rounded-xl border border-violet-200 bg-violet-50 px-[18px] py-2.5 text-[13px] font-extrabold text-violet-700 transition-all hover:bg-violet-100 md:inline-flex md:items-center"
            >
              {t("yh.selectButton")}{yhSelectionCount > 0 ? ` (${yhSelectionCount})` : ""}
            </button>
            <button
              onClick={generateWordReport}
              disabled={generatingReport}
              aria-label={t("a11y.fullWordReport")}
              className="hidden min-h-[42px] whitespace-nowrap rounded-xl border border-slate-200 px-[18px] py-2.5 text-[13px] font-extrabold text-slate-500 transition-all hover:bg-slate-50 disabled:opacity-60 md:inline-flex md:items-center"
            >
              {generatingReport ? t("report.generating") : t("report.wordReport")}
            </button>
          </div>
        </div>

        {/* Date-range report — collapsible (Word özelliği: mobilde gizli, md+ görünür) */}
        <div className="mb-2.5 hidden md:block">
          <button
            type="button"
            onClick={() => setDrOpen((v) => !v)}
            className={`flex w-full items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-[12px] font-extrabold text-slate-700 transition-colors ${drOpen ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`}
          >
            <span>{t("dateRange.title")}</span>
            <span className="ml-auto text-[12px] text-slate-400">{drOpen ? t("dateRange.close") : t("dateRange.open")}</span>
          </button>
          {drOpen && (
            <div className="mt-1.5 flex flex-wrap items-end gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <label className={labelCls}>{t("dateRange.startLabel")}</label>
                <input type="date" value={drStart} onChange={(e) => setDrStart(e.target.value)} className={`${inputCls} w-[150px]`} />
              </div>
              <div>
                <label className={labelCls}>{t("dateRange.endLabel")}</label>
                <input type="date" value={drEnd} onChange={(e) => setDrEnd(e.target.value)} className={`${inputCls} w-[150px]`} />
              </div>
              <button
                onClick={generateDateRangeReport}
                disabled={drBusy || !drStart || !drEnd}
                className="btn-secondary self-end disabled:opacity-60"
              >
                {drBusy ? t("report.generating") : t("dateRange.generate")}
              </button>
            </div>
          )}
        </div>

        {/* Tab content area — açılan sekme DOM'da kalır (tekrar fetch yok),
            aktif olmayan `hidden` ile gizlenir → sekme geçişi anında; ağır
            sekmeler (Taşlar/Seanslar/Ödevler/Analizler/Yolculuk) lazy yüklenir. */}
        <DanisanSectionShell
          as="div"
          className="min-h-[240px]"
          desktopClassName="sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-gradient-to-br sm:from-white sm:to-slate-50 sm:p-5"
        >

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
                  <div className="mb-2.5">
                    <button onClick={() => void generateTabWordReport("genel")} disabled={tabWordBusy} className={wordBtnCls}>
                      {tabWordBusy ? t("report.generating") : t("tabWord.genel")}
                    </button>
                  </div>

                  {/* Başlık + düzenle/vazgeç butonu */}
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1.5 text-[11px] font-black text-blue-700">{t("general.badge")}</span>
                      <h2 className="mt-2 text-[22px] font-black text-slate-950">
                        {isEditingGeneral ? t("general.editTitle") : t("general.title")}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isEditingGeneral ? (
                        <button
                          onClick={enterGeneralEdit}
                          disabled={notesLoading}
                          title={notesLoading ? t("general.notesLoadingTitle") : undefined}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-[12px] font-black text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {t("general.editButton")}
                        </button>
                      ) : (
                        <button
                          onClick={cancelGeneralEdit}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[12px] font-black text-slate-600 transition-colors hover:bg-slate-50"
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
                      <BirthDateInput value={editDogum} onChange={isEditingGeneral ? setEditDogum : () => {}} className={fldCls} />
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
                        <button onClick={saveAllGeneralInfo} disabled={savingAll} className="btn-primary disabled:opacity-70">
                          {savingAll ? t("general.saving") : t("general.save")}
                        </button>
                        <button onClick={cancelGeneralEdit} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[12px] font-black text-slate-600 transition-colors hover:bg-slate-50">
                          {t("cancel")}
                        </button>
                      </div>
                    )}
                  </div>

                  <NumerolojikOzetKart ad={editAd} soyad={editSoyad} dogum={editDogum} />
                </>
              );
            })()}
          </div>
          )}

          {openedTabs.has("notlar") && (
          <div role="tabpanel" id="tabpanel-notlar" aria-labelledby="tab-notlar" hidden={activeTab !== "notlar"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("notlar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.notlar")}
                </button>
              </div>
              <NotesTab initialNotlar={noteText} onPersist={saveClientNotes} saving={savingClientNotes} />
          </div>
          )}

          {openedTabs.has("randevular") && (
          <div role="tabpanel" id="tabpanel-randevular" aria-labelledby="tab-randevular" hidden={activeTab !== "randevular"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("randevular")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.randevular")}
                </button>
              </div>
              <AppointmentsTab clientId={client.id} clientName={fullName || t("clientFallback")} tenantId={tenantId} confirm={confirm} showToast={showToast} />
          </div>
          )}

          {openedTabs.has("taslar") && (
          <div role="tabpanel" id="tabpanel-taslar" aria-labelledby="tab-taslar" hidden={activeTab !== "taslar"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("taslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.taslar")}
                </button>
              </div>
              <StonesTab clientId={client.id} />
          </div>
          )}

          {openedTabs.has("seanslar") && (
          <div role="tabpanel" id="tabpanel-seanslar" aria-labelledby="tab-seanslar" hidden={activeTab !== "seanslar"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("seanslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.seanslar")}
                </button>
              </div>
              <SessionsTab clientId={client.id} />
          </div>
          )}

          {openedTabs.has("odevler") && (
          <div role="tabpanel" id="tabpanel-odevler" aria-labelledby="tab-odevler" hidden={activeTab !== "odevler"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("odevler")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.odevler")}
                </button>
              </div>
              <HomeworkTab clientId={client.id} />
          </div>
          )}

          {openedTabs.has("analizler") && (
          <div role="tabpanel" id="tabpanel-analizler" aria-labelledby="tab-analizler" hidden={activeTab !== "analizler"}>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("analizler")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? t("report.generating") : t("tabWord.analizler")}
                </button>
              </div>
              <AnalizlerTab clientId={client.id} clientName={fullName || t("clientFallback")} />
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
          {openedTabs.has("hafiza") && (
          <div role="tabpanel" id="tabpanel-hafiza" aria-labelledby="tab-hafiza" hidden={activeTab !== "hafiza"}>
            <ClientMemoryTab clientId={client.id} clientName={fullName || t("clientFallback")} />
          </div>
          )}
        </DanisanSectionShell>
        {yhPickerOpen && client ? (
          <MemoryPicker
            open={yhPickerOpen}
            onClose={() => setYhPickerOpen(false)}
            targetKind="report"
            fixedClient={{ id: client.id, name: fullName || t("clientFallback") }}
            onConfirmed={({ selectionGroupId, total }) => {
              setYhSelectionGroupId(selectionGroupId);
              setYhSelectionCount(total);
              setYhPickerOpen(false);
              showToast({ title: t("toast.addedTitle"), message: t("toast.yhAdded", { count: total }), type: "success" });
            }}
          />
        ) : null}
      </DanisanSectionShell>
      </div>

    </main>
  );
}

// ─── AppointmentsTab ──────────────────────────────────────────────────────────
function AppointmentsTab({
  clientId, clientName, tenantId, confirm, showToast,
}: {
  clientId: string;
  clientName: string;
  tenantId: string | null;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const t = useTranslations("clients.detail");
  const locale = useLocale() as ActiveLocale;
  const deleteConfirm = useDeleteConfirm();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

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
    setLoading(false);
  }

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
      if (!res.ok) { showToast({ title: t("toast.failTitle"), message: t("appt.updateFailed"), type: "error" }); setSaving(false); return; }
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
    if (!statusRes.ok) { showToast({ title: t("toast.failTitle"), message: t("appt.statusUpdateFailed"), type: "error" }); return; }
    setSelectedAppointment((old) => old && old.id === id ? { ...old, status } : old);

    // Z-3: Randevu tamamlandığında clients.gorusme güncelle
    if (status === "tamamlandi" && tenantId) {
      const apt = appointments.find((a) => a.id === id);
      if (apt) {
        const aptDate = apt.appointment_date.split("T")[0];
        const gorusmeToken = readSessionToken();
        const cliRes = await fetch(`/api/clients/${clientId}`, {
          headers: {
            "x-user-id": readYasamUser()?.id ?? "",
            ...(gorusmeToken ? { "x-session-token": gorusmeToken } : {}),
          },
        });
        const cli = cliRes.ok
          ? ((await cliRes.json()) as { client?: { gorusme?: string | null } }).client
          : null;
        if (!cli?.gorusme || aptDate > cli.gorusme) {
          await fetch(`/api/clients/${clientId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": readYasamUser()?.id ?? "",
              ...(gorusmeToken ? { "x-session-token": gorusmeToken } : {}),
            },
            body: JSON.stringify({ gorusme: aptDate }),
          });
          invalidateDanisanListCache(); // gorusme güncellendi → liste durum rozeti bayat
        }
      }
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

  const upcomingCount = appointments.filter((a) => !isPastDate(a.appointment_date)).length;
  const pastCount = appointments.length - upcomingCount;

  return (
    <div>
      {/* Header */}
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full bg-pink-100 px-2.5 py-1.5 text-[11px] font-black text-pink-700">{t("appt.badge")}</span>
          <h2 className="mt-1.5 mb-0.5 text-[22px] font-black text-slate-950">{t("appt.title")}</h2>
          <p className="text-[13px] text-slate-500">{t("appt.subtitle", { name: clientName })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            <MiniStat label={t("appt.stat.total")}    value={appointments.length} color="#db2777" bg="#fdf2f8" />
            <MiniStat label={t("appt.stat.upcoming")} value={upcomingCount}        color="#16a34a" bg="#f0fdf4" />
            <MiniStat label={t("appt.stat.past")}     value={pastCount}            color="#64748b" bg="#f8fafc" />
          </div>
          <button
            type="button"
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            className={`rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold transition-all ${showForm ? "border border-slate-200 bg-slate-50 text-slate-700" : "border-0 bg-gradient-to-br from-indigo-600 to-pink-600 text-white shadow-md hover:-translate-y-0.5 hover:shadow-lg"}`}
          >
            {showForm ? t("appt.toggleClose") : t("appt.toggleOpen")}
          </button>
        </div>
      </div>

      {/* New appointment form */}
      {showForm && (
        <div className="mb-3.5 rounded-[18px] border border-pink-200 bg-gradient-to-br from-white to-pink-50 p-3.5 shadow-sm">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="inline-flex rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-[11px] font-black text-pink-700">{editingId ? t("appt.form.editBadge") : t("appt.form.newBadge")}</span>
              <h3 className="mt-1.5 text-[18px] font-black text-slate-950">{editingId ? t("appt.form.editTitle") : t("appt.form.newTitle")}</h3>
            </div>
            <button type="button" onClick={resetForm}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50">
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

            <div className="rounded-[15px] border border-indigo-200 bg-indigo-50 p-2.5">
              <label className={labelCls}>{t("appt.form.planningType")}</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setPlanningMode("auto")}
                  className={`rounded-xl border border-slate-200 p-2 text-[12px] font-extrabold cursor-pointer transition-colors ${planningMode === "auto" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-indigo-600 hover:bg-indigo-50"}`}>
                  {t("appt.form.autoInterval")}
                </button>
                <button onClick={() => setPlanningMode("manual")}
                  className={`rounded-xl border border-slate-200 p-2 text-[12px] font-extrabold cursor-pointer transition-colors ${planningMode === "manual" ? "bg-pink-600 text-white border-pink-600" : "bg-white text-pink-600 hover:bg-pink-50"}`}>
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
              <div className="rounded-[15px] border border-pink-200 bg-pink-50 p-2.5">
                <strong className="text-[13px] font-black text-pink-700">{t("appt.form.appointmentDates")}</strong>
                {Array.from({ length: Math.max(1, Math.floor(Number(sessionCount)) || 1) }).map((_, i) => (
                  <div key={i} className="mt-2.5">
                    <label className={labelCls}>{t("appt.form.nthAppointment", { n: i + 1 })}</label>
                    <input type="datetime-local" value={manualDates[i] || ""} onChange={(e) => updateManualDate(i, e.target.value)} className={inputCls} />
                  </div>
                ))}
              </div>
            )}

            <button onClick={createAppointments} disabled={saving} className="btn-secondary w-full justify-center disabled:opacity-60">
              {saving ? t("appt.form.saving") : editingId ? t("appt.form.update") : t("appt.form.create")}
            </button>
          </div>
        </div>
      )}

      {/* Appointment list */}
      <div className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-sm">
        <h3 className="mb-3 mt-1.5 text-[18px] font-black text-slate-950">{t("appt.listTitle")}</h3>

        {loading ? (
          <p className="text-[13px] text-slate-500">{t("appt.loading")}</p>
        ) : appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-[18px] text-[13px] font-bold text-slate-500">
            {t("appt.empty")}
          </div>
        ) : (
          <div className="grid gap-3.5">
            {appointments.map((item, index) => {
              const si = getAppointmentStatusInfo(item, t);
              const leftBorder = getLeftBorderClass(item.status, item.appointment_date);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedAppointment(item)}
                  className={`flex w-full items-start gap-2.5 rounded-2xl border border-slate-200 border-l-4 bg-gradient-to-br from-white to-slate-50 p-[11px] text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${leftBorder}`}
                >
                  <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 text-[13px] font-black text-white shadow-md">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[15px] font-black text-slate-950">{item.title || t("appt.titleFallback")}</div>
                      <span className="rounded-full px-2 py-1 text-[11px] font-black"
                        style={{ background: si.bg, color: si.color, border: `1px solid ${si.border}` }}>
                        {si.label}
                      </span>
                    </div>
                    <div className="mt-[3px] text-[13px] font-extrabold text-indigo-600">{formatDateTimeTR(item.appointment_date, locale)}</div>
                    {item.notes && (
                      <div className="mt-1.5 rounded-xl bg-slate-50 p-2.5 text-[13px] text-slate-600">{item.notes}</div>
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/46 p-4 backdrop-blur-[6px]"
          onClick={() => setSelectedAppointment(null)}
        >
          <div
            className="w-[min(560px,100%)] overflow-hidden rounded-[22px] border border-white/85 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-950 via-violet-950 to-pink-700 p-[18px] text-white">
              <div>
                <span className="inline-flex rounded-full bg-white/14 px-2.5 py-1.5 text-[11px] font-black">{t("appt.modal.badge")}</span>
                <h3 className="mt-2 text-[24px] font-black">{selectedAppointment.title || t("appt.titleFallback")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-white/22 bg-white/14 text-[24px] font-black leading-none text-white hover:bg-white/25"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 p-[18px]">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                <div className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="text-[12px] font-bold text-slate-500">{t("appt.modal.client")}</span>
                  <strong className="text-[14px] text-slate-950">{clientName}</strong>
                </div>
                <div className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="text-[12px] font-bold text-slate-500">{t("appt.modal.dateTime")}</span>
                  <strong className="text-[14px] text-slate-950">{formatDateTimeTR(selectedAppointment.appointment_date, locale)}</strong>
                </div>
                <div className="grid gap-1 rounded-2xl p-3"
                  style={{ borderColor: getAppointmentStatusInfo(selectedAppointment, t).border, background: getAppointmentStatusInfo(selectedAppointment, t).bg, border: `1px solid ${getAppointmentStatusInfo(selectedAppointment, t).border}` }}>
                  <span className="text-[12px] font-bold text-slate-500">{t("appt.modal.status")}</span>
                  <strong className="text-[14px]" style={{ color: getAppointmentStatusInfo(selectedAppointment, t).color }}>
                    {getAppointmentStatusInfo(selectedAppointment, t).label}
                  </strong>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <span className="block mb-1.5 text-[12px] font-bold text-slate-500">{t("appt.modal.note")}</span>
                <p className="text-[13px] text-slate-700">{selectedAppointment.notes || t("appt.modal.noNote")}</p>
              </div>

              {/* WEB-07: Düzenle tüm statülerde açık (statü değişmeden title/notes/tarih güncellenir). */}
              <button type="button" onClick={() => openEditAppointment(selectedAppointment)}
                className="w-full rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-[13px] font-black text-indigo-800 transition hover:bg-indigo-100">
                {t("appt.modal.edit")}
              </button>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button type="button" onClick={() => void requestCompleteAppointment(selectedAppointment.id)} className="btn-success justify-center">{t("appt.modal.complete")}</button>
                <button type="button" onClick={() => void requestCancelAppointment(selectedAppointment.id)} className="btn-danger justify-center">{t("appt.modal.cancel")}</button>
                <button type="button" onClick={() => deleteAppointment(selectedAppointment.id)}
                  className="btn-danger justify-center" style={{ background: "linear-gradient(135deg, #020617, #1e293b)" }}>
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
function Info({ label, value, color }: { label: string; value?: string; color: string }) {
  return (
    <div className="rounded-[13px] border bg-white/82 p-2 shadow-sm" style={{ borderColor: `${color}35` }}>
      <span className="mb-0.5 block text-[12px] font-black" style={{ color }}>{label}</span>
      <strong className="text-[14px] text-slate-900">{value || "-"}</strong>
    </div>
  );
}

function MiniStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="min-w-[74px] rounded-[14px] border border-slate-200 p-[7px_9px] text-center text-[12px]"
      style={{ background: bg, borderColor: `${color}25` }}>
      <strong className="block text-[15px] font-black" style={{ color }}>{value}</strong>
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

function Tab({ label, id, activeTab, setActiveTab, color }: {
  label: string; id: string; activeTab: string; setActiveTab: (id: string) => void; color: string;
}) {
  const active = activeTab === id;
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${id}`}
      id={`tab-${id}`}
      onClick={() => setActiveTab(id)}
      className="min-h-[42px] snap-start whitespace-nowrap rounded-xl px-[18px] py-2.5 text-[13px] font-extrabold leading-[1.2] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      style={{
        background: active ? color : "transparent",
        color: active ? "white" : color,
        border: active ? `1px solid ${color}` : `1px solid ${color}22`,
        boxShadow: active ? `0 2px 6px ${color}18` : "none",
      }}
    >
      {label}
    </button>
  );
}

// ─── NumerolojikOzetKart ──────────────────────────────────────────────────────
// Genel Bilgiler sekmesinde anlık numeroloji özeti.
// Saf hesaplama — DB çağrısı yok, hata olursa sessizce "—" gösterir.

const ELEMENT_META: Record<string, { color: string; bg: string }> = {
  Hava:   { color: "#0284c7", bg: "#e0f2fe" },
  Su:     { color: "#1d4ed8", bg: "#dbeafe" },
  Ateş:   { color: "#c2410c", bg: "#ffedd5" },
  Toprak: { color: "#92400e", bg: "#fef3c7" },
};

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
        nearestPeakLabel = t("num.peakLabel", { index: p.index, age: p.age, topic: p.topic });
        // Varsa sonraki zirveleri de kontrol et — en küçük yaşlı birincisi zaten
      }
    } catch { /* sessiz */ }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
      {/* Başlık */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-base text-violet-500">∞</span>
        <span className="text-[13px] font-black text-violet-900">{t("num.title")}</span>
        <span className="ml-auto inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[12px] font-black text-violet-600">
          {t("num.readonly")}
        </span>
        {!hasName && (
          <span className="text-[12px] font-bold text-slate-400">
            {t("num.needName")}
          </span>
        )}
      </div>

      {/* 5 temel sayı */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {coreItems.map(({ label, value, color }) => (
          <div
            key={label}
            className="flex flex-col items-center rounded-xl border border-white/70 bg-white px-2 py-3 shadow-sm"
          >
            <span className="text-[22px] font-black leading-none" style={{ color }}>
              {value}
            </span>
            <span className="mt-1.5 text-center text-[12px] font-extrabold leading-tight text-slate-500">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Element dağılımı */}
      {hasElements && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl bg-white/60 px-3 py-2">
          <span className="text-[12px] font-black text-slate-500">{t("num.element")}</span>
          {/* element adları ("Hava"/"Su"/"Ateş"/"Toprak") persisted DATA key'idir — DEĞİŞMEZ. */}
          {ELEMENT_ORDER.map((name) => {
            const meta = ELEMENT_META[name];
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-extrabold"
                style={{ background: meta.bg, color: meta.color }}
              >
                {localizeEl(name)} <strong>{elementCounts[name] ?? 0}</strong>
              </span>
            );
          })}
          {dominantElement && (
            <span className="ml-auto text-[12px] font-bold text-slate-400">
              {t("num.dominant")} {localizeEl(dominantElement)}
            </span>
          )}
        </div>
      )}

      {/* En yakın zirve */}
      {nearestPeakLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-2">
          <span className="text-[12px] font-black text-slate-500">{t("num.peak")}</span>
          <span className="text-[12px] font-black text-indigo-700">{nearestPeakLabel}</span>
        </div>
      )}

      {/* Deeplink */}
      <div className="mt-3 flex justify-end">
        <Link
          href={buildAnalizHref(dogum, firstName, lastName)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3.5 py-2 text-[12px] font-black text-violet-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md"
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

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import NotesTab from "./components/NotesTab";
import StonesTab from "./components/StonesTab";
import SessionsTab from "./components/SessionsTab";
import HomeworkTab from "./components/HomeworkTab";
import AnalizlerTab from "./components/AnalizlerTab";
import YolculukTab from "./components/YolculukTab";
import { BirthDateInput } from "@/components/ui/BirthDateInput";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri, ELEMENT_ORDER } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";

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
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isPastDate(value: string) {
  return new Date(value).getTime() < new Date().getTime();
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

function getAppointmentStatusInfo(item: Appointment) {
  const status = item.status || "bekliyor";
  if (status === "tamamlandi") return { label: "Tamamlandı", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
  if (status === "iptal")      return { label: "İptal",       bg: "#fee2e2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" };
  if (isPastDate(item.appointment_date)) return { label: "Geçmiş", bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", dot: "#94a3b8" };
  return { label: "Yaklaşan", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", dot: "#22c55e" };
}

// ─── Shared style strings ─────────────────────────────────────────────────────
const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-slate-300 text-[13px] outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const textareaCls =
  "w-full min-h-[54px] rounded-xl border border-slate-300 p-2.5 text-[12px] resize-y outline-none bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";
const labelCls = "block mb-1 font-extrabold text-[12px] text-slate-700";
const wordBtnCls =
  "border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl font-extrabold text-[12px] cursor-pointer inline-flex items-center gap-1 hover:bg-blue-100 transition-colors disabled:opacity-60";

// ─── Main component ───────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  useBfcacheRefresh();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState("genel");
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [saglikNotu, setSaglikNotu] = useState("");
  const [adres, setAdres] = useState("");
  const [oneriler, setOneriler] = useState("");
  const [editAd, setEditAd] = useState("");
  const [editSoyad, setEditSoyad] = useState("");
  const [editTelefon, setEditTelefon] = useState("");
  const [editKan, setEditKan] = useState("");
  const [editMizac, setEditMizac] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [tabWordBusy, setTabWordBusy] = useState(false);
  const [drStart, setDrStart] = useState("");
  const [drEnd, setDrEnd] = useState("");
  const [drBusy, setDrBusy] = useState(false);
  const [drOpen, setDrOpen] = useState(false);
  const [editDogum, setEditDogum] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingClientNotes, setSavingClientNotes] = useState(false);

  useEffect(() => { void getSyncedTenantId().then(setTenantId); }, []);

  useEffect(() => {
    if (!tenantId) return;

    async function fetchClient() {
      setLoading(true);

      const { data, error } = await supabase
        .from("clients").select("*")
        .eq("id", clientId).eq("tenant_id", tenantId).single();

      if (error) {
        console.error("Danışan detay hatası:", error);
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

      const { data: notesData, error: notesError } = await supabase
        .from("client_notes").select("*").eq("client_id", clientId).maybeSingle();

      if (notesError) console.error("Genel bilgiler okuma hatası:", notesError);

      if (notesData) {
        const note = notesData as ClientNote;
        setNoteId(note.id || null);
        setSaglikNotu(note.saglik_notu || "");
        setAdres(note.adres || "");
        setOneriler(note.oneriler || "");
        setNoteText(note.notlar || "");
      }

      setLoading(false);
    }

    if (clientId) fetchClient();
  }, [clientId, tenantId]);

  async function saveAllGeneralInfo() {
    if (!tenantId || !client) return;
    setSavingAll(true);

    const { error: clientError } = await supabase
      .from("clients")
      .update({ ad: editAd.trim() || null, soyad: editSoyad.trim() || null, telefon: editTelefon.trim() || null, dogum: editDogum || null, kan: editKan || null, mizac: editMizac || null })
      .eq("id", client.id).eq("tenant_id", tenantId);

    if (clientError) {
      showToast({ title: "İşlem başarısız", message: "Danışan bilgileri kaydedilemedi: " + clientError.message, type: "error" });
      setSavingAll(false);
      return;
    }

    setClient((prev) => prev ? { ...prev, ad: editAd.trim() || undefined, soyad: editSoyad.trim() || undefined, telefon: editTelefon.trim() || undefined, dogum: editDogum || undefined, kan: editKan || undefined, mizac: editMizac || undefined } : prev);

    const notesPayload = { id: noteId || undefined, tenant_id: tenantId, client_id: clientId, saglik_notu: saglikNotu, adres, oneriler };
    const { data: notesData, error: notesError } = await supabase.from("client_notes").upsert(notesPayload).select().single();

    if (notesError) {
      showToast({ title: "İşlem başarısız", message: "Notlar kaydedilemedi: " + notesError.message, type: "error" });
      setSavingAll(false);
      return;
    }

    if (notesData?.id) setNoteId(notesData.id);
    showToast({ title: "Başarılı", message: "Değişiklikler kaydedildi.", type: "success" });
    setSavingAll(false);
  }

  async function saveClientNotes() {
    if (!tenantId) return;
    setSavingClientNotes(true);

    const payload = { id: noteId || undefined, tenant_id: tenantId, client_id: clientId, saglik_notu: saglikNotu, adres, oneriler, notlar: noteText };
    const { data, error } = await supabase.from("client_notes").upsert(payload).select().single();

    if (error) {
      showToast({ title: "İşlem başarısız", message: "Not kayıt hatası: " + error.message, type: "error" });
      setSavingClientNotes(false);
      return;
    }

    if (data?.id) setNoteId(data.id);
    showToast({ title: "Başarılı", message: "Notlar kaydedildi.", type: "success" });
    setSavingClientNotes(false);
  }

  async function generateWordReport() {
    if (!tenantId || !client) return;
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı"); }
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
      showToast({ title: "Başarılı", message: "Rapor indirme başlatıldı.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally { setGeneratingReport(false); }
  }

  async function generateDateRangeReport() {
    if (!tenantId || !client) return;
    if (!drStart || !drEnd) { showToast({ title: "Uyarı", message: "Başlangıç ve bitiş tarihi giriniz.", type: "warning" }); return; }
    if (drStart > drEnd) { showToast({ title: "Uyarı", message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.", type: "warning" }); return; }
    setDrBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "date-range", dateRange: { start: drStart, end: drEnd } }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı"); }
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
      showToast({ title: "Başarılı", message: "Tarih aralığı raporu indirme başlatıldı.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally { setDrBusy(false); }
  }

  async function generateTabWordReport(tab: string) {
    if (!tenantId || !client) return;
    setTabWordBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "tab", tabName: tab }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || "Rapor oluşturulamadı"); }
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
      showToast({ title: "Başarılı", message: "Rapor indirme başlatıldı.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally { setTabWordBusy(false); }
  }

  async function deleteClient() {
    if (!tenantId) return;
    setDeletingClient(true);

    const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("tenant_id", tenantId);

    if (error) {
      console.error("Danışan silme hatası:", error);
      showToast({ title: "İşlem başarısız", message: "Danışan silinemedi: " + error.message, type: "error" });
      setDeletingClient(false);
      return;
    }

    setShowDeleteModal(false);
    setDeletingClient(false);
    router.push("/danisan-yolculugu/liste");
  }

  // ── Loading / not-found states ──────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-3.5 text-slate-950">
        <div className="rounded-[18px] bg-white p-5 shadow-lg font-extrabold">
          Danışan yükleniyor...
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-3.5 text-slate-950">
        <button
          onClick={() => router.back()}
          className="mb-4 rounded-xl bg-sky-100 px-3.5 py-2.5 text-[13px] font-extrabold text-sky-700 transition-colors hover:bg-sky-200"
        >
          ← Danışan Listesine Dön
        </button>
        <div className="rounded-[18px] bg-white p-5 shadow-lg font-extrabold">
          Danışan bulunamadı
        </div>
      </main>
    );
  }

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-3.5 text-slate-950">

      {/* Top bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <button
          onClick={() => router.back()}
          className="rounded-xl bg-sky-100 px-3.5 py-2.5 text-[13px] font-extrabold text-sky-700 transition-colors hover:bg-sky-200"
        >
          ← Danışan Listesine Dön
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-extrabold text-red-600 shadow-sm transition-all hover:bg-red-100"
        >
          Danışanı Sil
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
            Danışan Detayı
          </span>
          <h1 className="mt-1.5 text-[24px] font-black text-slate-950">
            {fullName || "İsimsiz Danışan"}
          </h1>
          <p className="mt-1 text-[12px] text-slate-500">
            Danışan bilgileri, notlar, taşlar, seanslar, ödevler ve randevular burada yönetilir.
          </p>
          <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(135px,1fr))] gap-2">
            <Info label="Telefon"       value={client.telefon}              color="#2563eb" />
            <Info label="Doğum Tarihi"  value={formatDateTR(client.dogum)}  color="#7c3aed" />
            <Info label="Görüşme Tarihi" value={formatDateTR(client.gorusme)} color="#db2777" />
            <Info label="Burç"          value={client.burc}                 color="#ea580c" />
            <Info label="Kan Grubu"     value={client.kan}                  color="#dc2626" />
            <Info label="Mizaç"         value={client.mizac}                color="#16a34a" />
          </div>
        </div>
      </section>

      {/* Tabs section */}
      <section className="rounded-[20px] border border-white/78 bg-white/92 px-3.5 pb-[18px] pt-3.5 shadow-lg">

        {/* Tab bar — scroll on mobile, wrap on desktop */}
        <div className="mb-4 flex items-center gap-1.5 overflow-x-auto py-1 pb-1.5 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible sm:pb-1">
          <Tab label="Genel Bilgiler"      id="genel"     activeTab={activeTab} setActiveTab={setActiveTab} color="#2563eb" />
          <Tab label="Notlar"              id="notlar"    activeTab={activeTab} setActiveTab={setActiveTab} color="#7c3aed" />
          <Tab label="Randevular"          id="randevular" activeTab={activeTab} setActiveTab={setActiveTab} color="#db2777" />
          <Tab label="Taşlar"              id="taslar"    activeTab={activeTab} setActiveTab={setActiveTab} color="#0891b2" />
          <Tab label="Seanslar"            id="seanslar"  activeTab={activeTab} setActiveTab={setActiveTab} color="#16a34a" />
          <Tab label="Ödevler"             id="odevler"   activeTab={activeTab} setActiveTab={setActiveTab} color="#dc2626" />
          <Tab label="Analizler"           id="analizler" activeTab={activeTab} setActiveTab={setActiveTab} color="#9333ea" />
          <Tab label="✦ Danışan Yolculuğu" id="yolculuk"  activeTab={activeTab} setActiveTab={setActiveTab} color="#4f46e5" />
          <button
            onClick={generateWordReport}
            disabled={generatingReport}
            className="min-h-[42px] whitespace-nowrap rounded-xl border border-slate-200 px-[18px] py-2.5 text-[13px] font-extrabold text-slate-500 transition-all hover:bg-slate-50 disabled:opacity-60"
          >
            {generatingReport ? "⏳ Oluşturuluyor..." : "📄 Word Raporu"}
          </button>
        </div>

        {/* Date-range report — collapsible */}
        <div className="mb-2.5">
          <button
            type="button"
            onClick={() => setDrOpen((v) => !v)}
            className={`flex w-full items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-[12px] font-extrabold text-slate-700 transition-colors ${drOpen ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`}
          >
            <span>📅 Tarih Aralığı Raporu</span>
            <span className="ml-auto text-[11px] text-slate-400">{drOpen ? "▲ Kapat" : "▼ Aç"}</span>
          </button>
          {drOpen && (
            <div className="mt-1.5 flex flex-wrap items-end gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <label className={labelCls}>Başlangıç</label>
                <input type="date" value={drStart} onChange={(e) => setDrStart(e.target.value)} className={`${inputCls} w-[150px]`} />
              </div>
              <div>
                <label className={labelCls}>Bitiş</label>
                <input type="date" value={drEnd} onChange={(e) => setDrEnd(e.target.value)} className={`${inputCls} w-[150px]`} />
              </div>
              <button
                onClick={generateDateRangeReport}
                disabled={drBusy || !drStart || !drEnd}
                className="btn-secondary self-end disabled:opacity-60"
              >
                {drBusy ? "⏳ Oluşturuluyor..." : "Word Oluştur"}
              </button>
            </div>
          )}
        </div>

        {/* Tab content area */}
        <div className="min-h-[240px] rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">

          {activeTab === "genel" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("genel")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Genel Bilgiler Word"}
                </button>
              </div>

              <div className="mb-2.5">
                <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1.5 text-[11px] font-black text-blue-700">Genel Bilgiler</span>
                <h2 className="mt-2 text-[22px] font-black text-slate-950">Danışan Bilgilerini Düzenle</h2>
              </div>

              <div className="mb-1 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
                <div>
                  <label className={labelCls}>Ad</label>
                  <input value={editAd} onChange={(e) => setEditAd(e.target.value)} className={inputCls} placeholder="Ad" />
                </div>
                <div>
                  <label className={labelCls}>Soyad</label>
                  <input value={editSoyad} onChange={(e) => setEditSoyad(e.target.value)} className={inputCls} placeholder="Soyad" />
                </div>
                <div>
                  <label className={labelCls}>Telefon</label>
                  <input value={editTelefon} onChange={(e) => setEditTelefon(e.target.value)} className={inputCls} placeholder="05xx xxx xx xx" />
                </div>
                <div>
                  <label className={labelCls}>Doğum Tarihi</label>
                  <BirthDateInput value={editDogum} onChange={setEditDogum} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Kan Grubu</label>
                  <select value={editKan} onChange={(e) => setEditKan(e.target.value)} className={inputCls}>
                    <option value="">Seçiniz</option>
                    <option>A Rh+</option><option>A Rh-</option>
                    <option>B Rh+</option><option>B Rh-</option>
                    <option>AB Rh+</option><option>AB Rh-</option>
                    <option>0 Rh+</option><option>0 Rh-</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Mizaç</label>
                  <select value={editMizac} onChange={(e) => setEditMizac(e.target.value)} className={inputCls}>
                    <option value="">Seçiniz</option>
                    <option value="safra">Safra</option>
                    <option value="sovdavi">Sovdavi</option>
                    <option value="dem">Dem</option>
                    <option value="balgam">Balgam</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3.5">
                <div>
                  <label className={labelCls}>Sağlık Notu</label>
                  <textarea value={saglikNotu} onChange={(e) => setSaglikNotu(e.target.value)} className={textareaCls} placeholder="Danışanın sağlık notları..." />
                </div>
                <div>
                  <label className={labelCls}>Adres</label>
                  <textarea value={adres} onChange={(e) => setAdres(e.target.value)} className={textareaCls} placeholder="Adres bilgisi..." />
                </div>
                <div>
                  <label className={labelCls}>Öneriler</label>
                  <textarea value={oneriler} onChange={(e) => setOneriler(e.target.value)} className={textareaCls} placeholder="Danışana verilen genel öneriler..." />
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <button onClick={saveAllGeneralInfo} disabled={savingAll} className="btn-primary disabled:opacity-70">
                    {savingAll ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                  </button>
                </div>
              </div>

              <NumerolojikOzetKart ad={editAd} soyad={editSoyad} dogum={editDogum} />
            </>
          )}

          {activeTab === "notlar" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("notlar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Notlar Word"}
                </button>
              </div>
              <NotesTab noteText={noteText} setNoteText={setNoteText} onSave={saveClientNotes} saving={savingClientNotes} />
            </>
          )}

          {activeTab === "randevular" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("randevular")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Randevu Geçmişi Word"}
                </button>
              </div>
              <AppointmentsTab clientId={client.id} clientName={fullName || "Danışan"} tenantId={tenantId} confirm={confirm} showToast={showToast} />
            </>
          )}

          {activeTab === "taslar" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("taslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Taşlar Word"}
                </button>
              </div>
              <StonesTab clientId={client.id} />
            </>
          )}

          {activeTab === "seanslar" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("seanslar")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Seans Geçmişi Word"}
                </button>
              </div>
              <SessionsTab clientId={client.id} />
            </>
          )}

          {activeTab === "odevler" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("odevler")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Ödev Takip Word"}
                </button>
              </div>
              <HomeworkTab clientId={client.id} />
            </>
          )}

          {activeTab === "analizler" && (
            <>
              <div className="mb-2.5">
                <button onClick={() => void generateTabWordReport("analizler")} disabled={tabWordBusy} className={wordBtnCls}>
                  {tabWordBusy ? "⏳ Oluşturuluyor..." : "📄 Analiz Sonuçları Word"}
                </button>
              </div>
              <AnalizlerTab clientId={client.id} clientName={fullName || "Danışan"} />
            </>
          )}

          {activeTab === "yolculuk" && (
            <YolculukTab
              clientId={client.id}
              tenantId={tenantId}
              clientName={fullName || "Danışan"}
              clientPhone={client.telefon}
              clientLastSession={client.gorusme ? formatDateTR(client.gorusme) : undefined}
              clientAd={client.ad}
              clientSoyad={client.soyad}
              clientDogum={client.dogum}
              onNavigate={setActiveTab}
            />
          )}
        </div>
      </section>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/46 p-4 backdrop-blur-[6px]"
          onClick={() => !deletingClient && setShowDeleteModal(false)}
        >
          <div
            className="w-[min(360px,100%)] rounded-[18px] border border-red-200 bg-gradient-to-br from-white to-red-50 p-[18px] text-center shadow-[0_18px_45px_rgba(15,23,42,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2.5 flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-gradient-to-br from-red-500 to-red-600 text-[22px] font-black text-white shadow-lg">
              !
            </div>
            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1.5 text-[10px] font-black text-red-600">
              Danışan Silme Onayı
            </span>
            <h2 className="mt-1.5 text-[19px] font-black text-slate-950">Bu danışan silinsin mi?</h2>
            <p className="mx-auto mt-2 max-w-[300px] text-[12px] leading-relaxed text-slate-500">
              Bu işlem danışan kaydını sistemden kaldırır. Emin değilsen işlemi iptal edebilirsin.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingClient}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-extrabold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={deleteClient}
                disabled={deletingClient}
                className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 px-3.5 py-2 text-[12px] font-black text-white shadow-md transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-70"
              >
                {deletingClient ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const [title, setTitle] = useState("Seans");
  const [notes, setNotes] = useState("");
  const [sessionCount, setSessionCount] = useState(1);
  const [planningMode, setPlanningMode] = useState<PlanningMode>("auto");
  const [date, setDate] = useState("");
  const [dayInterval, setDayInterval] = useState(1);
  const [manualDates, setManualDates] = useState<string[]>([""]);

  useEffect(() => {
    if (!tenantId) return;
    loadAppointments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  async function loadAppointments() {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("appointments").select("*")
      .eq("tenant_id", tenantId).eq("client_id", clientId)
      .order("appointment_date", { ascending: true });
    if (error) { showToast({ title: "İşlem başarısız", message: "Randevular yüklenemedi: " + error.message, type: "error" }); setLoading(false); return; }
    setAppointments(data || []);
    setLoading(false);
  }

  function handleSessionCountChange(value: number) {
    const safeCount = Math.max(1, value || 1);
    setSessionCount(safeCount);
    setManualDates((old) => { const next = [...old]; while (next.length < safeCount) next.push(""); return next.slice(0, safeCount); });
  }

  function updateManualDate(index: number, value: string) {
    setManualDates((old) => { const next = [...old]; next[index] = value; return next; });
  }

  async function createAppointments() {
    if (!tenantId) return;
    const count = Math.max(1, Number(sessionCount));
    let rows: { tenant_id: string; client_id: string; title: string; notes: string | null; appointment_date: string; status: AppointmentStatus }[] = [];

    if (planningMode === "auto") {
      if (!date) { showToast({ title: "Eksik bilgi", message: "Başlangıç tarihi seçmelisiniz", type: "warning" }); return; }
      const interval = Math.max(1, Number(dayInterval));
      const startDate = new Date(date);
      rows = Array.from({ length: count }).map((_, i) => {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i * interval);
        return { tenant_id: tenantId, client_id: clientId, title: count > 1 ? `${title || "Seans"} ${i + 1}/${count}` : title || "Seans", notes: notes || null, appointment_date: d.toISOString(), status: "bekliyor" };
      });
    } else {
      const filled = manualDates.slice(0, count);
      const emptyIdx = filled.findIndex((x) => !x);
      if (emptyIdx !== -1) { showToast({ title: "Eksik bilgi", message: `${emptyIdx + 1}. randevu tarihini seçmelisiniz`, type: "warning" }); return; }
      rows = filled.map((d, i) => ({ tenant_id: tenantId, client_id: clientId, title: count > 1 ? `${title || "Seans"} ${i + 1}/${count}` : title || "Seans", notes: notes || null, appointment_date: new Date(d).toISOString(), status: "bekliyor" }));
    }

    setSaving(true);
    const { error } = await supabase.from("appointments").insert(rows);
    if (error) { showToast({ title: "İşlem başarısız", message: "Randevu kayıt hatası: " + error.message, type: "error" }); setSaving(false); return; }
    setTitle("Seans"); setNotes(""); setSessionCount(1); setPlanningMode("auto"); setDate(""); setDayInterval(1); setManualDates([""]); setShowForm(false);
    await loadAppointments();
    setSaving(false);
  }

  async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id).eq("tenant_id", tenantId).eq("client_id", clientId);
    if (error) { showToast({ title: "İşlem başarısız", message: "Randevu durumu güncellenemedi: " + error.message, type: "error" }); return; }
    setSelectedAppointment((old) => old && old.id === id ? { ...old, status } : old);
    await loadAppointments();
  }

  async function deleteAppointment(id: string) {
    const ok = await confirm({ message: "Bu randevu silinsin mi?", tone: "danger", title: "Randevuyu sil", confirmText: "Sil", cancelText: "Vazgeç" });
    if (!ok) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id).eq("tenant_id", tenantId).eq("client_id", clientId);
    if (error) { showToast({ title: "İşlem başarısız", message: "Randevu silinemedi: " + error.message, type: "error" }); return; }
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
          <span className="inline-flex rounded-full bg-pink-100 px-2.5 py-1.5 text-[11px] font-black text-pink-700">Danışana Özel Ajanda</span>
          <h2 className="mt-1.5 mb-0.5 text-[22px] font-black text-slate-950">Randevular</h2>
          <p className="text-[13px] text-slate-500">{clientName} için oluşturulan tüm randevular burada görünür.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            <MiniStat label="Toplam"   value={appointments.length} color="#db2777" bg="#fdf2f8" />
            <MiniStat label="Yaklaşan" value={upcomingCount}        color="#16a34a" bg="#f0fdf4" />
            <MiniStat label="Geçmiş"   value={pastCount}            color="#64748b" bg="#f8fafc" />
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={`rounded-xl px-3.5 py-2.5 text-[13px] font-extrabold transition-all ${showForm ? "border border-slate-200 bg-slate-50 text-slate-700" : "border-0 bg-gradient-to-br from-indigo-600 to-pink-600 text-white shadow-md hover:-translate-y-0.5 hover:shadow-lg"}`}
          >
            {showForm ? "Formu Kapat" : "+ Yeni Randevu Ekle"}
          </button>
        </div>
      </div>

      {/* New appointment form */}
      {showForm && (
        <div className="mb-3.5 rounded-[18px] border border-pink-200 bg-gradient-to-br from-white to-pink-50 p-3.5 shadow-sm">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="inline-flex rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-[11px] font-black text-pink-700">Yeni Randevu</span>
              <h3 className="mt-1.5 text-[18px] font-black text-slate-950">Yeni Randevu Ekle</h3>
            </div>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <label className={labelCls}>Başlık</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Örn: Biyoenerji Seansı" />
            </div>
            <div>
              <label className={labelCls}>Not</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${textareaCls} min-h-[90px]`} placeholder="Randevu notu..." />
            </div>
            <div>
              <label className={labelCls}>Seans Sayısı</label>
              <input type="number" min={1} value={sessionCount} onChange={(e) => handleSessionCountChange(Number(e.target.value))} className={inputCls} />
            </div>

            <div className="rounded-[15px] border border-indigo-200 bg-indigo-50 p-2.5">
              <label className={labelCls}>Planlama Türü</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setPlanningMode("auto")}
                  className={`rounded-xl border border-slate-200 p-2 text-[12px] font-extrabold cursor-pointer transition-colors ${planningMode === "auto" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-indigo-600 hover:bg-indigo-50"}`}>
                  Otomatik Aralık
                </button>
                <button onClick={() => setPlanningMode("manual")}
                  className={`rounded-xl border border-slate-200 p-2 text-[12px] font-extrabold cursor-pointer transition-colors ${planningMode === "manual" ? "bg-pink-600 text-white border-pink-600" : "bg-white text-pink-600 hover:bg-pink-50"}`}>
                  Tek Tek Tarih
                </button>
              </div>
            </div>

            {planningMode === "auto" && (
              <>
                <div>
                  <label className={labelCls}>Başlangıç Tarihi</label>
                  <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Kaç Günde Bir?</label>
                  <input type="number" min={1} value={dayInterval} onChange={(e) => setDayInterval(Number(e.target.value))} className={inputCls} />
                </div>
              </>
            )}

            {planningMode === "manual" && (
              <div className="rounded-[15px] border border-pink-200 bg-pink-50 p-2.5">
                <strong className="text-[13px] font-black text-pink-700">Randevu Tarihleri</strong>
                {Array.from({ length: sessionCount }).map((_, i) => (
                  <div key={i} className="mt-2.5">
                    <label className={labelCls}>{i + 1}. Randevu</label>
                    <input type="datetime-local" value={manualDates[i] || ""} onChange={(e) => updateManualDate(i, e.target.value)} className={inputCls} />
                  </div>
                ))}
              </div>
            )}

            <button onClick={createAppointments} disabled={saving} className="btn-secondary w-full justify-center disabled:opacity-60">
              {saving ? "Kaydediliyor..." : "Randevu Oluştur"}
            </button>
          </div>
        </div>
      )}

      {/* Appointment list */}
      <div className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-sm">
        <h3 className="mb-3 mt-1.5 text-[18px] font-black text-slate-950">Randevu Listesi</h3>

        {loading ? (
          <p className="text-[13px] text-slate-500">Randevular yükleniyor...</p>
        ) : appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-[18px] text-[13px] font-bold text-slate-500">
            Bu danışan için henüz randevu yok.
          </div>
        ) : (
          <div className="grid gap-3.5">
            {appointments.map((item, index) => {
              const si = getAppointmentStatusInfo(item);
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
                      <div className="text-[15px] font-black text-slate-950">{item.title || "Görüşme"}</div>
                      <span className="rounded-full px-2 py-1 text-[11px] font-black"
                        style={{ background: si.bg, color: si.color, border: `1px solid ${si.border}` }}>
                        {si.label}
                      </span>
                    </div>
                    <div className="mt-[3px] text-[13px] font-extrabold text-indigo-600">{formatDateTimeTR(item.appointment_date)}</div>
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
                <span className="inline-flex rounded-full bg-white/14 px-2.5 py-1.5 text-[11px] font-black">Randevu Detayı</span>
                <h3 className="mt-2 text-[24px] font-black">{selectedAppointment.title || "Görüşme"}</h3>
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
                  <span className="text-[11px] font-bold text-slate-500">Danışan</span>
                  <strong className="text-[14px] text-slate-950">{clientName}</strong>
                </div>
                <div className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="text-[11px] font-bold text-slate-500">Tarih / Saat</span>
                  <strong className="text-[14px] text-slate-950">{formatDateTimeTR(selectedAppointment.appointment_date)}</strong>
                </div>
                <div className="grid gap-1 rounded-2xl p-3"
                  style={{ borderColor: getAppointmentStatusInfo(selectedAppointment).border, background: getAppointmentStatusInfo(selectedAppointment).bg, border: `1px solid ${getAppointmentStatusInfo(selectedAppointment).border}` }}>
                  <span className="text-[11px] font-bold text-slate-500">Durum</span>
                  <strong className="text-[14px]" style={{ color: getAppointmentStatusInfo(selectedAppointment).color }}>
                    {getAppointmentStatusInfo(selectedAppointment).label}
                  </strong>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <span className="block mb-1.5 text-[11px] font-bold text-slate-500">Not</span>
                <p className="text-[13px] text-slate-700">{selectedAppointment.notes || "Not girilmemiş."}</p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <button type="button" onClick={() => updateAppointmentStatus(selectedAppointment.id, "tamamlandi")} className="btn-success justify-center">Tamamlandı</button>
                <button type="button" onClick={() => updateAppointmentStatus(selectedAppointment.id, "iptal")} className="btn-danger justify-center">İptal Et</button>
                <button type="button" onClick={() => deleteAppointment(selectedAppointment.id)}
                  className="btn-danger justify-center" style={{ background: "linear-gradient(135deg, #020617, #1e293b)" }}>
                  Sil
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
      <span className="mb-0.5 block text-[11px] font-black" style={{ color }}>{label}</span>
      <strong className="text-[13px] text-slate-900">{value || "-"}</strong>
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
      onClick={() => setActiveTab(id)}
      className="min-h-[42px] whitespace-nowrap rounded-xl px-[18px] py-2.5 text-[13px] font-extrabold leading-[1.2] transition-all"
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
  if (!dogum.trim()) return null;

  const firstName = ad.trim();
  const lastName  = soyad.trim();
  const hasName   = Boolean(firstName || lastName);

  // ── 5 temel sayı ──────────────────────────────────────────────────────────
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

  const coreItems = [
    { label: "Hayat Yolu / DM", value: hayatYolu,     color: "#7c3aed" },
    { label: "İfade Sayısı",    value: kaderSayisi,   color: "#2563eb" },
    { label: "Ana Kulvar",      value: ruhSayisi,     color: "#16a34a" },
    { label: "Yan Kulvar",      value: kisilikSayisi, color: "#db2777" },
    { label: "Kişisel Yıl",    value: kisiselYil,    color: "#ea580c" },
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
        nearestPeakLabel = `${p.index}. zirve · ${p.age} yaş · ${p.topic}. çakra`;
        // Varsa sonraki zirveleri de kontrol et — en küçük yaşlı birincisi zaten
      }
    } catch { /* sessiz */ }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
      {/* Başlık */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-base text-violet-500">∞</span>
        <span className="text-[13px] font-black text-violet-900">Numeroloji Özeti</span>
        <span className="ml-auto inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-600">
          Salt Okunur · Otomatik
        </span>
        {!hasName && (
          <span className="text-[10px] font-bold text-slate-400">
            Ad/soyad girilince tamamlanır
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
            <span className="mt-1.5 text-center text-[10px] font-extrabold leading-tight text-slate-500">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Element dağılımı */}
      {hasElements && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl bg-white/60 px-3 py-2">
          <span className="text-[10px] font-black text-slate-500">Element:</span>
          {ELEMENT_ORDER.map((name) => {
            const meta = ELEMENT_META[name];
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                style={{ background: meta.bg, color: meta.color }}
              >
                {name} <strong>{elementCounts[name] ?? 0}</strong>
              </span>
            );
          })}
          {dominantElement && (
            <span className="ml-auto text-[10px] font-bold text-slate-400">
              baskın: {dominantElement}
            </span>
          )}
        </div>
      )}

      {/* En yakın zirve */}
      {nearestPeakLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-2">
          <span className="text-[10px] font-black text-slate-500">Zirve:</span>
          <span className="text-[11px] font-black text-indigo-700">{nearestPeakLabel}</span>
        </div>
      )}

      {/* Deeplink */}
      <div className="mt-3 flex justify-end">
        <Link
          href={buildAnalizHref(dogum, firstName, lastName)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3.5 py-2 text-[12px] font-black text-violet-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md"
        >
          ∞ Tam Numeroloji Analizi Aç →
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

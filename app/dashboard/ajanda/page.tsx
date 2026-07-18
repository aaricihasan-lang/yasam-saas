"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  Calendar,
  CheckCircle,
  Clock3,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Uzman API çağrıları için kimlik başlıkları (publishable supabase yerine). */
function userHeaders(json = false): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

type Client = {
  id: string;
  ad: string | null;
  soyad: string | null;
};

type AppointmentStatus = "bekliyor" | "tamamlandi" | "iptal";

type AppointmentFilter =
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "cancelled";

type Appointment = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status: AppointmentStatus | string | null;
};

function getStatusInfo(status: string | null | undefined) {
  if (status === "tamamlandi") {
    return {
      label: "Tamamlandı",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-100",
      panel: "border-emerald-100 bg-emerald-50",
      dot: "bg-emerald-500",
    };
  }

  if (status === "iptal") {
    return {
      label: "İptal Edildi",
      pill: "bg-rose-50 text-rose-700 border-rose-100",
      panel: "border-rose-100 bg-rose-50",
      dot: "bg-rose-500",
    };
  }

  return {
    label: "Bekliyor",
    pill: "bg-violet-50 text-violet-700 border-violet-100",
    panel: "border-violet-100 bg-violet-50",
    dot: "bg-violet-500",
  };
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

  return "border-l-cyan-500";
}

const FILTER_OPTIONS: { key: AppointmentFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "today", label: "Bugün" },
  { key: "upcoming", label: "Yaklaşan" },
  { key: "completed", label: "Tamamlanan" },
  { key: "cancelled", label: "İptal" },
];

// Randevu tarih/saatinin geçmişte olup olmadığı (YEREL kullanıcı günü; UTC kayması yok).
// Geçmiş gün → geçmiş; bugün geçmiş SAAT → geçmiş (WEB-06); bugün ileri saat/saatsiz → değil.
function isPastCalendarDay(dateStr: string): boolean {
  if (!dateStr) return false;
  const s = dateStr.trim();
  const dayPart = s.slice(0, 10);
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  const todayStr = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  if (dayPart < todayStr) return true;
  if (dayPart > todayStr) return false;
  if (s.length <= 10) return false;
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t < n.getTime();
}

export default function AjandaPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [filter, setFilter] = useState<AppointmentFilter>("all");
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [appointmentType, setAppointmentType] = useState<"kayitli" | "genel">("kayitli");
  const [formClientId, setFormClientId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState<AppointmentStatus>("bekliyor");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedApptIds, setSelectedApptIds] = useState<Set<string>>(() => new Set());
  const [wordBusy, setWordBusy] = useState(false);
  const [singleWordBusy, setSingleWordBusy] = useState(false);

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
  }, []);

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();

    clients.forEach((client) => {
      map.set(client.id, `${client.ad || ""} ${client.soyad || ""}`.trim());
    });

    return map;
  }, [clients]);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const nameA = `${a.ad || ""} ${a.soyad || ""}`.trim().toLowerCase();
      const nameB = `${b.ad || ""} ${b.soyad || ""}`.trim().toLowerCase();
      return nameA.localeCompare(nameB, "tr");
    });
  }, [clients]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();

    return appointments.filter(
      (item) => new Date(item.appointment_date).toDateString() === today
    ).length;
  }, [appointments]);

  const waitingCount = useMemo(() => {
    return appointments.filter(
      (item) => (item.status || "bekliyor") === "bekliyor"
    ).length;
  }, [appointments]);

  const completedCount = useMemo(() => {
    return appointments.filter((item) => item.status === "tamamlandi").length;
  }, [appointments]);

  const cancelledCount = useMemo(() => {
    return appointments.filter((item) => item.status === "iptal").length;
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appointments.filter((item) => {
      const appointmentDate = new Date(item.appointment_date);
      const appointmentDay = new Date(appointmentDate);
      appointmentDay.setHours(0, 0, 0, 0);
      const status = item.status || "bekliyor";

      if (filter === "today") {
        return appointmentDay.getTime() === today.getTime();
      }

      if (filter === "upcoming") {
        return (
          appointmentDate >= new Date() &&
          status !== "tamamlandi" &&
          status !== "iptal"
        );
      }

      if (filter === "completed") {
        return status === "tamamlandi";
      }

      if (filter === "cancelled") {
        return status === "iptal";
      }

      return true;
    });
  }, [appointments, filter]);

  const upcomingTop10 = useMemo(() => {
    const now = new Date();

    return appointments
      .filter((item) => {
        const status = item.status || "bekliyor";
        return (
          new Date(item.appointment_date) >= now &&
          status !== "tamamlandi" &&
          status !== "iptal"
        );
      })
      .sort(
        (a, b) =>
          new Date(a.appointment_date).getTime() -
          new Date(b.appointment_date).getTime()
      )
      .slice(0, 10);
  }, [appointments]);

  const toggleApptSelection = useCallback((id: string) => {
    setSelectedApptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedApptIds(new Set(filteredAppointments.map((a) => a.id)));
  }, [filteredAppointments]);

  const clearApptSelection = useCallback(() => setSelectedApptIds(new Set()), []);

  async function exportAjandaWord(mode: "all" | "selected" | "filtered" | "weekly" | "monthly") {
    if (!tenantId) return;
    setWordBusy(true);
    try {
      let appointmentIds: string[] | undefined;
      let dateRange: { start: string; end: string } | undefined;

      if (mode === "selected") {
        appointmentIds = [...selectedApptIds];
        if (!appointmentIds.length) return;
      } else if (mode === "filtered") {
        appointmentIds = filteredAppointments.map((a) => a.id);
        if (!appointmentIds.length) return;
      } else if (mode === "weekly") {
        const now = new Date();
        const dayOfWeek = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek + 1);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        dateRange = { start: monday.toISOString(), end: sunday.toISOString() };
      } else if (mode === "monthly") {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        dateRange = { start: start.toISOString(), end: end.toISOString() };
      }

      const res = await fetch("/api/ajanda/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: mode, appointmentIds, dateRange }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ajanda-${mode}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: "Başarılı", message: "Ajanda raporu indirildi.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  async function exportSingleAppointmentWord(apptId: string) {
    if (!tenantId) return;
    setSingleWordBusy(true);
    try {
      const res = await fetch("/api/ajanda/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, exportMode: "single", appointmentId: apptId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: "Hata", message: err.error || "Rapor oluşturulamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ajanda-tek-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ title: "Başarılı", message: "Tek randevu raporu indirildi.", type: "success" });
    } catch (err) {
      showToast({ title: "Hata", message: err instanceof Error ? err.message : "Bilinmeyen hata", type: "error" });
    } finally {
      setSingleWordBusy(false);
    }
  }

  function formatTime(value: string) {
    return new Date(value).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDateShort(value: string) {
    return new Date(value).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    });
  }

  async function loadClients() {
    if (!tenantId) return;

    const res = await fetch("/api/clients", { headers: userHeaders() });
    if (!res.ok) {
      showToast({
        title: "Danışanlar yüklenemedi",
        message: "Danışan listesi alınamadı.",
        type: "error",
      });
      return;
    }

    const json = (await res.json()) as { clients?: Client[] };
    const list = (json.clients ?? [])
      .slice()
      .sort((a, b) => (a.ad ?? "").localeCompare(b.ad ?? "", "tr"));
    setClients(list);
  }

  async function loadAppointments() {
    if (!tenantId) return;

    const res = await fetch("/api/appointments", { headers: userHeaders() });
    if (!res.ok) {
      showToast({
        title: "Randevular yüklenemedi",
        message: "Randevu listesi alınamadı.",
        type: "error",
      });
      return;
    }

    const json = (await res.json()) as { appointments?: Appointment[] };
    setAppointments(json.appointments ?? []);
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDay(value: string) {
    return new Date(value).toLocaleDateString("tr-TR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  }

  async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
    if (!tenantId) return;

    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: userHeaders(true),
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      showToast({
        title: "Durum güncellenemedi",
        message: "Randevu durumu güncellenemedi.",
        type: "error",
      });
      return;
    }

    setSelectedAppointment((oldItem) =>
      oldItem && oldItem.id === id ? { ...oldItem, status } : oldItem
    );

    await loadAppointments();
  }

  async function deleteAppointment(id: string) {
    const confirmDelete = await confirm({
      message: "Bu randevu silinsin mi?",
      tone: "danger",
      title: "Randevuyu sil",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!confirmDelete) return;

    if (!tenantId) return;

    const res = await fetch(`/api/appointments/${id}`, {
      method: "DELETE",
      headers: userHeaders(),
    });

    if (!res.ok) {
      showToast({
        title: "Silme hatası",
        message: "Randevu silinemedi.",
        type: "error",
      });
      return;
    }

    setSelectedAppointment(null);
    await loadAppointments();

    showToast({
      title: "Randevu silindi",
      message: "Randevu başarıyla kaldırıldı.",
      type: "success",
    });
  }

  function resetApptForm() {
    setFormTitle("");
    setFormDate("");
    setFormTime("");
    setFormNotes("");
    setFormStatus("bekliyor");
    setFormClientId("");
    setEditingId(null);
    setShowForm(false);
  }

  // "İptal Et" → önce global confirm, sonra durum PATCH. Vazgeçilirse API çağrısı yok.
  async function requestCancelAppointment(id: string) {
    const ok = await confirm({
      title: "Randevu iptal edilsin mi?",
      message: 'Bu randevunun durumu "İptal" olarak değiştirilecek.',
      confirmText: "Randevuyu İptal Et",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    await updateAppointmentStatus(id, "iptal");
  }

  // "Tamamlandı" → önce global confirm, sonra durum PATCH. Vazgeçilirse API çağrısı yok.
  async function requestCompleteAppointment(id: string) {
    const ok = await confirm({
      title: "Randevu tamamlandı olarak işaretlensin mi?",
      message: 'Bu randevunun durumu "Tamamlandı" olarak değiştirilecek.',
      confirmText: "Tamamlandı Yap",
      cancelText: "Vazgeç",
      tone: "success",
    });
    if (!ok) return;
    await updateAppointmentStatus(id, "tamamlandi");
  }

  // Yalnız "bekliyor" randevular düzenlenir. Mevcut form edit modunda kullanılır;
  // danışan sabit, durum değişmez; yalnız title/notes/appointment_date PATCH edilir.
  function openEditAppointment(appt: Appointment) {
    const d = new Date(appt.appointment_date);
    const p = (x: number) => String(x).padStart(2, "0");
    setEditingId(appt.id);
    setAppointmentType(appt.client_id ? "kayitli" : "genel");
    setFormClientId(appt.client_id ?? "");
    setFormTitle(appt.title ?? "");
    setFormNotes(appt.notes ?? "");
    setFormDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    setFormTime(`${p(d.getHours())}:${p(d.getMinutes())}`);
    setSelectedAppointment(null);
    setShowForm(true);
  }

  async function createAppointment() {
    if (!tenantId) return;

    if (appointmentType === "kayitli" && !formClientId) {
      showToast({ title: "Eksik bilgi", message: "Lütfen bir danışan seçin.", type: "warning" });
      return;
    }

    if (!formDate || !formTime) {
      showToast({ title: "Eksik bilgi", message: "Tarih ve saat seçmelisiniz.", type: "warning" });
      return;
    }

    if (!formTitle.trim()) {
      showToast({ title: "Eksik bilgi", message: "Lütfen başlık giriniz.", type: "warning" });
      return;
    }

    // Geçmiş takvim günü (dün ve öncesi) → uyarı + açık onay; form verisi korunur.
    if (isPastCalendarDay(formDate)) {
      const ok = await confirm({
        title: "Geçmiş tarihli randevu",
        message: "Seçtiğiniz tarih geçmişte. Bu randevuyu yine de kaydetmek istiyor musunuz?",
        confirmText: "Yine de Kaydet",
        cancelText: "Vazgeç",
        tone: "warning",
      });
      if (!ok) return;
    }

    const appointmentDate = new Date(`${formDate}T${formTime}`).toISOString();

    setSaving(true);

    // EDIT modu: yalnız title/notes/appointment_date PATCH (status/client_id/tenant_id gönderilmez).
    if (editingId) {
      const res = await fetch(`/api/appointments/${editingId}`, {
        method: "PATCH",
        headers: userHeaders(true),
        body: JSON.stringify({
          title: formTitle.trim(),
          notes: formNotes.trim() || null,
          appointment_date: appointmentDate,
        }),
      });

      if (!res.ok) {
        showToast({ title: "Güncelleme hatası", message: "Randevu güncellenemedi.", type: "error" });
        setSaving(false);
        return; // form ve edit bilgileri korunur
      }

      resetApptForm();
      setSaving(false);
      await loadAppointments();
      showToast({ title: "Başarılı", message: "Randevu güncellendi.", type: "success" });
      return;
    }

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: userHeaders(true),
      body: JSON.stringify({
        client_id: appointmentType === "kayitli" ? formClientId : null,
        title: formTitle.trim(),
        notes: formNotes.trim() || null,
        appointment_date: appointmentDate,
        status: formStatus,
      }),
    });

    if (!res.ok) {
      showToast({ title: "Kayıt hatası", message: "Randevu oluşturulamadı.", type: "error" });
      setSaving(false);
      return;
    }

    resetApptForm();
    setSaving(false);

    await loadAppointments();

    showToast({ title: "Başarılı", message: "Randevu oluşturuldu.", type: "success" });
  }

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      loadClients();
      loadAppointments();
    });
  }, [tenantId]);

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.14),transparent_25%),radial-gradient(circle_at_85%_10%,rgba(236,72,153,0.10),transparent_25%),radial-gradient(circle_at_50%_80%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef4ff_0%,#f6f2ff_45%,#fff4fa_100%)] px-5 py-5 text-slate-950 antialiased sm:px-6 lg:px-8">
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[480px] w-[480px] rounded-full bg-indigo-400/14 blur-[150px]" />
        <div className="absolute -right-20 top-0 h-[420px] w-[420px] rounded-full bg-pink-400/12 blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-teal-300/12 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1600px]">
        <header className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Ajanda & Randevu Merkezi
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
                Bugünkü akışı ve tüm randevuları yönetin.
              </p>
            </div>

            <button
              type="button"
              onClick={() => { if (showForm) resetApptForm(); else setShowForm(true); }}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black shadow-md transition hover:-translate-y-0.5 ${
                showForm
                  ? "border border-slate-200 bg-white text-slate-700"
                  : "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
              }`}
            >
              {showForm ? "Formu Kapat" : "+ Yeni Randevu Ekle"}
            </button>
          </div>

          {showForm && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-5 py-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">{editingId ? "Randevu Düzenle" : "Yeni Randevu Oluştur"}</h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{editingId ? "Yalnız başlık, tarih/saat ve notu güncelleyebilirsin." : "Danışana bağlı veya genel randevu ekleyebilirsin."}</p>
                </div>
                <button
                  type="button"
                  onClick={resetApptForm}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  Vazgeç
                </button>
              </div>

              <div className="p-5">
                {/* Randevu tipi — edit modunda gizli (danışan sabit) */}
                {!editingId && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setAppointmentType("kayitli"); setFormClientId(""); }}
                    className={`rounded-xl border px-4 py-3 text-sm font-black transition ${
                      appointmentType === "kayitli"
                        ? "border-indigo-300 bg-indigo-600 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    👤 Kayıtlı Danışan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAppointmentType("genel"); setFormClientId(""); }}
                    className={`rounded-xl border px-4 py-3 text-sm font-black transition ${
                      appointmentType === "genel"
                        ? "border-violet-300 bg-violet-600 text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    🗓️ Genel Randevu
                  </button>
                </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Sol kolon */}
                  <div className="space-y-3">
                    {appointmentType === "kayitli" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-black text-slate-700">Danışan Seç{editingId ? " (değiştirilemez)" : ""}</label>
                        <select
                          value={formClientId}
                          onChange={(e) => setFormClientId(e.target.value)}
                          disabled={!!editingId}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="">-- Danışan seçin --</option>
                          {sortedClients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {`${c.ad || ""} ${c.soyad || ""}`.trim() || "İsimsiz"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-black text-slate-700">Başlık</label>
                      <input
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Örn: Seans, Toplantı, Kişisel not..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-black text-slate-700">Tarih</label>
                        <input
                          type="date"
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-black text-slate-700">Saat</label>
                        <input
                          type="time"
                          value={formTime}
                          onChange={(e) => setFormTime(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sağ kolon */}
                  <div className="space-y-3">
                    {/* Durum — edit modunda gizli (durum yalnız Tamamlandı/İptal butonlarından değişir) */}
                    {!editingId && (
                    <div>
                      <label className="mb-1.5 block text-xs font-black text-slate-700">Durum</label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="bekliyor">Bekliyor</option>
                        <option value="tamamlandi">Tamamlandı</option>
                        <option value="iptal">İptal</option>
                      </select>
                    </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-black text-slate-700">Açıklama / Not</label>
                      <textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="İsteğe bağlı notlar..."
                        rows={4}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={resetApptForm}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={createAppointment}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-70"
                  >
                    {saving ? "Kaydediliyor..." : editingId ? "Güncelle" : "Randevu Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-indigo-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02]">
              <Users className="h-5 w-5 shrink-0 text-indigo-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-indigo-800">{appointments.length}</div>
                <div className="mt-0.5 text-xs font-bold text-indigo-600">Toplam</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02]">
              <Calendar className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-emerald-800">{todayCount}</div>
                <div className="mt-0.5 text-xs font-bold text-emerald-600">Bugün</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-violet-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02]">
              <Clock3 className="h-5 w-5 shrink-0 text-violet-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-violet-800">{waitingCount}</div>
                <div className="mt-0.5 text-xs font-bold text-violet-600">Bekliyor</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02]">
              <CheckCircle className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-amber-800">{completedCount}</div>
                <div className="mt-0.5 text-xs font-bold text-amber-600">Biten</div>
              </div>
            </div>

            <div className="col-span-2 flex items-center justify-center gap-3 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-rose-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02] sm:col-span-1 sm:justify-start">
              <XCircle className="h-5 w-5 shrink-0 text-rose-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-rose-800">{cancelledCount}</div>
                <div className="mt-0.5 text-xs font-bold text-rose-600">İptal</div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`min-h-[40px] rounded-full px-4 py-1.5 text-sm font-black transition-all lg:min-h-0 ${
                filter === option.key
                  ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md"
                  : "border border-white/80 bg-white/90 text-slate-700 shadow-sm hover:scale-[1.03]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Word export çubuğu */}
        {appointments.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 shadow-sm">
            <span className="shrink-0 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-blue-800 shadow-sm">
              {selectedApptIds.size > 0 ? `✓ ${selectedApptIds.size} seçili` : "Ajanda Word"}
            </span>
            <button type="button" disabled={wordBusy} onClick={selectAllFiltered}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
              Tümünü Seç ({filteredAppointments.length})
            </button>
            {selectedApptIds.size > 0 && (
              <button type="button" disabled={wordBusy} onClick={clearApptSelection}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-slate-500 shadow-sm hover:bg-slate-50 disabled:opacity-50">
                Seçimi Temizle
              </button>
            )}
            <div className="hidden h-4 w-px bg-blue-200 sm:block" aria-hidden />
            <button type="button" disabled={selectedApptIds.size === 0 || wordBusy} onClick={() => void exportAjandaWord("selected")}
              className="rounded-lg border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
              {wordBusy ? "⏳..." : `📄 Seçilenleri Word (${selectedApptIds.size})`}
            </button>
            {filter !== "all" && (
              <button type="button" disabled={wordBusy || filteredAppointments.length === 0} onClick={() => void exportAjandaWord("filtered")}
                className="rounded-lg border border-violet-400 bg-violet-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm hover:bg-violet-700 disabled:opacity-40">
                {wordBusy ? "⏳..." : `📄 Filtrelenmiş Word (${filteredAppointments.length})`}
              </button>
            )}
            <button type="button" disabled={wordBusy} onClick={() => void exportAjandaWord("weekly")}
              className="rounded-lg border border-cyan-400 bg-cyan-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm hover:bg-cyan-700 disabled:opacity-40">
              {wordBusy ? "⏳..." : "📄 Haftalık"}
            </button>
            <button type="button" disabled={wordBusy} onClick={() => void exportAjandaWord("monthly")}
              className="rounded-lg border border-teal-400 bg-teal-600 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm hover:bg-teal-700 disabled:opacity-40">
              {wordBusy ? "⏳..." : "📄 Aylık"}
            </button>
            <button type="button" disabled={wordBusy} onClick={() => void exportAjandaWord("all")}
              className="rounded-lg border border-slate-400 bg-slate-700 px-3 py-2 text-xs font-black min-h-[40px] lg:min-h-0 lg:py-1 text-white shadow-sm hover:bg-slate-800 disabled:opacity-40">
              {wordBusy ? "⏳..." : "📄 Tümünü Word"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_0.8fr]">
          <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-lg backdrop-blur-xl">
            <div className="mb-3">
              <h2 className="text-xl font-black text-slate-950">Tüm Randevu Akışı</h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Sistemdeki tüm randevular burada listelenir.
              </p>
              <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                {filteredAppointments.length} kayıt görüntüleniyor
              </p>
            </div>

            <div className="max-h-[calc(100vh-310px)] space-y-2.5 overflow-y-auto pr-1">
              {filteredAppointments.map((item, index) => {
                const statusInfo = getStatusInfo(item.status);
                const borderClass = getLeftBorderClass(
                  item.status,
                  item.appointment_date
                );
                const isSelected = selectedApptIds.has(item.id);

                return (
                  <div key={item.id} className="relative">
                    <label
                      className="absolute right-1 top-1 z-10 flex h-11 w-11 cursor-pointer items-center justify-center lg:right-2.5 lg:top-2.5 lg:h-5 lg:w-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleApptSelection(item.id)}
                        className="h-5 w-5 rounded border-slate-300 accent-indigo-600 lg:h-4 lg:w-4"
                      />
                    </label>
                  <button
                    type="button"
                    onClick={() => setSelectedAppointment(item)}
                    className={`group flex w-full flex-col rounded-xl border border-slate-200/80 border-l-[4px] bg-white/90 p-3.5 pr-8 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${borderClass} ${isSelected ? "ring-2 ring-indigo-300/50" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-black text-white shadow-sm">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                              {formatDay(item.appointment_date)}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-black ${statusInfo.pill}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>

                          <div className="mt-1 text-base font-black text-slate-950">
                            {item.title || "Görüşme"}
                          </div>

                          <div className="mt-0.5 text-xs font-semibold text-slate-500">
                            {item.client_id ? (
                              clientMap.get(item.client_id) || "Danışan"
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-black text-violet-700">
                                Genel Randevu
                              </span>
                            )}
                          </div>

                          {item.notes && (
                            <div className="mt-2 line-clamp-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                              {item.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white shadow-sm">
                        <div className="text-[10px] font-bold text-slate-300">Tarih / Saat</div>
                        <div className="mt-0.5 text-xs font-black">
                          {formatDate(item.appointment_date)}
                        </div>
                      </div>
                    </div>
                  </button>
                  </div>
                );
              })}

              {filteredAppointments.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-xl">
                    ✨
                  </div>
                  <div className="text-sm font-black text-slate-800">
                    Bu filtrede randevu yok.
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Yukarıdaki "+ Yeni Randevu Ekle" butonu ile kayıt oluşturabilirsin.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-lg backdrop-blur-xl">
            <div className="mb-3">
              <h2 className="text-lg font-black text-slate-950">
                Yaklaşan İlk 10 Randevu
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                En yakın görüşmeler zaman çizelgesi.
              </p>
            </div>

            <div className="max-h-[calc(100vh-280px)] space-y-1 overflow-y-auto pr-1">
              {upcomingTop10.map((item, index) => {
                const statusInfo = getStatusInfo(item.status);

                return (
                  <div key={item.id} className="relative pl-9">
                    {index < upcomingTop10.length - 1 && (
                      <div
                        className="absolute left-[15px] top-10 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 to-transparent"
                        aria-hidden
                      />
                    )}

                    <div
                      className="absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-indigo-100 shadow-sm"
                      aria-hidden
                    >
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.2} />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedAppointment(item)}
                      className="mb-2 w-full rounded-xl border border-slate-200/80 bg-white/90 p-3 text-left shadow-sm transition-all hover:translate-x-1 hover:border-indigo-200 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-indigo-700">
                          {formatDateShort(item.appointment_date)}
                        </span>
                        <span className="text-xs font-bold text-slate-600">
                          {formatTime(item.appointment_date)}
                        </span>
                      </div>

                      <div className="mt-1 text-sm font-bold text-slate-800">
                        {item.title || "Görüşme"}
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-black ${statusInfo.pill}`}
                        >
                          {statusInfo.label}
                        </span>
                        {item.client_id && (
                          <span className="truncate text-xs text-slate-400">
                            {clientMap.get(item.client_id)}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}

              {upcomingTop10.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center">
                  <p className="text-sm font-black text-slate-700">
                    Yaklaşan randevu yok.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>

        {selectedAppointment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-[20px] bg-white shadow-2xl">
              <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 p-4 text-white">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-violet-200">
                      Randevu Detayı
                    </div>

                    <h3 className="mt-1 text-xl font-black">
                      {selectedAppointment.title || "Görüşme"}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedAppointment(null)}
                    className="h-8 w-8 rounded-full bg-white/15 text-lg font-bold hover:bg-white/25"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 p-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="text-xs font-bold text-emerald-600">
                    {selectedAppointment.client_id ? "Danışan" : "Randevu Tipi"}
                  </div>

                  <div className="text-sm font-black text-emerald-900">
                    {selectedAppointment.client_id ? (
                      clientMap.get(selectedAppointment.client_id) || "Danışan"
                    ) : (
                      <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-2.5 py-0.5 text-xs font-black text-violet-700">
                        🗓️ Genel Randevu
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <div className="text-xs font-bold text-indigo-600">Tarih / Saat</div>

                  <div className="text-sm font-black text-indigo-900">
                    {formatDate(selectedAppointment.appointment_date)}
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-3 ${
                    getStatusInfo(selectedAppointment.status).panel
                  }`}
                >
                  <div className="text-xs font-bold text-slate-600">Durum</div>

                  <div className="flex items-center gap-1.5 text-sm font-black text-slate-950">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        getStatusInfo(selectedAppointment.status).dot
                      }`}
                    />
                    {getStatusInfo(selectedAppointment.status).label}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <div className="text-xs font-bold text-amber-700">Notlar</div>

                  <div className="whitespace-pre-wrap text-xs font-semibold text-amber-950">
                    {selectedAppointment.notes || "Not girilmemiş."}
                  </div>
                </div>

                {/* Tek randevu Word butonu */}
                <button
                  type="button"
                  disabled={singleWordBusy}
                  onClick={() => void exportSingleAppointmentWord(selectedAppointment.id)}
                  className="w-full rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  {singleWordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
                </button>

                {(selectedAppointment.status ?? "bekliyor") === "bekliyor" && (
                  <button
                    type="button"
                    onClick={() => openEditAppointment(selectedAppointment)}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-xs font-black text-indigo-800 transition hover:bg-indigo-100"
                  >
                    Düzenle
                  </button>
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => void requestCompleteAppointment(selectedAppointment.id)}
                    className="rounded-xl bg-emerald-600 p-2.5 text-xs font-black text-white shadow-md shadow-emerald-100 transition hover:bg-emerald-700"
                  >
                    Tamamlandı
                  </button>

                  <button
                    type="button"
                    onClick={() => void requestCancelAppointment(selectedAppointment.id)}
                    className="rounded-xl bg-rose-600 p-2.5 text-xs font-black text-white shadow-md shadow-rose-100 transition hover:bg-rose-700"
                  >
                    İptal Et
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteAppointment(selectedAppointment.id)}
                    className="rounded-xl bg-slate-950 p-2.5 text-xs font-black text-white shadow-md shadow-slate-200 transition hover:bg-black"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import {
  Calendar,
  CheckCircle,
  Clock3,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

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

export default function AjandaPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [filter, setFilter] = useState<AppointmentFilter>("all");
  const [tenantId, setTenantId] = useState<string | null>(null);

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

    const { data, error } = await supabase
      .from("clients")
      .select("id, ad, soyad")
      .eq("tenant_id", tenantId)
      .order("ad", { ascending: true });

    if (error) {
      showToast({
        title: "Danışanlar yüklenemedi",
        message: error.message,
        type: "error",
      });
      return;
    }

    setClients(data || []);
  }

  async function loadAppointments() {
    if (!tenantId) return;

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("appointment_date", { ascending: true });

    if (error) {
      showToast({
        title: "Randevular yüklenemedi",
        message: error.message,
        type: "error",
      });
      return;
    }

    setAppointments(data || []);
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

    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      showToast({
        title: "Durum güncellenemedi",
        message: error.message,
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

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      showToast({
        title: "Silme hatası",
        message: error.message,
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

  useEffect(() => {
    if (!tenantId) return;

    runInEffect(() => {
      loadClients();
      loadAppointments();
    });
  }, [tenantId]);

  return (
    <main className="relative w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.14),transparent_25%),radial-gradient(circle_at_85%_10%,rgba(236,72,153,0.10),transparent_25%),radial-gradient(circle_at_50%_80%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef4ff_0%,#f6f2ff_45%,#fff4fa_100%)] px-5 py-5 text-slate-950 antialiased sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[480px] w-[480px] rounded-full bg-indigo-400/14 blur-[150px]" />
        <div className="absolute -right-20 top-0 h-[420px] w-[420px] rounded-full bg-pink-400/12 blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-teal-300/12 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full">
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

            <Link
              href="/dashboard/clients"
              className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5"
            >
              + Yeni Kayıt
            </Link>
          </div>

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

            <div className="flex items-center gap-3 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-rose-100/60 px-4 py-3 shadow-sm transition-all hover:scale-[1.02] sm:col-span-3 xl:col-span-1">
              <XCircle className="h-5 w-5 shrink-0 text-rose-600" strokeWidth={2.2} />
              <div>
                <div className="text-xl font-black leading-none text-rose-800">{cancelledCount}</div>
                <div className="mt-0.5 text-xs font-bold text-rose-600">İptal</div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-black transition-all ${
                filter === option.key
                  ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md"
                  : "border border-white/80 bg-white/90 text-slate-700 shadow-sm hover:scale-[1.03]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

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

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAppointment(item)}
                    className={`group flex w-full flex-col rounded-xl border border-slate-200/80 border-l-[4px] bg-white/90 p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${borderClass}`}
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
                            {item.client_id
                              ? clientMap.get(item.client_id) || "Danışan"
                              : "Danışan seçilmemiş"}
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
                    Randevular danışan detayından oluşturulabilir.
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
                  <div className="text-xs font-bold text-emerald-600">Danışan</div>

                  <div className="text-sm font-black text-emerald-900">
                    {selectedAppointment.client_id
                      ? clientMap.get(selectedAppointment.client_id) || "Danışan"
                      : "Danışan seçilmemiş"}
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

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateAppointmentStatus(
                        selectedAppointment.id,
                        "tamamlandi"
                      )
                    }
                    className="rounded-xl bg-emerald-600 p-2.5 text-xs font-black text-white shadow-md shadow-emerald-100 transition hover:bg-emerald-700"
                  >
                    Tamamlandı
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateAppointmentStatus(selectedAppointment.id, "iptal")
                    }
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

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

export default function AjandaPage() {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [filter, setFilter] = useState<AppointmentFilter>("all");

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

  async function loadClients() {
    const { data, error } = await supabase
      .from("clients")
      .select("id, ad, soyad")
      .eq("tenant_id", TENANT_ID)
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
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("tenant_id", TENANT_ID)
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
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .eq("tenant_id", TENANT_ID);

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

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", TENANT_ID);

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
    loadClients();
    loadAppointments();
  }, []);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7fbff_0%,#f5f1ff_45%,#f5fff8_100%)] p-3 text-slate-950 lg:p-4">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-3 overflow-hidden rounded-[20px] border border-white/80 bg-white/80 shadow-[0_16px_42px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link
                  href="/"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ← Ana Panele Dön
                </Link>

                <span className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[11px] font-black text-white shadow-md shadow-violet-100">
                  Ajanda
                </span>
              </div>

              <h1 className="text-[24px] font-black tracking-tight text-slate-950">
                Ajanda & Randevu Yönetimi
              </h1>

              <p className="mt-1 max-w-2xl text-[12px] font-medium text-slate-500">
                Randevuları takip et, durumlarını yönet, günlük akışı net gör.
              </p>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-center">
                <div className="text-[16px] font-black text-indigo-700">
                  {appointments.length}
                </div>
                <div className="text-[9px] font-black text-indigo-500">
                  Toplam
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                <div className="text-[16px] font-black text-emerald-700">
                  {todayCount}
                </div>
                <div className="text-[9px] font-black text-emerald-500">
                  Bugün
                </div>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-center">
                <div className="text-[16px] font-black text-violet-700">
                  {waitingCount}
                </div>
                <div className="text-[9px] font-black text-violet-500">
                  Bekliyor
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                <div className="text-[16px] font-black text-amber-700">
                  {completedCount}
                </div>
                <div className="text-[9px] font-black text-amber-500">
                  Biten
                </div>
              </div>

              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-center">
                <div className="text-[16px] font-black text-rose-700">
                  {cancelledCount}
                </div>
                <div className="text-[9px] font-black text-rose-500">
                  İptal
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[20px] border border-white/85 bg-white/86 p-4 shadow-[0_16px_42px_rgba(15,23,42,0.055)] backdrop-blur">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700">
                Randevu Listesi
              </div>

              <h2 className="mt-1 text-[20px] font-black text-slate-950">
                Yaklaşan Görüşmeler
              </h2>

              <p className="text-[11px] font-medium text-slate-500">
                Randevuya tıklayınca detay penceresi açılır.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAppointments}
              className="rounded-full bg-slate-950 px-4 py-2 text-[11px] font-black text-white shadow-md transition hover:bg-slate-800"
            >
              Yenile · {filteredAppointments.length} kayıt
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-1.5 md:grid-cols-5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                filter === "all"
                  ? "bg-slate-950 text-white shadow-md"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Tümü
            </button>

            <button
              type="button"
              onClick={() => setFilter("today")}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                filter === "today"
                  ? "bg-emerald-700 text-white shadow-md"
                  : "border border-emerald-100 bg-emerald-50 text-emerald-700"
              }`}
            >
              Bugün
            </button>

            <button
              type="button"
              onClick={() => setFilter("upcoming")}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                filter === "upcoming"
                  ? "bg-violet-700 text-white shadow-md"
                  : "border border-violet-100 bg-violet-50 text-violet-700"
              }`}
            >
              Yaklaşan
            </button>

            <button
              type="button"
              onClick={() => setFilter("completed")}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                filter === "completed"
                  ? "bg-amber-700 text-white shadow-md"
                  : "border border-amber-100 bg-amber-50 text-amber-700"
              }`}
            >
              Tamamlanan
            </button>

            <button
              type="button"
              onClick={() => setFilter("cancelled")}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                filter === "cancelled"
                  ? "bg-rose-700 text-white shadow-md"
                  : "border border-rose-100 bg-rose-50 text-rose-700"
              }`}
            >
              İptal
            </button>
          </div>

          <div className="space-y-2">
            {filteredAppointments.map((item, index) => {
              const statusInfo = getStatusInfo(item.status);

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedAppointment(item)}
                  className="group w-full overflow-hidden rounded-[16px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_175px]">
                    <div className="flex gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xs font-black text-white shadow-md shadow-violet-100">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-700">
                            {formatDay(item.appointment_date)}
                          </span>

                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusInfo.pill}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        <div className="mt-1 text-[15px] font-black text-slate-950">
                          {item.title || "Görüşme"}
                        </div>

                        <div className="text-[11px] font-semibold text-slate-500">
                          {item.client_id
                            ? clientMap.get(item.client_id) || "Danışan"
                            : "Danışan seçilmemiş"}
                        </div>

                        {item.notes && (
                          <div className="mt-2 line-clamp-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                            {item.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-gradient-to-br from-slate-950 to-slate-800 px-3 py-2 text-white md:border-l md:border-t-0">
                      <div>
                        <div className="text-[10px] font-bold text-slate-300">
                          Tarih / Saat
                        </div>
                        <div className="mt-1 text-[11px] font-black">
                          {formatDate(item.appointment_date)}
                        </div>
                      </div>

                      <span className="text-lg opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                        →
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredAppointments.length === 0 && (
              <div className="rounded-[18px] border-2 border-dashed border-slate-300 bg-white/70 p-6 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-xl">
                  ✨
                </div>

                <div className="text-sm font-black text-slate-800">
                  Bu filtrede randevu yok.
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Randevular danışan detayından oluşturulacak.
                </div>
              </div>
            )}
          </div>
        </section>

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
                    Danışan
                  </div>

                  <div className="text-sm font-black text-emerald-900">
                    {selectedAppointment.client_id
                      ? clientMap.get(selectedAppointment.client_id) || "Danışan"
                      : "Danışan seçilmemiş"}
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <div className="text-xs font-bold text-indigo-600">
                    Tarih / Saat
                  </div>

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

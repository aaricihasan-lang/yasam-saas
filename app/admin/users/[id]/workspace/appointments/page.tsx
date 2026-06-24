"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Home, Loader2, Search } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const filterInputClass =
  "mt-2 h-12 w-full rounded-2xl border-2 border-sky-100 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

const searchInputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-sky-100 bg-white px-4 pl-12 text-base font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

type AppointmentStatus = "bekliyor" | "tamamlandi" | "iptal";

type ClientNameRow = {
  id: string;
  ad: string | null;
  soyad: string | null;
};

type ReadonlyAppointment = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status: string | null;
};

const STATUS_FILTER_OPTIONS: { value: "" | AppointmentStatus; label: string }[] = [
  { value: "", label: "Tüm durumlar" },
  { value: "bekliyor", label: "Bekliyor" },
  { value: "tamamlandi", label: "Tamamlandı" },
  { value: "iptal", label: "İptal" },
];

const STATUS_BADGE_STYLES: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  bekliyor: {
    label: "Bekliyor",
    className: "bg-violet-100 text-violet-900 ring-violet-200",
  },
  tamamlandi: {
    label: "Tamamlandı",
    className: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  },
  iptal: {
    label: "İptal",
    className: "bg-rose-100 text-rose-900 ring-rose-200",
  },
};

function formatDateTimeTR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(value: string | null | undefined): AppointmentStatus {
  const s = String(value ?? "bekliyor").trim().toLowerCase();
  if (s === "tamamlandi" || s === "iptal") return s;
  return "bekliyor";
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = normalizeStatus(status);
  const meta = STATUS_BADGE_STYLES[normalized];
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function mapAppointmentRow(row: Record<string, unknown>): ReadonlyAppointment {
  return {
    id: String(row.id ?? ""),
    title: row.title != null ? String(row.title) : null,
    notes: row.notes != null ? String(row.notes) : null,
    appointment_date:
      row.appointment_date != null ? String(row.appointment_date) : "",
    created_at: row.created_at != null ? String(row.created_at) : "",
    client_id: row.client_id != null ? String(row.client_id) : null,
    status: row.status != null ? String(row.status) : null,
  };
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-3) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function AdminWorkspaceAppointmentsPage() {
  useBfcacheRefresh();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [appointments, setAppointments] = useState<ReadonlyAppointment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AppointmentStatus>("");

  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());

  const filteredAppointments = useMemo(() => {
    const q = search.trim().toLowerCase();

    return appointments.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const clientName = item.client_id
        ? (clientNames.get(item.client_id) || "").toLowerCase()
        : "";
      const status = normalizeStatus(item.status);

      const searchOk =
        !q || title.includes(q) || clientName.includes(q);
      const statusOk = !statusFilter || status === statusFilter;

      return searchOk && statusOk;
    });
  }, [appointments, search, statusFilter, clientNames]);

  const loadExpertAndAppointments = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    let userRow: Record<string, unknown> | null = null;
    let userError: { message: string } | null = null;
    {
      const adminId = readYasamUser()?.id;
      const userRes = await fetch(`/api/admin/users/${userId}`, {
        headers: adminHeaders(adminId),
      });
      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => ({}))) as { user?: Record<string, unknown> };
        userRow = userJson.user ?? null;
      } else {
        userError = { message: `HTTP ${userRes.status}` };
      }
    }

    if (userError || !userRow) {
      console.error("Uzman yükleme hatası:", userError);
      setExpert(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = userRow as Record<string, unknown>;
    const mapped = mapDbUser(row);
    const activeTenantId =
      row.tenant_id != null ? String(row.tenant_id).trim() : "";

    setExpert(mapped);
    setNotFound(false);

    if (!isExpertModuleEnabled(mapped, "appointments")) {
      setAppointments([]);
      setClientNames(new Map());
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setAppointments([]);
      setLoadError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      setLoading(false);
      return;
    }

    const [clientsRes, appointmentsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, ad, soyad")
        .eq("tenant_id", activeTenantId),
      supabase
        .from("appointments")
        .select(
          "id, title, notes, appointment_date, created_at, client_id, status",
        )
        .eq("tenant_id", activeTenantId)
        .order("appointment_date", { ascending: false }),
    ]);

    const nameMap = new Map<string, string>();
    (clientsRes.data ?? []).forEach((c) => {
      const client = c as ClientNameRow;
      const name = `${client.ad || ""} ${client.soyad || ""}`.trim();
      if (client.id) nameMap.set(client.id, name || "—");
    });
    setClientNames(nameMap);

    if (appointmentsRes.error) {
      console.error("Randevu listesi hatası:", appointmentsRes.error);
      setAppointments([]);
      setLoadError(appointmentsRes.error.message);
      setLoading(false);
      return;
    }

    setAppointments(
      (appointmentsRes.data ?? []).map((item) =>
        mapAppointmentRow(item as Record<string, unknown>),
      ),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpertAndAppointments();
  }, [sessionChecked, allowed, loadExpertAndAppointments]);

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "appointments") : false;

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <p className="text-xl font-black text-rose-950">Erişim reddedildi</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
          <Link href="/" className={`${navBtn} mt-6 border-violet-300 bg-violet-50 text-violet-950`}>
            Ana Panele Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-rose-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            <Link
              href={`/admin/users/${userId}/workspace`}
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950`}
            >
              Uzman Çalışma Alanına Dön
            </Link>
            <Link
              href={`/admin/users/${userId}`}
              className={`${navBtn} border-indigo-300/80 bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-950`}
            >
              Kullanıcı Detayına Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
          </div>
        </nav>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : notFound || !expert ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Üye bulunamadı</p>
            <Link
              href="/admin/users"
              className={`${navBtn} mt-6 inline-flex max-w-md`}
            >
              Kullanıcı yönetimine dön
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md">
                  <CalendarDays className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Ajanda / Randevu İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Randevu ekleme,
                    düzenleme veya silme yapılamaz.
                  </p>
                  <p className="mt-3 text-sm font-bold text-indigo-900">
                    {expert.fullName} · {expert.email}
                  </p>
                </div>
              </div>
            </header>

            {!moduleEnabled ? (
              <section
                className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
                role="alert"
              >
                <p className="text-base font-black text-rose-950">
                  Bu modül kullanıcıda aktif değil.
                </p>
                <p className="mt-2 text-sm font-medium text-rose-900/80">
                  Ajanda modülü bu uzman için kapalı. Liste görüntülenemez.
                </p>
                <Link
                  href={`/admin/users/${userId}/workspace`}
                  className={`${navBtn} mt-5 inline-flex max-w-md border-violet-300 bg-violet-50 text-violet-950`}
                >
                  Uzman Çalışma Alanına Dön
                </Link>
              </section>
            ) : (
              <>
                <section
                  className={`${panelClass} border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90`}
                  role="note"
                >
                  <p className="text-sm font-bold leading-relaxed text-amber-950 md:text-base">
                    Randevular, mevcut ajanda modülüyle aynı şekilde uzmanın
                    çalışma alanına (tenant) göre listelenir.
                  </p>
                </section>

                <section className={`${panelClass} border-sky-200/80`}>
                  <h2 className="text-lg font-black text-slate-950">
                    Arama ve Filtre
                  </h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-sm font-black text-slate-800">
                        Başlık veya danışan adı
                      </span>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-500"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Randevu başlığı veya danışan ara…"
                          className={searchInputClass}
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-sm font-black text-slate-800">Durum</span>
                      <select
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(
                            e.target.value as "" | AppointmentStatus,
                          )
                        }
                        className={filterInputClass}
                      >
                        {STATUS_FILTER_OPTIONS.map((opt) => (
                          <option key={opt.value || "all"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className={`${panelClass} border-slate-200/80`}>
                  <h2 className="text-xl font-black text-slate-950">
                    Randevu Listesi
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {filteredAppointments.length} kayıt
                    {search.trim() || statusFilter ? " (filtrelenmiş)" : ""}
                  </p>

                  {loadError ? (
                    <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                      {loadError}
                    </p>
                  ) : null}

                  {!loadError && filteredAppointments.length === 0 ? (
                    <p className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                      {appointments.length === 0
                        ? "Bu uzmana ait randevu kaydı bulunamadı."
                        : "Filtreye uygun randevu bulunamadı."}
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto rounded-2xl border-2 border-slate-100">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-100 bg-slate-50/90">
                            {[
                              "Randevu Başlığı",
                              "Danışan",
                              "Randevu Tarihi",
                              "Durum",
                              "Notlar",
                              "Oluşturulma Tarihi",
                              "İşlem",
                            ].map((col) => (
                              <th
                                key={col}
                                className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAppointments.map((item) => {
                            const clientLabel = item.client_id
                              ? clientNames.get(item.client_id) || "—"
                              : "—";

                            return (
                              <tr
                                key={item.id}
                                className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                              >
                                <td className="max-w-[200px] px-4 py-3 font-bold text-slate-900">
                                  {item.title?.trim() || "—"}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                  {item.client_id && clientLabel && clientLabel !== "—"
                                    ? clientLabel
                                    : "—"}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                  {formatDateTimeTR(item.appointment_date)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <StatusBadge status={item.status} />
                                </td>
                                <td className="max-w-[240px] px-4 py-3 font-medium text-slate-700">
                                  <span className="line-clamp-2">
                                    {item.notes?.trim() || "—"}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                  {formatCreatedAt(item.created_at)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3">
                                  <Link
                                    href={`/admin/users/${userId}/workspace/appointments/${item.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-950 transition hover:border-sky-300 hover:bg-sky-100 no-underline"
                                  >
                                    <span aria-hidden>👁</span>
                                    Detay Gör
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

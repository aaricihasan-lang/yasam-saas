"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
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

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

type AppointmentStatus = "bekliyor" | "tamamlandi" | "iptal";

type AppointmentDetail = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status: string | null;
};

type ClientSession = {
  id: string;
  session_date: string | null;
  session_type: string | null;
  duration_minutes: number | null;
  fee: number | null;
  session_note: string | null;
  actions_done: string | null;
  suggestions: string | null;
  next_plan: string | null;
  created_at: string;
};

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

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
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

function mapAppointmentRow(row: Record<string, unknown>): AppointmentDetail {
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

function EmptyRecord() {
  return <p className="text-sm font-bold text-slate-500">kayıt yok</p>;
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const text = value?.trim();
  return (
    <div>
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">
        {text || "—"}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`${panelClass} border-slate-200/80`}>
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-3) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function AdminWorkspaceAppointmentDetailPage() {
  useBfcacheRefresh();
  const params = useParams();
  const expertUserId = typeof params.id === "string" ? params.id : "";
  const appointmentId =
    typeof params.appointmentId === "string" ? params.appointmentId : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ClientSession[]>([]);

  const loadDetail = useCallback(async () => {
    if (!expertUserId || !appointmentId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    let userRow: Record<string, unknown> | null = null;
    let userError: { message: string } | null = null;
    {
      const adminId = readYasamUser()?.id;
      const userRes = await fetch(`/api/admin/users/${expertUserId}`, {
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
      setNotFound(true);
      setLoading(false);
      return;
    }

    const expertRow = userRow as Record<string, unknown>;
    const mappedExpert = mapDbUser(expertRow);
    const tenantId =
      expertRow.tenant_id != null ? String(expertRow.tenant_id).trim() : "";

    setExpert(mappedExpert);

    if (!isExpertModuleEnabled(mappedExpert, "appointments")) {
      setModuleDisabled(true);
      setNotFound(false);
      setLoading(false);
      return;
    }

    if (!tenantId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (appointmentError || !appointmentRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const mapped = mapAppointmentRow(appointmentRow as Record<string, unknown>);
    setAppointment(mapped);
    setModuleDisabled(false);
    setNotFound(false);

    if (mapped.client_id) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("ad, soyad")
        .eq("id", mapped.client_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (clientRow) {
        const c = clientRow as { ad?: string | null; soyad?: string | null };
        const name = `${c.ad || ""} ${c.soyad || ""}`.trim();
        setClientName(name || null);
      } else {
        setClientName(null);
      }

      const { data: sessionsData } = await supabase
        .from("client_sessions")
        .select(
          "id, session_date, session_type, duration_minutes, fee, session_note, actions_done, suggestions, next_plan, created_at",
        )
        .eq("client_id", mapped.client_id)
        .eq("tenant_id", tenantId)
        .order("session_date", { ascending: false });

      setSessions((sessionsData ?? []) as ClientSession[]);
    } else {
      setClientName(null);
      setSessions([]);
    }

    setLoading(false);
  }, [expertUserId, appointmentId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadDetail();
  }, [sessionChecked, allowed, loadDetail]);

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
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : moduleDisabled ? (
          <section
            className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
          >
            <p className="text-base font-black text-rose-950">
              Bu modül kullanıcıda aktif değil.
            </p>
          </section>
        ) : notFound || !appointment ? (
          <section className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Randevu bulunamadı</p>
          </section>
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
                    Randevu Detay İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran admin salt okunur görüntüleme alanıdır.
                  </p>
                  {expert ? (
                    <p className="mt-2 text-xs font-bold text-indigo-900">
                      Uzman: {expert.fullName} · {expert.email}
                    </p>
                  ) : null}
                </div>
              </div>
            </header>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-xl font-black text-slate-950">Randevu Bilgileri</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ReadonlyField
                  label="Başlık"
                  value={appointment.title}
                />
                <ReadonlyField
                  label="Danışan"
                  value={clientName}
                />
                <ReadonlyField
                  label="Randevu Tarihi"
                  value={formatDateTimeTR(appointment.appointment_date)}
                />
                <div>
                  <p className="text-xs font-black uppercase text-slate-500">Durum</p>
                  <div className="mt-2">
                    <StatusBadge status={appointment.status} />
                  </div>
                </div>
                <ReadonlyField
                  label="Oluşturma Tarihi"
                  value={formatCreatedAt(appointment.created_at)}
                />
                <ReadonlyField
                  label="Notlar"
                  value={appointment.notes}
                />
              </div>
            </section>

            <SectionCard title="Seans Bilgileri">
              {!appointment.client_id ? (
                <p className="text-sm font-medium text-slate-600">
                  Bu randevuya bağlı danışan kaydı yok.
                </p>
              ) : sessions.length === 0 ? (
                <EmptyRecord />
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-slate-600">
                    Danışana ait seans kayıtları (salt okunur).
                  </p>
                  {sessions.map((session) => (
                    <article
                      key={session.id}
                      className="rounded-2xl border-2 border-teal-100 bg-teal-50/50 p-4"
                    >
                      <p className="text-base font-black text-slate-900">
                        {session.session_type || "Seans"} ·{" "}
                        {formatDateTimeTR(session.session_date)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Süre: {session.duration_minutes ?? "—"} dk · Ücret:{" "}
                        {formatMoney(session.fee)}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ReadonlyField
                          label="Seans Notu"
                          value={session.session_note}
                        />
                        <ReadonlyField
                          label="Yapılanlar"
                          value={session.actions_done}
                        />
                        <ReadonlyField
                          label="Öneriler"
                          value={session.suggestions}
                        />
                        <ReadonlyField
                          label="Sonraki Plan"
                          value={session.next_plan}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </main>
  );
}

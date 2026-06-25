"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, UsersRound } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { notesToPlainText } from "@/lib/clientNotes";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const MIZAC_LABELS: Record<string, string> = {
  safra: "Safra",
  sovdavi: "Sovdavi",
  dem: "Dem",
  balgam: "Balgam",
};

const HOMEWORK_STATUS_LABELS: Record<string, string> = {
  devam: "Devam ediyor",
  tamamlandi: "Tamamlandı",
  gecikti: "Gecikti",
  iptal: "İptal",
};

type ClientProfile = {
  id: string;
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  dogum: string | null;
  gorusme: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
  created_at: string | null;
};

type ClientNotes = {
  saglik_notu: string | null;
  adres: string | null;
  oneriler: string | null;
  notlar: string | null;
};

type ClientStone = {
  id: string;
  stone_name: string | null;
  stone_type: string | null;
  stone_date: string | null;
  note: string | null;
  usage_area: string | null;
  combination_text: string | null;
  warning_text: string | null;
  other_notes: string | null;
  created_at: string;
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

type ClientHomework = {
  id: string;
  title: string | null;
  homework_type: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  expert_note: string | null;
  client_feedback: string | null;
  created_at: string;
};

type ClientAnalysis = {
  id: string;
  analysis_type: string | null;
  note: string | null;
  created_at: string;
};

function formatDateTR(date: string | null | undefined): string {
  if (!date) return "—";
  const raw = date.trim();
  if (raw.includes("T")) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  }
  const parts = raw.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return raw;
}

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

function formatMizac(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.trim().toLowerCase();
  return MIZAC_LABELS[key] ?? value;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAnalysisLabel(type: string | null | undefined): string {
  if (type === "chakra") return "Çakra Analizi";
  if (type === "planet") return "Ç.Gezegen Analizi";
  return type?.trim() || "Analiz";
}

function mapClientProfile(row: Record<string, unknown>): ClientProfile {
  return {
    id: String(row.id ?? ""),
    ad: row.ad != null ? String(row.ad) : null,
    soyad: row.soyad != null ? String(row.soyad) : null,
    telefon: row.telefon != null ? String(row.telefon) : null,
    dogum: row.dogum != null ? String(row.dogum) : null,
    gorusme: row.gorusme != null ? String(row.gorusme) : null,
    burc: row.burc != null ? String(row.burc) : null,
    kan: row.kan != null ? String(row.kan) : null,
    mizac: row.mizac != null ? String(row.mizac) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
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

export default function AdminWorkspaceClientDetailPage() {
  useBfcacheRefresh();
  const params = useParams();
  const expertUserId = typeof params.id === "string" ? params.id : "";
  const clientId = typeof params.clientId === "string" ? params.clientId : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [notes, setNotes] = useState<ClientNotes | null>(null);
  const [stones, setStones] = useState<ClientStone[]>([]);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [homeworks, setHomeworks] = useState<ClientHomework[]>([]);
  const [analyses, setAnalyses] = useState<ClientAnalysis[]>([]);

  const loadDetail = useCallback(async () => {
    if (!expertUserId || !clientId) {
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

    if (!isExpertModuleEnabled(mappedExpert, "clients")) {
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

    const wsAdminId = readYasamUser()?.id;
    const wsRes = await fetch(
      `/api/admin/users/${expertUserId}/workspace/clients/${clientId}`,
      { headers: adminHeaders(wsAdminId) },
    );
    const wsJson = wsRes.ok
      ? ((await wsRes.json()) as {
          client?: Record<string, unknown> | null;
          stones?: ClientStone[];
          sessions?: ClientSession[];
        })
      : null;
    const clientRow = wsJson?.client ?? null;

    if (!clientRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setClient(mapClientProfile(clientRow));
    setModuleDisabled(false);
    setNotFound(false);

    // Taş + seans kayıtları aynı admin endpoint'inden gelir (publishable okuma yok).
    const stonesRes = { data: (wsJson?.stones ?? []) as ClientStone[] };
    const sessionsRes = { data: (wsJson?.sessions ?? []) as ClientSession[] };

    // client_notes artık güvenli admin API üzerinden okunur (publishable key ile doğrudan okunmaz).
    try {
      const adminId = readYasamUser()?.id;
      const notesRes = await fetch(
        `/api/admin/users/${expertUserId}/workspace/clients/${clientId}/notes`,
        { headers: adminHeaders(adminId) },
      );
      const n = notesRes.ok
        ? ((await notesRes.json().catch(() => ({}))) as { note?: Record<string, unknown> | null }).note
        : null;
      if (n) {
        setNotes({
          saglik_notu: n.saglik_notu != null ? String(n.saglik_notu) : null,
          adres: n.adres != null ? String(n.adres) : null,
          oneriler: n.oneriler != null ? String(n.oneriler) : null,
          notlar: n.notlar != null ? String(n.notlar) : null,
        });
      } else {
        setNotes(null);
      }
    } catch {
      setNotes(null);
    }

    // client_analyses artık güvenli admin API üzerinden okunur (publishable key ile doğrudan okunmaz).
    let analysesList: ClientAnalysis[] = [];
    try {
      const adminId = readYasamUser()?.id;
      const aRes = await fetch(
        `/api/admin/users/${expertUserId}/workspace/clients/${clientId}/analyses`,
        { headers: adminHeaders(adminId) },
      );
      if (aRes.ok) {
        const aJson = (await aRes.json().catch(() => ({}))) as { analyses?: ClientAnalysis[] };
        analysesList = (aJson.analyses ?? []) as ClientAnalysis[];
      }
    } catch {
      /* sessiz */
    }

    // client_homeworks artık güvenli admin API üzerinden okunur (publishable key ile doğrudan okunmaz).
    let homeworksList: ClientHomework[] = [];
    try {
      const adminId = readYasamUser()?.id;
      const hRes = await fetch(
        `/api/admin/users/${expertUserId}/workspace/clients/${clientId}/homeworks`,
        { headers: adminHeaders(adminId) },
      );
      if (hRes.ok) {
        const hJson = (await hRes.json().catch(() => ({}))) as { homeworks?: ClientHomework[] };
        homeworksList = (hJson.homeworks ?? []) as ClientHomework[];
      }
    } catch {
      /* sessiz */
    }

    setStones((stonesRes.data ?? []) as ClientStone[]);
    setSessions((sessionsRes.data ?? []) as ClientSession[]);
    setHomeworks(homeworksList);
    setAnalyses(analysesList);
    setLoading(false);
  }, [expertUserId, clientId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadDetail();
  }, [sessionChecked, allowed, loadDetail]);

  const hasNotes =
    notes &&
    [notes.saglik_notu, notes.adres, notes.oneriler, notes.notlar].some((v) =>
      Boolean(v?.trim()),
    );

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
        ) : notFound || !client ? (
          <section className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Danışan bulunamadı</p>
          </section>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md">
                  <UsersRound className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Danışan Detay İzleme
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
              <h2 className="text-xl font-black text-slate-950">Profil</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ReadonlyField
                  label="Ad Soyad"
                  value={[client.ad, client.soyad].filter(Boolean).join(" ")}
                />
                <ReadonlyField label="Telefon" value={client.telefon} />
                <ReadonlyField
                  label="Doğum Tarihi"
                  value={formatDateTR(client.dogum)}
                />
                <ReadonlyField
                  label="Görüşme Tarihi"
                  value={formatDateTR(client.gorusme)}
                />
                <ReadonlyField label="Burç" value={client.burc} />
                <ReadonlyField label="Kan Grubu" value={client.kan} />
                <ReadonlyField
                  label="Mizaç"
                  value={formatMizac(client.mizac)}
                />
                <ReadonlyField
                  label="Kayıt Tarihi"
                  value={formatCreatedAt(client.created_at ?? undefined)}
                />
              </div>
            </section>

            <SectionCard title="Notlar">
              {!hasNotes ? (
                <EmptyRecord />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReadonlyField label="Sağlık Notu" value={notes?.saglik_notu} />
                  <ReadonlyField label="Adres" value={notes?.adres} />
                  <ReadonlyField label="Öneriler" value={notes?.oneriler} />
                  <ReadonlyField
                    label="Notlar"
                    value={notesToPlainText(notes?.notlar) || null}
                  />
                </div>
              )}
            </SectionCard>

            <SectionCard title="Taşlar">
              {stones.length === 0 ? (
                <EmptyRecord />
              ) : (
                <div className="space-y-4">
                  {stones.map((stone) => (
                    <article
                      key={stone.id}
                      className="rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-4"
                    >
                      <p className="text-base font-black text-slate-900">
                        {stone.stone_name || "İsimsiz taş"}
                        {stone.stone_type ? (
                          <span className="ml-2 text-sm font-bold text-amber-800">
                            ({stone.stone_type})
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {formatDateTR(stone.stone_date)} ·{" "}
                        {formatCreatedAt(stone.created_at)}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ReadonlyField label="Not" value={stone.note} />
                        <ReadonlyField
                          label="Kullanım Alanı"
                          value={stone.usage_area}
                        />
                        <ReadonlyField
                          label="Kombinasyon"
                          value={stone.combination_text}
                        />
                        <ReadonlyField
                          label="Uyarı"
                          value={stone.warning_text}
                        />
                        <ReadonlyField
                          label="Diğer Notlar"
                          value={stone.other_notes}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Seanslar">
              {sessions.length === 0 ? (
                <EmptyRecord />
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <article
                      key={session.id}
                      className="rounded-2xl border-2 border-teal-100 bg-teal-50/50 p-4"
                    >
                      <p className="text-base font-black text-slate-900">
                        {session.session_type || "Seans"} ·{" "}
                        {formatDateTR(session.session_date)}
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

            <SectionCard title="Ödevler">
              {homeworks.length === 0 ? (
                <EmptyRecord />
              ) : (
                <div className="space-y-4">
                  {homeworks.map((hw) => (
                    <article
                      key={hw.id}
                      className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 p-4"
                    >
                      <p className="text-base font-black text-slate-900">
                        {hw.title || "Ödev"}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {hw.homework_type || "—"} ·{" "}
                        {HOMEWORK_STATUS_LABELS[hw.status ?? ""] ??
                          hw.status ??
                          "—"}{" "}
                        · {formatDateTR(hw.start_date)} –{" "}
                        {formatDateTR(hw.end_date)}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <ReadonlyField
                          label="Açıklama"
                          value={hw.description}
                        />
                        <ReadonlyField
                          label="Uzman Notu"
                          value={hw.expert_note}
                        />
                        <ReadonlyField
                          label="Danışan Geri Bildirimi"
                          value={hw.client_feedback}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Analizler">
              {analyses.length === 0 ? (
                <EmptyRecord />
              ) : (
                <div className="space-y-3">
                  {analyses.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border-2 border-fuchsia-100 bg-fuchsia-50/50 p-4"
                    >
                      <p className="text-base font-black text-slate-900">
                        {getAnalysisLabel(item.analysis_type)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {formatDateTimeTR(item.created_at)}
                      </p>
                      {item.note?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-700">
                          {item.note}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm font-bold text-slate-500">
                          kayıt yok
                        </p>
                      )}
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

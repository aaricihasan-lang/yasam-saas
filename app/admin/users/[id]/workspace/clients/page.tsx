"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Loader2, Search, UsersRound } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const searchInputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-violet-100 bg-white px-4 pl-12 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

type ReadonlyClient = {
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

const MIZAC_LABELS: Record<string, string> = {
  safra: "Safra",
  sovdavi: "Sovdavi",
  dem: "Dem",
  balgam: "Balgam",
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
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return raw;
}

function formatMizac(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.trim().toLowerCase();
  return MIZAC_LABELS[key] ?? value;
}

function mapClientRow(row: Record<string, unknown>): ReadonlyClient {
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

export default function AdminWorkspaceClientsPage() {
  useBfcacheRefresh();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [clients, setClients] = useState<ReadonlyClient[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "clients") : false;

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) => {
      const fullName = `${client.ad || ""} ${client.soyad || ""}`.trim().toLowerCase();
      const phone = (client.telefon || "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [clients, search]);

  const loadExpertAndClients = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setClientsError(null);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

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
    setTenantId(activeTenantId || null);
    setNotFound(false);

    if (!isExpertModuleEnabled(mapped, "clients")) {
      setClients([]);
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setClients([]);
      setClientsError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .select(
        "id, ad, soyad, telefon, dogum, gorusme, burc, kan, mizac, created_at",
      )
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Danışan listesi hatası:", error);
      setClients([]);
      setClientsError(error.message);
      setLoading(false);
      return;
    }

    setClients((data ?? []).map((item) => mapClientRow(item as Record<string, unknown>)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpertAndClients();
  }, [sessionChecked, allowed, loadExpertAndClients]);

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
                    Danışan Yönetimi İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Danışan ekleme,
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
                  Danışan Yönetimi modülü bu uzman için kapalı. Liste
                  görüntülenemez.
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
                    Liste, mevcut danışan modülüyle aynı şekilde uzmanın çalışma
                    alanına (tenant) göre filtrelenir. Yalnızca görüntüleme
                    modundasınız.
                  </p>
                </section>

                <section className={`${panelClass} border-violet-200/80`}>
                  <label className="block">
                    <span className="text-sm font-black text-slate-800">Ara</span>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Ad, soyad veya telefon ara…"
                        className={searchInputClass}
                      />
                    </div>
                  </label>
                </section>

                <section className={`${panelClass} border-slate-200/80`}>
                  <h2 className="text-xl font-black text-slate-950">Danışan Listesi</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {filteredClients.length} kayıt
                    {search.trim() ? " (filtrelenmiş)" : ""}
                  </p>

                  {clientsError ? (
                    <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                      {clientsError}
                    </p>
                  ) : null}

                  {!clientsError && filteredClients.length === 0 ? (
                    <p className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                      {clients.length === 0
                        ? "Bu uzmana ait danışan kaydı bulunamadı."
                        : "Arama kriterine uygun danışan bulunamadı."}
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto rounded-2xl border-2 border-slate-100">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-100 bg-slate-50/90">
                            {[
                              "Ad Soyad",
                              "Telefon",
                              "Doğum Tarihi",
                              "Görüşme Tarihi",
                              "Burç",
                              "Kan Grubu",
                              "Mizaç",
                              "Kayıt Tarihi",
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
                          {filteredClients.map((client) => (
                            <tr
                              key={client.id}
                              className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                                {[client.ad, client.soyad].filter(Boolean).join(" ") || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {client.telefon || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {formatDateTR(client.dogum)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {formatDateTR(client.gorusme)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {client.burc || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {client.kan || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {formatMizac(client.mizac)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {formatCreatedAt(client.created_at ?? undefined)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <Link
                                  href={`/admin/users/${userId}/workspace/clients/${client.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-950 transition hover:border-violet-300 hover:bg-violet-100 no-underline"
                                >
                                  <span aria-hidden>👁</span>
                                  Detay Gör
                                </Link>
                              </td>
                            </tr>
                          ))}
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

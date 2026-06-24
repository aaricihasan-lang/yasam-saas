"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Loader2, Search, Sparkles } from "lucide-react";
import {
  formatCreatedAt,
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { listNumerologyAnalyses } from "@/app/numeroloji/helpers/numerolojiKayit";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";
import { nrDisplay } from "@/app/numeroloji/utils/numerolojiPlainMetin";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const searchInputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-fuchsia-100 bg-white px-4 pl-12 text-base font-semibold text-slate-900 outline-none transition focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100";

type NumerologyListRow = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at: string;
  anaKulvar: string;
  yanKulvar: string;
  ifadeSayisi: string;
  hayatYolu: string;
};

function mapNumerologyRow(row: Record<string, unknown>): NumerologyListRow {
  const motor = extractMotorFromAnalysisJson(row.analysis_data);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    surname: String(row.surname ?? ""),
    birth_date: String(row.birth_date ?? ""),
    created_at: String(row.created_at ?? ""),
    anaKulvar: motor ? nrDisplay(motor.anaKulvar) : "—",
    yanKulvar: motor ? nrDisplay(motor.yanKulvar) : "—",
    ifadeSayisi: motor ? nrDisplay(motor.ifadeSayisi) : "—",
    hayatYolu: motor ? nrDisplay(motor.hayatYolu) : "—",
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

export default function AdminWorkspaceNumerologyPage() {
  useBfcacheRefresh();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [records, setRecords] = useState<NumerologyListRow[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const moduleEnabled = expert ? isExpertModuleEnabled(expert, "numerology") : false;

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;

    return records.filter((row) => {
      const ad = row.name.toLowerCase();
      const soyad = row.surname.toLowerCase();
      return ad.includes(q) || soyad.includes(q);
    });
  }, [records, search]);

  const loadExpertAndRecords = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRecordsError(null);

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
      setTenantId(null);
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

    console.log("selectedUser", mapped);
    console.log("tenantId", activeTenantId || null);

    if (!isExpertModuleEnabled(mapped, "numerology")) {
      setRecords([]);
      console.log("numerology count", 0);
      setLoading(false);
      return;
    }

    if (!activeTenantId) {
      setRecords([]);
      setRecordsError("Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı.");
      console.log("numerology count", 0);
      setLoading(false);
      return;
    }

    const { data, error } = await listNumerologyAnalyses(activeTenantId);

    if (error) {
      console.error("Numeroloji listesi hatası:", error);
      setRecords([]);
      setRecordsError(error);
      console.log("numerology count", 0);
      setLoading(false);
      return;
    }

    const sorted = [...(data ?? [])].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return tb - ta;
    });

    const mappedRecords = sorted.map((item) =>
      mapNumerologyRow(item as unknown as Record<string, unknown>),
    );

    console.log("numerology count", mappedRecords.length);

    setRecords(mappedRecords);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExpertAndRecords();
  }, [sessionChecked, allowed, loadExpertAndRecords]);

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
            <Link href="/admin/users" className={`${navBtn} mt-6 inline-flex max-w-md`}>
              Kullanıcı yönetimine dön
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/90 via-white to-violet-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-md">
                  <Sparkles className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-fuchsia-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    Numeroloji İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran salt okunur admin izleme alanıdır. Kayıt ekleme,
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
                  Numeroloji modülü bu uzman için kapalı. Liste görüntülenemez.
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
                    Kayıtlar, mevcut numeroloji modülüyle aynı şekilde uzmanın
                    çalışma alanına (tenant) göre listelenir.
                  </p>
                </section>

                <section className={`${panelClass} border-fuchsia-200/80`}>
                  <label className="block">
                    <span className="text-sm font-black text-slate-800">Ara</span>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fuchsia-500"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Ad veya soyad ara…"
                        className={searchInputClass}
                      />
                    </div>
                  </label>
                </section>

                <section className={`${panelClass} border-slate-200/80`}>
                  <h2 className="text-xl font-black text-slate-950">Numeroloji Listesi</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {filteredRecords.length} kayıt
                    {search.trim() ? " (filtrelenmiş)" : ""}
                  </p>

                  {recordsError ? (
                    <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                      {recordsError}
                    </p>
                  ) : null}

                  {!recordsError && filteredRecords.length === 0 ? (
                    <p className="mt-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm font-bold text-slate-600">
                      {records.length === 0
                        ? "Bu uzmana ait numeroloji kaydı bulunamadı."
                        : "Arama kriterine uygun kayıt bulunamadı."}
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto rounded-2xl border-2 border-slate-100">
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-100 bg-slate-50/90">
                            {[
                              "Ad Soyad",
                              "Doğum Tarihi",
                              "Ana Kulvar",
                              "Yan Kulvar",
                              "İfade Sayısı",
                              "Hayat Yolu",
                              "Oluşturma Tarihi",
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
                          {filteredRecords.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                                {[row.name, row.surname].filter(Boolean).join(" ") || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {row.birth_date || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {row.anaKulvar}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {row.yanKulvar}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {row.ifadeSayisi}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {row.hayatYolu}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {formatCreatedAt(row.created_at)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <Link
                                  href={`/admin/users/${userId}/workspace/numerology/${row.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-black text-fuchsia-950 transition hover:border-fuchsia-300 hover:bg-fuchsia-100 no-underline"
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

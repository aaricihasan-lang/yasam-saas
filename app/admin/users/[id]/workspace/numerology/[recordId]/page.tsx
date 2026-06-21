"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";
import { supabase } from "@/lib/supabase";
import { AdminNumerologyReadonlyDetay } from "../AdminNumerologyReadonlyDetay";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

export default function AdminWorkspaceNumerologyDetailPage() {
  useBfcacheRefresh();
  const params = useParams();
  const expertUserId = typeof params.id === "string" ? params.id : "";
  const recordId = typeof params.recordId === "string" ? params.recordId : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [analysisData, setAnalysisData] = useState<unknown>(null);
  const [motor, setMotor] = useState<ReturnType<typeof extractMotorFromAnalysisJson>>(null);

  const loadDetail = useCallback(async () => {
    if (!expertUserId || !recordId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", expertUserId)
      .maybeSingle();

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

    if (!isExpertModuleEnabled(mappedExpert, "numerology")) {
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

    const { data: recordRow, error: recordError } = await supabase
      .from("numerology_records")
      .select("*")
      .eq("id", recordId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (recordError || !recordRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = recordRow as Record<string, unknown>;
    setName(String(row.name ?? ""));
    setSurname(String(row.surname ?? ""));
    setBirthDate(String(row.birth_date ?? ""));
    setAnalysisData(row.analysis_data);
    setMotor(extractMotorFromAnalysisJson(row.analysis_data));
    setModuleDisabled(false);
    setNotFound(false);
    setLoading(false);
  }, [expertUserId, recordId]);

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
        ) : notFound || !motor ? (
          <section className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Kayıt bulunamadı</p>
          </section>
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
                    Numeroloji Detay İzleme
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran admin salt okunur görüntüleme alanıdır.
                  </p>
                  {expert ? (
                    <p className="mt-2 text-xs font-bold text-indigo-900">
                      Uzman: {expert.fullName} · {expert.email}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-bold text-slate-800">
                    {[name, surname].filter(Boolean).join(" ")} · {birthDate}
                  </p>
                </div>
              </div>
            </header>

            <AdminNumerologyReadonlyDetay
              out={motor}
              name={name}
              surname={surname}
              birthDate={birthDate}
              analysisData={analysisData}
            />
          </div>
        )}
      </div>
    </main>
  );
}

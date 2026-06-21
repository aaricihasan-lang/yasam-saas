"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import {
  getNumerologyAnalysisById,
  resolveNumerolojiTenantId,
  resolveNumerolojiUserAndTenant,
  type NumerologyRecordRow,
} from "../../helpers/numerolojiKayit";
import { NumerolojiKayitDetayPanel } from "../../components/NumerolojiKayitDetayPanel";

const detayNavSecondaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-violet-800 no-underline backdrop-blur-sm transition-all duration-200 hover:border-violet-300 hover:bg-violet-50";

const detayNavPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(139,92,246,0.28)] no-underline transition-all duration-200 hover:shadow-[0_6px_18px_rgba(139,92,246,0.35)]";

export default function NumerolojiKayitDetayPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [row, setRow] = useState<NumerologyRecordRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wordBusy, setWordBusy] = useState(false);

  const downloadWord = useCallback(async () => {
    if (!row) return;
    const session = await resolveNumerolojiUserAndTenant();
    if (!session) {
      alert("Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.");
      return;
    }
    const { userId, tenantId } = session;
    setWordBusy(true);
    try {
      const res = await fetch("/api/numeroloji/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, userId, exportMode: "single", recordId: row.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error || "Word raporu oluşturulamadı.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = `${row.name}-${row.surname}`.toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `numeroloji-${safe}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Word raporu indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setWordBusy(false);
    }
  }, [row]);

  useEffect(() => {
    if (!id) {
      runInEffect(() => {
        setError("Geçersiz kayıt.");
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    async function run() {
      const tid = await resolveNumerolojiTenantId();
      if (!tid) {
        if (!cancelled) {
          setError("Aktif kullanıcı tenant_id bulunamadı.");
          setRow(null);
          setLoading(false);
        }
        return;
      }
      const { data, error: e } = await getNumerologyAnalysisById(id, tid);
      if (cancelled) return;
      if (e || !data) {
        setError(e || "Kayıt bulunamadı.");
        setRow(null);
      } else {
        setError(null);
        setRow(data);
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const motor = row ? extractMotorFromAnalysisJson(row.analysis_data) : null;
  const adSoyad = row ? `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim() : "";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f3ff_38%,#ecfeff_100%)] text-slate-900 antialiased">
      <BfcacheRefreshHandler />
      <div
        className="pointer-events-none absolute left-0 top-0 h-[220px] w-[220px] rounded-full bg-fuchsia-300/18 blur-[90px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-0 h-[220px] w-[220px] rounded-full bg-amber-300/18 blur-[90px]"
        aria-hidden
      />
      <div className="relative z-10 w-full px-3 py-3 sm:px-5 xl:px-6">
        <div className="mx-auto max-w-[1400px]">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Link href="/numeroloji/analiz" className={detayNavPrimaryClass}>
            <span aria-hidden>✨</span> Yeni analiz
          </Link>
          <Link href="/numeroloji" className={detayNavSecondaryClass}>
            Modül seçimi
          </Link>
          {row && !loading && (
            <button
              type="button"
              onClick={() => void downloadWord()}
              disabled={wordBusy}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 backdrop-blur-sm transition-all duration-200 hover:bg-blue-100 disabled:opacity-60"
            >
              {wordBusy ? "⏳ Hazırlanıyor..." : "📄 Word Raporu"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-xl border border-violet-300/40 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_0_28px_rgba(139,92,246,0.12)] backdrop-blur-xl">
            Yükleniyor…
          </div>
        ) : null}

        {error ? (
          <div
            className="rounded-xl border border-rose-300/50 bg-rose-50/90 px-4 py-3 text-sm font-semibold text-rose-900 shadow-[0_0_24px_rgba(244,63,94,0.1)] backdrop-blur-xl"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {row && !error ? (
          <div className="w-full space-y-2">
            <header className="relative overflow-hidden rounded-[16px] border border-violet-200/60 bg-white/82 px-4 py-3 shadow-[0_0_16px_rgba(139,92,246,0.08)] backdrop-blur-xl sm:px-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-violet-200/20 blur-2xl" aria-hidden />
              <div className="pointer-events-none absolute right-12 top-2 h-12 w-12 rounded-full bg-amber-200/18 blur-xl" aria-hidden />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="inline-block rounded-full border border-violet-200/60 bg-violet-50/70 px-2 py-0.5 text-[9px] font-black tracking-[0.20em] text-violet-600">
                    KAYITLI ANALİZ
                  </p>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{adSoyad}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs font-medium text-slate-400">
                    <span>Doğum: {row.birth_date}</span>
                    <span aria-hidden className="opacity-50">·</span>
                    <span>
                      {new Date(row.created_at).toLocaleString("tr-TR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 opacity-[0.11]" aria-hidden>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-violet-700">
                    <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.5L12 15.3 6.4 19.3l2.1-6.5L3 8.8h6.8L12 2z" stroke="currentColor" strokeWidth="0.55" fill="currentColor" fillOpacity="0.25" />
                  </svg>
                </div>
              </div>
            </header>

            {motor ? (
              <NumerolojiKayitDetayPanel
                out={motor}
                name={row.name}
                surname={row.surname}
                birthDate={row.birth_date}
                analysisData={row.analysis_data}
                recordId={row.id}
                onAnalysisDataUpdate={(analysis_data) => setRow((prev) => (prev ? { ...prev, analysis_data } : prev))}
              />
            ) : (
              <p className="rounded-xl border border-violet-300/40 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_0_24px_rgba(139,92,246,0.1)] backdrop-blur-xl">
                Kayıtlı analiz verisi okunamadı veya eski formatta.
              </p>
            )}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

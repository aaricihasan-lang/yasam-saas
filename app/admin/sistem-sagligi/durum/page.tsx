"use client";

import { useCallback, useEffect, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  AccessDeniedScreen,
  LoadingScreen,
  SistemSagligiDetailShell,
  SummaryStatCard,
  useSistemSagligiAdminGate,
} from "../detail-shared";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

type HealthState = "healthy" | "check";

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-2) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function SistemSagligiDurumPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthState>("check");
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [detail, setDetail] = useState("");

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    const started = performance.now();
    const urlConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
    const keyConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
    );

    if (!urlConfigured || !keyConfigured) {
      setHealth("check");
      setPingMs(null);
      setDetail("Ortam değişkenleri eksik (Supabase URL veya anahtar).");
      setLoading(false);
      return;
    }

    const adminId = readYasamUser()?.id;
    const res = await fetch("/api/admin/health/db-ping", {
      headers: adminHeaders(adminId),
    });

    const elapsed = Math.round(performance.now() - started);
    setPingMs(elapsed);

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setHealth("check");
      setDetail(`Bağlantı hatası: ${j.error ?? `HTTP ${res.status}`}`);
    } else {
      setHealth("healthy");
      setDetail(`users tablosuna head isteği başarılı (${elapsed} ms).`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void runHealthCheck();
  }, [checked, allowed, runHealthCheck]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  const statusLabel = health === "healthy" ? "Sağlıklı" : "Kontrol gerekli";
  const statusTone = health === "healthy" ? "emerald" : "amber";

  return (
    <SistemSagligiDetailShell
      title="Sistem Durumu"
      description="Supabase bağlantısı ve temel veri erişim kontrolü."
      headerGradient="from-slate-900 via-emerald-900 to-teal-800"
      loading={loading}
      loadingLabel="Sistem durumu kontrol ediliyor…"
      onRetry={() => void runHealthCheck()}
    >
      <section
        aria-label="Durum özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <SummaryStatCard
          label="Sistem durumu"
          value={statusLabel}
          tone={statusTone}
          sublabel="Supabase erişim sonucu"
        />
        <SummaryStatCard
          label="Yanıt süresi"
          value={pingMs != null ? `${pingMs} ms` : "—"}
          tone="indigo"
          sublabel="users head sorgusu"
        />
        <SummaryStatCard
          label="Bağlantı"
          value={health === "healthy" ? "Aktif" : "Sorunlu"}
          tone={health === "healthy" ? "cyan" : "rose"}
        />
      </section>

      <section className="mt-8 rounded-[28px] border-2 border-white/90 bg-white/95 p-8 shadow-xl sm:p-10">
        <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">Kontrol detayı</h2>
        <p className="mt-4 text-base font-medium leading-relaxed text-slate-700 sm:text-lg">
          {detail}
        </p>
        <button
          type="button"
          onClick={() => void runHealthCheck()}
          className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 px-8 text-base font-bold text-emerald-950 transition hover:scale-[1.02]"
        >
          Yeniden kontrol et
        </button>
      </section>
    </SistemSagligiDetailShell>
  );
}

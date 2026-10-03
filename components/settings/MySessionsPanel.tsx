"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, MonitorSmartphone, RefreshCw, Smartphone } from "lucide-react";
import { readSessionToken } from "@/lib/auth/yasamUser";

/**
 * OTURUM MODELİ v2 — "Oturumlarım": kullanıcının KENDİ oturumları (admin + uzman).
 * Web / Android uygulama, cihaz-tarayıcı ailesi, açılış, son görülme, durum, maskeli IP,
 * şehir/ülke ve "Android uygulama (kalıcı)" rozeti. "Bu oturumu kapat" — kayıp telefon dahil.
 * Token/parola/hash ASLA gösterilmez (sunucu da döndürmez).
 */
type SessionRow = {
  id: string;
  kind: "web" | "android_app";
  device: string;
  state: "active" | "pending" | "ended";
  endReason: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  ipMasked: string | null;
  city: string | null;
  country: string | null;
  persistent: boolean;
  current: boolean;
};

const END_REASON_LABELS: Record<string, string> = {
  user_logout: "Çıkış yapıldı",
  owner_self_revoked: "Bu ekrandan kapatıldı",
  expired_idle: "Süre doldu (kullanılmadı)",
  expired_absolute: "Süre doldu",
  expired_policy_cleanup: "Süre doldu",
  stale: "Yeni girişte kapandı",
  replaced_same_device: "Aynı cihazda yeniden giriş",
  owner_denied: "Onay verilmedi",
  pending_expired: "Onay süresi doldu",
  password_changed: "Parola değişti",
  admin_terminated: "Yönetici kapattı",
  admin_logout_all: "Yönetici kapattı",
  admin_password_reset: "Parola sıfırlandı",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function MySessionsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = readSessionToken();
    if (!token) return;
    try {
      const res = await fetch("/api/me/sessions", {
        cache: "no-store",
        headers: { "x-user-id": userId, "x-session-token": token },
      });
      const j = (await res.json().catch(() => ({}))) as { sessions?: SessionRow[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Oturumlar okunamadı.");
        return;
      }
      setError(null);
      setRows(Array.isArray(j.sessions) ? j.sessions : []);
    } catch {
      setError("Oturumlar okunamadı. Bağlantınızı kontrol edin.");
    }
  }, [userId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function revoke(row: SessionRow) {
    const token = readSessionToken();
    if (!token || busyId) return;
    const ok = window.confirm(
      row.current
        ? "Bu cihazdaki oturumu kapatmak istiyor musunuz? Çıkış yapılacak."
        : `"${row.device}" oturumunu kapatmak istiyor musunuz?`,
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/me/sessions/${row.id}`, {
        method: "DELETE",
        headers: { "x-user-id": userId, "x-session-token": token },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; wasCurrent?: boolean };
      if (!res.ok) setError(j.error ?? "Oturum kapatılamadı.");
      if (res.ok && j.wasCurrent) {
        window.location.replace("/");
        return;
      }
    } catch {
      setError("Oturum kapatılamadı. Bağlantınızı kontrol edin.");
    } finally {
      setBusyId(null);
      void load();
    }
  }

  const open = (rows ?? []).filter((r) => r.state !== "ended");
  const ended = (rows ?? []).filter((r) => r.state === "ended");

  return (
    <section className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <MonitorSmartphone className="h-4 w-4 text-violet-600" aria-hidden />
          Oturumlarım
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Yenile
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Kaybolan bir cihaz varsa buradan oturumunu kapatabilirsiniz. Android uygulama oturumu, siz çıkış
        yapana veya kapatana kadar açık kalır.
      </p>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      {rows === null && !error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Yükleniyor…
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {open.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
                  {r.kind === "android_app" ? (
                    <Smartphone className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <MonitorSmartphone className="h-4 w-4 text-slate-500" aria-hidden />
                  )}
                  <span className="break-words">{r.device}</span>
                  {r.persistent && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Android uygulama (kalıcı)
                    </span>
                  )}
                  {r.state === "pending" && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Onay bekliyor</span>
                  )}
                  {r.current && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Bu cihaz</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {r.kind === "android_app" ? "Android uygulama" : "Web"} · Açılış {fmt(r.createdAt)} · Son görülme {fmt(r.lastSeenAt)}
                  {r.city || r.country ? ` · ${[r.city, r.country].filter(Boolean).join(", ")}` : ""}
                  {r.ipMasked ? ` · ${r.ipMasked}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void revoke(r)}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />}
                Bu oturumu kapat
              </button>
            </div>
          </li>
        ))}
      </ul>

      {ended.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">Son kapanan oturumlar ({ended.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {ended.map((r) => (
              <li key={r.id} className="text-[11px] text-slate-500">
                {r.device} · {fmt(r.createdAt)} → {fmt(r.endedAt)} · {END_REASON_LABELS[r.endReason ?? ""] ?? "Kapandı"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

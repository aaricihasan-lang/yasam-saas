"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/**
 * OTURUM MODELİ v2 — admin hesabıyla başka bir cihazdan yapılan ve ONAY BEKLEYEN web
 * girişleri için güvenlik bandı. Yalnız admin oturumunda çalışır; kapatılamaz ama ekranı
 * bloke etmez. Gösterilen: tarayıcı/cihaz ailesi, giriş zamanı, maskeli IP, şehir/ülke.
 * Token/parola/hash ASLA gösterilmez. Yük: 20 sn + sekmeye dönüş (yalnız admin).
 */
type PendingItem = {
  id: string;
  device: string;
  createdAt: string | null;
  pendingExpiresAt: string | null;
  ipMasked: string | null;
  city: string | null;
  country: string | null;
};

const POLL_MS = 20_000;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function authHeaders(): Record<string, string> | null {
  const user = readYasamUser();
  const token = readSessionToken();
  if (!user || user.role !== "admin" || !token) return null;
  return { "x-admin-id": String(user.id), "x-session-token": token };
}

export default function AdminSessionApprovalBanner() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const res = await fetch("/api/admin/me/session-approvals", { cache: "no-store", headers });
      if (!res.ok) return;
      const j = (await res.json().catch(() => ({}))) as { pending?: PendingItem[] };
      setItems(Array.isArray(j.pending) ? j.pending : []);
    } catch {
      /* ağ hatası: bir sonraki turda tekrar */
    }
  }, []);

  useEffect(() => {
    if (!authHeaders()) return;
    const first = setTimeout(() => void load(), 1500);
    const iv = setInterval(() => void load(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function decide(id: string, decision: "approve" | "deny") {
    const headers = authHeaders();
    if (!headers || busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/me/session-approvals/${id}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice(
        res.ok
          ? decision === "approve"
            ? "Yeni cihaz onaylandı. İki oturum birlikte kullanılabilir."
            : "Giriş reddedildi ve kapatıldı. Mevcut oturumunuz devam ediyor."
          : j.error ?? "İşlem tamamlanamadı.",
      );
    } catch {
      setNotice("İşlem tamamlanamadı. Bağlantınızı kontrol edin.");
    } finally {
      setBusyId(null);
      void load();
    }
  }

  if (items.length === 0 && !notice) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Yönetici güvenlik uyarısı"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3"
    >
      <div className="w-full max-w-xl rounded-2xl border border-amber-300 bg-white/95 p-4 shadow-2xl shadow-amber-200/60 backdrop-blur">
        {items.map((it) => (
          <div key={it.id} className="mb-3 last:mb-0">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">
                  Yönetici hesabınızla başka bir bilgisayardan giriş yapılmak isteniyor.
                </p>
                <p className="mt-1 break-words text-xs font-medium text-slate-600">
                  {it.device} · {fmtTime(it.createdAt)}
                  {it.city || it.country ? ` · ${[it.city, it.country].filter(Boolean).join(", ")}` : ""}
                  {it.ipMasked ? ` · ${it.ipMasked}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Onay verilmezse bu giriş {fmtTime(it.pendingExpiresAt)} itibarıyla kendiliğinden düşer.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decide(it.id, "approve")}
                className="h-10 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                Evet, bilgim var
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void decide(it.id, "deny")}
                className="h-10 rounded-xl border border-rose-300 bg-rose-50 px-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                Bu giriş bana ait değil
              </button>
            </div>
          </div>
        ))}
        {notice && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 text-xs font-bold text-violet-700 hover:underline"
            >
              Tamam
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

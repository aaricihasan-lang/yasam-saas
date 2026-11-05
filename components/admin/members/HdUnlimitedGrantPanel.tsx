"use client";

import { useCallback, useEffect, useState } from "react";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { useConfirm } from "@/components/ui/ConfirmProvider";

/**
 * Uzman Detayı · "Human Design — Geçici Sınırsız Kullanım" (owner talimatı 05.11.2026).
 * YALNIZ sistem sahibi görür: sunucu diğer herkese 404 döner → bölüm hiç çizilmez.
 * Tek işlem: 24 Saat Sınırsız Aç (onay penceresiyle). Aktif izin sırasında buton yok → süre yanlışlıkla uzatılamaz.
 * Süre ve kalan zaman sunucu saatine göre gösterilir (Türkiye saati); süre bitince bölüm kendiliğinden normale döner.
 */
type Status = { userId: string; eligible: boolean; active: boolean; grantedAt: string | null; expiresAt: string | null; serverNow: string };
type State = { phase: "loading" } | { phase: "hidden" } | { phase: "ready"; status: Status; skewMs: number };

const API = "/api/admin/hd/unlimited-grant";
const TR_DATE = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function headers(adminId: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": adminId };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function remainingText(ms: number): string {
  if (ms <= 0) return "süre doldu";
  // Sunucu/DB saat farkı (ms) 24 saati aşan "24 saat 1 dakika" göstermesin: izin hiçbir zaman 24 saatten uzun değildir.
  const totalMin = Math.ceil(Math.min(ms, 24 * 3_600_000) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} saat ${m} dakika` : `${m} dakika`;
}

export function HdUnlimitedGrantPanel({ userId, adminId }: { userId: string; adminId: string }) {
  const { confirm } = useConfirm();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((status: Status) => {
    setState({ phase: "ready", status, skewMs: Date.parse(status.serverNow) - Date.now() });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?userId=${encodeURIComponent(userId)}`, { headers: headers(adminId), credentials: "same-origin", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: Status } | null;
      if (res.ok && body?.ok && body.status) apply(body.status);
      else setState({ phase: "hidden" });
    } catch {
      setState({ phase: "hidden" });
    }
  }, [userId, adminId, apply]);

  useEffect(() => {
    if (!userId || !adminId) return;
    void load();
  }, [userId, adminId, load]);

  // Aktif izinde kalan süre dakikada bir güncellenir; süre dolunca durum sunucudan yeniden okunur (normal sınıra dönüş).
  const activeExpiry = state.phase === "ready" && state.status.active && state.status.expiresAt ? Date.parse(state.status.expiresAt) : null;
  const skew = state.phase === "ready" ? state.skewMs : 0;
  useEffect(() => {
    if (activeExpiry === null) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const left = activeExpiry - (Date.now() + skew);
    const done = setTimeout(() => void load(), Math.max(1_000, Math.min(left + 1_500, 2_147_000_000)));
    return () => { clearInterval(t); clearTimeout(done); };
  }, [activeExpiry, skew, load]);

  if (state.phase !== "ready") return null;
  const { status } = state;
  const leftMs = activeExpiry !== null ? activeExpiry - (now + skew) : 0;

  const open = async () => {
    if (busy || status.active || !status.eligible) return;
    const ok = await confirm({
      title: "24 saat sınırsız kullanım",
      message: "Bu uzmanın Human Design hesaplama sınırı 24 saat boyunca kaldırılacak. İşlem 24 saat sonunda otomatik sona erecek. Onaylıyor musunuz?",
      confirmText: "Onayla",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, { method: "POST", headers: headers(adminId, true), credentials: "same-origin", cache: "no-store", body: JSON.stringify({ userId }) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: string; status?: Status; error?: string } | null;
      if (res.ok && body?.ok && body.status) {
        apply(body.status);
        setNow(Date.now());
        setMsg({ ok: true, text: body.result === "already_active" ? "Bu uzmanın izni zaten aktif; süre uzatılmadı." : "24 saatlik izin açıldı." });
      } else {
        setMsg({ ok: false, text: body?.error ?? "İşlem tamamlanamadı." });
      }
    } catch {
      setMsg({ ok: false, text: "Ağ hatası — işlem doğrulanamadı." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 p-4 md:p-5" data-hd-unlimited>
      <span className="block text-sm font-bold text-slate-800">Human Design — Geçici Sınırsız Kullanım</span>
      {status.active && status.expiresAt ? (
        <div className="mt-2 rounded-xl border border-white/80 bg-white/90 px-4 py-3" data-hd-unlimited-state="active">
          <p className="text-sm font-bold text-emerald-700">24 Saatlik İzin Aktif</p>
          <p className="mt-1 text-xs font-medium leading-snug text-slate-600">
            Bitiş: <span className="font-bold text-slate-800" data-hd-unlimited-expires>{TR_DATE.format(new Date(status.expiresAt))}</span> (Türkiye saati) · Kalan: <span data-hd-unlimited-left>{remainingText(leftMs)}</span>
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">Süre bitince normal sınırlar (20/saat · 100/gün) kendiliğinden geri gelir.</p>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-4 py-3" data-hd-unlimited-state="normal">
          <p className="min-w-0 text-xs font-medium leading-snug text-slate-600">
            Normal sınır: <span className="font-bold text-slate-800">20/saat · 100/gün</span>
            {status.eligible ? null : <span className="block text-[11px] text-slate-500">Yalnız aktif, onaylı ve demo olmayan uzmanlara açılabilir.</span>}
          </p>
          {status.eligible ? (
            <button
              type="button"
              onClick={() => void open()}
              disabled={busy}
              data-hd-unlimited-open
              className="min-h-[40px] shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Açılıyor…" : "24 Saat Sınırsız Aç"}
            </button>
          ) : null}
        </div>
      )}
      {msg ? (
        <p role="status" className={`mt-2 text-xs font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`} data-hd-unlimited-msg>{msg.text}</p>
      ) : null}
    </div>
  );
}

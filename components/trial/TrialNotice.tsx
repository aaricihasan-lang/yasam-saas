"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock3, Crown, MessageCircle, ShieldAlert, Sparkles, X } from "lucide-react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { trialCountdownTitle, TRIAL_MESSAGES, type TrialPhase } from "@/lib/trial/trialCore";
import { ackTrialNotice, isKnownNoTrial, isTrialNoticePending, rememberNoTrial } from "@/lib/trial/trialNoticeStore";

/**
 * TRIAL7 — 7 günlük ücretsiz deneme bilgilendirmesi (yalnız deneme uzmanı; Premium / admin / demo
 * için hiçbir şey çizilmez ve tek durum sorgusundan sonra sekme boyunca tekrar sorgulanmaz).
 *
 *   • Her YENİ oturumda bir kez küçük kutu: "Ücretsiz Denemenize N Gün Kaldı" / son 24 saatte
 *     "Bugün Ücretsiz Denemenizin Son Günü". Tamam → bu oturumda tekrar görünmez; çıkış + giriş → yeniden.
 *   • Süre bitince (veya durdurulunca) bilgilendirme + "Pro Üyeliğe Geç" (uygulama içi talep) + WhatsApp;
 *     ekranın köşesinde küçük kalıcı bağlantı. İnceleme durumunda bilgilendirme.
 * Kalan süre YALNIZ sunucunun bitiş zamanından (endsAt − serverNow) hesaplanır; cihaz saati kullanılmaz.
 * Günlük e-posta YOK.
 */

type TrialStatus = {
  phase: TrialPhase;
  endsAt: string | null;
  serverNow: string;
  credits: { dailyLimit: number; usedTotal: number } | null;
  proRequestAt: string | null;
  whatsappUrl: string | null;
};

const HIDDEN_PREFIXES = ["/admin", "/register", "/ucretsiz-analiz", "/kampanya", "/magaza"];

function authHeaders(userId: string): Record<string, string> {
  const token = readSessionToken();
  return { "x-user-id": userId, ...(token ? { "x-session-token": token } : {}) };
}

function formatEnd(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

export default function TrialNotice() {
  const pathname = usePathname() ?? "/";
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);

  const hiddenRoute = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (hiddenRoute) return;
    const user = readYasamUser();
    if (!user || String(user.role ?? "").toLowerCase() !== "expert" || user.is_demo_account === true) return;
    if (user.trial_kind && user.trial_kind !== "self_7d") return;
    if (!user.trial_kind && isKnownNoTrial(user.id)) return;
    const ctrl = new AbortController();
    fetch("/api/trial/status", { headers: authHeaders(user.id), cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { trial?: TrialStatus | null } | null) => {
        if (!j) return;
        if (!j.trial) {
          rememberNoTrial(user.id);
          return;
        }
        setStatus(j.trial);
        const ph = j.trial.phase;
        if (isTrialNoticePending() && (ph === "active" || ph === "expired" || ph === "suspended" || ph === "review")) setOpen(true);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [pathname, hiddenRoute]);

  const close = useCallback(() => {
    ackTrialNotice();
    setOpen(false);
  }, []);

  const requestPro = useCallback(async () => {
    const user = readYasamUser();
    if (!user) return;
    setRequesting(true);
    setRequestMsg(null);
    try {
      const r = await fetch("/api/trial/pro-request", {
        method: "POST",
        headers: { ...authHeaders(user.id), "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; createdAt?: string };
      setRequestMsg(j.message ?? j.error ?? "Talep gönderilemedi. Lütfen tekrar deneyin.");
      if (r.ok && j.createdAt) setStatus((s) => (s ? { ...s, proRequestAt: j.createdAt ?? s.proRequestAt } : s));
    } catch {
      setRequestMsg("Talep gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setRequesting(false);
    }
  }, []);

  if (hiddenRoute || !status) return null;
  const ended = status.phase === "expired" || status.phase === "suspended";
  const remainingMs =
    status.endsAt && status.serverNow ? Math.max(0, Date.parse(status.endsAt) - Date.parse(status.serverNow)) : 0;

  let title: string;
  let body: string;
  let Icon = Clock3;
  if (status.phase === "active") {
    title = trialCountdownTitle(remainingMs);
    body = `Ücretsiz deneme süreniz ${formatEnd(status.endsAt)} tarihinde sona erer.`;
  } else if (status.phase === "expired") {
    title = "Ücretsiz Deneme Süreniz Sona Erdi — Pro'ya Geçin";
    body = TRIAL_MESSAGES.expired;
    Icon = Crown;
  } else if (status.phase === "suspended") {
    title = "Deneme Erişiminiz Durduruldu";
    body = TRIAL_MESSAGES.suspended;
    Icon = ShieldAlert;
  } else if (status.phase === "review") {
    title = "Üyeliğiniz İnceleniyor";
    body = TRIAL_MESSAGES.review;
    Icon = ShieldAlert;
  } else {
    return null;
  }

  return (
    <>
      {ended && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-[0_12px_32px_rgba(15,23,42,0.18)] backdrop-blur transition hover:-translate-y-0.5"
        >
          <Crown className="h-4 w-4 text-amber-500" aria-hidden />
          Pro Üyeliğe Geç
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-notice-title"
        >
          <div className="relative w-full max-w-[420px] overflow-hidden rounded-[26px] border border-white/80 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.30)] sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-violet-200/50 blur-3xl" aria-hidden />
            {ended ? (
              <button
                type="button"
                onClick={close}
                className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <div className="relative">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-white shadow-lg shadow-amber-200">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 id="trial-notice-title" className="mt-4 text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                {title}
              </h2>
              <p className="mt-2 text-[15px] leading-6 text-slate-600">{body}</p>

              {status.phase === "active" && status.credits ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Bugünkü Roxy krediniz: {Math.max(0, status.credits.dailyLimit - status.credits.usedTotal)} / {status.credits.dailyLimit}
                </p>
              ) : null}

              {ended ? (
                <div className="mt-5 grid gap-2.5">
                  <button
                    type="button"
                    onClick={requestPro}
                    disabled={requesting}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:opacity-70"
                  >
                    <Crown className="h-4 w-4" aria-hidden />
                    {status.proRequestAt ? "Pro Talebiniz Alındı" : "Pro Üyeliğe Geç"}
                  </button>
                  {status.whatsappUrl ? (
                    <a
                      href={status.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      WhatsApp ile İletişime Geçin
                    </a>
                  ) : null}
                  {requestMsg ? <p className="text-center text-sm font-semibold text-slate-600" role="status">{requestMsg}</p> : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5"
                >
                  Tamam
                </button>
              )}
              {ended ? (
                <button type="button" onClick={close} className="mt-3 w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-700">
                  Tamam
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

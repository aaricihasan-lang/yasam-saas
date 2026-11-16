"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-C — parola sonrası QR onay paneli (bilgisayar).
 *
 * Gösterir: QR (App Link), telefonda seçilecek 2 haneli eşleştirme kodu, kalan süre. 2 sn aralıkla
 * YALNIZ bu tarayıcının challenge durumunu sorar (HttpOnly bağlama çerezi). "verified" → tamamlama
 * (/api/auth/mfa/complete) → üst bileşen normal giriş akışını sürdürür. Ret / süre / kullanılmış →
 * kesin son; yeniden giriş gerekir. Ağ hatası karar DEĞİLDİR (yoklama sürer).
 * Token veya kullanıcı verisi bu bileşende tutulmaz.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { completeMfaLogin, pollMfaChallenge, type MfaChallengeInfo } from "@/lib/auth/loginUser";
import { encodeQr, qrToSvgPath } from "@/lib/qr/qrEncode";

type Done = { row: Record<string, unknown>; sessionToken: string | null; suspiciousLogin: boolean };

const FINAL_TEXT: Record<string, string> = {
  denied: "Giriş isteği telefonunuzdan reddedildi. Bu siz değilseniz parolanızı değiştirin ve yöneticinize bildirin.",
  expired: "QR kodunun süresi doldu. Lütfen yeniden giriş yapın.",
  consumed: "Bu giriş isteği zaten kullanıldı. Lütfen yeniden giriş yapın.",
  invalid: "Giriş isteği bu tarayıcıda bulunamadı. Lütfen yeniden giriş yapın.",
  failed: "Giriş tamamlanamadı. Lütfen yeniden giriş yapın.",
};

export default function MfaQrPanel({
  challenge,
  onDone,
  onCancel,
}: {
  challenge: MfaChallengeInfo;
  onDone: (r: Done) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [final, setFinal] = useState<keyof typeof FINAL_TEXT | null>(null);
  const [completing, setCompleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);
  const expiresMs = Date.parse(challenge.expiresAt);
  const remaining = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const hasQr = challenge.methods.includes("qr_device") && !!challenge.qr;

  const svg = useMemo(() => (challenge.qr ? qrToSvgPath(encodeQr(challenge.qr.url, "M")) : null), [challenge.qr]);

  // Süre dolumu türetilir (effect içinde setState yok): sunucu da süresi geçmiş challenge'ı reddeder.
  const timedOut = hasQr && !final && !completing && Number.isFinite(expiresMs) && remaining === 0;
  const shownFinal = final ?? (timedOut ? "expired" : null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hasQr || final || timedOut) return;
    let stop = false;
    const tick = async () => {
      if (stop || doneRef.current) return;
      const st = await pollMfaChallenge(challenge);
      if (stop || doneRef.current) return;
      if (st === "verified") {
        doneRef.current = true;
        setCompleting(true);
        const r = await completeMfaLogin(challenge);
        if (r.ok) {
          await onDone({ row: r.row, sessionToken: r.sessionToken, suspiciousLogin: r.suspiciousLogin });
        } else {
          setCompleting(false);
          setFinal(r.code === "MFA_DENIED" ? "denied" : r.code === "MFA_EXPIRED" ? "expired" : r.code === "MFA_CONSUMED" ? "consumed" : "failed");
        }
        return;
      }
      if (st === "denied" || st === "expired" || st === "consumed" || st === "invalid") {
        doneRef.current = true;
        setFinal(st);
      }
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 2000);
    return () => { stop = true; clearInterval(id); };
  }, [challenge, hasQr, final, timedOut, onDone]);

  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="relative z-10 mt-4 space-y-4" data-testid="mfa-qr-panel">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50/80 to-white px-4 py-4 text-center shadow-sm">
        <p className="text-[15px] font-bold text-slate-800">İkinci doğrulama</p>
        {!hasQr ? (
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {challenge.message ?? "Hesabınız için ikinci doğrulama zorunlu; şu anda kullanılabilir doğrulama yöntemi yok. Lütfen sistem yöneticisiyle iletişime geçin."}
          </p>
        ) : shownFinal ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-rose-700" data-testid="mfa-final">{FINAL_TEXT[shownFinal]}</p>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-snug text-slate-600">
              Telefonunuzun kamerasıyla QR kodu okutun. <span className="font-semibold">Yaşam Sistemi</span> uygulaması açılınca
              aşağıdaki sayıyı seçip onaylayın.
            </p>
            <div className="mx-auto mt-3 w-[min(240px,70vw)] rounded-xl bg-white p-2 ring-1 ring-slate-200">
              {svg && (
                <svg viewBox={svg.viewBox} role="img" aria-label="Giriş onayı için QR kod" className="block h-auto w-full text-slate-900" shapeRendering="crispEdges">
                  <rect width="100%" height="100%" fill="#ffffff" />
                  <path d={svg.d} fill="currentColor" />
                </svg>
              )}
            </div>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Telefonda seçeceğiniz sayı</p>
            <p className="mt-0.5 font-mono text-4xl font-extrabold tracking-[0.2em] text-violet-800" data-testid="mfa-match-code" aria-live="polite">
              {challenge.qr?.matchCode}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500" data-testid="mfa-countdown">
              {completing ? "Onaylandı — giriş tamamlanıyor…" : `Kalan süre ${mm}:${ss}`}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Bu giriş isteğini siz başlatmadıysanız telefonda <span className="font-semibold">Reddet</span>&apos;e basın.
              QR kodu başka bir bilgisayarda açılsa bile giriş yalnızca bu tarayıcıda tamamlanır.
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={completing}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60"
      >
        {shownFinal || !hasQr ? "Giriş ekranına dön" : "Vazgeç"}
      </button>
    </div>
  );
}

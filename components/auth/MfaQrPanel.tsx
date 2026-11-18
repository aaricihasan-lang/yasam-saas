"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-C/F2-D — parola sonrası ikinci doğrulama paneli.
 *
 * Yöntemler (sunucunun bu hesap için sunduğu kadar): QR (güvenilir Android cihaz) ve e-posta kodu.
 * İkisi de varsa kullanıcı aralarında geçebilir; hiçbiri ikinci doğrulamayı ATLATMAZ — oturum yalnız
 * challenge "verified" olduktan sonra /api/auth/mfa/complete ile bu tarayıcıda açılır.
 *  · QR: kod + telefonda seçilecek 2 haneli eşleştirme sayısı. Android telefonun kendi tarayıcısında
 *    "Bu telefonda uygulamayla onayla" bağlantısı (App Link) da sunulur.
 *  · E-posta: 6 haneli kod (3 dk, 5 yanlışta giriş isteği kapanır). iPhone'da uygulama GEREKMEZ.
 *  · F2-E kurtarma kodu: telefon ve e-postaya erişilemiyorsa tek kullanımlık kurtarma kodu (veya Owner'ın
 *    verdiği kurtarma bileti). Parola zaten doğrulanmış challenge'da çalışır; 5 yanlışta istek kapanır.
 * Challenge durumu 2 sn aralıkla sorulur (telefon reddi / süre dolumu her iki yöntemde de görünür).
 * Ağ hatası karar DEĞİLDİR. Token veya kullanıcı verisi bu bileşende tutulmaz.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { completeMfaLogin, mfaEmailRequest, mfaRecoveryVerify, pollMfaChallenge, type MfaChallengeInfo } from "@/lib/auth/loginUser";
import { encodeQr, qrToSvgPath } from "@/lib/qr/qrEncode";

type Done = { row: Record<string, unknown>; sessionToken: string | null; suspiciousLogin: boolean };
type Method = "qr" | "email" | "recovery";

const FINAL_TEXT: Record<string, string> = {
  denied: "Giriş isteği telefonunuzdan reddedildi. Bu siz değilseniz parolanızı değiştirin ve yöneticinize bildirin.",
  expired: "Giriş isteğinin süresi doldu. Lütfen yeniden giriş yapın.",
  consumed: "Bu giriş isteği zaten kullanıldı. Lütfen yeniden giriş yapın.",
  invalid: "Giriş isteği bu tarayıcıda bulunamadı. Lütfen yeniden giriş yapın.",
  locked: "Kod 5 kez hatalı girildi. Güvenliğiniz için bu giriş isteği kapatıldı; lütfen yeniden giriş yapın.",
  recovery_locked: "Kurtarma kodu 5 kez hatalı girildi. Güvenliğiniz için bu giriş isteği kapatıldı; lütfen yeniden giriş yapın.",
  failed: "Giriş tamamlanamadı. Lütfen yeniden giriş yapın.",
};

function detectPhone(): "android" | "ios" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  // iPadOS 13+ masaüstü UA'sı: dokunmatik Mac → iOS kabul.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)) return "ios";
  return null;
}

export default function MfaQrPanel({
  challenge,
  onDone,
  onCancel,
}: {
  challenge: MfaChallengeInfo;
  onDone: (r: Done) => void | Promise<void>;
  onCancel: () => void;
}) {
  const hasQr = challenge.methods.includes("qr_device") && !!challenge.qr;
  const hasEmail = challenge.methods.includes("email_otp");
  const hasRecovery = challenge.methods.includes("recovery_code");
  const hasAny = hasQr || hasEmail || hasRecovery;

  const [phone] = useState(detectPhone);
  // Telefondaki tarayıcıda QR okutulamaz → e-posta varsa o öne çıkar; aksi halde QR.
  const [method, setMethod] = useState<Method>(() =>
    hasQr && !(phone && hasEmail) ? "qr" : hasEmail ? "email" : hasQr ? "qr" : "recovery");
  const [final, setFinal] = useState<keyof typeof FINAL_TEXT | null>(null);
  const [completing, setCompleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);

  const [emailSent, setEmailSent] = useState(false);
  const [emailBusy, setEmailBusy] = useState<"send" | "verify" | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement | null>(null);

  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryOk, setRecoveryOk] = useState<string | null>(null);
  const recoveryRef = useRef<HTMLInputElement | null>(null);
  const recoveryChars = recoveryCode.replace(/[^A-Za-z0-9]/g, "").length;

  const expiresMs = Date.parse(challenge.expiresAt);
  const remaining = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const svg = useMemo(() => (challenge.qr ? qrToSvgPath(encodeQr(challenge.qr.url, "M")) : null), [challenge.qr]);

  // Süre dolumu türetilir (effect içinde setState yok): sunucu da süresi geçmiş challenge'ı reddeder.
  const timedOut = hasAny && !final && !completing && Number.isFinite(expiresMs) && remaining === 0;
  const shownFinal = final ?? (timedOut ? "expired" : null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleting(true);
    const r = await completeMfaLogin(challenge);
    if (r.ok) {
      await onDone({ row: r.row, sessionToken: r.sessionToken, suspiciousLogin: r.suspiciousLogin });
    } else {
      setCompleting(false);
      setFinal(r.code === "MFA_DENIED" ? "denied" : r.code === "MFA_EXPIRED" ? "expired" : r.code === "MFA_CONSUMED" ? "consumed" : "failed");
    }
  }
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    if (!hasAny || final || timedOut) return;
    let stop = false;
    const tick = async () => {
      if (stop || doneRef.current) return;
      const st = await pollMfaChallenge(challenge);
      if (stop || doneRef.current) return;
      if (st === "verified") {
        await finishRef.current();
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
  }, [challenge, hasAny, final, timedOut, onDone]);

  async function sendEmail() {
    if (emailBusy || doneRef.current) return;
    setEmailBusy("send");
    setEmailError(null);
    setEmailInfo(null);
    const r = await mfaEmailRequest(challenge, "send");
    setEmailBusy(null);
    if (r.ok) {
      setEmailSent(true);
      setCode("");
      setResendAt(Date.now() + 60_000);
      setEmailInfo(`Kod ${challenge.emailHint ?? "e-posta adresinize"} adresine gönderildi. 3 dakika geçerlidir; gelen kutunuzda yoksa istenmeyen klasörüne bakın.`);
      window.setTimeout(() => codeRef.current?.focus(), 0);
      return;
    }
    if (r.code === "MFA_INVALID") { doneRef.current = true; setFinal("invalid"); return; }
    if (r.retryAfter) setResendAt(Date.now() + r.retryAfter * 1000);
    setEmailError(r.message ?? "Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.");
  }

  async function verifyEmail() {
    if (emailBusy || doneRef.current || code.length !== 6) return;
    setEmailBusy("verify");
    setEmailError(null);
    const r = await mfaEmailRequest(challenge, "verify", code);
    setEmailBusy(null);
    if (r.ok) {
      await finish();
      return;
    }
    if (r.code === "OTP_LOCKED") { doneRef.current = true; setFinal("locked"); return; }
    if (r.code === "MFA_INVALID") { doneRef.current = true; setFinal("invalid"); return; }
    // F2-I: bağlantı hatasında kod sunucuya ulaşmadı → girilen kod korunur (bağlantı gelince aynı kodla yeniden denenir).
    if (r.code !== "NETWORK") setCode("");
    if (r.code === "OTP_EXPIRED" || r.code === "OTP_NONE") setResendAt(0);
    setEmailError(r.message ?? "Kod doğrulanamadı.");
    window.setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function verifyRecovery() {
    if (recoveryBusy || doneRef.current || recoveryChars !== 28) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    const r = await mfaRecoveryVerify(challenge, recoveryCode);
    setRecoveryBusy(false);
    if (r.ok) {
      setRecoveryCode("");
      setRecoveryOk(r.kind === "code"
        ? `Kurtarma kodu kabul edildi. Kalan kullanılmamış kod: ${r.remaining}.`
        : "Kurtarma bileti kabul edildi.");
      await finish();
      return;
    }
    if (r.code === "RECOVERY_LOCKED") { doneRef.current = true; setFinal("recovery_locked"); return; }
    if (r.code === "MFA_INVALID") { doneRef.current = true; setFinal("invalid"); return; }
    setRecoveryCode("");
    setRecoveryError(r.message ?? "Kurtarma kodu doğrulanamadı.");
    window.setTimeout(() => recoveryRef.current?.focus(), 0);
  }

  function openRecovery() {
    setMethod("recovery");
    setRecoveryError(null);
    window.setTimeout(() => recoveryRef.current?.focus(), 0);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const tabCls = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
      on ? "bg-white text-violet-800 shadow-sm ring-1 ring-violet-200" : "text-slate-600 hover:text-slate-800"
    }`;

  return (
    <div className="relative z-10 mt-4 space-y-4" data-testid="mfa-qr-panel">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50/80 to-white px-4 py-4 text-center shadow-sm">
        <p className="text-[15px] font-bold text-slate-800">İkinci doğrulama</p>
        {!hasAny ? (
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {challenge.message ?? "Hesabınız için ikinci doğrulama zorunlu; şu anda kullanılabilir doğrulama yöntemi yok. Lütfen sistem yöneticisiyle iletişime geçin."}
          </p>
        ) : shownFinal ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-rose-700" data-testid="mfa-final">{FINAL_TEXT[shownFinal]}</p>
        ) : completing ? (
          <>
            {recoveryOk && <p className="mt-3 text-[13px] font-semibold text-slate-700" data-testid="mfa-recovery-ok">{recoveryOk}</p>}
            <p className="mt-3 text-sm font-semibold text-emerald-700" data-testid="mfa-completing">Doğrulandı — giriş tamamlanıyor…</p>
          </>
        ) : method === "recovery" && hasRecovery ? (
          <form
            onSubmit={(e) => { e.preventDefault(); void verifyRecovery(); }}
            className="mx-auto mt-3 max-w-xs text-left"
            data-testid="mfa-recovery-panel"
          >
            <p className="text-[13px] leading-snug text-slate-600">
              Kurtarma kodlarınızdan <span className="font-semibold">kullanılmamış birini</span> girin. Her kod yalnızca bir kez kullanılabilir.
              Sistem yöneticisinin verdiği kurtarma biletini de buraya girebilirsiniz.
            </p>
            <label htmlFor="mfa-recovery-code" className="mt-3 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">Kurtarma kodu</label>
            <input
              id="mfa-recovery-code"
              ref={recoveryRef}
              data-testid="mfa-recovery-code"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, "").slice(0, 40))}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="ABCD-EFGH-…"
              className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-center font-mono text-[15px] font-bold tracking-wider text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <p className="mt-1 text-[11px] text-slate-500" aria-live="polite">{recoveryChars}/28 karakter</p>
            <button
              type="submit"
              data-testid="mfa-recovery-verify"
              disabled={recoveryBusy || recoveryChars !== 28}
              className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {recoveryBusy ? "Doğrulanıyor…" : "Kurtarma koduyla giriş yap"}
            </button>
            {recoveryError && (
              <p role="alert" data-testid="mfa-recovery-error" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{recoveryError}</p>
            )}
            {(hasQr || hasEmail) && (
              <button type="button" data-testid="mfa-recovery-back" onClick={() => setMethod(hasQr && !(phone && hasEmail) ? "qr" : hasEmail ? "email" : "qr")}
                className="mt-3 w-full text-xs font-bold text-violet-700 hover:underline">
                Telefon veya e-posta ile doğrulamaya dön
              </button>
            )}
            <p className="mt-3 text-center text-xs font-semibold text-slate-500" data-testid="mfa-countdown">Kalan süre {mm}:{ss}</p>
          </form>
        ) : (
          <>
            {hasQr && hasEmail && (
              <div role="tablist" aria-label="Doğrulama yöntemi" className="mx-auto mt-3 flex max-w-xs gap-1 rounded-xl bg-slate-100 p-1">
                <button type="button" role="tab" aria-selected={method === "qr"} data-testid="mfa-method-qr" className={tabCls(method === "qr")} onClick={() => setMethod("qr")}>
                  Telefonla (QR)
                </button>
                <button type="button" role="tab" aria-selected={method === "email"} data-testid="mfa-method-email" className={tabCls(method === "email")} onClick={() => setMethod("email")}>
                  E-posta kodu
                </button>
              </div>
            )}

            {method === "qr" && hasQr ? (
              <>
                <p className="mt-3 text-[13px] leading-snug text-slate-600">
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
                {phone === "android" && challenge.qr && (
                  <a
                    href={challenge.qr.url}
                    data-testid="mfa-open-app"
                    className="mx-auto mt-3 block max-w-xs rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
                  >
                    Bu telefonda uygulamayla onayla
                  </a>
                )}
                <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Telefona yazacağınız kod</p>
                <p className="mt-0.5 font-mono text-4xl font-extrabold tracking-[0.2em] text-violet-800" data-testid="mfa-match-code" aria-live="polite">
                  {challenge.qr?.matchCode}
                </p>
                <p className="mt-2 text-[11px] leading-snug text-slate-500">
                  Bu giriş isteğini siz başlatmadıysanız telefonda <span className="font-semibold">Reddet</span>&apos;e basın.
                  QR kodu başka bir bilgisayarda açılsa bile giriş yalnızca bu tarayıcıda tamamlanır.
                </p>
              </>
            ) : (
              <div className="mt-3" data-testid="mfa-email-panel">
                {!emailSent ? (
                  <>
                    <p className="text-[13px] leading-snug text-slate-600">
                      Kayıtlı e-posta adresinize <span className="font-semibold">{challenge.emailHint ?? ""}</span> 6 haneli bir doğrulama kodu göndereceğiz.
                    </p>
                    <button
                      type="button"
                      data-testid="mfa-email-send"
                      disabled={emailBusy !== null || resendIn > 0}
                      onClick={() => void sendEmail()}
                      className="mx-auto mt-3 block w-full max-w-xs rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
                    >
                      {emailBusy === "send" ? "Gönderiliyor…" : resendIn > 0 ? `Tekrar deneme ${resendIn} sn` : "Kodu e-postama gönder"}
                    </button>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void verifyEmail(); }}
                    className="mx-auto max-w-xs"
                  >
                    {emailInfo && <p role="status" className="text-[12px] leading-snug text-slate-600" data-testid="mfa-email-info">{emailInfo}</p>}
                    <label htmlFor="mfa-email-code" className="mt-3 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">Doğrulama kodu</label>
                    <input
                      id="mfa-email-code"
                      ref={codeRef}
                      data-testid="mfa-email-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button
                      type="submit"
                      data-testid="mfa-email-verify"
                      disabled={emailBusy !== null || code.length !== 6}
                      className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
                    >
                      {emailBusy === "verify" ? "Doğrulanıyor…" : "Doğrula ve giriş yap"}
                    </button>
                    <button
                      type="button"
                      data-testid="mfa-email-resend"
                      disabled={emailBusy !== null || resendIn > 0}
                      onClick={() => void sendEmail()}
                      className="mt-2 w-full text-xs font-bold text-violet-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                    >
                      {resendIn > 0 ? `Yeni kod ${resendIn} sn sonra istenebilir` : "Yeni kod gönder"}
                    </button>
                  </form>
                )}
                {emailError && (
                  <p role="alert" data-testid="mfa-email-error" className="mx-auto mt-3 max-w-xs rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {emailError}
                    {hasQr && <> <button type="button" className="underline" onClick={() => setMethod("qr")}>QR ile onaylayın</button></>}
                  </p>
                )}
                {phone === "ios" && !hasQr && (
                  <p className="mt-2 text-[11px] text-slate-500">iPhone&apos;da uygulama kurmanız gerekmez; e-posta kodu yeterlidir.</p>
                )}
              </div>
            )}
            <p className="mt-3 text-xs font-semibold text-slate-500" data-testid="mfa-countdown">Kalan süre {mm}:{ss}</p>
            {hasRecovery && (
              <button type="button" data-testid="mfa-use-recovery" onClick={openRecovery}
                className="mt-3 w-full text-xs font-bold text-violet-700 hover:underline">
                Telefonuma veya e-postama erişemiyorum — kurtarma kodu kullan
              </button>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={completing}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60"
      >
        {shownFinal || !hasAny ? "Giriş ekranına dön" : "Vazgeç"}
      </button>
    </div>
  );
}

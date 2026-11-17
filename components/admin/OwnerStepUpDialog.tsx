"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-G — Owner kritik işlem onayı (işleme özel yeniden doğrulama).
 * İstek bu oturuma + işleme + hedef kayda bağlıdır; 5 dk, tek kullanım. Doğrulama: Owner'ın güvenilir telefonu
 * (QR + eşleştirme sayısı) veya doğrulanmış e-postasına gelen 6 haneli kod. Doğrulanınca çağıran ekran asıl
 * işlemi yeniden gönderir; kanıt o işlemle aynı DB işleminde tüketilir. Kod / kanıt bu bileşende saklanmaz.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";
import { encodeQr, qrToSvgPath } from "@/lib/qr/qrEncode";

export type StepUpAction = "device_approve" | "mfa_disable" | "recovery_execute" | "retention_policy" | "retention_execute" | "password_reset" | "admin_grant";

const ACTION_LABEL: Record<StepUpAction, string> = {
  device_approve: "güvenilir cihaz onayı",
  mfa_disable: "ikinci doğrulama zorunluluğunu kaldırma",
  recovery_execute: "hesap kurtarma yürütme",
  retention_policy: "denetim kaydı saklama kararı",
  retention_execute: "denetim kaydı imhası / anonimleştirme",
  password_reset: "kullanıcı parolasını sıfırlama",
  admin_grant: "yönetici yetkisi verme",
};

type Begun = { challengeId: string; expiresAt: string | null; qr?: { url: string; matchCode: string }; emailHint?: string | null };

export default function OwnerStepUpDialog({
  action,
  targetId,
  onVerified,
  onCancel,
}: {
  action: StepUpAction;
  targetId: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [begun, setBegun] = useState<Begun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const doneRef = useRef(false);
  const startedRef = useRef(false);

  const svg = useMemo(() => (begun?.qr ? qrToSvgPath(encodeQr(begun.qr.url, "M")) : null), [begun]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const headers = ownerAdminHeaders(true);
    if (!headers) { window.setTimeout(() => setError("Yönetici oturumu bulunamadı."), 0); return; }
    void (async () => {
      try {
        const res = await fetch("/api/admin/step-up", { method: "POST", headers, cache: "no-store", body: JSON.stringify({ op: "begin", action, targetId }) });
        const j = (await res.json().catch(() => ({}))) as Begun & { error?: string };
        if (!res.ok) { setError(j.error ?? "Onay isteği başlatılamadı."); return; }
        setBegun(j);
        if (!j.qr && j.emailHint === undefined) setError("Onay için kullanılabilir yöntem yok: güvenilir telefon veya doğrulanmış e-posta gerekir.");
      } catch {
        setError("Bağlantı hatası.");
      }
    })();
  }, [action, targetId]);

  useEffect(() => {
    if (!begun) return;
    const headers = ownerAdminHeaders();
    if (!headers) return;
    const id = window.setInterval(async () => {
      if (doneRef.current) return;
      try {
        const res = await fetch(`/api/admin/step-up?challenge=${encodeURIComponent(begun.challengeId)}`, { headers, cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { state?: string };
        if (j.state === "verified") { doneRef.current = true; onVerified(); }
        else if (j.state === "denied" || j.state === "expired" || j.state === "invalid" || j.state === "consumed") {
          doneRef.current = true;
          setError(j.state === "denied" ? "Onay telefonunuzdan reddedildi." : "Onay isteğinin süresi doldu. İşlemi yeniden başlatın.");
        }
      } catch { /* ağ hatası karar değildir */ }
    }, 2000);
    return () => window.clearInterval(id);
  }, [begun, onVerified]);

  async function email(op: "email_send" | "email_verify") {
    if (!begun || busy) return;
    const headers = ownerAdminHeaders(true);
    if (!headers) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/step-up", { method: "POST", headers, cache: "no-store",
        body: JSON.stringify(op === "email_send" ? { op, challengeId: begun.challengeId } : { op, challengeId: begun.challengeId, code }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; sent?: boolean; result?: string };
      if (!res.ok) { setError(j.error ?? "İşlem tamamlanamadı."); setCode(""); return; }
      if (op === "email_send") { setSent(true); setInfo(`Kod ${begun.emailHint ?? "e-posta adresinize"} adresine gönderildi (3 dk).`); }
      else if (j.result === "verified" && !doneRef.current) { doneRef.current = true; onVerified(); }
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Kritik işlem onayı" data-testid="step-up-dialog"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 min-[480px]:items-center">
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <p className="text-sm font-black text-slate-900">Kritik işlem onayı</p>
        <p className="mt-1 text-xs leading-snug text-slate-600">
          <strong>{ACTION_LABEL[action]}</strong> için kimliğinizi yeniden doğrulayın. Bu onay yalnız bu işlem ve bu kayıt için,
          5 dakika ve bir kez geçerlidir. Kullanıcıyı bağımsız kanaldan doğrulama kuralı ayrıca geçerlidir.
        </p>
        {error && <p role="alert" data-testid="step-up-error" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        {info && !error && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{info}</p>}
        {begun?.qr && (
          <div className="mt-3 text-center" data-testid="step-up-qr">
            <p className="text-[12px] text-slate-600">Güvenilir telefonunuzla QR kodu okutun; telefonda işlem adını kontrol edip aşağıdaki 6 haneli kodu yazın.</p>
            <div className="mx-auto mt-2 w-[min(200px,60vw)] rounded-xl bg-white p-2 ring-1 ring-slate-200">
              {svg && (
                <svg viewBox={svg.viewBox} role="img" aria-label="Onay QR kodu" className="block h-auto w-full text-slate-900" shapeRendering="crispEdges">
                  <rect width="100%" height="100%" fill="#ffffff" />
                  <path d={svg.d} fill="currentColor" />
                </svg>
              )}
            </div>
            <p className="mt-2 font-mono text-3xl font-extrabold tracking-[0.2em] text-violet-800" data-testid="step-up-match">{begun.qr.matchCode}</p>
          </div>
        )}
        {begun && begun.emailHint !== undefined && (
          <div className="mt-3 border-t border-slate-100 pt-3" data-testid="step-up-email">
            {!sent ? (
              <button type="button" data-testid="step-up-email-send" disabled={busy} onClick={() => void email("email_send")}
                className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-60">
                {begun.qr ? "Telefonum yanımda değil — e-postama kod gönder" : "E-postama onay kodu gönder"}
              </button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void email("email_verify"); }} className="space-y-2">
                <input data-testid="step-up-email-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" aria-label="Onay kodu" placeholder="6 haneli kod"
                  className="h-10 w-full rounded-lg border border-slate-300 text-center font-mono text-lg tracking-[0.3em]" />
                <button type="submit" data-testid="step-up-email-verify" disabled={busy || code.length !== 6}
                  className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">Kodu doğrula</button>
              </form>
            )}
          </div>
        )}
        <button type="button" onClick={onCancel} data-testid="step-up-cancel"
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Vazgeç</button>
      </div>
    </div>
  );
}

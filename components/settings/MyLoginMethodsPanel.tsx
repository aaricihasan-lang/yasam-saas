"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Mail, RefreshCw, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { readSessionToken, hasSessionCredential, sessionTokenHeader } from "@/lib/auth/yasamUser";
import AccountRecoverySection from "@/components/settings/AccountRecoverySection";

/**
 * GİRİŞ GÜVENLİĞİ F2-D — "Giriş Yöntemlerim": kullanıcının KENDİ ikinci doğrulama yöntemleri.
 * · E-posta: kayıtlı adresin kutu sahipliğini 6 haneli kodla doğrulama (adres değiştirilmez).
 * · Güvenilir Android cihazlar: liste + iptal (telefon kaybı). Açık anahtar / kod ASLA gösterilmez.
 * Yöntemi olmayan hesapta zorunluluk açılmaz (Owner kararı; sunucu da reddeder).
 */
type Device = {
  id: string;
  display_code: string | null;
  model: string | null;
  state: string;
  created_at: string | null;
  activated_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

const DEVICE_STATE: Record<string, [string, string]> = {
  active: ["Etkin", "bg-emerald-50 text-emerald-700"],
  owner_approved: ["Onaylandı · telefonda etkinleştirin", "bg-sky-50 text-sky-700"],
  pending_owner: ["Yönetici onayı bekliyor", "bg-amber-50 text-amber-700"],
  revoked: ["İptal edildi", "bg-slate-100 text-slate-500"],
  rejected: ["Reddedildi", "bg-slate-100 text-slate-500"],
  expired: ["Süresi doldu", "bg-slate-100 text-slate-500"],
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function MyLoginMethodsPanel({ userId }: { userId: string }) {
  const [emailInfo, setEmailInfo] = useState<{ email: string | null; verified: boolean; available: boolean; changeAvailable: boolean } | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const token = readSessionToken();
    return { "x-user-id": userId, ...sessionTokenHeader(token) };
  }, [userId]);

  const load = useCallback(async () => {
    if (!hasSessionCredential(readSessionToken())) return;
    try {
      const [e, d] = await Promise.all([
        fetch("/api/me/email-verification", { cache: "no-store", headers: headers() }),
        fetch("/api/me/devices", { cache: "no-store", headers: headers() }),
      ]);
      const ej = (await e.json().catch(() => ({}))) as { email?: string | null; verified?: boolean; available?: boolean; changeAvailable?: boolean; error?: string };
      const dj = (await d.json().catch(() => ({}))) as { devices?: Device[]; error?: string };
      if (e.ok) setEmailInfo({ email: ej.email ?? null, verified: ej.verified === true, available: ej.available === true, changeAvailable: ej.changeAvailable === true });
      if (d.ok) setDevices(Array.isArray(dj.devices) ? dj.devices : []);
      if (!e.ok || !d.ok) setError(ej.error ?? dj.error ?? "Giriş yöntemleri okunamadı.");
      else setError(null);
    } catch {
      setError("Giriş yöntemleri okunamadı. Bağlantınızı kontrol edin.");
    }
  }, [headers]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function emailAction(action: "send" | "confirm") {
    if (busy) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/me/email-verification", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(action === "send" ? { action } : { action, code }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; sent?: boolean; verified?: boolean };
      if (!res.ok) {
        setError(j.error ?? "İşlem tamamlanamadı.");
        if (action === "confirm") setCode("");
        return;
      }
      if (j.verified) {
        setNotice("E-posta adresiniz doğrulandı.");
        setCodeSent(false);
        setCode("");
        void load();
      } else if (j.sent) {
        setCodeSent(true);
        setNotice("Doğrulama kodu e-posta adresinize gönderildi. Kod 3 dakika geçerlidir.");
      }
    } catch {
      setError("İşlem tamamlanamadı. Bağlantınızı kontrol edin.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeDevice(dev: Device) {
    if (busy) return;
    const ok = window.confirm(
      `"${dev.model ?? "Android cihaz"}" cihazını iptal etmek istiyor musunuz? Bu cihaz bir daha giriş onaylayamaz ve onunla açılmış oturumlar kapanır.`,
    );
    if (!ok) return;
    setBusy(`dev:${dev.id}`);
    try {
      const res = await fetch(`/api/me/devices/${dev.id}`, {
        method: "DELETE",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Kullanıcı iptali" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(j.error ?? "Cihaz iptal edilemedi.");
      else setNotice("Cihaz iptal edildi.");
    } catch {
      setError("Cihaz iptal edilemedi. Bağlantınızı kontrol edin.");
    } finally {
      setBusy(null);
      void load();
    }
  }

  const liveDevices = (devices ?? []).filter((d) => ["active", "owner_approved", "pending_owner"].includes(d.state));
  const pastDevices = (devices ?? []).filter((d) => !["active", "owner_approved", "pending_owner"].includes(d.state));

  return (
    <section data-testid="login-methods-panel" className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <KeyRound className="h-4 w-4 text-violet-600" aria-hidden />
          Giriş Yöntemlerim
        </h3>
        <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Yenile
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Parolanızdan sonra ikinci doğrulama için kullanılabilecek yöntemler. Android telefonunuz varsa QR ile, yoksa
        e-posta kodu ile giriş onaylanır.
      </p>

      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}

      {/* E-posta */}
      <div className="mt-3 rounded-xl border border-slate-200 px-3 py-3" data-testid="email-method-card">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
          <Mail className="h-4 w-4 text-slate-500" aria-hidden />
          E-posta ile kod
          {emailInfo?.verified ? (
            <span data-testid="email-verified-badge" className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Doğrulandı</span>
          ) : emailInfo ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Doğrulanmadı</span>
          ) : null}
        </p>
        <p className="mt-0.5 break-all text-[11px] text-slate-500">{emailInfo?.email ?? "—"}</p>
        {emailInfo && !emailInfo.verified && !emailInfo.available && (
          <p data-testid="email-verify-unavailable" className="mt-2 text-[11px] text-slate-500">E-posta ile doğrulama bu hesapta şu anda kullanılamıyor.</p>
        )}
        {emailInfo && !emailInfo.verified && emailInfo.available && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {codeSent && (
              <input
                data-testid="email-verify-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Doğrulama kodu"
                placeholder="6 haneli kod"
                className="h-9 w-32 rounded-lg border border-slate-300 px-2 text-center font-mono text-base tracking-[0.3em]"
              />
            )}
            {codeSent && (
              <button
                type="button"
                data-testid="email-verify-confirm"
                disabled={busy !== null || code.length !== 6}
                onClick={() => void emailAction("confirm")}
                className="flex h-9 items-center gap-1 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                Doğrula
              </button>
            )}
            <button
              type="button"
              data-testid="email-verify-send"
              disabled={busy !== null}
              onClick={() => void emailAction("send")}
              className="flex h-9 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 disabled:opacity-60"
            >
              {busy === "send" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {codeSent ? "Yeni kod gönder" : "Doğrulama kodu gönder"}
            </button>
          </div>
        )}
      </div>

      {/* Android cihazlar */}
      <div className="mt-2 rounded-xl border border-slate-200 px-3 py-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <Smartphone className="h-4 w-4 text-emerald-600" aria-hidden />
          Güvenilir Android cihazlarım
        </p>
        {devices !== null && liveDevices.length === 0 && (
          <p className="mt-1 text-[11px] text-slate-500">
            Kayıtlı cihaz yok. Android uygulamasından cihaz kaydı başlatabilirsiniz; ilk cihaz yönetici onayıyla etkinleşir.
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {liveDevices.map((d) => {
            const [label, cls] = DEVICE_STATE[d.state] ?? [d.state, "bg-slate-100 text-slate-500"];
            return (
              <li key={d.id} data-testid="my-device-row" className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900">
                    <span className="break-words">{d.model ?? "Android cihaz"}</span>
                    {d.display_code && <span className="font-mono text-[10px] text-slate-500">{d.display_code}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Kayıt {fmt(d.created_at)} · Son kullanım {fmt(d.last_used_at)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void revokeDevice(d)}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {busy === `dev:${d.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  İptal et
                </button>
              </li>
            );
          })}
        </ul>
        {pastDevices.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">Eski cihazlar ({pastDevices.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {pastDevices.map((d) => (
                <li key={d.id} className="text-[11px] text-slate-500">
                  {d.model ?? "Android cihaz"} · {(DEVICE_STATE[d.state] ?? [d.state])[0]} · {fmt(d.revoked_at ?? d.created_at)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* F2-E: hesap kurtarma (kurtarma kodları, e-posta / telefon değişimi, açık kurtarma talebi) */}
      <AccountRecoverySection userId={userId} devices={liveDevices} onChanged={() => void load()} emailChangeAvailable={emailInfo ? emailInfo.changeAvailable : null} />
    </section>
  );
}

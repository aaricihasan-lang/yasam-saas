"use client";
/**
 * Üye Detayı → Hesap ve Güvenlik → İki Aşamalı Giriş Yönetimi (YALNIZ Owner).
 * Yetki kararı sunucuda + DB'de (GET/POST /api/admin/users/[id]/mfa → auth_is_owner_admin, auth_mfa_set_required);
 * Owner olmayan yöneticide API 403 döner ve bu bölüm HİÇ çizilmez. Gizli değer gösterilmez (yalnız var / yok, tarih).
 * Kaldırma: DB son 30 dk MFA'lı oturum + işleme / üyeye bağlı tek kullanımlık kanıt ister → OwnerStepUpDialog,
 * doğrulanınca aynı istek BİR KEZ yeniden gönderilir (kanıt DB'de aynı işlemde tüketilir).
 */
import { useCallback, useEffect, useState } from "react";
import OwnerStepUpDialog from "@/components/admin/OwnerStepUpDialog";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";
import detailCss from "@/components/admin/members/detail/MemberDetailV2.module.css";

type MethodState = { usable: boolean; reasons: string[]; reasonText: string[] };
type Status = {
  role: string;
  isOwnerAccount: boolean;
  mfaRequired: boolean;
  mfaRequiredAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  hasActiveDevice: boolean;
  recoveryCodesLeft: number;
  ownerOfflineKitLeft: number | null;
  configIssues: string[];
  configIssueText: string[];
  ownerSelfRecoveryReady: boolean | null;
  memberRecoveryReady?: boolean | null;
  loginMethods: string[];
  methods: { email_otp: MethodState; qr_device: MethodState };
  ready: boolean;
  readyReasonText: string[];
};
type Mode = null | "enable" | "disable" | "access_reset";

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
};

function Pill({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-black ring-1 ${ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
      {ok ? yes : no}
    </span>
  );
}

export function MemberMfaPanel({ userId }: { userId: string }) {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) { setVisible(false); return; }
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/mfa`, { headers, cache: "no-store" });
      if (res.status === 403 || res.status === 401) { setVisible(false); return; }
      const j = (await res.json().catch(() => ({}))) as { status?: Status; isSelf?: boolean; error?: string };
      if (!res.ok || !j.status) { setVisible(true); setLoadError(j.error ?? "Durum okunamadı."); return; }
      setVisible(true); setLoadError(null); setStatus(j.status); setIsSelf(j.isSelf === true);
    } catch {
      setVisible(true); setLoadError("Durum okunamadı. Bağlantınızı kontrol edin.");
    }
  }, [userId]);

  useEffect(() => {
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const openMode = (m: Mode) => { setMode(m); setReason(""); setConfirmed(false); setOwnerPassword(""); setMessage(null); };

  const submit = useCallback(async () => {
    if (!mode) return;
    const headers = ownerAdminHeaders(true);
    if (!headers) { setMessage({ kind: "error", text: "Yönetici oturumu bulunamadı." }); return; }
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/mfa`, {
        method: "POST", headers, cache: "no-store",
        body: JSON.stringify({ action: mode, reason: reason.trim(), confirm: confirmed, ...(mode === "access_reset" ? { password: ownerPassword } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; changed?: boolean; reloginRequired?: boolean; status?: Status | null;
        devicesRevoked?: number; sessionsClosed?: number };
      if (res.ok && j.ok && mode === "access_reset") {
        setMode(null); setOwnerPassword("");
        setMessage({ kind: "ok", text: `Giriş erişimi sıfırlandı: ikinci doğrulama zorunluluğu kaldırıldı, ${j.devicesRevoked ?? 0} cihaz iptal edildi, ${j.sessionsClosed ?? 0} oturum kapatıldı. Üye parolasıyla giriş yapabilir; gerekirse şifresini sıfırlayın veya e-posta adresini güncelleyin (yeni adresi üye doğrulayana kadar doğrulanmamış sayılır).` });
        void load();
        return;
      }
      if (res.ok && j.ok) {
        if (j.status) setStatus(j.status);
        setMode(null);
        if (j.reloginRequired) {
          setMessage({ kind: "ok", text: "İkinci doğrulama zorunluluğunuz açıldı. Bu oturum güvenlik gereği kapatıldı; çıkış yapıp telefonunuz veya e-posta kodunuzla yeniden giriş yapın." });
        } else {
          setMessage({ kind: "ok", text: j.changed === false ? "Değişiklik gerekmedi: durum zaten bu şekildeydi." : mode === "enable" ? "İkinci doğrulama zorunluluğu açıldı. Üyenin ikinci doğrulamasız açık oturumları kapatıldı." : "İkinci doğrulama zorunluluğu kaldırıldı." });
        }
        return;
      }
      if (j.code === "STEP_UP_REQUIRED") { setStepUp(true); return; }
      if (j.status) setStatus(j.status);
      setMessage({ kind: "error", text: j.error ?? "İşlem tamamlanamadı." });
    } catch {
      setMessage({ kind: "error", text: "Sunucuya ulaşılamadı; işlem yapılmadı." });
    } finally {
      setBusy(false);
    }
  }, [mode, reason, confirmed, ownerPassword, userId, load]);

  if (!visible) return null;

  const s = status;
  // Sunucu aynı kuralları ayrıca uygular (API 409); düğme yalnız kolaylık.
  const ownerBlocked = !!s && s.isOwnerAccount && s.ownerSelfRecoveryReady !== true;
  const canEnable = !!s && !s.mfaRequired && s.ready && s.configIssues.length === 0 && !ownerBlocked;
  const canDisable = !!s && s.mfaRequired && !isSelf;
  const canReset = !!s && !isSelf && !s.isOwnerAccount;
  const reasonOk = reason.trim().length >= (mode === "access_reset" ? 10 : 3);
  const passwordOk = mode !== "access_reset" || ownerPassword.length > 0;

  return (
    <section id="uye-mfa-yonetimi" className="min-w-0 rounded-[28px] border-2 border-white/80 bg-white/90 p-6 sm:p-8" aria-labelledby="uye-mfa-baslik" data-mfa-panel>
      <h2 id="uye-mfa-baslik" className="text-xl font-black text-slate-950">İki Aşamalı Giriş Yönetimi</h2>
      <p className="mt-1 text-sm font-semibold text-slate-600">Yalnız sistem sahibi görür ve değiştirir. Şifre, kod ve anahtarlar burada gösterilmez.</p>

      {loadError ? <p className="mt-4 break-words rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800" role="alert">{loadError}</p> : null}

      {s ? (
        <>
          <div className={`mt-4 ${detailCss.infoGrid}`}>
            <div className={detailCss.infoCard} data-mfa-required={s.mfaRequired ? "on" : "off"}>
              <b>Zorunluluk</b>
              <span><Pill ok={s.mfaRequired} yes="Açık" no="Kapalı" /></span>
              <span>Son açılma: {fmt(s.mfaRequiredAt)}</span>
            </div>
            <div className={detailCss.infoCard}>
              <b>E-posta adresi</b>
              <span><Pill ok={s.emailVerified} yes="Doğrulandı" no="Doğrulanmadı" /></span>
              {s.emailVerifiedAt ? <span>{fmt(s.emailVerifiedAt)}</span> : null}
            </div>
            <div className={detailCss.infoCard} data-method="email_otp">
              <b>E-posta kodu yöntemi</b>
              <span><Pill ok={s.methods.email_otp.usable} yes="Kullanılabilir" no="Kullanılamaz" /></span>
              {s.methods.email_otp.reasonText.map((t) => <span key={t} className="break-words">{t}</span>)}
            </div>
            <div className={detailCss.infoCard} data-method="qr_device">
              <b>Güvenilir Android telefon</b>
              <span><Pill ok={s.methods.qr_device.usable} yes="Kullanılabilir" no="Kullanılamaz" /></span>
              <span>Aktif cihaz: {s.hasActiveDevice ? "var" : "yok"}</span>
              {s.methods.qr_device.reasonText.map((t) => <span key={t} className="break-words">{t}</span>)}
            </div>
            <div className={detailCss.infoCard} data-recovery="codes">
              <b>Kurtarma kodları (isteğe bağlı)</b>
              <span>{s.recoveryCodesLeft > 0 ? `${s.recoveryCodesLeft} kullanılmamış kurtarma kodu` : "Yok"}</span>
              <span className="break-words">Erişimini kaybeden üye Owner destekli sıfırlamayla yeniden girer.</span>
            </div>
            {s.isOwnerAccount ? (
              <div className={detailCss.infoCard} data-recovery="owner-kit" data-owner-kit={s.ownerOfflineKitLeft === null ? "unknown" : String(s.ownerOfflineKitLeft)}>
                <b>Çevrimdışı kurtarma kiti</b>
                <span><Pill ok={s.ownerSelfRecoveryReady === true} yes="Hazır" no={s.ownerOfflineKitLeft === null ? "Okunamadı" : "Yok"} /></span>
                <span className="break-words">{s.ownerOfflineKitLeft === null
                  ? "Kit durumu yalnız kendi oturumunuzla okunabilir."
                  : s.ownerOfflineKitLeft > 0
                    ? `${s.ownerOfflineKitLeft} kullanılmamış kit kodu (kâğıtta saklayın).`
                    : "Kit kodu yok. Kendi zorunluluğunuzu açmadan önce kit oluşturulmalı."}</span>
              </div>
            ) : null}
            <div className={detailCss.infoCard} data-mfa-ready={s.ready ? "yes" : "no"}>
              <b>Etkinleştirmeye hazır mı?</b>
              <span><Pill ok={s.ready} yes="Hazır" no="Hazır değil" /></span>
              {s.readyReasonText.map((t) => <span key={t} className="break-words">{t}</span>)}
              {s.configIssueText.map((t) => <span key={t} className="break-words" data-mfa-config-issue>{t}</span>)}
            </div>
          </div>

          {message ? (
            <p className={`mt-4 break-words rounded-xl px-3 py-2 text-sm font-bold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`} role={message.kind === "ok" ? "status" : "alert"} data-mfa-message={message.kind}>
              {message.text}
            </p>
          ) : null}

          {mode === null ? (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!s.mfaRequired ? (
                <button type="button" onClick={() => openMode("enable")} disabled={!canEnable}
                  className="min-h-11 w-full rounded-xl bg-[#793843] px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" data-mfa-action="enable">
                  Zorunluluğu aç
                </button>
              ) : null}
              {s.mfaRequired && !isSelf ? (
                <button type="button" onClick={() => openMode("disable")} disabled={!canDisable}
                  className="min-h-11 w-full rounded-xl border-2 border-rose-300 bg-white px-4 py-2.5 text-sm font-black text-rose-800 sm:w-auto" data-mfa-action="disable">
                  Zorunluluğu kaldır
                </button>
              ) : null}
              {s.mfaRequired && isSelf ? <p className="text-sm font-semibold text-slate-600">Kendi zorunluluğunuz bu ekrandan kaldırılamaz.</p> : null}
              {!s.mfaRequired && !s.ready ? <p className="text-sm font-semibold text-slate-600">Önce üyenin çalışan bir doğrulama yöntemi olmalı; aksi hâlde giriş yapamaz.</p> : null}
              {!s.mfaRequired && s.ready && ownerBlocked ? <p className="text-sm font-semibold text-slate-600" data-mfa-owner-blocked>Kendi zorunluluğunuzu açmadan önce kullanılmamış çevrimdışı kurtarma kiti kodunuz olmalı.</p> : null}
              {canReset ? (
                <button type="button" onClick={() => openMode("access_reset")}
                  className="min-h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 sm:w-auto" data-mfa-action="access_reset">
                  Giriş erişimini sıfırla
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" data-mfa-form={mode}>
              <p className="break-words text-sm font-bold text-slate-800">
                {mode === "enable"
                  ? isSelf
                    ? "Kendi hesabınızda ikinci doğrulamayı zorunlu yapıyorsunuz. İkinci doğrulamasız açılmış oturumlarınız (bu oturum dahil) hemen kapanır; telefonunuz veya e-posta kodunuzla yeniden giriş yapmanız gerekir."
                    : "Üye bundan sonra her girişte ikinci doğrulama yapacak. İkinci doğrulamasız açık oturumları hemen kapanır."
                  : mode === "access_reset"
                    ? "Üye bütün giriş yöntemlerine erişimini kaybettiyse ve kişiyi sistem dışında teyit ettiyseniz kullanın. İkinci doğrulama zorunluluğu kalkar, güvenilir cihazları iptal edilir ve bütün oturumları kapanır. Danışanlar, notlar, raporlar ve diğer veriler DEĞİŞMEZ."
                    : "Zorunluluğu kaldırmak hesabın korumasını azaltır. Telefonunuz veya e-posta kodunuzla ek doğrulama istenecek."}
              </p>
              <label className="grid gap-1 text-sm font-bold text-slate-700">
                Gerekçe
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
                  className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" data-mfa-reason />
              </label>
              {mode === "access_reset" ? (
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Kendi parolanız (Owner)
                  <input type="password" autoComplete="current-password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" data-mfa-owner-password />
                </label>
              ) : null}
              <label className="flex items-start gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" data-mfa-confirm />
                <span className="break-words">{mode === "enable" ? "Üyenin çalışan bir doğrulama yöntemi olduğunu ve girişlerin değişeceğini anladım." : mode === "access_reset" ? "Kişinin kimliğini sistem dışında teyit ettim; yalnız bu üyenin giriş erişimini sıfırlıyorum." : "Bu hesabın ikinci doğrulama korumasını kaldırmayı onaylıyorum."}</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => void submit()} disabled={busy || !reasonOk || !confirmed || !passwordOk}
                  className="min-h-11 w-full rounded-xl bg-[#793843] px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" data-mfa-submit>
                  {busy ? "İşleniyor…" : mode === "enable" ? "Zorunluluğu aç" : mode === "access_reset" ? "Erişimi sıfırla" : "Zorunluluğu kaldır"}
                </button>
                <button type="button" onClick={() => setMode(null)} disabled={busy}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 sm:w-auto">
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </>
      ) : !loadError ? <p className="mt-4 text-sm font-semibold text-slate-500">Yükleniyor…</p> : null}

      {stepUp ? (
        <OwnerStepUpDialog
          action="mfa_disable"
          targetId={userId}
          onCancel={() => { setStepUp(false); setMessage({ kind: "error", text: "Ek doğrulama tamamlanmadı; hiçbir şey değişmedi." }); }}
          onVerified={() => { setStepUp(false); void submit(); }}
        />
      ) : null}
    </section>
  );
}

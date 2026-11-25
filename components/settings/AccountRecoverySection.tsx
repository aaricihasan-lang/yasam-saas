"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { AlertTriangle, Copy, Download, KeyRound, Loader2, Mail, ShieldAlert, Smartphone } from "lucide-react";
import { readSessionToken, hasSessionCredential, sessionTokenHeader } from "@/lib/auth/yasamUser";
import PasswordInput from "@/components/ui/PasswordInput";

/**
 * GİRİŞ GÜVENLİĞİ F2-E — "Giriş Yöntemlerim" altındaki hesap kurtarma bölümleri.
 *  · Kurtarma kodları: 10 tek kullanımlık kod; parola ile oluşturulur, YALNIZ bir kez gösterilir
 *    (bileşen durumu kapatılınca silinir; sunucuda düz kod yoktur). Yenilemek eskileri geçersiz kılar.
 *  · Açık kurtarma talebi: hesabım için Owner talep açtıysa iptal edebilirim.
 *  · E-posta değişikliği: QR veya kurtarma koduyla açılmış oturum + parola + yeni adrese gelen kod.
 *  · Telefon değişimi: eski telefonla (QR) son 30 dk'da açılmış oturumdan; yeni telefon yine Owner onayıyla.
 *  · Owner: çevrimdışı kodla açılmış taze oturumda yeni telefon için eşleştirme kodu.
 *  · F3: e-posta değişikliği formu yalnız sunucu bu hesap için açık dediğinde (emailChangeAvailable) gösterilir;
 *    kapalıysa bilgi notu çıkar. Asıl denetim sunucudadır (/api/me/email-change 403 METHOD_NOT_IN_SCOPE).
 */
type Status = {
  codesActive: number;
  generatedAt: string | null;
  lastUsedAt: string | null;
  sessionMethod: string | null;
  sessionRecoveryKind: string | null;
  isOwner: boolean;
  ownerOfflineActive: number | null;
  ownerBootstrapAvailable: boolean;
  openCase: { id: string; opened_at: string; not_before: string } | null;
};
type LiveDevice = { id: string; model: string | null; display_code: string | null; state: string };
type Replace = { proofDeviceId: string | null; waiting: { old_device_id: string; display_code: string | null; model: string | null; expires_at: string } | null };

function fmt(iso: string | null | undefined, locale: ActiveLocale): string {
  if (!iso) return "—";
  try {
    // I18N-F1-R1: ekran diline göre (tr → "tr-TR" ile bugünkü çıktı birebir aynı).
    return formatDateTime(iso, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, locale);
  } catch {
    return "—";
  }
}

const card = "mt-2 rounded-xl border border-slate-200 px-3 py-3";
const input = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";
const primary = "flex h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white transition hover:bg-violet-700 disabled:opacity-60";
const secondary = "flex h-10 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60";

export default function AccountRecoverySection({
  userId,
  devices,
  onChanged,
  emailChangeAvailable = null,
}: {
  userId: string;
  devices: LiveDevice[];
  onChanged: () => void;
  /** F3: null = henüz bilinmiyor (form gösterilir, sunucu yine denetler); false = bu hesapta kapalı. */
  emailChangeAvailable?: boolean | null;
}) {
  const t = useTranslations("auth.ui.recovery");
  const locale = useLocale() as ActiveLocale;
  const [st, setSt] = useState<Status | null>(null);
  const [rep, setRep] = useState<Replace | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [genPassword, setGenPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailReq, setEmailReq] = useState<{ id: string; sentTo: string } | null>(null);
  const [emailCode, setEmailCode] = useState("");

  const [ownerPassword, setOwnerPassword] = useState("");
  const [bootstrap, setBootstrap] = useState<{ code: string; expiresAt: string | null } | null>(null);

  const headers = useCallback((json = false): Record<string, string> => {
    const token = readSessionToken();
    return { "x-user-id": userId, ...sessionTokenHeader(token), ...(json ? { "Content-Type": "application/json" } : {}) };
  }, [userId]);

  const load = useCallback(async () => {
    if (!hasSessionCredential(readSessionToken())) return;
    try {
      const [a, b] = await Promise.all([
        fetch("/api/me/account-recovery", { cache: "no-store", headers: headers() }),
        fetch("/api/me/devices/replace", { cache: "no-store", headers: headers() }),
      ]);
      if (a.ok) setSt((await a.json()) as Status);
      if (b.ok) setRep((await b.json()) as Replace);
    } catch {
      setError(t("loadFailed"));
    }
  }, [headers, t]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function post(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; j: Record<string, unknown> }> {
    const res = await fetch(url, { method, headers: headers(true), body: body === undefined ? undefined : JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, j };
  }

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch {
      setError(t("actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  const generate = () => run("gen", async () => {
    const { ok, j } = await post("/api/me/account-recovery", { action: "generate", password: genPassword });
    setGenPassword("");
    if (!ok || !Array.isArray(j.codes)) { setError(typeof j.error === "string" ? j.error : t("codesFailed")); return; }
    setCodes(j.codes.filter((c): c is string => typeof c === "string"));
    setSaved(false);
    void load();
  });

  function closeCodes() {
    setCodes(null);
    setSaved(false);
    setNotice(t("codesClosed"));
  }

  async function copyCodes() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setNotice(t("copied"));
    } catch {
      setError(t("copyFailed"));
    }
  }

  function downloadCodes() {
    if (!codes) return;
    const text = [
      t("file.title"),
      t("file.created", { date: formatDateTime(new Date(), undefined, locale) }),
      t("file.warning"),
      "",
      ...codes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`),
      "",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t("file.name");
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const cancelCase = (caseId: string) => run("case", async () => {
    const { ok, j } = await post("/api/me/account-recovery", { action: "cancel_case", caseId });
    if (!ok) { setError(typeof j.error === "string" ? j.error : t("caseCancelFailed")); return; }
    setNotice(t("caseCancelled"));
    void load();
  });

  const startEmail = () => run("email-start", async () => {
    const { ok, j } = await post("/api/me/email-change", { action: "start", newEmail, password: emailPassword });
    setEmailPassword("");
    if (!ok || typeof j.requestId !== "string") { setError(typeof j.error === "string" ? j.error : t("emailStartFailed")); return; }
    setEmailReq({ id: j.requestId, sentTo: typeof j.sentTo === "string" ? j.sentTo : "" });
    setEmailCode("");
    setNotice(t("emailCodeSent", { target: typeof j.sentTo === "string" ? j.sentTo : t("emailCodeSentFallbackTarget") }));
  });

  const confirmEmail = () => run("email-confirm", async () => {
    if (!emailReq) return;
    const { ok, j } = await post("/api/me/email-change", { action: "confirm", requestId: emailReq.id, code: emailCode });
    setEmailCode("");
    if (!ok) { setError(typeof j.error === "string" ? j.error : t("emailChangeFailed")); return; }
    setEmailReq(null);
    setNewEmail("");
    setNotice(t("emailChanged"));
    onChanged();
  });

  const beginReplace = (deviceId: string) => run("rep", async () => {
    const { ok, j } = await post("/api/me/devices/replace", { oldDeviceId: deviceId });
    if (!ok) { setError(typeof j.error === "string" ? j.error : t("replaceFailed")); return; }
    setNotice(t("replaceStarted"));
    void load();
  });

  const cancelReplace = () => run("rep-cancel", async () => {
    const { ok, j } = await post("/api/me/devices/replace", undefined, "DELETE");
    if (!ok) { setError(typeof j.error === "string" ? j.error : t("replaceCancelFailed")); return; }
    setNotice(t("replaceCancelled"));
    void load();
  });

  const ownerBootstrap = () => run("owner", async () => {
    const { ok, j } = await post("/api/me/account-recovery", { action: "owner_bootstrap", password: ownerPassword });
    setOwnerPassword("");
    if (!ok || typeof j.code !== "string") { setError(typeof j.error === "string" ? j.error : t("bootstrapFailed")); return; }
    setBootstrap({ code: j.code, expiresAt: typeof j.expiresAt === "string" ? j.expiresAt : null });
    void load();
  });

  const strongSession = st?.sessionMethod === "qr_device" || st?.sessionMethod === "recovery_code";
  const proofDevice = rep?.proofDeviceId ? devices.find((d) => d.id === rep.proofDeviceId && d.state === "active") : undefined;

  return (
    <div data-testid="account-recovery-section">
      {st?.sessionMethod === "recovery_code" && (
        <div data-testid="recovery-session-banner" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {t.rich("sessionBanner", {
              kind: t(st.sessionRecoveryKind === "case_ticket" ? "sessionKind.case_ticket" : st.sessionRecoveryKind === "owner_offline" ? "sessionKind.owner_offline" : "sessionKind.code"),
              strong: (c) => <strong>{c}</strong>,
            })}
          </p>
        </div>
      )}

      {st?.openCase && (
        <div data-testid="recovery-case-banner" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
          <p className="flex items-center gap-1.5 font-bold"><ShieldAlert className="h-4 w-4" aria-hidden /> {t("caseTitle")}</p>
          <p className="mt-1">
            {t("caseBody", { opened: fmt(st.openCase.opened_at, locale), notBefore: fmt(st.openCase.not_before, locale) })}
          </p>
          <button type="button" data-testid="recovery-case-cancel" disabled={busy !== null} onClick={() => void cancelCase(st.openCase!.id)}
            className="mt-2 flex h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60">
            {busy === "case" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {t("caseCancel")}
          </button>
        </div>
      )}

      {error && <p role="alert" data-testid="recovery-error" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" data-testid="recovery-notice" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}

      {/* Kurtarma kodları */}
      <div className={card} data-testid="recovery-codes-card">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
          <KeyRound className="h-4 w-4 text-violet-600" aria-hidden />
          {t("codesTitle")}
          {st && (
            <span data-testid="recovery-codes-count" className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.codesActive > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {st.codesActive > 0 ? t("codesActive", { count: st.codesActive }) : t("codesNone")}
            </span>
          )}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {t("codesIntro")}
          {st?.generatedAt ? ` ${t("lastGenerated", { date: fmt(st.generatedAt, locale) })}` : ""}
        </p>

        {codes ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3" data-testid="recovery-codes-shown">
            <p className="text-xs font-bold text-violet-900">{t("codesShownTitle")}</p>
            <ol className="mt-2 grid grid-cols-1 gap-1 font-mono text-[13px] font-bold tracking-wide text-slate-900 min-[420px]:grid-cols-2">
              {codes.map((c, i) => (
                <li key={c} data-testid="recovery-code-item" className="break-all rounded bg-white px-2 py-1 ring-1 ring-violet-100">
                  <span className="mr-1 text-slate-400">{i + 1}.</span>{c}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => void copyCodes()}><Copy className="h-3.5 w-3.5" aria-hidden /> {t("copy")}</button>
              <button type="button" className={secondary} onClick={downloadCodes} data-testid="recovery-codes-download"><Download className="h-3.5 w-3.5" aria-hidden /> {t("download")}</button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" data-testid="recovery-codes-saved" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4" />
              {t("savedCheck")}
            </label>
            <button type="button" data-testid="recovery-codes-close" disabled={!saved} onClick={closeCodes} className={`${primary} mt-2 w-full`}>{t("closeCodes")}</button>
          </div>
        ) : (
          <form className="mt-3 flex flex-col gap-2 min-[480px]:flex-row" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
            <PasswordInput wrapperClassName="w-full" data-testid="recovery-gen-password" value={genPassword} onChange={(e) => setGenPassword(e.target.value)}
              autoComplete="current-password" aria-label={t("password")} placeholder={t("password")} className={input} />
            <button type="submit" data-testid="recovery-generate" disabled={busy !== null || !genPassword} className={`${primary} shrink-0`}>
              {busy === "gen" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {st && st.codesActive > 0 ? t("generateNew") : t("generate")}
            </button>
          </form>
        )}
        {!codes && st && st.codesActive > 0 && (
          <p className="mt-1.5 text-[11px] text-amber-700">{t("regenWarning")}</p>
        )}
      </div>

      {/* E-posta değişikliği */}
      <details className={card} data-testid="email-change-card">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-slate-900">
          <Mail className="h-4 w-4 text-slate-500" aria-hidden /> {t("emailTitle")}
        </summary>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          {t("emailIntro")}
        </p>
        {emailChangeAvailable === false && (
          <p data-testid="email-change-unavailable" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
            {t("emailChangeUnavailable")}
          </p>
        )}
        {emailChangeAvailable !== false && !strongSession && st && (
          <p data-testid="email-change-needs-strong" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            {t("emailNeedsStrong")}
          </p>
        )}
        {emailChangeAvailable === false ? null : !emailReq ? (
          <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void startEmail(); }}>
            <input type="email" data-testid="email-change-new" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email"
              aria-label={t("newEmail")} placeholder={t("newEmail")} className={input} />
            <PasswordInput wrapperClassName="w-full" data-testid="email-change-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password" aria-label={t("password")} placeholder={t("password")} className={input} />
            <button type="submit" data-testid="email-change-start" disabled={busy !== null || !newEmail || !emailPassword} className={`${primary} w-full`}>
              {busy === "email-start" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {t("emailSendCode")}
            </button>
          </form>
        ) : (
          <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void confirmEmail(); }}>
            <input data-testid="email-change-code" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" aria-label={t("codeAria")} placeholder={t("codePlaceholder")}
              className={`${input} text-center font-mono tracking-[0.3em]`} />
            <button type="submit" data-testid="email-change-confirm" disabled={busy !== null || emailCode.length !== 6} className={`${primary} w-full`}>
              {busy === "email-confirm" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {t("emailConfirm")}
            </button>
            <button type="button" className="w-full text-xs font-bold text-violet-700 hover:underline" onClick={() => setEmailReq(null)}>{t("cancel")}</button>
          </form>
        )}
      </details>

      {/* Telefon değişimi */}
      <details className={card} data-testid="phone-change-card">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-slate-900">
          <Smartphone className="h-4 w-4 text-emerald-600" aria-hidden /> {t("phoneTitle")}
        </summary>
        {rep?.waiting ? (
          <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-900" data-testid="phone-change-waiting">
            <p>
              {t.rich("phoneWaiting", {
                model: rep.waiting.model ?? t("androidDevice"),
                code: rep.waiting.display_code ?? "",
                date: fmt(rep.waiting.expires_at, locale),
                strong: (c) => <strong>{c}</strong>,
              })}
            </p>
            <button type="button" data-testid="phone-change-cancel" disabled={busy !== null} onClick={() => void cancelReplace()} className={`${secondary} mt-2`}>{t("phoneChangeCancel")}</button>
          </div>
        ) : proofDevice ? (
          <div className="mt-2">
            <p className="text-[11px] leading-snug text-slate-500">
              {t.rich("proofIntro", { model: proofDevice.model ?? t("androidDevice"), strong: (c) => <strong>{c}</strong> })}
            </p>
            <button type="button" data-testid="phone-change-begin" disabled={busy !== null} onClick={() => void beginReplace(proofDevice.id)} className={`${primary} mt-2 w-full`}>
              {busy === "rep" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {t("phoneBegin")}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-slate-500" data-testid="phone-change-help">
            {t.rich("phoneHelp", { strong: (c) => <strong>{c}</strong> })}
          </p>
        )}
      </details>

      {/* Owner — çevrimdışı kurtarma */}
      {st?.isOwner && (
        <div className={card} data-testid="owner-recovery-card">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldAlert className="h-4 w-4 text-rose-600" aria-hidden /> {t("ownerTitle")}</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {t.rich("ownerIntro", {
              n: String(st.ownerOfflineActive ?? 0),
              count: (c) => <strong data-testid="owner-offline-count">{c}</strong>,
            })}
          </p>
          {bootstrap ? (
            <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2" data-testid="owner-bootstrap-code">
              <p className="text-[11px] text-violet-900">{t("bootstrapHint", { date: fmt(bootstrap.expiresAt, locale) })}</p>
              <p className="mt-1 break-all font-mono text-lg font-extrabold tracking-wider text-violet-900">{bootstrap.code}</p>
            </div>
          ) : st.ownerBootstrapAvailable ? (
            <form className="mt-2 flex flex-col gap-2 min-[480px]:flex-row" onSubmit={(e) => { e.preventDefault(); void ownerBootstrap(); }}>
              <PasswordInput wrapperClassName="w-full" data-testid="owner-bootstrap-password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)}
                autoComplete="current-password" aria-label={t("password")} placeholder={t("password")} className={input} />
              <button type="submit" data-testid="owner-bootstrap-issue" disabled={busy !== null || !ownerPassword} className={`${primary} shrink-0`}>
                {busy === "owner" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} {t("bootstrapIssue")}
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

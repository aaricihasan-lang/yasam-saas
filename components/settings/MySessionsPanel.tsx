"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, MonitorSmartphone, RefreshCw, Smartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { readSessionToken, hasSessionCredential, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { localeTag } from "@/lib/i18n/format";
import { localizeApiError, type ApiErrorPayload } from "@/lib/i18n/apiError";
import type { ActiveLocale } from "@/lib/i18n/locales";

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

/** Kapanış nedeni (sunucu kodu) → katalog anahtarı `auth.ui.sessions.endReason.<anahtar>`. Kod listesi değişmedi. */
const END_REASON_KEYS = [
  "user_logout",
  "owner_self_revoked",
  "expired_idle",
  "expired_absolute",
  "expired_policy_cleanup",
  "stale",
  "replaced_same_device",
  "owner_denied",
  "pending_expired",
  "password_changed",
  "admin_terminated",
  "admin_logout_all",
  "admin_password_reset",
] as const;
const END_REASON_SET: ReadonlySet<string> = new Set(END_REASON_KEYS);

/** Hata durumu dil-bağımsız saklanır; metin render'da ekran dilinde üretilir (kontrol akışı metne bağlı değil). */
type PanelError = {
  key: "loadFailed" | "loadFailedNetwork" | "revokeFailed" | "revokeFailedNetwork";
  payload?: ApiErrorPayload;
};

// Gösterim yalnız: tr → bugünkü `toLocaleString("tr-TR", …)` ile birebir; en → en-GB (24 saat). Saklanan ISO değeri değişmez.
function fmt(iso: string | null, locale: ActiveLocale): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(localeTag(locale), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function MySessionsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const t = useTranslations("auth.ui.sessions");
  const tErr = useTranslations("common.apiErrors");
  const locale = useLocale() as ActiveLocale;

  const load = useCallback(async () => {
    const token = readSessionToken();
    if (!hasSessionCredential(token)) return;
    try {
      const res = await fetch("/api/me/sessions", {
        cache: "no-store",
        headers: { "x-user-id": userId, ...sessionTokenHeader(token) },
      });
      const j = (await res.json().catch(() => ({}))) as { sessions?: SessionRow[]; error?: string };
      if (!res.ok) {
        setError({ key: "loadFailed", payload: j });
        return;
      }
      setError(null);
      setRows(Array.isArray(j.sessions) ? j.sessions : []);
    } catch {
      setError({ key: "loadFailedNetwork" });
    }
  }, [userId]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function revoke(row: SessionRow) {
    const token = readSessionToken();
    if (!hasSessionCredential(token) || busyId) return;
    const ok = window.confirm(
      row.current ? t("confirmCurrent") : t("confirmOther", { device: row.device ?? "" }),
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/me/sessions/${row.id}`, {
        method: "DELETE",
        headers: { "x-user-id": userId, ...sessionTokenHeader(token) },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; wasCurrent?: boolean };
      if (!res.ok) setError({ key: "revokeFailed", payload: j });
      if (res.ok && j.wasCurrent) {
        window.location.replace("/");
        return;
      }
    } catch {
      setError({ key: "revokeFailedNetwork" });
    } finally {
      setBusyId(null);
      void load();
    }
  }

  // TR: sunucu metni bugünkü gibi (`j.error ?? varsayılan`); diğer dillerde eşlenmemiş Türkçe sunucu metni gösterilmez.
  const errorText = error
    ? error.payload
      ? localizeApiError(tErr, locale, error.payload, t(error.key))
      : t(error.key)
    : null;
  const open = (rows ?? []).filter((r) => r.state !== "ended");
  const ended = (rows ?? []).filter((r) => r.state === "ended");

  return (
    <section className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <MonitorSmartphone className="h-4 w-4 text-violet-600" aria-hidden />
          {t("title")}
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t("refresh")}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {t("intro")}
      </p>

      {errorText && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{errorText}</p>}
      {rows === null && !error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t("loading")}
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
                      {t("androidPersistent")}
                    </span>
                  )}
                  {r.state === "pending" && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t("pending")}</span>
                  )}
                  {r.current && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{t("thisDevice")}</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {r.kind === "android_app" ? t("kindAndroid") : t("kindWeb")} · {t("openedAt", { date: fmt(r.createdAt, locale) })} · {t("lastSeenAt", { date: fmt(r.lastSeenAt, locale) })}
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
                {t("revoke")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {ended.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-600">{t("endedSummary", { count: ended.length })}</summary>
          <ul className="mt-2 space-y-1.5">
            {ended.map((r) => (
              <li key={r.id} className="text-[11px] text-slate-500">
                {r.device} · {fmt(r.createdAt, locale)} → {fmt(r.endedAt, locale)} ·{" "}
                {r.endReason && END_REASON_SET.has(r.endReason) ? t(`endReason.${r.endReason}`) : t("endReasonDefault")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

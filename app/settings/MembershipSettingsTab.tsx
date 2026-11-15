"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, Crown, Info, Loader2, MessageSquare, ShieldAlert } from "lucide-react";
import { readSessionToken, sessionTokenHeader, type YasamUser } from "@/lib/auth/yasamUser";
import {
  profileStateFromResponse,
  resolveMembershipView,
  type MembershipTone,
  type MembershipView,
  type ProfileFetchState,
  type TrialStatusLite,
} from "@/lib/settings/membershipView";

/**
 * F4 — Ayarlar › "Üyeliğim" (SALT-OKUNUR). Yalnız mevcut uçları okur:
 *   GET /api/auth/profile (kimlik oturumdan; başka kullanıcı id'si guard'da reddedilir) ve yalnız 7 günlük
 *   deneme uzmanında GET /api/trial/status (kök yerleşimdeki deneme bildirimiyle AYNI çağrı; yeni yan etki yok).
 * Yazma / ödeme / Roxy çağrısı YOK. "Pro üyelik talebi" mevcut "Admin ile İrtibat" sekmesine yönlendirir.
 */

type LoadState = { loading: true } | { loading: false; view: MembershipView };

const TONE_BADGE: Record<MembershipTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  muted: "border-slate-200 bg-slate-50 text-slate-700",
};

function authHeaders(userId: string): Record<string, string> {
  return { "x-user-id": userId, ...sessionTokenHeader(readSessionToken()) };
}

async function loadMembership(user: YasamUser, signal: AbortSignal): Promise<MembershipView> {
  let profile: ProfileFetchState = { status: "error" };
  try {
    const res = await fetch("/api/auth/profile", { headers: authHeaders(user.id), cache: "no-store", signal });
    const body = await res.json().catch(() => null);
    profile = profileStateFromResponse(res.status, body);
  } catch (e) {
    if (signal.aborted) throw e;
  }

  let trial: TrialStatusLite | null = null;
  if (
    profile.status === "ok" &&
    String(profile.profile.trial_kind ?? "").trim().toLowerCase() === "self_7d" &&
    String(profile.profile.role ?? "").toLowerCase() === "expert" &&
    profile.profile.is_demo_account !== true
  ) {
    try {
      const res = await fetch("/api/trial/status", { headers: authHeaders(user.id), cache: "no-store", signal });
      const body = (res.ok ? await res.json().catch(() => null) : null) as { trial?: TrialStatusLite | null } | null;
      trial = body?.trial ?? null;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  return resolveMembershipView({ profile, trial });
}

/** Sekme simgesi (page.tsx lucide import listesine dokunmamak için buradan verilir). */
export const MEMBERSHIP_TAB_ICON = BadgeCheck;

export function MembershipSettingsTab({ user, onOpenContact }: { user: YasamUser; onOpenContact: () => void }) {
  const [state, setState] = useState<LoadState>({ loading: true });

  useEffect(() => {
    const ctrl = new AbortController();
    loadMembership(user, ctrl.signal)
      .then((view) => setState({ loading: false, view }))
      .catch(() => {
        /* iptal edildi */
      });
    return () => ctrl.abort();
  }, [user]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-violet-500" aria-hidden />
        Üyelik bilgileriniz yükleniyor…
      </div>
    );
  }

  const v = state.view;
  const HeadIcon = v.tone === "warn" || v.tone === "danger" ? ShieldAlert : v.kind === "pro_active" ? Crown : BadgeCheck;

  return (
    <section aria-labelledby="membership-heading" data-membership-kind={v.kind} className="min-w-0 space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-fuchsia-50/50 p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-fuchsia-200/30 blur-3xl" aria-hidden />
        <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md">
            <HeadIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-violet-700">Mevcut paket</p>
            <h3 id="membership-heading" className="mt-0.5 break-words text-lg font-black text-slate-900 sm:text-xl">
              {v.packageLabel}
            </h3>
            <span
              className={`mt-2 inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold ${TONE_BADGE[v.tone]}`}
              data-testid="membership-status"
            >
              <span className="sr-only">Üyelik durumu: </span>
              {v.statusLabel}
            </span>
            <p className="mt-3 break-words text-sm leading-relaxed text-slate-700">{v.summary}</p>
          </div>
        </div>
      </div>

      {v.rows.length > 0 ? (
        <div className="min-w-0">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
            <CalendarClock className="h-4 w-4 text-violet-600" aria-hidden />
            Tarihler ve kullanım
          </h4>
          <dl className="grid min-w-0 gap-2.5 sm:grid-cols-2">
            {v.rows.map((r) => (
              <div key={r.term} className="min-w-0 rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
                <dt className="text-[11px] font-black uppercase tracking-wide text-slate-500">{r.term}</dt>
                <dd className="mt-1 break-words text-sm font-bold text-slate-900">{r.value}</dd>
                {r.note ? <dd className="mt-1 break-words text-xs leading-relaxed text-slate-500">{r.note}</dd> : null}
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-slate-400">Tarihler Türkiye saatiyle gösterilir.</p>
        </div>
      ) : null}

      {v.restrictions.length > 0 ? (
        <div className="min-w-0">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
            <Info className="h-4 w-4 text-violet-600" aria-hidden />
            Erişim kuralları
          </h4>
          <ul className="space-y-1.5">
            {v.restrictions.map((r) => (
              <li key={r} className="flex min-w-0 gap-2 text-sm leading-relaxed text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
                <span className="min-w-0 break-words">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.contactCta ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-xs leading-relaxed text-slate-600">{v.contactCta.hint}</p>
          <button
            type="button"
            onClick={onOpenContact}
            data-testid="membership-contact-cta"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            {v.contactCta.label}
          </button>
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Bu sayfa yalnız bilgi amaçlıdır; paket ve üyelik değişiklikleri yöneticiniz tarafından yapılır.
      </p>
    </section>
  );
}

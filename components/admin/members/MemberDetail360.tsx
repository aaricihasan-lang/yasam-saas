"use client";

/**
 * ÜYE DETAYI 360° — bölüm navigasyonu, Kullanım paneli, Yönetim Geçmişi.
 *
 * GİZLİLİK: Kullanım verisi YALNIZ mevcut Usage360 admin detay ucundan (telemetri rollup'ı +
 * hesap meta) gelir; uzmanın danışan/not/analiz/rapor içeriği sorgulanmaz. Yönetim geçmişi
 * admin_audit_log'dan yalnız allowlist'li işlem türü + tarih + (çözülebiliyorsa) yönetici adı
 * gösterir; old/new değerleri, tutar, not vb. ASLA gösterilmez.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, History, Loader2, ListTree } from "lucide-react";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { formatDurationTr, CHANNEL_LABEL } from "@/lib/admin/stats/usage360Labels";
import { formatDateTimeTr } from "@/lib/admin/userManagement";
import {
  AUDIT_CATEGORY,
  auditTimelineText,
  relativeDaysLabel,
  summarizeMemberUsage,
  type AuditCategory,
  type MemberUsageSummary,
} from "@/lib/admin/member360";
import { daysBetweenIso, istanbulTodayIso } from "@/lib/admin/memberCommercial";
import { formatIsoDateTr } from "@/lib/admin/memberPricing";
import type { Usage360DetailData } from "@/lib/admin/stats/apiTypes";

// ── Bölüm navigasyonu ─────────────────────────────────────────────────────────────

export type MemberSection = { id: string; label: string };

/**
 * Erişilebilir anchor navigasyonu (gerçek sekme DEĞİL — mevcut işlemler tek sayfada kalır, veri
 * kaybı riski yok). lg+ ekranda üst menünün altında yapışkan; mobilde yatay kaydırmalı şerit.
 */
export function MemberSectionNav({ sections }: { sections: MemberSection[] }) {
  return (
    <nav
      aria-label="Üye detayı bölümleri"
      className="z-40 -mx-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/90 px-1 py-1.5 shadow-md backdrop-blur-xl lg:sticky lg:top-[108px]"
    >
      <ul className="flex min-w-max items-center gap-1">
        <li className="hidden px-2 text-violet-700 sm:block" aria-hidden>
          <ListTree className="h-4 w-4" />
        </li>
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-black text-slate-700 no-underline transition hover:bg-violet-50 hover:text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Kullanım verisi (mevcut Usage360 detay ucu; son 30 TR günü) ──────────────────────

export type MemberUsageState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; summary: MemberUsageSummary; today: string }
  | { kind: "error" };

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function useMemberUsage(userId: string, adminId: string, enabled: boolean, reloadKey = 0): MemberUsageState {
  const key = `${userId}|${adminId}|${reloadKey}`;
  const [res, setRes] = useState<{ key: string; state: MemberUsageState } | null>(null);
  useEffect(() => {
    if (!enabled || !userId || !adminId) return;
    const ctrl = new AbortController();
    const today = istanbulTodayIso();
    const qs = new URLSearchParams({ userId, from: addDaysIso(today, -29), to: today });
    const headers: Record<string, string> = { "x-admin-id": adminId };
    const token = readSessionToken();
    if (token) headers["x-session-token"] = token;
    fetch(`/api/admin/expert-stats/usage360/detail?${qs.toString()}`, { headers, signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) { setRes({ key, state: { kind: "error" } }); return; }
        const j = (await r.json()) as { data?: Usage360DetailData };
        if (!j.data) { setRes({ key, state: { kind: "error" } }); return; }
        setRes({ key, state: { kind: "ready", summary: summarizeMemberUsage(j.data), today: j.data.today } });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setRes({ key, state: { kind: "error" } });
      });
    return () => ctrl.abort();
  }, [enabled, userId, adminId, key]);
  if (!enabled) return { kind: "idle" };
  return res && res.key === key ? res.state : { kind: "loading" };
}

/** "Son gerçek aktivite" kısa metni (Özet + Kullanım ortak). */
export function lastActivityText(s: MemberUsageSummary, today: string): string {
  if (!s.measurementStart) return "Ölçüm henüz başlamadı";
  if (!s.lastActivityAt) return `Ölçüm başından beri (${formatIsoDateTr(s.measurementStart)}) aktivite yok`;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(s.lastActivityAt));
  const rel = relativeDaysLabel(daysBetweenIso(day, today));
  return `${rel.charAt(0).toUpperCase()}${rel.slice(1)} · ${formatDateTimeTr(s.lastActivityAt)}`;
}

/** "4 gün" + kısmi kapsam eki. */
export function activeDaysText(n: number, coverage: "none" | "partial" | "full", measuredInWindow: number | null, windowDays: number): string {
  if (coverage === "none") return "Ölçülemiyor";
  if (coverage === "partial") return `${n} gün (kısmi: ${Math.min(measuredInWindow ?? 0, windowDays)}/${windowDays} gün ölçüldü)`;
  return `${n} gün`;
}

const tile = "rounded-2xl border-2 border-slate-100 bg-white/90 p-4";
const term = "text-[11px] font-black uppercase tracking-wide text-slate-500";

export function MemberUsagePanel({ userId, state }: { userId: string; state: MemberUsageState }) {
  return (
    <section
      id="uye-kullanim"
      aria-labelledby="uye-kullanim-title"
      className="scroll-mt-28 rounded-[28px] border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="uye-kullanim-title" className="flex items-center gap-2 text-xl font-black text-slate-950">
            <Activity className="h-5 w-5 text-emerald-700" aria-hidden />
            Kullanım · son 30 gün
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Gerçek etkileşim ölçümü (Usage360). Oturumun yalnız açık kalması kullanım sayılmaz; uzman içeriği görüntülenmez.
          </p>
        </div>
        <Link
          href={`/admin/kullanim-takibi/uzman/${encodeURIComponent(userId)}`}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-emerald-300 bg-white px-3 text-sm font-black text-emerald-900 no-underline hover:bg-emerald-50"
        >
          Ayrıntılı Kullanım 360°
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {state.kind === "loading" || state.kind === "idle" ? (
        <div className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Kullanım verisi yükleniyor…
        </div>
      ) : state.kind === "error" ? (
        <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900" role="alert">
          Kullanım verisi şu an alınamadı. Bu, kullanım olmadığı anlamına gelmez.
        </p>
      ) : (
        <UsageBody s={state.summary} today={state.today} />
      )}
    </section>
  );
}

function UsageBody({ s, today }: { s: MemberUsageSummary; today: string }) {
  if (!s.measurementStart) {
    return (
      <p className="mt-6 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-700">
        Kullanım ölçümü henüz başlamadı — sayılar gösterilmez (sıfır kullanım olarak yorumlanmaz).
      </p>
    );
  }
  const partial = s.coverage30 === "partial";
  return (
    <>
      {partial ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900" role="note">
          Kısmi ölçüm: son 30 günün yalnız {s.measuredDaysIn30} günü ölçüldü (ölçüm başlangıcı {formatIsoDateTr(s.measurementStart)}).
          Öncesi için tahmin yapılmaz.
        </p>
      ) : null}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className={tile}>
          <dt className={term}>Son gerçek aktivite</dt>
          <dd className="mt-1.5 text-sm font-black text-slate-900">{lastActivityText(s, today)}</dd>
        </div>
        <div className={tile}>
          <dt className={term}>Aktif gün</dt>
          <dd className="mt-1.5 text-sm font-black text-slate-900">
            7g: {activeDaysText(s.d7ActiveDays, s.coverage7, s.measuredDaysIn30, 7)}
            <span className="block">30g: {activeDaysText(s.d30ActiveDays, s.coverage30, s.measuredDaysIn30, 30)}</span>
          </dd>
        </div>
        <div className={tile}>
          <dt className={term}>Ziyaret · yaklaşık aktif süre</dt>
          <dd className="mt-1.5 text-sm font-black text-slate-900">
            {s.visits30} ziyaret · {formatDurationTr(s.activeSeconds30)}
            <span className="block text-xs font-semibold text-slate-500">{s.actions30} anlamlı işlem (kayıt, analiz, rapor…)</span>
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className={tile}>
          <p className={term}>Kullanılan modüller</p>
          {s.modulesUsed.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-slate-600">Bu dönemde modül kullanımı ölçülmedi.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {s.modulesUsed.slice(0, 12).map((m) => (
                <li key={m.key} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-900 ring-1 ring-emerald-200">
                  {m.label}
                  <span className="font-bold text-emerald-700"> · {m.actions > 0 ? `${m.actions} işlem` : "yalnız açıldı"}</span>
                </li>
              ))}
            </ul>
          )}
          {s.allowedNeverOpened > 0 ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Ölçüm başlangıcından beri hiç açılmamış izinli modül: {s.allowedNeverOpened}
            </p>
          ) : null}
        </div>
        <div className={tile}>
          <p className={term}>Kanal / platform (30 gün)</p>
          {s.channels.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-slate-600">Bu dönemde ziyaret ölçülmedi.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {s.channels.map((c) => (
                <li key={c.channel} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span className="w-40 shrink-0 truncate">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${c.pct}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">%{c.pct} · {c.visits}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ── Yönetim Geçmişi ───────────────────────────────────────────────────────────────

export type TimelineAuditRow = {
  id: string;
  action: string;
  actorName: string | null;
  actorIsMainAdmin: boolean;
  createdAt: string | null;
  context?: unknown;
};

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  approval: "Onay", account: "Hesap", modules: "Modül", commercial: "Ticari", security: "Güvenlik", profile: "Profil", other: "Diğer",
};
const CATEGORY_TONE: Record<AuditCategory, string> = {
  approval: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  account: "bg-slate-100 text-slate-800 ring-slate-200",
  modules: "bg-violet-100 text-violet-900 ring-violet-200",
  commercial: "bg-teal-100 text-teal-900 ring-teal-200",
  security: "bg-rose-100 text-rose-900 ring-rose-200",
  profile: "bg-sky-100 text-sky-900 ring-sky-200",
  other: "bg-slate-100 text-slate-700 ring-slate-200",
};
const FILTERS: ("all" | AuditCategory)[] = ["all", "approval", "account", "modules", "commercial", "security", "profile"];

export function MemberAdminTimeline({ rows, moduleLabel }: { rows: TimelineAuditRow[]; moduleLabel: (key: string) => string | null }) {
  const [filter, setFilter] = useState<"all" | AuditCategory>("all");
  const [showAll, setShowAll] = useState(false);
  const categorized = rows.map((r) => ({ ...r, category: (AUDIT_CATEGORY[r.action] ?? "other") as AuditCategory }));
  const visible = categorized.filter((r) => filter === "all" || r.category === filter);
  const shown = showAll ? visible : visible.slice(0, 10);
  return (
    <section
      id="uye-gecmis"
      aria-labelledby="uye-gecmis-title"
      className="scroll-mt-28 rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8"
    >
      <h2 id="uye-gecmis-title" className="flex items-center gap-2 text-xl font-black text-slate-950">
        <History className="h-5 w-5 text-violet-700" aria-hidden />
        Yönetim Geçmişi
      </h2>
      <p className="mt-1 text-sm font-medium text-slate-600">
        Bu üyeye ait yönetim işlemleri (son 50 kayıt). Yalnız işlem türü, tarih ve yönetici gösterilir — tutar, not veya içerik gösterilmez.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Geçmiş filtresi">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => { setFilter(f); setShowAll(false); }}
            className={`rounded-full border-2 px-3 py-1 text-xs font-black transition ${
              filter === f ? "border-violet-400 bg-violet-100 text-violet-950" : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50"
            }`}
          >
            {f === "all" ? "Tümü" : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm font-bold text-slate-500">
          Bu filtrede yönetim kaydı yok.
        </p>
      ) : (
        <ol className="mt-5 space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col gap-1 rounded-xl border border-slate-100 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-black ring-1 ${CATEGORY_TONE[r.category]}`}>
                {CATEGORY_LABEL[r.category]}
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{auditTimelineText(r, moduleLabel)}</span>
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                {r.createdAt ? formatDateTimeTr(r.createdAt) : "—"} · {r.actorName?.trim() ? r.actorName : "Yönetici"}
                {r.actorIsMainAdmin ? " (ana yönetici)" : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      {visible.length > 10 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 rounded-full border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
        >
          {showAll ? "Daha az göster" : `Tümünü göster (${visible.length})`}
        </button>
      ) : null}
    </section>
  );
}

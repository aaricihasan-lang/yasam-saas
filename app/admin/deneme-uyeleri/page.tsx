"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Crown, Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { isAdminUser, readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  type AdminModuleUiKey,
} from "@/lib/admin/userManagement";

/**
 * TRIAL7 — "Deneme Üyeleri" (sade yönetim görünümü). Yalnız 7 günlük deneme rejimindeki uzmanlar
 * listelenir; mevcut Üye Yönetimi ekranı değişmez. İşlemler: kişiye özel günlük kredi + modül limitleri,
 * şüpheli hesabı incele / incelemeyi kaldır, deneme erişimini durdur / sürdür, Pro talebini kapat,
 * ödeme sonrası Pro'ya geçir (modülleri yönetici seçer). SÜRE UZATMA YOKTUR (Owner kararı).
 */

type Phase = "not_started" | "active" | "expired" | "review" | "suspended" | "converted";
type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  registered_at: string | null;
  phase: Phase;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  risk_score: number;
  risk_flags: string[];
  review_reason: string | null;
  daily_limit: number;
  module_limits: Partial<Record<CreditModule, number>>;
  pro_request_at: string | null;
  used_total: number;
  used_by_module: Partial<Record<CreditModule, number>>;
};
type CreditModule = "astrology" | "human_design" | "numerology";
type ListResponse = { rows: Row[]; total: number; counts: Record<string, number>; server_now: string; pageSize: number };

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "not_started", label: "Başlamamış" },
  { key: "expired", label: "Süresi Dolmuş" },
  { key: "review", label: "İncelemede" },
  { key: "suspended", label: "Durdurulmuş" },
  { key: "pro_request", label: "Pro Talebi" },
];
const PHASE_LABEL: Record<Phase, string> = {
  not_started: "Başlamamış",
  active: "Aktif",
  expired: "Süresi dolmuş",
  review: "İncelemede",
  suspended: "Durdurulmuş",
  converted: "Pro",
};
const PHASE_CLASS: Record<Phase, string> = {
  not_started: "bg-slate-100 text-slate-700",
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-800",
  review: "bg-rose-50 text-rose-700",
  suspended: "bg-slate-200 text-slate-700",
  converted: "bg-violet-50 text-violet-700",
};
const CREDIT_LABEL: Record<CreditModule, string> = { astrology: "Atlas", human_design: "Human Design", numerology: "Numeroloji" };
const RISK_LABEL: Record<string, string> = {
  tek_kullanimlik_eposta: "Tek kullanımlık e-posta",
  ayni_ip_coklu_kayit: "Aynı IP'den çoklu kayıt",
  ayni_ip_onceki_kayit: "Aynı IP'den önceki kayıt",
  tarayici_bilgisi_yok: "Tarayıcı bilgisi yok",
  otomatik_uretilmis_ad: "Otomatik üretilmiş ad",
};
/** Pro'ya geçişte varsayılan seçili modüller (deneme paketi; Dijital İçerik otomatik seçilmez). */
const PRO_DEFAULT: ReadonlySet<string> = new Set([
  "clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "reflexology", "energy_body",
  "aromatherapy", "cosmic_calendar", "human_design", "cupping", "beslenme", "astrology",
]);

function headers(adminId: string, json = false): Record<string, string> {
  const token = readSessionToken();
  return { "x-admin-id": adminId, ...(token ? { "x-session-token": token } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}
function remaining(endsAt: string | null, serverNow: string): string {
  if (!endsAt) return "—";
  const ms = Date.parse(endsAt) - Date.parse(serverNow);
  if (!(ms > 0)) return "Doldu";
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)} gün ${h % 24} sa` : `${h} sa ${Math.floor((ms % 3_600_000) / 60_000)} dk`;
}

export default function DenemeUyeleriPage() {
  const { showToast } = useToast();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      const u = readYasamUser();
      setAdminId(isAdminUser(u) && u ? u.id : null);
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!adminId) return;
    const ctrl = new AbortController();
    queueMicrotask(() => setLoading(true));
    const sp = new URLSearchParams({ status: tab, q: query, page: String(page) });
    fetch(`/api/admin/trials?${sp}`, { headers: headers(adminId), signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Deneme üyeleri okunamadı.");
        setData(j as ListResponse);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") showToast({ type: "error", message: e instanceof Error ? e.message : "Hata" });
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [adminId, tab, query, page, tick, showToast]);

  const act = useCallback(
    async (url: string, method: "PATCH" | "POST", body: unknown, okMsg: string) => {
      if (!adminId) return false;
      const r = await fetch(url, { method, headers: headers(adminId, true), body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        showToast({ type: "error", message: j.error ?? "İşlem tamamlanamadı." });
        return false;
      }
      showToast({ type: "success", message: okMsg });
      setTick((x) => x + 1);
      return true;
    },
    [adminId, showToast],
  );

  if (!checked) return null;
  if (!adminId) {
    return <main className="p-8 text-center text-slate-600">Bu sayfa yalnız yöneticiler içindir.</main>;
  }

  const counts = data?.counts ?? {};
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Yönetim paneli">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-950">Deneme Üyeleri</h1>
            <p className="text-sm text-slate-500">7 günlük ücretsiz deneme · süre uzatma yoktur · günlük Roxy kredisi Türkiye saatiyle 00.00&apos;da yenilenir</p>
          </div>
        </div>
        <button type="button" onClick={() => setTick((x) => x + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Yenile
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setPage(1); setOpenId(null); }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${tab === t.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {t.label}
            <span className="ml-1.5 opacity-70">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1); }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad veya e-posta ara" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
        </div>
        <button type="submit" className="rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Ara</button>
      </form>

      <div className="mt-4 grid gap-3">
        {loading && !data ? (
          <div className="flex justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : data && data.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Bu filtrede deneme üyesi yok.</p>
        ) : (
          data?.rows.map((r) => (
            <TrialRowCard
              key={r.id}
              row={r}
              serverNow={data.server_now}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              act={act}
            />
          ))
        )}
      </div>

      {data && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Önceki</button>
          <span className="text-slate-600">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">Sonraki</button>
        </div>
      ) : null}
    </main>
  );
}

function TrialRowCard({
  row: r,
  serverNow,
  open,
  onToggle,
  act,
}: {
  row: Row;
  serverNow: string;
  open: boolean;
  onToggle: () => void;
  act: (url: string, method: "PATCH" | "POST", body: unknown, okMsg: string) => Promise<boolean>;
}) {
  const base = `/api/admin/trials/${encodeURIComponent(r.id)}`;
  const [daily, setDaily] = useState(String(r.daily_limit));
  const [mods, setMods] = useState<Record<CreditModule, string>>({
    astrology: r.module_limits.astrology == null ? "" : String(r.module_limits.astrology),
    human_design: r.module_limits.human_design == null ? "" : String(r.module_limits.human_design),
    numerology: r.module_limits.numerology == null ? "" : String(r.module_limits.numerology),
  });
  const [converting, setConverting] = useState(false);
  const [proModules, setProModules] = useState<Set<AdminModuleUiKey>>(
    () => new Set(ADMIN_MODULE_UI_KEYS.filter((k) => PRO_DEFAULT.has(k))),
  );
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = () =>
    run(() => {
      const moduleLimits: Record<string, number> = {};
      for (const [k, v] of Object.entries(mods)) if (v.trim() !== "") moduleLimits[k] = Number(v);
      return act(base, "PATCH", { action: "limits", dailyLimit: Number(daily), moduleLimits }, "Kredi limitleri kaydedildi.");
    });
  const state = (action: string, msg: string, reason?: string) => run(() => act(base, "PATCH", { action, ...(reason ? { reason } : {}) }, msg));
  const convert = () =>
    run(async () => {
      const ok = await act(`${base}/convert`, "POST", { modules: [...proModules] }, "Üye Pro üyeliğe geçirildi. Kayıtları korundu.");
      if (ok) setConverting(false);
      return ok;
    });

  const flags = useMemo(() => (r.risk_flags ?? []).map((f) => RISK_LABEL[f] ?? f), [r.risk_flags]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{r.full_name || "—"}</p>
          <p className="truncate text-sm text-slate-500">{r.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {r.pro_request_at ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-violet-800"><Crown className="h-3.5 w-3.5" />Pro talebi</span> : null}
          {r.risk_score > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700"><ShieldAlert className="h-3.5 w-3.5" />Risk {r.risk_score}</span> : null}
          <span className={`rounded-full px-2.5 py-1 ${PHASE_CLASS[r.phase]}`}>{PHASE_LABEL[r.phase]}</span>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-700">Kalan: {r.phase === "active" ? remaining(r.trial_ends_at, serverNow) : "—"}</span>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-700">Roxy: {r.used_total} / {r.daily_limit}</span>
        </div>
      </button>

      {open ? (
        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">Kayıt</dt><dd className="font-semibold text-slate-800">{fmt(r.registered_at ?? r.created_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">İlk başarılı giriş</dt><dd className="font-semibold text-slate-800">{fmt(r.trial_started_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">Deneme bitişi</dt><dd className="font-semibold text-slate-800">{fmt(r.trial_ends_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">Pro talebi</dt><dd className="font-semibold text-slate-800">{fmt(r.pro_request_at)}</dd></div>
          </dl>
          {flags.length > 0 || r.review_reason ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">
              {flags.join(" · ")}{r.review_reason ? ` — ${r.review_reason}` : ""}
            </p>
          ) : null}

          <div className="rounded-xl border border-slate-100 p-3">
            <p className="font-bold text-slate-800">Günlük Roxy kredisi</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Bugün: {(Object.keys(CREDIT_LABEL) as CreditModule[]).map((k) => `${CREDIT_LABEL[k]} ${r.used_by_module[k] ?? 0}`).join(" · ")} · Kalan {Math.max(0, r.daily_limit - r.used_total)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Ortak günlük
                <input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value.replace(/\D/g, ""))} className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
              </label>
              {(Object.keys(CREDIT_LABEL) as CreditModule[]).map((k) => (
                <label key={k} className="grid gap-1 text-xs font-semibold text-slate-600">{CREDIT_LABEL[k]} (isteğe bağlı)
                  <input inputMode="numeric" placeholder="—" value={mods[k]} onChange={(e) => setMods((m) => ({ ...m, [k]: e.target.value.replace(/\D/g, "") }))} className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
                </label>
              ))}
            </div>
            <button type="button" disabled={busy || daily === ""} onClick={saveLimits} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Limitleri kaydet</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {r.phase === "review" ? (
              <button type="button" disabled={busy} onClick={() => state("clear_review", "İnceleme kaldırıldı.")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">İncelemeyi kaldır</button>
            ) : r.phase === "active" || r.phase === "not_started" ? (
              <button type="button" disabled={busy} onClick={() => state("review", "Hesap incelemeye alındı.", "Yönetici incelemesi")} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">İncelemeye al</button>
            ) : null}
            {r.phase === "suspended" ? (
              <button type="button" disabled={busy} onClick={() => state("resume", "Deneme erişimi sürdürüldü (süre uzamaz).")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Erişimi sürdür</button>
            ) : r.phase !== "expired" ? (
              <button type="button" disabled={busy} onClick={() => state("suspend", "Deneme erişimi durduruldu.")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Deneme erişimini durdur</button>
            ) : null}
            {r.pro_request_at ? (
              <button type="button" disabled={busy} onClick={() => run(() => act(base, "PATCH", { action: "dismiss_pro_request" }, "Pro talebi kapatıldı."))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Talebi kapat</button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => setConverting((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-800 to-fuchsia-700 px-3 py-1.5 text-xs font-bold text-white">
              <Crown className="h-3.5 w-3.5" /> Pro üyeliğe geçir
            </button>
          </div>

          {converting ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
              <p className="font-bold text-slate-800">Ödeme alındıktan sonra açılacak modülleri seçin</p>
              <p className="text-xs text-slate-500">Hesap, tenant ve tüm kayıtlar korunur. Dijital İçerik otomatik açılmaz; gerekiyorsa seçin.</p>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {ADMIN_MODULE_UI_KEYS.filter((k) => ADMIN_MODULE_KIND[k] === "module" && (k as string) !== "personal_archive").map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={proModules.has(k)}
                      onChange={(e) => setProModules((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })}
                    />
                    {ADMIN_MODULE_UI_LABELS[k]}
                  </label>
                ))}
              </div>
              <button type="button" disabled={busy || proModules.size === 0} onClick={convert} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Pro üyeliğe geçişi onayla</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

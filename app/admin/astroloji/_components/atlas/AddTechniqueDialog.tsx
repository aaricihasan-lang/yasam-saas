"use client";

/**
 * Gökyüzü Atlası — "+ Teknik Ekle" (Aşama D4): sonuç çalışma masasından ÇIKMADAN aynı danışana yeni teknik.
 *
 * Akış (mevcut güvenli planlama aynen): teknik seç → yalnız o tekniğin parametreleri → SUNUCU planı (engine/plan;
 * sağlayıcı ÇAĞRILMAZ) → hazırsa "Aç" (0 yeni istek; önbellekten), değilse düğmede yeni istek sayısı görünür ve
 * tıklama = onay (confirmNewRequests = plan.newRequestCount; sunucu uyuşmazlıkta 409 döner) → engine/run.
 * Danışan ve doğum profili değişmez; sonuç masada yeni sekmede açılır. Kayıtlı analizler etkilenmez.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import { astroFetch } from "../../_lib/api";
import { buildSelections, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "../../_lib/techniques";
import { DialEmblem } from "./PrepCenter";
import { MethodFields, PartnerField, TechniqueParamFields, type PartnerOption } from "../TechniqueSelector";
import { deskPrimary } from "./ResultDesk";

type SystemId = "western" | "vedic" | "kp";
const SYSTEMS: { id: SystemId; label: string }[] = [
  { id: "western", label: "Batı" },
  { id: "vedic", label: "Vedik" },
  { id: "kp", label: "KP" },
];
type PlanSel = { technique: string; options: Record<string, unknown> | null; unitCount: number; newRequests: number; blocked: { code: string; error: string } | null; info?: { lunarReturns?: LunarReturnInfo[] } | null };
type Plan = { newRequestCount: number; selections: PlanSel[] };

export type AddRunResult<T> = { ok: true; results: T[]; selections: { technique: string; options: Record<string, unknown> }[]; executed: { newResults: number; cachedResults: number; providerAttempts: number } } | { ok: false; error: string; results: T[] | null; selections: { technique: string; options: Record<string, unknown> }[] };

export default function AddTechniqueDialog<T>({
  open,
  initial,
  onClose,
  profileId,
  revision,
  profileLabel,
  birthSummary = null,
  birthPlaceLabel = null,
  timeKnown,
  params,
  onParams,
  method,
  onMethod,
  partners,
  partnerQuery,
  onPartnerQuery,
  openTechniques,
  labelOf,
  previewNoInterp,
  onDone,
}: {
  open: boolean;
  /** Ön seçili teknik (ör. hata göstergesinden "Yeniden dene"). */
  initial?: UiTechniqueId | null;
  onClose: () => void;
  profileId: string;
  revision: number;
  profileLabel: string;
  /** "15.07.1990 · 14:30 · İstanbul, Türkiye" (yalnız görüntü). */
  birthSummary?: string | null;
  /** Gözlem yeri seçiminde öneri olarak gösterilir (otomatik seçilmez). */
  birthPlaceLabel?: string | null;
  timeKnown: boolean;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  method: { houseSystem: HouseSystem; nodeType: NodeType };
  onMethod: (next: { houseSystem: HouseSystem; nodeType: NodeType }) => void;
  partners: PartnerOption[];
  partnerQuery: string;
  onPartnerQuery: (q: string) => void;
  /** Masada şu an açık sekmesi olan teknikler (listede işaretlenir). */
  openTechniques: string[];
  labelOf: (id: string) => string | null;
  previewNoInterp: boolean;
  onDone: (r: AddRunResult<T>) => void;
}) {
  const [system, setSystem] = useState<SystemId>(initial ? (initial.split(".")[0] as SystemId) : "western");
  const [tech, setTech] = useState<UiTechniqueId | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sel = useMemo(() => {
    if (!tech) return null;
    if (missingReason(tech, params)) return null;
    return buildSelections({ [tech]: true }, params, method)[0] ?? null;
  }, [tech, params, method]);
  const planKey = open && sel ? JSON.stringify({ profileId, revision, selections: [sel] }) : null;
  const [planState, setPlanState] = useState<{ key: string; plan: Plan | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!planKey) return;
    let alive = true;
    const t = setTimeout(() => {
      void astroFetch<{ plan: Plan }>("/api/admin/astroloji/engine/plan", { method: "POST", body: JSON.parse(planKey) }).then((r) => {
        if (alive) setPlanState({ key: planKey, plan: r.ok ? r.data.plan : null, error: r.ok ? null : r.error });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [planKey]);
  const cur = planState && planState.key === planKey ? planState : null;
  const ps = cur?.plan?.selections[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function go() {
    if (!cur?.plan || !ps || ps.blocked || !sel) return;
    setBusy(true);
    setErr(null);
    const sels = [{ technique: ps.technique, options: ps.options ?? sel.options }];
    const r = await astroFetch<{ results: T[]; executed: { newResults: number; cachedResults: number; providerAttempts: number } }>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId, revision, selections: sels, confirmNewRequests: cur.plan.newRequestCount },
    });
    setBusy(false);
    if (!r.ok) {
      const locked = r.code === "IN_PROGRESS" || ((r.data?.results as { code?: string }[] | undefined) ?? []).some((x) => x.code === "IN_PROGRESS");
      setErr(
        r.code === "CONFIRMATION_REQUIRED"
          ? `${r.error} (plan güncellendi — yeniden kontrol edin)`
          : locked
            ? `${((r.data?.results as { code?: string; error?: string }[] | undefined) ?? []).find((x) => x.code === "IN_PROGRESS")?.error ?? r.error} Durumu ücretsiz kontrol etmek için sonuç ekranındaki hata göstergesini kullanın.`
            : r.error,
      );
      onDone({ ok: false, error: r.error, results: (r.data?.results as T[] | undefined) ?? null, selections: sels });
      return;
    }
    onDone({ ok: true, results: r.data.results, selections: sels, executed: r.data.executed });
  }

  const meta = tech ? TECHNIQUE_META[tech] : null;
  const opts = ps?.options ? describeOptions(ps.technique, ps.options, labelOf) : "";
  const needsTimeBlocked = !!meta?.needsTime && !timeKnown;
  const missing = tech ? missingReason(tech, params) : null;
  const btnLabel = busy ? "Hesaplanıyor…" : !ps ? "Plan hazırlanıyor…" : ps.blocked ? "Hesaplanamaz" : ps.newRequests === 0 ? "Hazır sonucu aç" : `${cur?.plan?.newRequestCount ?? ps.newRequests} yeni isteği onayla ve hesapla`;
  const initials = profileLabel.split(/\s[—–-]\s/)[0].trim().split(/\s+/).filter(Boolean).map((w, i, a) => (i === 0 || i === a.length - 1 ? w[0] : "")).join("").toLocaleUpperCase("tr-TR");

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#050816]/80 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Teknik ekle" data-testid="atlas-add-technique">
      <div className="relative flex max-h-[100svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.4rem] border border-[#D9B56F]/35 bg-[radial-gradient(ellipse_at_20%_0%,#232a6a_0%,#121a4a_45%,#080e2a_100%)] text-[#F6F2EA] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.08)] sm:max-h-[90svh] sm:rounded-[1.4rem]">
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#E6C887]/70 to-transparent" aria-hidden="true" />
        {/* Danışan başlığı */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a3f86,#141b48_70%)] text-[13px] font-semibold text-[#F6E7C3] shadow-[0_0_0_1px_rgba(217,181,111,0.5),0_0_18px_-4px_rgba(217,181,111,0.5)]">
              {initials || "·"}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#E6CF9F]/80">TEKNİK EKLE · AYNI DANIŞAN</p>
              <h3 className="truncate text-base font-light leading-tight text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-lg">{profileLabel}</h3>
              <p className="truncate text-[11.5px] text-[#F6F2EA]/55">
                {birthSummary ? `${birthSummary} · ` : ""}rev {revision} · sonuç masada yeni sekmede açılır
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="rounded-lg p-2 text-[#F6F2EA]/60 hover:bg-white/10 hover:text-[#F6F2EA]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[270px_minmax(0,1fr)] md:overflow-hidden">
          {/* Sistem + teknik listesi */}
          <div className="flex min-h-0 flex-col gap-2.5 border-b border-white/[0.07] p-3 md:border-b-0 md:border-r">
            <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Astroloji sistemi">
              {SYSTEMS.map((sy) => {
                const on = system === sy.id;
                return (
                  <button
                    key={sy.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSystem(sy.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] ${
                      on ? "border-[#D9B56F]/60 bg-[#D9B56F]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
                    }`}
                    data-add-system={sy.id}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full p-1 ${on ? "bg-[radial-gradient(circle_at_35%_28%,#3a3f86,#121a48_70%)] shadow-[0_0_0_1px_rgba(217,181,111,0.7),0_0_16px_-4px_rgba(217,181,111,0.6)]" : "bg-[radial-gradient(circle_at_35%_28%,#252a5e,#0e1438_70%)] opacity-70"}`}>
                      <DialEmblem id={sy.id} />
                    </span>
                    <span className={`text-[12px] ${on ? "text-[#F6F2EA]" : "text-[#F6F2EA]/60"}`}>{sy.label}</span>
                  </button>
                );
              })}
            </div>
            <ul className="flex min-h-0 flex-col gap-1 md:overflow-y-auto md:pr-1 [scrollbar-width:thin]" aria-label="Teknikler">
              {UI_TECHNIQUES.filter((id) => id.startsWith(`${system}.`)).map((id) => {
                const on = id === tech;
                const isOpen = openTechniques.includes(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setTech(id);
                        setErr(null);
                      }}
                      className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-[13px] transition ${
                        on ? "border-[#D9B56F]/60 bg-[linear-gradient(180deg,rgba(52,49,108,0.9),rgba(20,28,64,0.95))] text-[#F6F2EA]" : "border-transparent text-[#F6F2EA]/80 hover:border-white/10 hover:bg-white/[0.04]"
                      }`}
                      data-add-technique={id}
                    >
                      {on && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-gradient-to-b from-[#E6C887] to-[#D9B56F]/20" aria-hidden="true" />}
                      <span className="min-w-0 break-words">{TECHNIQUE_META[id].label}</span>
                      {isOpen && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[#F6F2EA]/70">açık</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Seçili teknik: ayarlar + plan */}
          <div className="flex min-h-0 flex-col gap-2.5 p-3 sm:p-4 md:overflow-y-auto [scrollbar-width:thin]">
            {!tech || !meta ? (
              <p className="text-sm text-[#F6F2EA]/60">Soldan bir teknik seçin.</p>
            ) : (
              <>
                <div>
                  <p className="text-[15px] text-[#F6F2EA] [font-family:var(--font-atlas-display)] font-light">{meta.label}</p>
                  <p className="text-[12px] text-[#F6F2EA]/55">{meta.hint}</p>
                </div>
                {needsTimeBlocked && <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">Doğum saati bilinmiyor — bu teknik hesaplanmaz.</p>}
                <div className="flex flex-col gap-2.5 rounded-xl border border-[#D9B56F]/40 bg-[#FBF7EE] p-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" data-testid="atlas-add-params">
                  <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#7a5a1c]">AYARLAR</p>
                  {meta.needsPartner && <PartnerField params={params} onParams={onParams} partners={partners} partnerQuery={partnerQuery} onPartnerQuery={onPartnerQuery} />}
                  <TechniqueParamFields id={tech} params={params} onParams={onParams} lunarReturns={ps?.info?.lunarReturns ?? null} birthPlaceLabel={birthPlaceLabel} />
                  <MethodFields id={tech} method={method} onMethod={onMethod} />
                </div>
                {err && (
                  <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" role="alert">
                    {err}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Kompakt plan + onay */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] bg-black/20 px-4 py-2.5 sm:px-5">
          <p className="min-w-0 flex-1 text-[12.5px]" data-testid="atlas-add-plan" role="status">
            {!tech ? (
              <span className="text-[#F6F2EA]/50">Teknik seçilmedi.</span>
            ) : missing ? (
              <span className="text-amber-200">Eksik ayar: {missing}.</span>
            ) : cur?.error ? (
              <span className="text-rose-300">{cur.error}</span>
            ) : !ps ? (
              <span className="text-[#F6F2EA]/55">Plan hazırlanıyor…</span>
            ) : ps.blocked ? (
              <span className="text-rose-300">Hesaplanamaz: {ps.blocked.error}</span>
            ) : ps.newRequests === 0 ? (
              <span className="text-[#CFF3EC]">Hazır sonuç var{opts ? ` (${opts})` : ""} — yeni istek yapılmaz.</span>
            ) : (
              <span className="text-[#F6E7C3]">
                Yeni hesaplama: <strong>{cur?.plan?.newRequestCount ?? ps.newRequests}</strong> sağlayıcı isteği · {ps.unitCount} birim{opts ? ` · ${opts}` : ""}
              </span>
            )}
          </p>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[#F6F2EA]/80 hover:border-white/30">
            Vazgeç
          </button>
          <button type="button" onClick={() => void go()} disabled={busy || !ps || !!ps.blocked || !sel} className={`${deskPrimary} rounded-xl`} data-testid="atlas-add-run">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

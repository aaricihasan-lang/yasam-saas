"use client";

/**
 * Gökyüzü Atlası — "+ Teknik Ekle" (Aşama D4; 2026-10-12 Android UAT madde 6 + 7): sonuç çalışma masasından ÇIKMADAN aynı
 * danışana BİRDEN FAZLA teknik.
 *
 * Akış (Yeni Analiz'deki çoklu seçim mantığıyla aynı; mevcut güvenli planlama aynen): Batı / Vedik / KP listesinden
 * teknikler İŞARETLENİR (seçim ve seçim kaldırma açık) → her tekniğin kendi ayar paneli ayrı açılır ("Ayarları Kapat /
 * Listeye Dön" pencereyi KAPATMAZ, girilen değerler korunur) → SUNUCU planı (engine/plan; sağlayıcı ÇAĞRILMAZ) teknik
 * başına durum + toplam yeni sağlayıcı isteği / hazır sonuç sayısı → tek onay. Onay düğmesindeki sayı = gönderilen
 * confirmNewRequests = planın yeni istek sayısı (sunucu uyuşmazlıkta 409 döner) → ücretli çağrı önizlemesi gerçekte
 * gönderilecek isteklerle aynıdır. Eksik ayarlı / hesaplanamaz teknikler işlem öncesi açıkça listelenir ve gönderilmez.
 * Danışan ve doğum profili değişmez; sonuçlar masada yeni sekmelerde açılır. Kayıtlı analizler etkilenmez.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, Settings2, X } from "lucide-react";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import { astroFetch } from "../../_lib/api";
import { buildSelections, describeOptions, missingReason, runOptionsFor, TECHNIQUE_META, UI_TECHNIQUES, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "../../_lib/techniques";
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
type Plan = { newRequestCount: number; cachedCount: number; selections: PlanSel[] };
type Status = { kind: "missing" | "pending" | "ready" | "new" | "blocked" | "error"; text: string };

export type AddRunResult<T> = { ok: true; results: T[]; selections: { technique: string; options: Record<string, unknown> }[]; executed: { newResults: number; cachedResults: number; providerAttempts: number } } | { ok: false; error: string; results: T[] | null; selections: { technique: string; options: Record<string, unknown> }[] };

const systemOf = (id: UiTechniqueId) => id.split(".")[0] as SystemId;
const DOT: Record<Status["kind"], string> = {
  missing: "bg-amber-300",
  pending: "bg-slate-400",
  ready: "bg-emerald-400",
  new: "bg-[#E6C887]",
  blocked: "bg-rose-400",
  error: "bg-rose-400",
};

export default function AddTechniqueDialog<T>({
  open,
  initial,
  onClose,
  profileId,
  revision,
  profileLabel,
  birthSummary = null,
  birthPlaceLabel = null,
  birthDate = null,
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
  onDirtyChange,
}: {
  open: boolean;
  /** Ön seçili teknik (ör. hata göstergesinden "Yeniden dene"). */
  initial?: UiTechniqueId | null;
  /** Pencereyi kapat (üst bileşen, seçim varsa kaydedilmemiş değişiklik uyarısı gösterir). */
  onClose: () => void;
  profileId: string;
  revision: number;
  profileLabel: string;
  /** "15.07.1990 · 14:30 · İstanbul, Türkiye" (yalnız görüntü). */
  birthSummary?: string | null;
  /** Gözlem yeri seçiminde öneri olarak gösterilir (otomatik seçilmez). */
  birthPlaceLabel?: string | null;
  /** Yıllık profeksiyonlar: yaş ↔ yıl aralığı gösterimi için doğum tarihi (YYYY-MM-DD). */
  birthDate?: string | null;
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
  /** Seçilmiş ama hesaplanmamış teknik var mı (çıkış koruması). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [system, setSystem] = useState<SystemId>(initial ? systemOf(initial) : "western");
  const [picked, setPicked] = useState<UiTechniqueId[]>(initial ? [initial] : []);
  // Ayar paneli açık teknik (null = liste görünümü). Mobilde panel listenin YERİNE açılır (üst üste binmez).
  const [focus, setFocus] = useState<UiTechniqueId | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPicked = (id: UiTechniqueId) => picked.includes(id);
  const toggle = (id: UiTechniqueId) => {
    setErr(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  useEffect(() => {
    onDirtyChange?.(picked.length > 0 && !busy);
  }, [picked.length, busy, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Seçimler UI_TECHNIQUES sırasında (Yeni Analiz ile aynı kurucu). Eksik ayarlılar plana girmez.
  const chosen = UI_TECHNIQUES.filter((id) => picked.includes(id));
  const sels = useMemo(() => {
    const ok = Object.fromEntries(UI_TECHNIQUES.filter((id) => picked.includes(id) && !missingReason(id, params)).map((id) => [id, true])) as Partial<Record<UiTechniqueId, boolean>>;
    return buildSelections(ok, params, method);
  }, [picked, params, method]);
  const planKey = open && sels.length > 0 ? JSON.stringify({ profileId, revision, selections: sels }) : null;
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
  const plan = cur?.plan ?? null;

  const statusOf = (id: UiTechniqueId): Status => {
    const miss = missingReason(id, params);
    if (miss) return { kind: "missing", text: `eksik ayar: ${miss}` };
    const idx = sels.findIndex((s) => s.technique === id);
    if (idx < 0) return { kind: "missing", text: "eksik ayar" };
    if (cur?.error) return { kind: "error", text: "plan alınamadı" };
    const ps = plan?.selections[idx];
    if (!ps) return { kind: "pending", text: "plan hazırlanıyor" };
    if (ps.blocked) return { kind: "blocked", text: ps.blocked.error };
    if (ps.newRequests === 0) return { kind: "ready", text: "hazır sonuç (yeni istek yok)" };
    return { kind: "new", text: `${ps.newRequests} yeni sağlayıcı isteği` };
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (focus) setFocus(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, focus]);

  if (!open) return null;

  const statuses = chosen.map((id) => ({ id, st: statusOf(id) }));
  const missingN = statuses.filter((x) => x.st.kind === "missing").length;
  const blockedN = statuses.filter((x) => x.st.kind === "blocked").length;
  const runnable = plan ? plan.selections.filter((s) => !s.blocked) : [];
  const readyN = runnable.filter((s) => s.newRequests === 0).length;
  const newReq = plan?.newRequestCount ?? 0;
  const planReady = !!plan && plan.selections.length === sels.length;

  async function go() {
    if (!plan || !planReady || runnable.length === 0) return;
    setBusy(true);
    setErr(null);
    // Gönderilen seçimler = planın NORMALİZE seçenekleri (önizlemede gösterilenin aynısı); hesaplanamazlar gönderilmez.
    const send = plan.selections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.blocked)
      .map(({ s, i }) => ({ technique: s.technique, options: runOptionsFor(s.technique, s.options, sels[i].options) }));
    const r = await astroFetch<{ results: T[]; executed: { newResults: number; cachedResults: number; providerAttempts: number } }>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId, revision, selections: send, confirmNewRequests: newReq },
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
      onDone({ ok: false, error: r.error, results: (r.data?.results as T[] | undefined) ?? null, selections: send });
      return;
    }
    setPicked([]);
    onDone({ ok: true, results: r.data.results, selections: send, executed: r.data.executed });
  }

  const focusMeta = focus ? TECHNIQUE_META[focus] : null;
  const focusIdx = focus ? sels.findIndex((s) => s.technique === focus) : -1;
  const focusPs = focusIdx >= 0 ? (plan?.selections[focusIdx] ?? null) : null;
  const btnLabel = busy
    ? "Hesaplanıyor…"
    : picked.length === 0
      ? "Önce teknik seçin"
      : sels.length === 0
        ? "Eksik ayarları tamamlayın"
        : !planReady
          ? "Plan hazırlanıyor…"
          : runnable.length === 0
            ? "Hesaplanamaz"
            : newReq === 0
              ? `${runnable.length === 1 ? "Hazır sonucu" : `${runnable.length} hazır sonucu`} aç`
              : `${newReq} yeni isteği onayla · ${runnable.length} teknik`;
  const initials = profileLabel.split(/\s[—–-]\s/)[0].trim().split(/\s+/).filter(Boolean).map((w, i, a) => (i === 0 || i === a.length - 1 ? w[0] : "")).join("").toLocaleUpperCase("tr-TR");

  const list = (
    <div className={`min-h-0 flex-col gap-2.5 border-white/[0.07] p-3 md:flex md:border-r ${focus ? "hidden" : "flex"}`}>
      <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Astroloji sistemi">
        {SYSTEMS.map((sy) => {
          const on = system === sy.id;
          const n = picked.filter((id) => systemOf(id) === sy.id).length;
          return (
            <button
              key={sy.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSystem(sy.id)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] ${
                on ? "border-[#D9B56F]/60 bg-[#D9B56F]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
              }`}
              data-add-system={sy.id}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full p-1 ${on ? "bg-[radial-gradient(circle_at_35%_28%,#3a3f86,#121a48_70%)] shadow-[0_0_0_1px_rgba(217,181,111,0.7),0_0_16px_-4px_rgba(217,181,111,0.6)]" : "bg-[radial-gradient(circle_at_35%_28%,#252a5e,#0e1438_70%)] opacity-70"}`}>
                <DialEmblem id={sy.id} />
              </span>
              <span className={`text-[12px] ${on ? "text-[#F6F2EA]" : "text-[#F6F2EA]/60"}`}>{sy.label}</span>
              {n > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#D9B56F] px-1.5 text-[10px] font-semibold text-[#0B1430]">{n}</span>}
            </button>
          );
        })}
      </div>
      <ul className="flex min-h-0 flex-col gap-1 md:overflow-y-auto md:pr-1 [scrollbar-width:thin]" aria-label="Teknikler">
        {UI_TECHNIQUES.filter((id) => id.startsWith(`${system}.`)).map((id) => {
          const on = isPicked(id);
          const isOpen = openTechniques.includes(id);
          const st = on ? statusOf(id) : null;
          return (
            <li key={id} className={`flex shrink-0 items-stretch overflow-hidden rounded-lg border transition ${on ? "border-[#D9B56F]/60 bg-[linear-gradient(180deg,rgba(52,49,108,0.9),rgba(20,28,64,0.95))]" : "border-white/[0.06] hover:border-white/15"}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(id)}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-[13px] text-[#F6F2EA]"
                data-add-technique={id}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-[#E6C887] bg-[#D9B56F] text-[#0B1430]" : "border-white/30"}`} aria-hidden="true">
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{TECHNIQUE_META[id].label}</span>
                  {st && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#F6F2EA]/65" data-add-status={st.kind}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[st.kind]}`} aria-hidden="true" />
                      <span className="min-w-0 break-words">{st.text}</span>
                    </span>
                  )}
                </span>
                {isOpen && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[#F6F2EA]/70">açık</span>}
              </button>
              {on && (
                <button
                  type="button"
                  onClick={() => setFocus(id)}
                  className={`flex w-11 shrink-0 items-center justify-center border-l border-white/10 text-[#E6CF9F] hover:bg-white/10 ${focus === id ? "bg-white/10" : ""}`}
                  aria-label={`${TECHNIQUE_META[id].label} ayarları`}
                  title="Ayarlar"
                  data-add-settings={id}
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const settings = (
    <div className={`min-h-0 flex-col gap-2.5 p-3 sm:p-4 md:flex md:overflow-y-auto [scrollbar-width:thin] ${focus ? "flex" : "hidden"}`}>
      {!focus || !focusMeta ? (
        <div className="flex flex-col gap-2 text-sm text-[#F6F2EA]/70">
          <p>Soldan teknikleri işaretleyin; birden fazla seçebilirsiniz.</p>
          <p className="text-[12.5px] text-[#F6F2EA]/55">Ayar gerektiren teknikte satırdaki ⚙ simgesiyle ayarları açın. Ayarlar diğer tekniklere geçince kaybolmaz.</p>
          {chosen.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1" data-testid="atlas-add-summary">
              {statuses.map(({ id, st }) => (
                <li key={id} className="flex items-start gap-2 text-[12.5px]">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[st.kind]}`} aria-hidden="true" />
                  <span className="min-w-0 break-words">
                    <strong className="font-medium text-[#F6F2EA]">{TECHNIQUE_META[id].label}</strong> — {st.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-[15px] font-light text-[#F6F2EA] [font-family:var(--font-atlas-display)]">{focusMeta.label}</p>
              <p className="text-[12px] text-[#F6F2EA]/55">{focusMeta.hint}</p>
            </div>
            <button type="button" onClick={() => setFocus(null)} className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-[#D9B56F]/50 bg-[#D9B56F]/10 px-3 py-1.5 text-[12.5px] font-medium text-[#F6E7C3] hover:bg-[#D9B56F]/20" data-testid="atlas-add-close-settings">
              <ArrowLeft className="h-3.5 w-3.5" /> Ayarları Kapat / Listeye Dön
            </button>
          </div>
          {!isPicked(focus) && (
            <button type="button" onClick={() => toggle(focus)} className="self-start rounded-lg border border-white/20 px-3 py-1.5 text-xs text-[#F6F2EA]/85">
              Bu tekniği seç
            </button>
          )}
          {focusMeta.needsTime && !timeKnown && <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">Doğum saati bilinmiyor — bu teknik hesaplanmaz.</p>}
          <div className="flex flex-col gap-2.5 rounded-xl border border-[#D9B56F]/40 bg-[#FBF7EE] p-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" data-testid="atlas-add-params">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#7a5a1c]">AYARLAR</p>
            {focusMeta.needsPartner && <PartnerField params={params} onParams={onParams} partners={partners} partnerQuery={partnerQuery} onPartnerQuery={onPartnerQuery} />}
            <TechniqueParamFields id={focus} params={params} onParams={onParams} lunarReturns={focusPs?.info?.lunarReturns ?? null} birthPlaceLabel={birthPlaceLabel} birthDate={birthDate} />
            <MethodFields id={focus} method={method} onMethod={onMethod} />
          </div>
          {isPicked(focus) && (
            <p className="text-[12px] text-[#F6F2EA]/70" data-testid="atlas-add-focus-status">
              Durum: {statusOf(focus).text}
              {focusPs?.options ? ` · ${describeOptions(focusPs.technique, focusPs.options, labelOf)}` : ""}
            </p>
          )}
        </>
      )}
      {err && (
        <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" role="alert">
          {err}
        </p>
      )}
    </div>
  );

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
              <h3 className="break-words text-base font-light leading-tight text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-lg">{profileLabel}</h3>
              <p className="break-words text-[11.5px] text-[#F6F2EA]/55">
                {birthSummary ? `${birthSummary} · ` : ""}rev {revision} · birden fazla teknik seçebilirsiniz
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Teknik Ekle penceresini kapat" className="rounded-lg p-2 text-[#F6F2EA]/60 hover:bg-white/10 hover:text-[#F6F2EA]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[300px_minmax(0,1fr)] md:overflow-hidden">
          {list}
          {settings}
        </div>

        {/* Toplam plan + tek onay */}
        <div className="flex flex-col gap-2 border-t border-white/[0.07] bg-black/20 px-4 py-2.5 sm:flex-row sm:items-center sm:px-5">
          <div className="min-w-0 flex-1 text-[12.5px]" data-testid="atlas-add-plan" role="status">
            {picked.length === 0 ? (
              <span className="text-[#F6F2EA]/50">Teknik seçilmedi.</span>
            ) : (
              <>
                <span className="text-[#F6E7C3]">
                  <strong>{picked.length}</strong> teknik seçildi
                  {planReady && (
                    <>
                      {" "}· <strong>{readyN}</strong> hazır sonuç · <strong data-testid="atlas-add-newreq">{newReq}</strong> yeni sağlayıcı isteği
                    </>
                  )}
                </span>
                {missingN > 0 && <span className="block text-amber-200">{missingN} teknikte eksik ayar var — tamamlanmadan hesaplanmaz.</span>}
                {blockedN > 0 && <span className="block text-rose-300">{blockedN} teknik hesaplanamaz (nedeni listede).</span>}
                {cur?.error && <span className="block text-rose-300">{cur.error}</span>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm text-[#F6F2EA]/80 hover:border-white/30 sm:flex-none" data-testid="atlas-add-cancel" title="Teknik Ekle penceresini kapatır">
              Pencereyi Kapat
            </button>
            <button type="button" onClick={() => void go()} disabled={busy || !planReady || runnable.length === 0} className={`${deskPrimary} flex-[2] justify-center rounded-xl sm:flex-none`} data-testid="atlas-add-run">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {btnLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

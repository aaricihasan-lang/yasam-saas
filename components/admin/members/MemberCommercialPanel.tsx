"use client";

/**
 * TİCARİ 360 — fiyat dönemleri + mevcut/sonraki anlaşma özeti (üye detayı).
 *
 * Ödeme gateway'i DEĞİLDİR: kart/banka/fatura/otomatik tahsilat/otomatik kilit YOK. Kayıt yalnız
 * admin'in elle tuttuğu ticari bilgidir; çakışma kuralı sunucuda (DB kilidi) uygulanır, buradaki
 * kontrol yalnız erken uyarıdır. Fiyat dönemi olmayan eski üyede users.agreed_fee/billing_period
 * aynen "Mevcut anlaşma" olarak gösterilir.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { BILLING_PERIOD_LABELS, BILLING_PERIODS, istanbulTodayIso, renewalState, type BillingPeriod } from "@/lib/admin/memberCommercial";
import {
  findOverlap,
  formatIsoDateTr,
  formatPhaseRange,
  formatPrice,
  mapPricingPhaseRow,
  phaseOn,
  phaseTiming,
  phaseTimingLabel,
  PRICING_LABEL_MAX,
  PRICING_NOTE_MAX,
  resolveCommercialTerms,
  sortPhases,
  type PricingPhase,
} from "@/lib/admin/memberPricing";
import { dueDistanceLabel, paymentDayIso } from "@/lib/admin/member360";

type Draft = { startsOn: string; endsOn: string; amount: string; billingPeriod: BillingPeriod; label: string; termsNote: string };
const EMPTY_DRAFT: Draft = { startsOn: "", endsOn: "", amount: "", billingPeriod: "monthly", label: "", termsNote: "" };

const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border-2 border-teal-100 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100";
const labelCls = "block text-xs font-black text-slate-700";
const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";

function headersFor(adminId: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": adminId };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

type LoadState = { kind: "loading" } | { kind: "ready"; phases: PricingPhase[] } | { kind: "error" };

export function MemberCommercialPanel({
  userId,
  adminId,
  legacyFee,
  legacyPeriod,
  nextPaymentAt,
  paymentExempt,
  onPhasesChange,
  onNotify,
}: {
  userId: string;
  adminId: string;
  legacyFee: number | null;
  legacyPeriod: BillingPeriod | null;
  nextPaymentAt: string | null;
  paymentExempt: boolean;
  onPhasesChange: (phases: PricingPhase[]) => void;
  onNotify: (type: "success" | "error", title: string, message: string) => void;
}) {
  const [reload, setReload] = useState(0);
  const loadKey = `${userId}|${adminId}|${reload}`;
  const [loaded, setLoaded] = useState<{ key: string; state: LoadState } | null>(null);
  const state: LoadState = loaded && loaded.key === loadKey ? loaded.state : loaded?.state.kind === "ready" ? loaded.state : { kind: "loading" };
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PricingPhase | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !adminId) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/pricing-phases`, { headers: headersFor(adminId), signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) { setLoaded({ key: loadKey, state: { kind: "error" } }); return; }
        const j = (await r.json()) as { phases?: unknown[] };
        const phases = sortPhases((j.phases ?? []).map((p) => mapPricingPhaseRowFromApi(p)).filter((p): p is PricingPhase => p !== null));
        setLoaded({ key: loadKey, state: { kind: "ready", phases } });
        onPhasesChange(phases);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setLoaded({ key: loadKey, state: { kind: "error" } });
      });
    return () => ctrl.abort();
    // onPhasesChange ebeveynin setState'idir (kararlı) — yeniden yüklemeyi tetiklemez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adminId, loadKey]);

  const today = istanbulTodayIso();
  // Yeniden yüklemede son hazır liste gösterilmeye devam eder (titreme yok).
  const phases = useMemo(() => (loaded?.state.kind === "ready" ? loaded.state.phases : []), [loaded]);
  const terms = useMemo(
    () => resolveCommercialTerms(phases, { agreedFee: legacyFee, billingPeriod: legacyPeriod }, today),
    [phases, legacyFee, legacyPeriod, today],
  );
  const npd = paymentDayIso(nextPaymentAt);
  const renewal = renewalState(npd, today);
  const phaseAtRenewal = npd ? phaseOn(phases, npd) : null;
  const overlap = draft.startsOn ? findOverlap(phases, { startsOn: draft.startsOn, endsOn: draft.endsOn || null }, editing?.id) : null;

  function openCreate() {
    const last = phases.at(-1);
    // Öneri: son dönem bittiyse ertesi gün; açık uçluysa kullanıcı tarih seçer.
    const suggested = last?.endsOn ? addDays(last.endsOn, 1) : phases.length === 0 ? today : "";
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, startsOn: suggested, billingPeriod: legacyPeriod ?? "monthly" });
    setFormOpen(true);
  }
  function openEdit(p: PricingPhase) {
    setEditing(p);
    setDraft({
      startsOn: p.startsOn, endsOn: p.endsOn ?? "", amount: String(p.amount), billingPeriod: p.billingPeriod,
      label: p.label ?? "", termsNote: p.termsNote ?? "",
    });
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const body = {
      ...(editing ? { phaseId: editing.id, expectedUpdatedAt: editing.updatedAt } : {}),
      draft: {
        startsOn: draft.startsOn, endsOn: draft.endsOn || null, amount: draft.amount, billingPeriod: draft.billingPeriod,
        label: draft.label || null, termsNote: draft.termsNote || null,
      },
    };
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/pricing-phases`, {
      method: editing ? "PATCH" : "POST", headers: headersFor(adminId, true), body: JSON.stringify(body),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; changed?: boolean; phases?: unknown[] }) : {};
    setSaving(false);
    if (!res || !res.ok || !json.ok) {
      onNotify("error", "Fiyat dönemi kaydedilemedi", json.error ?? "Sunucuya ulaşılamadı.");
      if (res?.status === 409) setReload((n) => n + 1);
      return;
    }
    applyPhases(json.phases);
    onNotify("success", "Kaydedildi", json.changed === false ? "Değişiklik yok; fiyat dönemi güncel." : editing ? "Fiyat dönemi güncellendi." : "Fiyat dönemi eklendi.");
    closeForm();
  }

  async function remove(p: PricingPhase) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/pricing-phases`, {
      method: "DELETE", headers: headersFor(adminId, true), body: JSON.stringify({ phaseId: p.id, expectedUpdatedAt: p.updatedAt }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; phases?: unknown[] }) : {};
    setSaving(false);
    setConfirmDelete(null);
    if (!res || !res.ok || !json.ok) {
      onNotify("error", "Silinemedi", json.error ?? "Sunucuya ulaşılamadı.");
      if (res?.status === 409) setReload((n) => n + 1);
      return;
    }
    applyPhases(json.phases);
    onNotify("success", "Silindi", "Fiyat dönemi kaldırıldı.");
  }

  function applyPhases(raw: unknown[] | undefined) {
    const next = sortPhases((raw ?? []).map((p) => mapPricingPhaseRowFromApi(p)).filter((p): p is PricingPhase => p !== null));
    setLoaded({ key: loadKey, state: { kind: "ready", phases: next } });
    onPhasesChange(next);
  }

  return (
    <section
      aria-labelledby="ticari-360-title"
      className="rounded-[28px] border-2 border-teal-200/80 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/50 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ticari-360-title" className="flex items-center gap-2 text-xl font-black text-teal-950">
            <CalendarRange className="h-5 w-5 text-teal-700" aria-hidden />
            Ticari Anlaşma
          </h2>
          <p className="mt-1 text-sm font-medium text-teal-900/75">
            Uzmana özel fiyat dönemleri (ör. ilk 5 ay 200 TL, sonra 600 TL). Yalnız kayıttır — otomatik tahsilat veya erişim kısıtı yoktur.
          </p>
        </div>
        <button type="button" onClick={openCreate} disabled={state.kind !== "ready" || formOpen}
          className={`${btn} border-teal-300 bg-white text-teal-950 hover:bg-teal-50`}>
          <Plus className="h-4 w-4" aria-hidden /> Fiyat dönemi ekle
        </button>
      </div>

      {state.kind === "loading" ? (
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Ticari bilgiler yükleniyor…
        </div>
      ) : state.kind === "error" ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900" role="alert">
          Fiyat dönemleri okunamadı. Ödeme takibi aşağıda kullanılabilir.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border-2 border-teal-200 bg-white/90 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-teal-800">Mevcut anlaşma</p>
              {terms.current.source === "none" ? (
                <p className="mt-2 text-sm font-bold text-slate-600">Ücret / dönem belirtilmemiş</p>
              ) : (
                <>
                  <p className="mt-1.5 text-xl font-black text-slate-950">{formatPrice(terms.current.amount, terms.current.billingPeriod)}</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-700">
                    {terms.current.phase ? formatPhaseRange(terms.current.phase) : "Genel anlaşma (tarih aralığı yok)"}
                  </p>
                  {terms.current.phase?.label ? <p className="mt-1 text-xs font-black text-teal-900">{terms.current.phase.label}</p> : null}
                  {terms.current.phase?.termsNote ? <p className="mt-0.5 text-xs font-medium text-slate-600">{terms.current.phase.termsNote}</p> : null}
                  {terms.current.phase ? (
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{phaseTimingLabel(terms.current.phase, today)}</p>
                  ) : null}
                </>
              )}
            </div>
            <div className="rounded-2xl border-2 border-slate-200 bg-white/90 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">Sonraki dönem</p>
              {terms.next ? (
                <>
                  <p className="mt-1.5 text-xl font-black text-slate-950">{formatPrice(terms.next.amount, terms.next.billingPeriod)}</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-700">{formatPhaseRange(terms.next)}</p>
                  {terms.next.label ? <p className="mt-1 text-xs font-black text-slate-800">{terms.next.label}</p> : null}
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{phaseTimingLabel(terms.next, today)}</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-bold text-slate-600">Planlanmış sonraki dönem yok</p>
              )}
            </div>
            <div className={`rounded-2xl border-2 bg-white/90 p-4 ${renewal.kind === "overdue" && !paymentExempt ? "border-rose-300" : "border-slate-200"}`}>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">Sonraki ödeme / yenileme</p>
              {paymentExempt ? (
                <p className="mt-2 text-sm font-bold text-sky-900">Ödemeden muaf</p>
              ) : npd ? (
                <>
                  <p className="mt-1.5 text-xl font-black text-slate-950">{formatIsoDateTr(npd)}</p>
                  <p className={`mt-0.5 text-sm font-black ${renewal.kind === "overdue" ? "text-rose-800" : renewal.kind === "due" && renewal.days <= 7 ? "text-amber-800" : "text-slate-700"}`}>
                    {renewal.kind === "overdue" ? `Gecikmiş · ${dueDistanceLabel(npd, today)}` : dueDistanceLabel(npd, today)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    O tarihte geçerli fiyat:{" "}
                    <span className="font-black text-slate-800">
                      {phaseAtRenewal
                        ? formatPrice(phaseAtRenewal.amount, phaseAtRenewal.billingPeriod)
                        : terms.current.source === "legacy" && phases.length === 0
                          ? formatPrice(legacyFee, legacyPeriod)
                          : "fiyat dönemi tanımlı değil"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm font-bold text-slate-600">Tarih girilmemiş</p>
              )}
            </div>
          </div>

          {phases.length > 0 ? (
            <ol className="mt-4 space-y-2" aria-label="Fiyat dönemleri">
              {phases.map((p) => {
                const t = phaseTiming(p, today);
                return (
                  <li key={p.id} className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-white/90 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${
                    t.kind === "current" ? "border-teal-300" : "border-slate-200"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900">
                        {formatPrice(p.amount, p.billingPeriod)}
                        <span className="font-bold text-slate-600"> · {formatPhaseRange(p)}</span>
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {phaseTimingLabel(p, today)}
                        {p.label ? ` · ${p.label}` : ""}
                      </p>
                      {p.termsNote ? <p className="mt-0.5 break-words text-xs font-medium text-slate-600">{p.termsNote}</p> : null}
                    </div>
                    {confirmDelete === p.id ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Silme onayı">
                        <span className="text-xs font-black text-rose-900">Bu dönem silinsin mi?</span>
                        <button type="button" disabled={saving} onClick={() => void remove(p)} className={`${btn} border-rose-400 bg-rose-600 text-white hover:bg-rose-700`}>Sil</button>
                        <button type="button" disabled={saving} onClick={() => setConfirmDelete(null)} className={`${btn} border-slate-200 bg-white text-slate-700`}>Vazgeç</button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => openEdit(p)} disabled={saving || formOpen} className={`${btn} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`} aria-label={`${formatPhaseRange(p)} dönemini düzenle`}>
                          <Pencil className="h-4 w-4" aria-hidden /> Düzenle
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(p.id)} disabled={saving || formOpen} className={`${btn} border-rose-200 bg-white text-rose-800 hover:bg-rose-50`} aria-label={`${formatPhaseRange(p)} dönemini sil`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 text-xs font-semibold text-slate-500">
              Fiyat dönemi tanımlı değil — mevcut anlaşma, Ödeme Takibi&apos;ndeki “Anlaşılan Ücret / Ödeme Dönemi” alanlarından gelir.
            </p>
          )}

          {formOpen ? (
            <form onSubmit={submit} className="mt-4 rounded-2xl border-2 border-teal-200 bg-white/95 p-4" noValidate aria-label={editing ? "Fiyat dönemini düzenle" : "Yeni fiyat dönemi"}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-teal-950">{editing ? "Fiyat dönemini düzenle" : "Yeni fiyat dönemi"}</p>
                <button type="button" onClick={closeForm} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Formu kapat">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={labelCls}>Başlangıç
                  <input type="date" required className={inputCls} value={draft.startsOn} onChange={(e) => setDraft((d) => ({ ...d, startsOn: e.target.value }))} />
                </label>
                <label className={labelCls}>Bitiş (boş = açık uçlu)
                  <input type="date" className={inputCls} value={draft.endsOn} min={draft.startsOn || undefined} onChange={(e) => setDraft((d) => ({ ...d, endsOn: e.target.value }))} />
                </label>
                <label className={labelCls}>Tutar (TL)
                  <input type="text" inputMode="decimal" required maxLength={14} placeholder="örn. 600" className={inputCls} value={draft.amount}
                    onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
                </label>
                <label className={labelCls}>Ödeme dönemi
                  <select className={inputCls} value={draft.billingPeriod} onChange={(e) => setDraft((d) => ({ ...d, billingPeriod: e.target.value as BillingPeriod }))}>
                    {BILLING_PERIODS.map((p) => <option key={p} value={p}>{BILLING_PERIOD_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className={`${labelCls} sm:col-span-2`}>Kısa etiket (isteğe bağlı)
                  <input type="text" maxLength={PRICING_LABEL_MAX} placeholder="örn. Yıllık peşin — 12 ay kullanım / 10 aylık ücret" className={inputCls}
                    value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                </label>
                <label className={`${labelCls} sm:col-span-2`}>Koşul notu (isteğe bağlı)
                  <input type="text" maxLength={PRICING_NOTE_MAX} placeholder="örn. Tanışma fiyatı, 5 ay" className={inputCls}
                    value={draft.termsNote} onChange={(e) => setDraft((d) => ({ ...d, termsNote: e.target.value }))} />
                </label>
              </div>
              {overlap ? (
                <p className="mt-3 text-xs font-black text-rose-800" role="alert">
                  Bu aralık mevcut dönemle çakışıyor: {formatPhaseRange(overlap)} ({formatPrice(overlap.amount, overlap.billingPeriod)}). Kaydedilemez.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="submit" disabled={saving || !draft.startsOn || !draft.amount.trim() || Boolean(overlap)}
                  className={`${btn} border-teal-600 bg-teal-600 text-white hover:bg-teal-700`}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {editing ? "Değişikliği kaydet" : "Dönemi kaydet"}
                </button>
                <button type="button" onClick={closeForm} disabled={saving} className={`${btn} border-slate-200 bg-white text-slate-700`}>Vazgeç</button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

/** API yanıtı camelCase PricingPhase döner; eski/snake biçime de dayanıklı. */
function mapPricingPhaseRowFromApi(raw: unknown): PricingPhase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if ("startsOn" in r) {
    return mapPricingPhaseRow({
      id: r.id, starts_on: r.startsOn, ends_on: r.endsOn, amount: r.amount, billing_period: r.billingPeriod,
      label: r.label, terms_note: r.termsNote, updated_at: r.updatedAt,
    });
  }
  return mapPricingPhaseRow(r);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

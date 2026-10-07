"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { formatInstantDateTime } from "@/lib/time/reportTime";
import {
  CONSENT_METHODS,
  CONSENT_METHOD_LABELS,
  CONSENT_NOTE_MAX,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABELS,
  CONSENT_TYPES,
  CONSENT_TYPE_LABELS,
  type ConsentMethod,
  type ConsentRecord,
  type ConsentStatus,
  type ConsentSummary,
  type ConsentType,
} from "@/lib/legal/clientConsent";

/**
 * KVKK danışan onam paneli (FAZ1 FINAL HARDENING — INFRA; entegrasyon DY-A).
 *
 * Kullanım:
 *   <ClientConsentPanel clientId={id} />                       → tam panel (durum + kayıt formu + geçmiş)
 *   <ClientConsentPanel clientId={id} variant="badge" />       → yalnız durum rozeti (danışan başlığı)
 *   <ClientConsentPanel clientId={id} onDefer={() => …} />     → "Sonra tamamla" düğmesi görünür
 *
 * Veri: GET/POST /api/clients/[id]/consents (append-only; geri çekme = yeni kayıt).
 * Örnek aydınlatma metni: /kvkk-aydinlatma (uzman kendi bilgileriyle uyarlar).
 */

type Props = {
  clientId: string;
  variant?: "panel" | "badge";
  /** Verilirse "Sonra tamamla" düğmesi gösterilir (ör. yeni danışan kaydı akışı). */
  onDefer?: () => void;
  /** Yeni kayıt başarıyla eklendiğinde (ör. başlık rozetini tazelemek için). */
  onChange?: (summary: ConsentSummary) => void;
  /** Kaydın alındığı ekran (API `source`): ör. "dy_detay", "dy_kayit". */
  source?: string;
  className?: string;
  /**
   * Danışan detayı (mobil kompakt UX, owner kararı 2026-10-07): varsayılan KAPALI; yalnız kırmızı
   * "KVKK Aydınlatma ve Onam" başlığı + aç/kapat oku görünür. İçerik DOM'da kalır (form/geçmiş/veri
   * yüklemesi ve özet rozeti aynen çalışır) — yalnız görünürlük değişir. Veri modeli DEĞİŞMEZ.
   */
  collapsible?: boolean;
};

type LoadState = { forClientId: string } & (
  | { kind: "loading" }
  | { kind: "ready"; history: ConsentRecord[]; current: Partial<Record<ConsentType, ConsentRecord>>; summary: ConsentSummary; demo: boolean }
  | { kind: "not_ready"; message: string }
  | { kind: "error"; message: string }
);

function authHeaders(): Record<string, string> {
  const user = readYasamUser();
  const token = readSessionToken();
  return {
    "x-user-id": user?.id ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

type ConsentsResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  demo?: boolean;
  history?: ConsentRecord[];
  current?: Partial<Record<ConsentType, ConsentRecord>>;
  summary?: ConsentSummary;
};

/** GET /api/clients/[id]/consents → panel durumu (saf; setState yok). */
async function fetchConsentState(clientId: string): Promise<LoadState> {
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/consents`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as ConsentsResponse;
    if (res.status === 503 && json.code === "CONSENTS_NOT_READY") {
      return { kind: "not_ready", forClientId: clientId, message: json.error ?? "KVKK onam kaydı henüz etkin değil." };
    }
    if (!res.ok || !json.ok || !json.summary) {
      return { kind: "error", forClientId: clientId, message: json.error ?? "Onam kayıtları yüklenemedi." };
    }
    return {
      kind: "ready",
      forClientId: clientId,
      history: json.history ?? [],
      current: json.current ?? {},
      summary: json.summary,
      demo: json.demo === true,
    };
  } catch {
    return { kind: "error", forClientId: clientId, message: "Onam kayıtları yüklenemedi." };
  }
}

const TONE_CLASS: Record<ConsentSummary["tone"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  none: "border-slate-200 bg-slate-50 text-slate-600",
};

const STATUS_CLASS: Record<ConsentStatus, string> = {
  granted: "bg-emerald-100 text-emerald-800",
  refused: "bg-rose-100 text-rose-800",
  withdrawn: "bg-slate-200 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
};

export default function ClientConsentPanel({
  clientId,
  variant = "panel",
  onDefer,
  onChange,
  source,
  className = "",
  collapsible = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const bodyId = `kvkk-body-${useId().replace(/:/g, "")}`;
  const [rawState, setState] = useState<LoadState>({ kind: "loading", forClientId: clientId });
  // clientId değişince eski danışanın verisi bir an bile gösterilmez.
  const state: LoadState =
    rawState.forClientId === clientId ? rawState : { kind: "loading", forClientId: clientId };
  const [consentType, setConsentType] = useState<ConsentType>("aydinlatma_bildirildi");
  const [status, setStatus] = useState<ConsentStatus>("granted");
  const [method, setMethod] = useState<ConsentMethod>("islak_imza");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { run, pending } = useSubmitLock();
  const loadSeq = useRef(0);

  /** Tek yükleme: sonucu durum olarak döndürür (setState çağıranın sorumluluğunda). */
  const reload = useCallback(async (): Promise<ConsentSummary | null> => {
    const seq = ++loadSeq.current;
    const next = await fetchConsentState(clientId);
    if (seq !== loadSeq.current) return null; // geç gelen yanıt
    setState(next);
    return next.kind === "ready" ? next.summary : null;
  }, [clientId]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    let cancelled = false;
    void fetchConsentState(clientId).then((next) => {
      if (!cancelled && seq === loadSeq.current) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const submit = () =>
    run(async (signal) => {
      setFormError(null);
      setSaved(false);
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/consents`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          consent_type: consentType,
          status,
          method,
          note: note.trim() || null,
          ...(source ? { source } : {}),
        }),
      }).catch(() => null);
      const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : {};
      if (!res || !res.ok || !json.ok) {
        setFormError(json.error ?? "Kayıt eklenemedi. Lütfen tekrar deneyin.");
        return;
      }
      setNote("");
      setSaved(true);
      const summary = await reload();
      if (summary) onChange?.(summary);
    });

  // ─── Rozet görünümü ────────────────────────────────────────────────────────
  if (variant === "badge") {
    if (state.kind !== "ready") {
      if (state.kind === "loading") return null;
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASS.none} ${className}`}
          title={state.message}
        >
          KVKK durumu alınamadı
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASS[state.summary.tone]} ${className}`}
        title="KVKK aydınlatma / açık rıza kaydı durumu"
      >
        {state.summary.badge}
      </span>
    );
  }

  // ─── Panel görünümü ────────────────────────────────────────────────────────
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm ${className}`}
      aria-label="KVKK aydınlatma ve onam kayıtları"
    >
      {collapsible ? (
        <h3 className="m-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            data-testid="kvkk-toggle"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>⚠</span>
              KVKK Aydınlatma ve Onam
            </span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              fill="currentColor"
            >
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" />
            </svg>
          </button>
        </h3>
      ) : null}
      <div id={bodyId} hidden={collapsible && !open} data-testid="kvkk-body">
      <header className={`flex flex-wrap items-start justify-between gap-2 ${collapsible ? "mt-3" : ""}`}>
        <div>
          {collapsible ? null : <h3 className="text-sm font-black text-slate-900">KVKK Aydınlatma ve Onam</h3>}
          <p className="mt-0.5 text-[11px] text-slate-500">
            Danışanınıza yaptığınız aydınlatmayı ve aldığınız izinleri kayıt altına alın. Kayıtlar
            değiştirilemez; geri çekme yeni bir kayıt olarak eklenir.
          </p>
        </div>
      </header>

      {state.kind === "loading" && <p className="mt-4 text-xs text-slate-500">Yükleniyor…</p>}

      {(state.kind === "error" || state.kind === "not_ready") && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="alert">
          <p>{state.message}</p>
          {state.kind === "error" && (
            <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => {
                setState({ kind: "loading", forClientId: clientId });
                void reload();
              }}>
              Yeniden dene
            </button>
          )}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {CONSENT_TYPES.map((t) => {
              const rec = state.current[t];
              return (
                <li key={t} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">{CONSENT_TYPE_LABELS[t].label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        rec ? STATUS_CLASS[rec.status] : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {rec ? CONSENT_STATUS_LABELS[rec.status] : "Kayıt yok"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{CONSENT_TYPE_LABELS[t].help}</p>
                  {rec && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatInstantDateTime(rec.recorded_at)} · {CONSENT_METHOD_LABELS[rec.method]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {state.demo ? (
            <p className="mt-4 text-xs text-slate-500">Demo hesabında onam kaydı eklenemez.</p>
          ) : (
            <form
              className="mt-4 grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="text-[11px] font-semibold text-slate-600">
                Kayıt türü
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  value={consentType}
                  onChange={(e) => setConsentType(e.target.value as ConsentType)}
                  disabled={pending}
                >
                  {CONSENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CONSENT_TYPE_LABELS[t].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Durum
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ConsentStatus)}
                  disabled={pending}
                >
                  {CONSENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONSENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Alınma yöntemi
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as ConsentMethod)}
                  disabled={pending}
                >
                  {CONSENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {CONSENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600 sm:col-span-3">
                Not (isteğe bağlı — sağlık bilgisi yazmayın)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  rows={2}
                  maxLength={CONSENT_NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={pending}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                <button type="submit" className="btn-primary text-xs" disabled={pending}>
                  {pending ? "Kaydediliyor…" : "Kaydı ekle"}
                </button>
                {onDefer && (
                  <button type="button" className="btn-secondary text-xs" onClick={onDefer} disabled={pending}>
                    Sonra tamamla
                  </button>
                )}
                <Link
                  href="/kvkk-aydinlatma"
                  target="_blank"
                  className="text-[11px] font-semibold text-violet-700 underline"
                >
                  Örnek aydınlatma metni
                </Link>
                {saved && !formError && <span className="text-[11px] font-semibold text-emerald-700">Kaydedildi.</span>}
                {formError && (
                  <span className="text-[11px] font-semibold text-rose-700" role="alert">
                    {formError}
                  </span>
                )}
              </div>
            </form>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
              Kayıt geçmişi ({state.history.length})
            </summary>
            {state.history.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">Henüz kayıt yok.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {state.history.map((h) => (
                  <li key={h.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
                    <span className="font-semibold">{CONSENT_TYPE_LABELS[h.consent_type]?.label ?? h.consent_type}</span>
                    {" — "}
                    {CONSENT_STATUS_LABELS[h.status] ?? h.status}
                    {" · "}
                    {CONSENT_METHOD_LABELS[h.method] ?? h.method}
                    {" · "}
                    {formatInstantDateTime(h.recorded_at)}
                    {h.note ? <span className="block text-slate-500">{h.note}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </>
      )}

      {onDefer && state.kind !== "ready" && (
        <button type="button" className="btn-secondary mt-3 text-xs" onClick={onDefer}>
          Sonra tamamla
        </button>
      )}
      </div>
    </section>
  );
}

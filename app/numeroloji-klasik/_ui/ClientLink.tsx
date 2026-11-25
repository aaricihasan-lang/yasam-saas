"use client";

// Klasik Numeroloji · danışan bağlama (formlar + kayıtlı analiz).
// Yeni sunucu ucu YOK: mevcut /api/clients (liste + tekil) kullanılır; ikisi de requireModuleAccess("clients") +
// oturum tenant'ı ile sınırlıdır. Sunucu analiz kaydında danışanın aynı tenant'ta olduğunu AYRICA doğrular
// (service.ts → clientBelongsToTenant). Danışan Yönetimi izni yoksa bileşen hiç görünmez (ent.canLinkClients).

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { apiRequest, authHeaders } from "../_lib/api";

export type LinkedClient = { id: string; ad: string | null; soyad: string | null; dogum: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Danışan görünen adı. `fallback` verilmezse TR varsayılanı (formlara AKTARILAN değer — veri yolu, değişmez);
 * ekranda gösterimde çağıran katalog metnini (`clientLink.unnamed`) geçirir.
 */
export function clientDisplayName(c: Pick<LinkedClient, "ad" | "soyad">, fallback = "Adsız danışan"): string { // i18n-ignore: forma aktarılan veri varsayılanı (gösterimde katalog geçirilir)
  return `${c.ad ?? ""} ${c.soyad ?? ""}`.replace(/\s+/g, " ").trim() || fallback;
}

/** Danışan kaydındaki doğum (YYYY-MM-DD) → form biçimi GG.AA.YYYY; geçersizse "". */
export function clientBirthTr(dogum: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dogum ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function pickClient(x: unknown): LinkedClient | null {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o || typeof o.id !== "string" || !UUID_RE.test(o.id)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return { id: o.id, ad: s(o.ad), soyad: s(o.soyad), dogum: s(o.dogum) };
}

/** Tekil danışan (aynı tenant değilse 404 → null). */
export async function fetchClient(id: string): Promise<{ ok: true; client: LinkedClient } | { ok: false; notFound: boolean }> {
  if (!UUID_RE.test(id)) return { ok: false, notFound: true };
  const r = await apiRequest<{ client: unknown }>(`/api/clients/${encodeURIComponent(id)}`);
  if (r.ok) {
    const c = pickClient(r.data.client);
    return c ? { ok: true, client: c } : { ok: false, notFound: true };
  }
  return { ok: false, notFound: r.status === 404 || r.status === 403 };
}

/** ?clientId= (Danışan dosyasından gelen bağlantı) — yalnız geçerli uuid okunur. */
export function readClientIdQuery(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("clientId");
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * Form içi danışan seçici. `value` seçili danışan; `onChange(null)` bağı kaldırır.
 * `onPrefill` verilirse "Bilgileri forma aktar" düğmesi görünür (ad soyad + doğum; uzman açıkça tıklar).
 * D6 (05.11.2026): `inline` → kart (nk-card nk-panel) yerine başlık kartı içinde akan kompakt kutu (kart içinde
 * kart / başlıkla çakışma yok); `onCancel` → "Vazgeç" bileşeni tamamen kapatır (sonuç sayfası "Danışana bağla").
 */
export function ClientLinkField({
  enabled, value, onChange, onPrefill, error, inline = false, onCancel,
}: {
  enabled: boolean;
  value: LinkedClient | null;
  onChange: (c: LinkedClient | null) => void;
  onPrefill?: (c: LinkedClient) => void;
  error?: string | null;
  inline?: boolean;
  onCancel?: () => void;
}) {
  const t = useTranslations("numerology.classic.clientLink");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LinkedClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !open) return;
    const ac = new AbortController();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      const sp = new URLSearchParams({ order: "asc", limit: "30" });
      if (q.trim()) sp.set("search", q.trim().slice(0, 100));
      fetch(`/api/clients?${sp.toString()}`, { headers: authHeaders(), cache: "no-store", credentials: "same-origin", signal: ac.signal })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as { clients?: unknown } | null;
          if (!r.ok || !j || !Array.isArray(j.clients)) throw new Error("liste");
          setRows(j.clients.map(pickClient).filter((x): x is LinkedClient => x !== null));
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") setLoadError(t("listFailed"));
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      ac.abort();
      if (timer.current) clearTimeout(timer.current);
    };
    // t: next-intl çevirici (dil değişimi yeniden arama tetiklemesin diye bağımlılık değil — yalnız hata metni).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, open, q]);

  if (!enabled) return null;
  const cancel = () => {
    setOpen(false);
    onCancel?.();
  };
  return (
    <section
      className={inline ? "nk-client-inline" : "nk-card nk-panel"}
      style={inline ? { display: "grid", gap: 6, marginTop: 4, padding: 12, borderRadius: 12, border: "1px solid var(--b-line)", background: "#fbfdff", minWidth: 0 } : undefined}
      aria-labelledby={`${uid}-baslik`}
      data-testid="client-link"
    >
      {inline ? (
        <p className="nk-label-cap" id={`${uid}-baslik`} style={{ margin: 0 }}>{t("title")} <span className="nk-muted" style={{ fontWeight: 500 }}>{t("optional")}</span></p>
      ) : (
        <h2 className="nk-h2" id={`${uid}-baslik`}>{t("title")} <span className="nk-muted" style={{ fontWeight: 500, fontSize: "0.8em" }}>{t("optional")}</span></h2>
      )}
      <p className={inline ? "nk-hint" : "nk-lead"} style={inline ? { margin: 0 } : undefined}>{t("lead")}</p>
      {value ? (
        <div className="nk-client-chosen" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }} data-testid="client-chosen">
          <span className="nk-badge nk-ice">{t.rich("linked", { name: clientDisplayName(value, t("unnamed")), b: (c) => <b>{c}</b> })}</span>
          {onPrefill ? <button type="button" className="nk-btn" onClick={() => onPrefill(value)} data-testid="client-prefill">{t("prefill")}</button> : null}
          <button type="button" className="nk-btn" onClick={() => onChange(null)} data-testid="client-unlink">{t("unlink")}</button>
        </div>
      ) : open ? (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={`${uid}-ara`} className="nk-sr-only">{t("searchLabel")}</label>
          <input
            id={`${uid}-ara`}
            className="nk-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPh")}
            autoComplete="off"
            data-testid="client-search"
          />
          {loading ? <p className="nk-hint" role="status">{t("loading")}</p> : null}
          {loadError ? <p className="nk-field-error" role="alert">{loadError}</p> : null}
          {!loading && !loadError && rows.length === 0 ? <p className="nk-hint">{t("noMatch")}</p> : null}
          <ul className="nk-client-results" style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" className="nk-btn" style={{ width: "100%", justifyContent: "space-between", textAlign: "left" }} onClick={() => { onChange(c); setOpen(false); }} data-testid="client-option">
                  <span>{clientDisplayName(c, t("unnamed"))}</span>
                  {clientBirthTr(c.dogum) ? <span className="nk-muted">{clientBirthTr(c.dogum)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="nk-btn" style={{ marginTop: 10 }} onClick={cancel} data-testid="client-cancel">{t("cancel")}</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: inline ? 4 : 12 }}>
          <button type="button" className="nk-btn" onClick={() => setOpen(true)} data-testid="client-open">{t("choose")}</button>
          {onCancel ? <button type="button" className="nk-btn" onClick={cancel} data-testid="client-cancel">{t("cancel")}</button> : null}
        </div>
      )}
      {error ? <p className="nk-field-error" role="alert" style={{ marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}

/**
 * 30.10.2026 owner kararı: formlarda büyük "Danışan bağlantısı" kartı yerine kişi bilgileri kartının içinde küçük,
 * İSTEĞE BAĞLI "Danışan Seç" düğmesi. Seçilen danışan küçük etiketle gösterilir (kaldırılabilir); ad / doğum boşsa
 * otomatik aktarılır, doluysa "Bilgileri aktar" ile açıkça. Danışan seçimi hiçbir kayıt OLUŞTURMAZ (bağ yalnız Kaydet'te).
 * Test kimlikleri ClientLinkField ile aynıdır (client-link, client-open, client-search, client-option, client-chosen,
 * client-prefill, client-unlink).
 */
export function ClientPickerCompact({
  enabled, value, onChange, onPrefill, error,
}: {
  enabled: boolean;
  value: LinkedClient | null;
  onChange: (c: LinkedClient | null) => void;
  onPrefill?: (c: LinkedClient, auto: boolean) => void;
  error?: string | null;
}) {
  const t = useTranslations("numerology.classic.clientLink");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<LinkedClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!enabled || !open) return;
    const ac = new AbortController();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      const sp = new URLSearchParams({ order: "asc", limit: "30" });
      if (q.trim()) sp.set("search", q.trim().slice(0, 100));
      fetch(`/api/clients?${sp.toString()}`, { headers: authHeaders(), cache: "no-store", credentials: "same-origin", signal: ac.signal })
        .then(async (r) => {
          const j = (await r.json().catch(() => null)) as { clients?: unknown } | null;
          if (!r.ok || !j || !Array.isArray(j.clients)) throw new Error("liste");
          setRows(j.clients.map(pickClient).filter((x): x is LinkedClient => x !== null));
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") setLoadError(t("listFailed"));
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      ac.abort();
      if (timer.current) clearTimeout(timer.current);
    };
    // t: next-intl çevirici (dil değişimi yeniden arama tetiklemesin diye bağımlılık değil — yalnız hata metni).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, open, q]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!enabled) return null;
  const close = () => {
    setOpen(false);
    window.setTimeout(() => openRef.current?.focus(), 0);
  };
  return (
    <div className="nk-cpick" data-testid="client-link">
      {value ? (
        <div className="nk-cpick-row" data-testid="client-chosen">
          <span className="nk-cpick-chip">
            <span className="nk-cpick-k">{t("chip")}</span>
            <b>{clientDisplayName(value, t("unnamed"))}</b>
            <button type="button" className="nk-cpick-x" onClick={() => onChange(null)} aria-label={t("removeAria", { name: clientDisplayName(value, t("unnamed")) })} data-testid="client-unlink">×</button>
          </span>
          {onPrefill ? <button type="button" className="nk-btn nk-sm" onClick={() => onPrefill(value, false)} data-testid="client-prefill">{t("prefillShort")}</button> : null}
        </div>
      ) : open ? (
        <div className="nk-cpick-panel" role="group" aria-labelledby={`${uid}-t`}>
          <p className="nk-cpick-k" id={`${uid}-t`}>{t("choose")} <span className="nk-muted">{t("optional")}</span></p>
          <label htmlFor={`${uid}-ara`} className="nk-sr-only">{t("searchLabel")}</label>
          <input
            ref={searchRef}
            id={`${uid}-ara`}
            className="nk-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}
            placeholder={t("searchPh")}
            autoComplete="off"
            data-testid="client-search"
          />
          {loading ? <p className="nk-hint" role="status">{t("loading")}</p> : null}
          {loadError ? <p className="nk-field-error" role="alert">{loadError}</p> : null}
          {!loading && !loadError && rows.length === 0 ? <p className="nk-hint">{t("noMatch")}</p> : null}
          <ul className="nk-cpick-list">
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" className="nk-cpick-opt" onClick={() => { onChange(c); setOpen(false); onPrefill?.(c, true); }} data-testid="client-option">
                  <span>{clientDisplayName(c, t("unnamed"))}</span>
                  {clientBirthTr(c.dogum) ? <span className="nk-muted">{clientBirthTr(c.dogum)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="nk-btn nk-sm" onClick={close}>{t("cancel")}</button>
        </div>
      ) : (
        <button ref={openRef} type="button" className="nk-btn nk-sm nk-cpick-open" onClick={() => setOpen(true)} data-testid="client-open" aria-expanded={false}>
          <span aria-hidden="true">＋</span> {t("chooseCap")} <span className="nk-muted">{t("optional")}</span>
        </button>
      )}
      {error ? <p className="nk-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

/** Kayıtlı analizde danışan bağlantı satırı (bağlı danışanın adı + dosyasına bağlantı). */
export function LinkedClientLine({ clientId }: { clientId: string | null }) {
  const t = useTranslations("numerology.classic.clientLink");
  const [c, setC] = useState<LinkedClient | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    void fetchClient(clientId).then((r) => {
      if (!alive) return;
      if (r.ok) setC(r.client);
      else setMissing(true);
    });
    return () => { alive = false; };
  }, [clientId]);
  if (!clientId) return null;
  if (missing) return <span data-testid="linked-client">{t("lineMissing")}</span>;
  if (!c) return <span data-testid="linked-client">{t("linePending")}</span>;
  return (
    <span data-testid="linked-client">
      {t("lineLabel")} <Link href={`/dashboard/clients/${encodeURIComponent(c.id)}?tab=numeroloji`}><b>{clientDisplayName(c, t("unnamed"))}</b></Link>
    </span>
  );
}

/**
 * Form durumu: seçili danışan + (Danışan dosyasından gelindiyse) ?clientId= ön seçimi.
 * Ön seçim YALNIZ /api/clients/[id] aynı tenant'ta 200 dönerse uygulanır; aksi hâlde hata gösterilir, bağ kurulmaz.
 */
export function useLinkedClient(canLink: boolean | undefined) {
  const t = useTranslations("numerology.classic.clientLink");
  const [client, setClient] = useState<LinkedClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canLink) return;
    const id = readClientIdQuery();
    if (!id) return;
    let alive = true;
    void fetchClient(id).then((r) => {
      if (!alive) return;
      if (r.ok) setClient(r.client);
      else setError(t("queryNotFound"));
    });
    return () => { alive = false; };
    // t: next-intl çevirici (dil değişimi danışanı yeniden istemesin diye bağımlılık değil — yalnız hata metni).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLink]);
  const set = (c: LinkedClient | null) => {
    setClient(c);
    setError(null);
  };
  return { client: canLink ? client : null, setClient: set, error: canLink ? error : null };
}

/**
 * Kayıtlı analizi danışana bağla / bağı kaldır (mevcut PATCH ucu; row_version CAS). Yalnız canLinkClients.
 * Başarıda onSaved(yeni analiz görünümü) çağrılır.
 */
export function ClientLinkAction<T extends { id: string; clientId: string | null; rowVersion: number }>({
  analysis, canLink, onSaved,
}: { analysis: T; canLink: boolean; onSaved: (a: T) => void }) {
  const t = useTranslations("numerology.classic.clientLink");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!canLink) return null;
  async function save(clientId: string | null) {
    setBusy(true);
    setErr(null);
    // PATCH yanıtı { row: { clientId, rowVersion, updatedAt, … } } — mevcut görünüm bu alanlarla güncellenir.
    const r = await apiRequest<{ row: { clientId: string | null; rowVersion: number; updatedAt?: string } }>(`/api/numeroloji-klasik/analyses/${encodeURIComponent(analysis.id)}`, {
      method: "PATCH",
      json: { clientId, rowVersion: analysis.rowVersion },
    });
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      const row = r.data.row;
      onSaved({ ...analysis, clientId: row?.clientId ?? null, rowVersion: typeof row?.rowVersion === "number" ? row.rowVersion : analysis.rowVersion + 1, ...(row?.updatedAt ? { updatedAt: row.updatedAt } : {}) });
    } else if (r.status === 409) setErr(t("conflict"));
    else if (r.status === 404) setErr(t("notFound"));
    // TR: sunucu metni birebir; EN: sunucunun Türkçe metni yerine genel katalog metni.
    else setErr((locale === DEFAULT_LOCALE ? r.error : null) ?? t("saveFailed"));
  }
  return (
    <div style={{ marginTop: 10 }} data-testid="client-link-action">
      {analysis.clientId ? (
        <button type="button" className="nk-btn nk-sm" disabled={busy} onClick={() => void save(null)} data-testid="result-client-unlink">{t("resultUnlink")}</button>
      ) : editing ? (
        <ClientLinkField enabled inline value={null} onChange={(c) => { if (c) void save(c.id); }} onCancel={() => { setEditing(false); setErr(null); }} />
      ) : (
        <button type="button" className="nk-btn nk-sm" disabled={busy} onClick={() => setEditing(true)} data-testid="result-client-link">{t("resultLink")}</button>
      )}
      {err ? <p className="nk-field-error" role="alert">{err}</p> : null}
    </div>
  );
}

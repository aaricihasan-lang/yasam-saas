"use client";

// Klasik Numeroloji · danışan bağlama (formlar + kayıtlı analiz).
// Yeni sunucu ucu YOK: mevcut /api/clients (liste + tekil) kullanılır; ikisi de requireModuleAccess("clients") +
// oturum tenant'ı ile sınırlıdır. Sunucu analiz kaydında danışanın aynı tenant'ta olduğunu AYRICA doğrular
// (service.ts → clientBelongsToTenant). Danışan Yönetimi izni yoksa bileşen hiç görünmez (ent.canLinkClients).

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { apiRequest, authHeaders } from "../_lib/api";

export type LinkedClient = { id: string; ad: string | null; soyad: string | null; dogum: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clientDisplayName(c: Pick<LinkedClient, "ad" | "soyad">): string {
  return `${c.ad ?? ""} ${c.soyad ?? ""}`.replace(/\s+/g, " ").trim() || "Adsız danışan";
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
 */
export function ClientLinkField({
  enabled, value, onChange, onPrefill, error,
}: {
  enabled: boolean;
  value: LinkedClient | null;
  onChange: (c: LinkedClient | null) => void;
  onPrefill?: (c: LinkedClient) => void;
  error?: string | null;
}) {
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
          if ((e as { name?: string })?.name !== "AbortError") setLoadError("Danışan listesi yüklenemedi.");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      ac.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, open, q]);

  if (!enabled) return null;
  return (
    <section className="nk-card nk-panel" aria-labelledby={`${uid}-baslik`} data-testid="client-link">
      <h2 className="nk-h2" id={`${uid}-baslik`}>Danışan bağlantısı <span className="nk-muted" style={{ fontWeight: 500, fontSize: "0.8em" }}>(isteğe bağlı)</span></h2>
      <p className="nk-lead">Analizi kendi danışanınıza bağlarsanız Danışan dosyasının Numeroloji sekmesinde görünür.</p>
      {value ? (
        <div className="nk-client-chosen" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }} data-testid="client-chosen">
          <span className="nk-badge nk-ice">Bağlı danışan: <b>{clientDisplayName(value)}</b></span>
          {onPrefill ? <button type="button" className="nk-btn" onClick={() => onPrefill(value)} data-testid="client-prefill">Bilgileri forma aktar</button> : null}
          <button type="button" className="nk-btn" onClick={() => onChange(null)} data-testid="client-unlink">Bağı kaldır</button>
        </div>
      ) : open ? (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={`${uid}-ara`} className="nk-sr-only">Danışan ara</label>
          <input
            id={`${uid}-ara`}
            className="nk-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad veya soyad ile ara"
            autoComplete="off"
            data-testid="client-search"
          />
          {loading ? <p className="nk-hint" role="status">Yükleniyor…</p> : null}
          {loadError ? <p className="nk-field-error" role="alert">{loadError}</p> : null}
          {!loading && !loadError && rows.length === 0 ? <p className="nk-hint">Eşleşen danışan yok.</p> : null}
          <ul className="nk-client-results" style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" className="nk-btn" style={{ width: "100%", justifyContent: "space-between", textAlign: "left" }} onClick={() => { onChange(c); setOpen(false); }} data-testid="client-option">
                  <span>{clientDisplayName(c)}</span>
                  {clientBirthTr(c.dogum) ? <span className="nk-muted">{clientBirthTr(c.dogum)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="nk-btn" style={{ marginTop: 10 }} onClick={() => setOpen(false)}>Vazgeç</button>
        </div>
      ) : (
        <button type="button" className="nk-btn" style={{ marginTop: 12 }} onClick={() => setOpen(true)} data-testid="client-open">Danışan seç</button>
      )}
      {error ? <p className="nk-field-error" role="alert" style={{ marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}

/** Kayıtlı analizde danışan bağlantı satırı (bağlı danışanın adı + dosyasına bağlantı). */
export function LinkedClientLine({ clientId }: { clientId: string | null }) {
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
  if (missing) return <span data-testid="linked-client">Danışan bağlı (görüntüleme izniniz yok ya da danışan silinmiş)</span>;
  if (!c) return <span data-testid="linked-client">Danışan bağlı…</span>;
  return (
    <span data-testid="linked-client">
      Danışan <Link href={`/dashboard/clients/${encodeURIComponent(c.id)}?tab=numeroloji`}><b>{clientDisplayName(c)}</b></Link>
    </span>
  );
}

/**
 * Form durumu: seçili danışan + (Danışan dosyasından gelindiyse) ?clientId= ön seçimi.
 * Ön seçim YALNIZ /api/clients/[id] aynı tenant'ta 200 dönerse uygulanır; aksi hâlde hata gösterilir, bağ kurulmaz.
 */
export function useLinkedClient(canLink: boolean | undefined) {
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
      else setError("Bağlantıdaki danışan bulunamadı; analiz danışansız kaydedilir ya da listeden seçebilirsiniz.");
    });
    return () => { alive = false; };
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
    } else if (r.status === 409) setErr("Kayıt başka bir sekmede değişti; sayfayı yenileyip tekrar deneyin.");
    else if (r.status === 404) setErr("Danışan ya da analiz bulunamadı.");
    else setErr(r.error ?? "Danışan bağlantısı kaydedilemedi.");
  }
  return (
    <div style={{ marginTop: 10 }} data-testid="client-link-action">
      {analysis.clientId ? (
        <button type="button" className="nk-btn nk-sm" disabled={busy} onClick={() => void save(null)} data-testid="result-client-unlink">Danışan bağını kaldır</button>
      ) : editing ? (
        <ClientLinkField enabled value={null} onChange={(c) => { if (c) void save(c.id); }} />
      ) : (
        <button type="button" className="nk-btn nk-sm" disabled={busy} onClick={() => setEditing(true)} data-testid="result-client-link">Danışana bağla</button>
      )}
      {err ? <p className="nk-field-error" role="alert">{err}</p> : null}
    </div>
  );
}

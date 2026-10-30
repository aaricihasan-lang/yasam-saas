"use client";

// Klasik Numeroloji · kayıtlı analizler (20'lik sayfa + "Tümünü göster"; yeniden adlandır; sayfa içi silme onayı).
// 30.10.2026: liste HER ZAMAN başlığa göre Türkçe A–Z (sunucu bütün kümeyi sıralar: ?sira=ad); yeniden adlandırınca
// yerel liste aynı kuralla yeniden sıralanır.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { CLASSIC_TITLE_MAX, validateTitle } from "@/lib/numeroloji-klasik/input";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../_lib/api";
import { KIND_LABELS, fmtDateTime } from "../_lib/format";
import type { AnalysisRow, ListResponse, PatchResponse } from "../_lib/types";
import { Alert, ConfirmDialog, Hero, Icon, Shell, Skeleton } from "../_ui/kit";

const TR = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });
/** Sunucudaki compareAnalysisTitleTr ile aynı kural (boş başlık sona; eşitlikte yeni kayıt önce, sonra kimlik). */
function sortTr(rows: AnalysisRow[]): AnalysisRow[] {
  return rows.slice().sort((a, b) => {
    const ta = (a.title ?? "").trim();
    const tb = (b.title ?? "").trim();
    if (!ta !== !tb) return ta ? -1 : 1;
    return TR.compare(ta, tb) || String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id);
  });
}

export default function RecordsClient() {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<AnalysisRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (signal?: AbortSignal, keepError = false) => {
    setLoading(true);
    if (!keepError) setError(null);
    const r = await apiRequest<ListResponse>(`${API_BASE}/analyses?sira=ad`, { signal });
    if (r.ok) {
      setRows(r.data.rows);
      setNextOffset(r.data.hasMore ? r.data.nextOffset : null);
    } else if ((r as ApiErr).code !== "ABORTED") setError(errorMessage(r as ApiErr));
    setLoading(false);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    runInEffect(() => void load(ac.signal));
    return () => ac.abort();
  }, [load]);

  async function showAll() {
    setLoadingMore(true);
    let off = nextOffset;
    const acc: AnalysisRow[] = [];
    // Sunucu sayfası 20; "Tümünü göster" kalan sayfaları sırayla ister (üst sınır: 25 sayfa).
    for (let guard = 0; off !== null && guard < 25; guard++) {
      const r = await apiRequest<ListResponse>(`${API_BASE}/analyses?sira=ad&offset=${off}`);
      if (!r.ok) {
        setError(errorMessage(r as ApiErr));
        break;
      }
      acc.push(...r.data.rows);
      off = r.data.hasMore ? r.data.nextOffset : null;
    }
    setRows((cur) => {
      const seen = new Set(cur.map((x) => x.id));
      return [...cur, ...acc.filter((x) => !seen.has(x.id))];
    });
    setNextOffset(off);
    setLoadingMore(false);
  }

  function startEdit(r: AnalysisRow) {
    setEditing(r.id);
    setDraft(r.title);
    setDraftError(null);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }

  async function saveEdit(r: AnalysisRow) {
    const v = validateTitle(draft);
    if (!v.ok) return setDraftError(v.error);
    if (!v.value) return setDraftError("Başlık boş olamaz.");
    setSaving(true);
    const res = await apiRequest<PatchResponse>(`${API_BASE}/analyses/${encodeURIComponent(r.id)}`, { method: "PATCH", json: { title: v.value, rowVersion: r.rowVersion } });
    setSaving(false);
    if (res.ok) {
      setRows((cur) => sortTr(cur.map((x) => (x.id === r.id ? { ...x, ...res.data.row } : x))));
      setEditing(null);
      setNotice("Başlık güncellendi.");
      return;
    }
    const e = res as ApiErr;
    if (e.status === 409) {
      setEditing(null);
      setNotice(null);
      setError("Kayıt başka bir oturumda değişti; liste yenilendi. Değişikliği tekrar deneyin.");
      void load(undefined, true);
      return;
    }
    setDraftError(errorMessage(e));
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const r = toDelete;
    const res = await apiRequest<{ ok: true; id: string }>(`${API_BASE}/analyses/${encodeURIComponent(r.id)}?rowVersion=${r.rowVersion}`, { method: "DELETE" });
    setDeleting(false);
    setToDelete(null);
    if (res.ok) {
      setRows((cur) => cur.filter((x) => x.id !== r.id));
      setNotice(`“${r.title || "Adsız analiz"}” silindi.`);
      return;
    }
    const e = res as ApiErr;
    if (e.status === 409) {
      setError("Kayıt başka bir oturumda değişti; liste yenilendi. Silmeyi tekrar deneyin.");
      void load(undefined, true);
      return;
    }
    if (e.status === 404) {
      setRows((cur) => cur.filter((x) => x.id !== r.id));
      setNotice("Kayıt zaten silinmiş.");
      return;
    }
    setError(errorMessage(e));
  }

  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { href: "/numeroloji-klasik", label: "Klasik Numeroloji" }, { label: "Kayıtlı Analizler" }]}>
      <Hero compact eyebrow="Klasik Numeroloji" title="Kayıtlı Analizler" sub="Kayıtlı analizi açmak yeniden hesap yapmaz." aside={<Link className="nk-btn nk-primary" href="/numeroloji-klasik/yeni">Yeni analiz</Link>} />
      {error ? <Alert tone="error" action={<button type="button" className="nk-btn nk-sm" onClick={() => void load()}>Yenile</button>}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" live>{notice}</Alert> : null}

      {loading ? (
        <div style={{ marginTop: 14 }}><Skeleton lines={5} label="Kayıtlar yükleniyor…" /></div>
      ) : (
        <section className="nk-card nk-panel" style={{ marginTop: 14 }} aria-labelledby="nk-kayit-baslik">
          <h2 className="nk-h2" id="nk-kayit-baslik">{rows.length ? `${rows.length} kayıt${nextOffset !== null ? "+" : ""}` : "Kayıt yok"}</h2>
          {!rows.length && !error ? (
            <p className="nk-empty">Henüz kayıtlı Klasik Numeroloji analizi yok. <Link href="/numeroloji-klasik/yeni" className="nk-link-btn">Yeni analiz başlatın</Link>.</p>
          ) : null}
          <ul className="nk-rec-list" data-testid="records">
            {rows.map((r) => (
              <li key={r.id} className="nk-rec" data-testid="record">
                {editing === r.id ? (
                  <form className="nk-rename" onSubmit={(e) => { e.preventDefault(); void saveEdit(r); }}>
                    <label className="nk-sr-only" htmlFor={`nk-ad-${r.id}`}>Yeni başlık</label>
                    <input ref={editRef} id={`nk-ad-${r.id}`} className="nk-input" value={draft} maxLength={CLASSIC_TITLE_MAX + 10}
                      onChange={(e) => setDraft(e.target.value)} aria-invalid={draftError ? true : undefined}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                    <button type="submit" className="nk-btn nk-primary nk-sm" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
                    <button type="button" className="nk-btn nk-sm" onClick={() => setEditing(null)} disabled={saving}>Vazgeç</button>
                    {draftError ? <p className="nk-field-error" role="alert" style={{ flexBasis: "100%" }}>{draftError}</p> : null}
                  </form>
                ) : (
                  <Link className="nk-rec-main" href={`/numeroloji-klasik/analiz/${encodeURIComponent(r.id)}`}>
                    <span className="nk-rec-title">{r.title || "Adsız analiz"}</span>
                    <span className="nk-rec-meta">
                      <span>{KIND_LABELS[r.kind] ?? "Analiz"}</span>
                      <span>{fmtDateTime(r.createdAt)}</span>
                      {r.status === "partial" ? <span className="nk-badge nk-warn">Kısmi</span> : null}
                    </span>
                  </Link>
                )}
                {editing !== r.id ? (
                  <div className="nk-rec-actions">
                    <button type="button" className="nk-btn nk-sm" onClick={() => startEdit(r)} aria-label={`${r.title || "Adsız analiz"} — yeniden adlandır`}><Icon name="edit" />Yeniden adlandır</button>
                    <button type="button" className="nk-btn nk-sm" onClick={() => setToDelete(r)} aria-label={`${r.title || "Adsız analiz"} — sil`}><Icon name="trash" />Sil</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {nextOffset !== null ? (
            <div className="nk-btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="nk-btn" onClick={() => void showAll()} disabled={loadingMore} data-testid="show-all">{loadingMore ? "Yükleniyor…" : "Tümünü göster"}</button>
            </div>
          ) : null}
        </section>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Analiz silinsin mi?"
        confirmLabel="Sil"
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        <p>“{toDelete?.title || "Adsız analiz"}” kayıtlı analizler listesinden kaldırılacak. Bu işlem geri alınamaz.</p>
      </ConfirmDialog>
    </Shell>
  );
}

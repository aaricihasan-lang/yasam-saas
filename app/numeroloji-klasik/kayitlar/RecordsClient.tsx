"use client";

// Klasik Numeroloji · kayıtlı analizler (20'lik sayfa + "Tümünü göster"; yeniden adlandır; sayfa içi silme onayı).
// 30.10.2026: liste HER ZAMAN başlığa göre Türkçe A–Z (sunucu bütün kümeyi sıralar: ?sira=ad); yeniden adlandırınca
// yerel liste aynı kuralla yeniden sıralanır.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { runInEffect } from "@/lib/runInEffect";
import { CLASSIC_TITLE_MAX, validateTitle } from "@/lib/numeroloji-klasik/input";
import { API_BASE, apiRequest, errorMessage, errorMessageEn, type ApiErr } from "../_lib/api";
import { fmtDateTime, kindLabelI18n } from "../_lib/format";
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
  const t = useTranslations("numerology.classic.records");
  const tC = useTranslations("numerology.classic");
  const tFmt = useTranslations("numerology.classic.fmt");
  const tErr = useTranslations("numerology.classic.apiErrors");
  const tVal = useTranslations("numerology.classic.validation");
  const locale = useLocale();
  const isTr = locale === DEFAULT_LOCALE;
  // TR: sunucu metni birebir (errorMessage); EN: dil-bağımsız kod → katalog.
  const errText = useCallback((e: ApiErr) => (isTr ? errorMessage(e) : errorMessageEn(e, tErr)), [isTr, tErr]);
  // load() kimliği dile bağlanmaz (liste dil değişiminde yeniden istenmez): güncel çevirici ref üzerinden okunur.
  const errTextRef = useRef(errText);
  useEffect(() => { errTextRef.current = errText; }, [errText]);
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
    } else if ((r as ApiErr).code !== "ABORTED") setError(errTextRef.current(r as ApiErr));
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
        setError(errText(r as ApiErr));
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
    // validateTitle (lib, değişmez) Türkçe metin döndürür; EN'de dil-bağımsız `code` → katalog.
    if (!v.ok) return setDraftError(isTr ? v.error : tVal.has(`codes.${v.code}`) ? tVal(`codes.${v.code}`) : tVal("titleInvalid"));
    if (!v.value) return setDraftError(t("titleEmpty"));
    setSaving(true);
    const res = await apiRequest<PatchResponse>(`${API_BASE}/analyses/${encodeURIComponent(r.id)}`, { method: "PATCH", json: { title: v.value, rowVersion: r.rowVersion } });
    setSaving(false);
    if (res.ok) {
      setRows((cur) => sortTr(cur.map((x) => (x.id === r.id ? { ...x, ...res.data.row } : x))));
      setEditing(null);
      setNotice(t("renamed"));
      return;
    }
    const e = res as ApiErr;
    if (e.status === 409) {
      setEditing(null);
      setNotice(null);
      setError(t("conflictRename"));
      void load(undefined, true);
      return;
    }
    setDraftError(errText(e));
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
      setNotice(t("deleted", { title: r.title || t("untitled") }));
      return;
    }
    const e = res as ApiErr;
    if (e.status === 409) {
      setError(t("conflictDelete"));
      void load(undefined, true);
      return;
    }
    if (e.status === 404) {
      setRows((cur) => cur.filter((x) => x.id !== r.id));
      setNotice(t("alreadyDeleted"));
      return;
    }
    setError(errText(e));
  }

  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: tC("shared.crumbCentre") }, { href: "/numeroloji-klasik", label: tC("shared.crumbClassic") }, { label: t("title") }]}>
      <Hero compact eyebrow={tC("shared.crumbClassic")} title={t("title")} sub={t("sub")} aside={<Link className="nk-btn nk-primary" href="/numeroloji-klasik/yeni">{t("newAnalysis")}</Link>} />
      {error ? <Alert tone="error" action={<button type="button" className="nk-btn nk-sm" onClick={() => void load()}>{t("refresh")}</button>}>{error}</Alert> : null}
      {notice ? <Alert tone="ok" live>{notice}</Alert> : null}

      {loading ? (
        <div style={{ marginTop: 14 }}><Skeleton lines={5} label={t("loading")} /></div>
      ) : (
        <section className="nk-card nk-panel" style={{ marginTop: 14 }} aria-labelledby="nk-kayit-baslik">
          <h2 className="nk-h2" id="nk-kayit-baslik">{rows.length ? `${t(rows.length === 1 ? "countOne" : "count", { n: String(rows.length) })}${nextOffset !== null ? "+" : ""}` : t("none")}</h2>
          {!rows.length && !error ? (
            <p className="nk-empty">{t.rich("emptyLead", { link: (c) => <Link href="/numeroloji-klasik/yeni" className="nk-link-btn">{c}</Link> })}</p>
          ) : null}
          <ul className="nk-rec-list" data-testid="records">
            {rows.map((r) => (
              <li key={r.id} className="nk-rec" data-testid="record">
                {editing === r.id ? (
                  <form className="nk-rename" onSubmit={(e) => { e.preventDefault(); void saveEdit(r); }}>
                    <label className="nk-sr-only" htmlFor={`nk-ad-${r.id}`}>{t("newTitleLabel")}</label>
                    <input ref={editRef} id={`nk-ad-${r.id}`} className="nk-input" value={draft} maxLength={CLASSIC_TITLE_MAX + 10}
                      onChange={(e) => setDraft(e.target.value)} aria-invalid={draftError ? true : undefined}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                    <button type="submit" className="nk-btn nk-primary nk-sm" disabled={saving}>{saving ? t("saving") : t("save")}</button>
                    <button type="button" className="nk-btn nk-sm" onClick={() => setEditing(null)} disabled={saving}>{t("cancel")}</button>
                    {draftError ? <p className="nk-field-error" role="alert" style={{ flexBasis: "100%" }}>{draftError}</p> : null}
                  </form>
                ) : (
                  <Link className="nk-rec-main" href={`/numeroloji-klasik/analiz/${encodeURIComponent(r.id)}`}>
                    <span className="nk-rec-title">{r.title || t("untitled")}</span>
                    <span className="nk-rec-meta">
                      <span>{kindLabelI18n(r.kind, tFmt)}</span>
                      <span>{fmtDateTime(r.createdAt, locale)}</span>
                      {r.status === "partial" ? <span className="nk-badge nk-warn">{t("partial")}</span> : null}
                    </span>
                  </Link>
                )}
                {editing !== r.id ? (
                  <div className="nk-rec-actions">
                    <button type="button" className="nk-btn nk-sm" onClick={() => startEdit(r)} aria-label={t("renameAria", { title: r.title || t("untitled") })}><Icon name="edit" />{t("rename")}</button>
                    <button type="button" className="nk-btn nk-sm" onClick={() => setToDelete(r)} aria-label={t("deleteAria", { title: r.title || t("untitled") })}><Icon name="trash" />{t("delete")}</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {nextOffset !== null ? (
            <div className="nk-btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="nk-btn" onClick={() => void showAll()} disabled={loadingMore} data-testid="show-all">{loadingMore ? t("loadingMore") : t("showAll")}</button>
            </div>
          ) : null}
        </section>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={t("confirmTitle")}
        confirmLabel={t("delete")}
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        <p>{t("confirmBody", { title: toDelete?.title || t("untitled") })}</p>
      </ConfirmDialog>
    </Shell>
  );
}

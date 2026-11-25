"use client";

// İlişki / Grup analizi çalışma alanı:
//   • Yorum Kaynakları — [Analiz Açıklamaları] [Bilgi Bankam] (+ yalnız admin: [Merkezi Bilgi Bankası Yorumu]).
//     Bu analiz türleri için hesaplama servisi metin yorumu sağlamaz → "Sistem Yorumu" sekmesi YOK (uydurma yok).
//   • Uzman Yorumu — analize özel; kaydet / düzenle; iyimser eşzamanlılık; boşaltma iki adımlı onay.
//   • Raporu Hazırla — içerik seçimi (hepsi varsayılan KAPALI) + Raporu Hazırlayan → donmuş rapor + indir.
//     Kayıtlı rapor tekrar indirilince değişmez; yeni içerik için yeni rapor. Android'de Word kapalı (mevcut kural).

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { EXPERT_COMMENT_MAX } from "@/lib/human-design/relations/relationExtras.shared";
import type { RelationComment, RelationReportListRow } from "@/lib/human-design/relations/relationExtras";
import type { RelationAnalysisView } from "@/lib/human-design/relations/relationService";
import {
  createRelationReport,
  downloadRelationReport,
  fetchRelationComment,
  fetchRelationReports,
  fetchRelationSources,
  saveRelationComment,
  type RelationSources,
} from "../helpers/relationsClient";
import { useRelationLabels } from "../helpers/useRelationLabels";
import { useRelationError } from "../helpers/useRelationError";

function dmyHm(iso: string, locale = "tr-TR"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}
const card = "rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm";

// ─── Yorum kaynakları ────────────────────────────────────────────────────────

export function RelationSourcesPanel({ id }: { id: string }) {
  const [state, setState] = useState<{ loading: boolean; data: RelationSources | null; error: string | null }>({ loading: true, data: null, error: null });
  const [tab, setTab] = useState<"analysis" | "expert" | "central">("analysis");
  const { t } = useRelationLabels();
  const errText = useRelationError();
  useEffect(() => {
    let alive = true;
    fetchRelationSources(id).then((r) => {
      if (alive) setState(r.ok ? { loading: false, data: r.sources, error: null } : { loading: false, data: null, error: errText(r) });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kimlik değişince yeniden okunur
  }, [id]);
  const d = state.data;
  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "analysis", label: t("sources.tabAnalysis") },
    { key: "expert", label: t("sources.tabExpert") },
    ...(d && d.central !== null ? [{ key: "central" as const, label: t("sources.tabCentral") }] : []),
  ];
  return (
    <section className={card} data-hd-rel-sources>
      <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("sources.title")}</h3>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            data-hd-rel-source-tab={tb.key}
            className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-bold sm:flex-none ${tab === tb.key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {state.loading ? <p className="text-xs text-slate-500">{t("sources.loading")}</p> : null}
      {state.error ? <p role="alert" className="text-xs font-semibold text-rose-700">{state.error}</p> : null}
      {d && tab === "analysis" ? (
        <div data-hd-rel-source="analysis" className="space-y-3">
          <p className="text-[11px] text-slate-500">{t("note.explanationSource")}</p>
          {d.analysis.map((sec) => (
            <div key={sec.key}>
              <p className="text-xs font-black text-slate-800">{sec.title}</p>
              <ul className="mt-1 space-y-1.5">
                {sec.items.map((it, i) => (
                  <li key={i} className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-700">
                    <b className="text-slate-900">{it.title}:</b> {it.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">{t("note.explanationDisclaimer")}</p>
        </div>
      ) : null}
      {d && tab === "expert" ? (
        <div data-hd-rel-source="expert" className="space-y-3">
          {d.expert.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">{t("sources.expertEmpty")}</p>
          ) : (
            d.expert.map((g) => (
              <div key={g.key} data-hd-rel-kb-group={g.scope}>
                <p className="text-xs font-black text-emerald-800">{g.title}</p>
                <p className="text-[10px] text-slate-500">{g.scope === "individual" ? t("sources.scopeIndividual", { person: g.person ?? "" }) : t("sources.scopeGeneral")}</p>
                <div className="mt-1 space-y-1.5">
                  {g.entries.map((e) => (
                    <article key={e.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2" data-hd-kb-code={e.code}>
                      <p className="text-xs font-bold text-slate-800">{e.title}</p>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{e.content}</p>
                      {e.expertNotes ? (
                        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{t("sources.privateNotes")}</p>
                          <p className="whitespace-pre-wrap text-xs text-slate-700">{e.expertNotes}</p>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
      {d && tab === "central" && d.central ? (
        <div data-hd-rel-source="central" className="space-y-1.5">
          {d.central.length === 0 ? <p className="text-xs text-slate-600">{t("sources.centralEmpty")}</p> : null}
          {d.central.map((e) => (
            <article key={e.key} className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2">
              <p className="text-xs font-bold text-slate-800">{e.title}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{e.text}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─── Uzman Yorumu ────────────────────────────────────────────────────────────

export function ExpertCommentEditor({ id }: { id: string }) {
  const { showToast } = useToast();
  const L = useRelationLabels();
  const t = L.t;
  const errText = useRelationError();
  const [loaded, setLoaded] = useState<RelationComment | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRelationComment(id).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setLoaded(r.comment);
        setText(r.comment.text ?? "");
      } else setLoadErr(errText(r));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kimlik değişince yeniden okunur
  }, [id]);
  const dirty = !!loaded && text !== (loaded.text ?? "");
  const save = useCallback(
    async (clear: boolean) => {
      if (!loaded || saving) return;
      setSaving(true);
      setError(null);
      const r = await saveRelationComment(id, clear ? "" : text, loaded.updatedAt, clear);
      setSaving(false);
      setConfirmClear(false);
      if (r.ok) {
        setLoaded(r.comment);
        setText(r.comment.text ?? "");
        showToast({ message: clear ? t("comment.deleted") : t("comment.saved"), type: "success" });
      } else {
        const msg = errText(r);
        setError(msg); // metin ekranda KALIR (kaybolmaz)
        showToast({ message: msg, type: "error" });
      }
    },
    [id, loaded, saving, text, showToast, t, errText],
  );
  if (loadErr) return <section className={card}><p role="alert" className="text-xs font-semibold text-rose-700">{loadErr}</p></section>;
  if (!loaded) return <section className={card}><p className="text-xs text-slate-500">{t("comment.loading")}</p></section>;
  if (!loaded.available) {
    return (
      <section className={card} data-hd-rel-comment="unavailable">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("comment.title")}</h3>
        <p className="mt-1 text-xs text-slate-600">{t("comment.unavailable")}</p>
      </section>
    );
  }
  const willClear = !text.trim() && !!loaded.text;
  return (
    <section className={card} data-hd-rel-comment="ready">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("comment.title")}</h3>
        <span className="text-[11px] text-slate-500">{loaded.updatedAt ? t("comment.lastSaved", { date: dmyHm(loaded.updatedAt, L.dateLocale) }) : t("comment.notSaved")}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{t("comment.hint")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, EXPERT_COMMENT_MAX))}
        rows={7}
        maxLength={EXPERT_COMMENT_MAX}
        className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-base leading-relaxed text-slate-900 sm:text-sm"
        placeholder={t("comment.placeholder")}
        aria-label={t("comment.title")}
        data-hd-rel-comment-input
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[11px] ${text.length > EXPERT_COMMENT_MAX * 0.95 ? "text-amber-700" : "text-slate-500"}`}>
          {text.length.toLocaleString(L.dateLocale)} / {EXPERT_COMMENT_MAX.toLocaleString(L.dateLocale)}
          {dirty ? t("comment.dirty") : ""}
        </span>
        {willClear ? (
          confirmClear ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-rose-700">{t("comment.willDelete")}</span>
              <button type="button" disabled={saving} onClick={() => void save(true)} className="min-h-[40px] rounded-xl bg-rose-600 px-3 text-xs font-bold text-white" data-hd-rel-comment-clear-confirm>{t("comment.confirmDelete")}</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600">{t("comment.cancel")}</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="min-h-[40px] rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700" data-hd-rel-comment-clear>{t("comment.delete")}</button>
          )
        ) : (
          <button type="button" disabled={!dirty || saving} onClick={() => void save(false)} className="min-h-[40px] rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50" data-hd-rel-comment-save>
            {saving ? t("comment.saving") : t("comment.save")}
          </button>
        )}
      </div>
      {error ? <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700" data-hd-rel-comment-error>{error}</p> : null}
    </section>
  );
}

// ─── Raporu Hazırla ──────────────────────────────────────────────────────────

export function RelationReportPanel({ id, analysis }: { id: string; analysis?: RelationAnalysisView }) {
  const { showToast } = useToast();
  const L = useRelationLabels();
  const t = L.t;
  const errText = useRelationError();
  const [rows, setRows] = useState<RelationReportListRow[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const reload = useCallback(() => {
    fetchRelationReports(id).then((r) => {
      if (r.ok) {
        setRows(r.rows);
        setAvailable(r.available);
      } else setRows([]);
    });
  }, [id]);
  useEffect(() => {
    reload();
  }, [reload]);
  const download = async (reportId: string) => {
    if (busy) return;
    setBusy(reportId);
    const r = await downloadRelationReport(reportId);
    setBusy("");
    if (!r.ok) showToast({ message: errText(r), type: "error" });
  };
  return (
    <section className={`${card} no-android`} data-hd-rel-reports>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">{t("reports.title")}</h3>
        <button type="button" onClick={() => setOpen(true)} disabled={!available} className="min-h-[40px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-black text-white disabled:opacity-50" data-hd-rel-report-open>
          {rows && rows.length ? t("reports.newReport") : t("reports.prepare")}
        </button>
      </div>
      {!available ? <p className="mt-1 text-[11px] text-slate-600">{t("reports.unavailable")}</p> : null}
      {rows && rows.length ? (
        <ul className="mt-2 divide-y divide-slate-100" data-hd-rel-report-list>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs" data-hd-rel-report-row={r.id}>
              <span className="min-w-0 text-slate-700">
                <b>{dmyHm(r.createdAt, L.dateLocale)}</b>
                <span className="block text-[11px] text-slate-500">
                  {[r.sections.analysis && t("reports.secAnalysis"), r.sections.knowledge && t("reports.secKnowledge"), r.sections.expertComment && t("reports.secComment")].filter(Boolean).join(" · ") || t("reports.technicalOnly")}
                  {r.preparedBy ? t("reports.preparedBy", { name: r.preparedBy }) : ""}
                  {r.image === "unavailable" ? t("reports.noImage") : ""}
                </span>
              </span>
              <button type="button" onClick={() => void download(r.id)} disabled={!!busy} className="min-h-[40px] rounded-xl border border-emerald-200 px-3 font-bold text-emerald-700 disabled:opacity-50" data-hd-rel-report-download={r.id}>
                {busy === r.id ? t("reports.downloading") : t("reports.download")}
              </button>
            </li>
          ))}
        </ul>
      ) : rows ? (
        <p className="mt-1 text-[11px] text-slate-500">{t("reports.none")}</p>
      ) : null}
      {open ? (
        <ReportDialog
          id={id}
          analysis={analysis}
          onClose={() => setOpen(false)}
          onCreated={async (newId, image) => {
            setOpen(false);
            reload();
            if (image.status !== "ok") showToast({ message: (L.isTr ? image.reason : null) ?? t("reports.noImageToast"), type: "warning" });
            await download(newId);
          }}
        />
      ) : null}
    </section>
  );
}

function ReportDialog({ id, analysis: a, onClose, onCreated }: { id: string; analysis?: RelationAnalysisView; onClose: () => void; onCreated: (id: string, image: { status: "ok" | "unavailable"; reason: string | null }) => void | Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  useHdModalA11y(ref, onClose);
  const { showToast } = useToast();
  const { t } = useRelationLabels();
  const errText = useRelationError();
  const [analysis, setAnalysis] = useState(false);
  const [knowledge, setKnowledge] = useState(false);
  const [comment, setComment] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [busy, setBusy] = useState(false);
  // Penta: rapor hatası pencerede KALIR (yalnız 4 sn'lik toast kaçırılabiliyordu). Connection akışı değişmez.
  const [pentaError, setPentaError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setPentaError(null);
    // Birleşik BodyGraph / Penta görseli sunucuda kayıtlı veriden ekrandaki sahneyle çizilir (tarayıcı yakalaması yok).
    const r = await createRelationReport(id, { analysis, knowledge, expert_comment: comment }, preparedBy);
    setBusy(false);
    if (r.ok) await onCreated(r.id, r.image);
    else {
      const msg = errText(r);
      showToast({ message: msg, type: "error" });
      if (a?.kind === "penta") {
        setPentaError(r.code === "NO_EXPERT_COMMENT" ? t("reports.noComment") : msg);
      }
    }
  };
  const box = (checked: boolean, set: (v: boolean) => void, label: string, attr: string) => (
    <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-indigo-600" data-hd-rel-report-opt={attr} />
      {label}
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="hd-rel-report-title" className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" data-hd-rel-report-dialog>
        <h2 id="hd-rel-report-title" className="text-base font-black text-slate-900">{t("reports.dialogTitle")}</h2>
        <p className="mt-1 text-xs text-slate-600">{a?.kind === "connection" ? t("reports.dialogIntroConnection") : t("reports.dialogIntroPenta")}</p>
        <div className="mt-3 space-y-2">
          {box(analysis, setAnalysis, t("reports.optAnalysis"), "analysis")}
          {box(knowledge, setKnowledge, t("reports.optKnowledge"), "knowledge")}
          {box(comment, (v) => { setComment(v); if (!v) setPentaError(null); }, t("reports.optComment"), "expert_comment")}
        </div>
        {pentaError ? <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700" data-hd-rel-report-error>{pentaError}</p> : null}
        <p className="mt-2 text-[11px] text-slate-500">{t("reports.systemNote")}</p>
        <label className="mt-3 block text-xs font-bold text-slate-700">
          {t("reports.preparedByLabel")}
          <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value.slice(0, 120))} maxLength={120} className="mt-1 h-10 w-full rounded-xl border border-indigo-200 px-3 text-base font-normal sm:text-sm" data-hd-rel-report-prepared />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">{t("reports.cancel")}</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50" data-hd-rel-report-create>
            {busy ? t("reports.preparing") : t("reports.prepareAndDownload")}
          </button>
        </div>
      </div>
    </div>
  );
}

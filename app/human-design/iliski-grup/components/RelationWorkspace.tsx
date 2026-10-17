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
import { ANALYSIS_EXPLANATION_DISCLAIMER, ANALYSIS_EXPLANATION_SOURCE } from "@/lib/human-design/relations/explanations";
import type { RelationComment, RelationReportListRow } from "@/lib/human-design/relations/relationExtras";
import type { RelationAnalysisView } from "@/lib/human-design/relations/relationService";
import type { HdConnectionResult } from "@/lib/human-design/relations/connection";
import { captureConnectionGraphic } from "../helpers/relationGraphicCapture";
import {
  createRelationReport,
  downloadRelationReport,
  fetchRelationComment,
  fetchRelationReports,
  fetchRelationSources,
  saveRelationComment,
  type RelationSources,
} from "../helpers/relationsClient";

function dmyHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}
const card = "rounded-2xl border border-indigo-100 bg-white/95 px-4 py-4 shadow-sm";

// ─── Yorum kaynakları ────────────────────────────────────────────────────────

export function RelationSourcesPanel({ id }: { id: string }) {
  const [state, setState] = useState<{ loading: boolean; data: RelationSources | null; error: string | null }>({ loading: true, data: null, error: null });
  const [tab, setTab] = useState<"analysis" | "expert" | "central">("analysis");
  useEffect(() => {
    let alive = true;
    fetchRelationSources(id).then((r) => {
      if (alive) setState(r.ok ? { loading: false, data: r.sources, error: null } : { loading: false, data: null, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  const d = state.data;
  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: "analysis", label: "Analiz Açıklamaları" },
    { key: "expert", label: "Bilgi Bankam" },
    ...(d && d.central !== null ? [{ key: "central" as const, label: "Merkezi Bilgi Bankası Yorumu" }] : []),
  ];
  return (
    <section className={card} data-hd-rel-sources>
      <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-700">Yorum Kaynakları</h3>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            data-hd-rel-source-tab={t.key}
            className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-bold sm:flex-none ${tab === t.key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {state.loading ? <p className="text-xs text-slate-500">Yükleniyor…</p> : null}
      {state.error ? <p role="alert" className="text-xs font-semibold text-rose-700">{state.error}</p> : null}
      {d && tab === "analysis" ? (
        <div data-hd-rel-source="analysis" className="space-y-3">
          <p className="text-[11px] text-slate-500">{ANALYSIS_EXPLANATION_SOURCE}</p>
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
          <p className="text-[11px] text-slate-500">{ANALYSIS_EXPLANATION_DISCLAIMER}</p>
        </div>
      ) : null}
      {d && tab === "expert" ? (
        <div data-hd-rel-source="expert" className="space-y-3">
          {d.expert.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">Bu analizin kanalları, Penta kapıları veya katılımcıların tip/otorite/profili için Bilgi Bankanızda henüz kayıt yok.</p>
          ) : (
            d.expert.map((g) => (
              <div key={g.key} data-hd-rel-kb-group={g.scope}>
                <p className="text-xs font-black text-emerald-800">{g.title}</p>
                <p className="text-[10px] text-slate-500">{g.scope === "individual" ? `Bireysel kayıt — yalnız ${g.person} için; ilişki/grup yorumu değildir.` : "Genel kayıt — ilişki/grup yorumu değildir."}</p>
                <div className="mt-1 space-y-1.5">
                  {g.entries.map((e) => (
                    <article key={e.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2" data-hd-kb-code={e.code}>
                      <p className="text-xs font-bold text-slate-800">{e.title}</p>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{e.content}</p>
                      {e.expertNotes ? (
                        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5">
                          <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Özel Çalışma Notları · yalnız size görünür, rapora eklenmez</p>
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
          {d.central.length === 0 ? <p className="text-xs text-slate-600">Bu analizin kanalları ve katılımcıların tip/otoritesi için yayınlanmış merkezî içerik yok.</p> : null}
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
      } else setLoadErr(r.error);
    });
    return () => {
      alive = false;
    };
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
        showToast({ message: clear ? "Uzman yorumu silindi." : "Uzman yorumu kaydedildi.", type: "success" });
      } else {
        setError(r.error); // metin ekranda KALIR (kaybolmaz)
        showToast({ message: r.error, type: "error" });
      }
    },
    [id, loaded, saving, text, showToast],
  );
  if (loadErr) return <section className={card}><p role="alert" className="text-xs font-semibold text-rose-700">{loadErr}</p></section>;
  if (!loaded) return <section className={card}><p className="text-xs text-slate-500">Uzman yorumu yükleniyor…</p></section>;
  if (!loaded.available) {
    return (
      <section className={card} data-hd-rel-comment="unavailable">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">Uzman Yorumu</h3>
        <p className="mt-1 text-xs text-slate-600">Uzman yorumu özelliği henüz etkin değil (veritabanı güncellemesi bekleniyor).</p>
      </section>
    );
  }
  const willClear = !text.trim() && !!loaded.text;
  return (
    <section className={card} data-hd-rel-comment="ready">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">Uzman Yorumu</h3>
        <span className="text-[11px] text-slate-500">{loaded.updatedAt ? `Son kayıt: ${dmyHm(loaded.updatedAt)}` : "Henüz kaydedilmedi"}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Bu analize özel mesleki yorumunuz. Word&apos;e yalnız rapor hazırlarken “Uzman Yorumumu Ekle” seçerseniz eklenir.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, EXPERT_COMMENT_MAX))}
        rows={7}
        maxLength={EXPERT_COMMENT_MAX}
        className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-base leading-relaxed text-slate-900 sm:text-sm"
        placeholder="Bu ilişki / grup için mesleki yorumunuzu yazın…"
        aria-label="Uzman Yorumu"
        data-hd-rel-comment-input
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[11px] ${text.length > EXPERT_COMMENT_MAX * 0.95 ? "text-amber-700" : "text-slate-500"}`}>
          {text.length.toLocaleString("tr-TR")} / {EXPERT_COMMENT_MAX.toLocaleString("tr-TR")}
          {dirty ? " · kaydedilmemiş değişiklik" : ""}
        </span>
        {willClear ? (
          confirmClear ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-rose-700">Kayıtlı yorum silinecek.</span>
              <button type="button" disabled={saving} onClick={() => void save(true)} className="min-h-[40px] rounded-xl bg-rose-600 px-3 text-xs font-bold text-white" data-hd-rel-comment-clear-confirm>Evet, sil</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600">Vazgeç</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="min-h-[40px] rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700" data-hd-rel-comment-clear>Yorumu Sil</button>
          )
        ) : (
          <button type="button" disabled={!dirty || saving} onClick={() => void save(false)} className="min-h-[40px] rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50" data-hd-rel-comment-save>
            {saving ? "Kaydediliyor…" : "Kaydet"}
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
    if (!r.ok) showToast({ message: r.error, type: "error" });
  };
  return (
    <section className={`${card} no-android`} data-hd-rel-reports>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-700">Raporlar</h3>
        <button type="button" onClick={() => setOpen(true)} disabled={!available} className="min-h-[40px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-black text-white disabled:opacity-50" data-hd-rel-report-open>
          {rows && rows.length ? "Yeni Rapor Hazırla" : "Raporu Hazırla"}
        </button>
      </div>
      {!available ? <p className="mt-1 text-[11px] text-slate-600">Kayıtlı rapor özelliği henüz etkin değil (veritabanı güncellemesi bekleniyor).</p> : null}
      {rows && rows.length ? (
        <ul className="mt-2 divide-y divide-slate-100" data-hd-rel-report-list>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs" data-hd-rel-report-row={r.id}>
              <span className="min-w-0 text-slate-700">
                <b>{dmyHm(r.createdAt)}</b>
                <span className="block text-[11px] text-slate-500">
                  {[r.sections.analysis && "Analiz Açıklamaları", r.sections.knowledge && "Bilgi Bankam", r.sections.expertComment && "Uzman Yorumu"].filter(Boolean).join(" · ") || "Yalnız teknik sonuçlar"}
                  {r.preparedBy ? ` · Hazırlayan: ${r.preparedBy}` : ""}
                  {r.image === "unavailable" ? " · görselsiz (kaynak veri yok)" : ""}
                </span>
              </span>
              <button type="button" onClick={() => void download(r.id)} disabled={!!busy} className="min-h-[40px] rounded-xl border border-emerald-200 px-3 font-bold text-emerald-700 disabled:opacity-50" data-hd-rel-report-download={r.id}>
                {busy === r.id ? "İndiriliyor…" : "Word İndir"}
              </button>
            </li>
          ))}
        </ul>
      ) : rows ? (
        <p className="mt-1 text-[11px] text-slate-500">Bu analiz için henüz rapor hazırlanmadı.</p>
      ) : null}
      {open ? (
        <ReportDialog
          id={id}
          analysis={analysis}
          onClose={() => setOpen(false)}
          onCreated={async (newId, image) => {
            setOpen(false);
            reload();
            if (image.status !== "ok") showToast({ message: image.reason ?? "Rapor görselsiz hazırlandı.", type: "warning" });
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
  const [analysis, setAnalysis] = useState(false);
  const [knowledge, setKnowledge] = useState(false);
  const [comment, setComment] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    // Connection: standart birleşik BodyGraph tarayıcıda kayıtlı sonuçla çizilip PNG olarak rapora DONDURULUR.
    // Yakalanamazsa rapor yine hazırlanır; Word'de Yaşam Sistemi şematik çizimi kullanılır (açıkça yazılır).
    let graphic: string | null = null;
    if (a && a.kind === "connection") {
      setStep("Birleşik BodyGraph hazırlanıyor…");
      const cap = await captureConnectionGraphic(a.id, a.result as HdConnectionResult, a.participants[0]?.name ?? "A", a.participants[1]?.name ?? "B");
      if (cap.ok) graphic = cap.dataUrl;
      else showToast({ message: `${cap.error} Raporda şematik çizim kullanılacak.`, type: "warning" });
    }
    setStep("Rapor hazırlanıyor…");
    const r = await createRelationReport(id, { analysis, knowledge, expert_comment: comment }, preparedBy, graphic);
    setStep("");
    setBusy(false);
    if (r.ok) await onCreated(r.id, r.image);
    else showToast({ message: r.error, type: "error" });
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
        <h2 id="hd-rel-report-title" className="text-base font-black text-slate-900">Raporu Hazırla</h2>
        <p className="mt-1 text-xs text-slate-600">Rapor her durumda katılımcıları, {a?.kind === "connection" ? "standart birleşik BodyGraph'ı" : "harita görselini"} ve teknik sonuçları içerir. Eklemek istediğiniz içerikleri seçin:</p>
        <div className="mt-3 space-y-2">
          {box(analysis, setAnalysis, "Analiz Açıklamalarını Ekle", "analysis")}
          {box(knowledge, setKnowledge, "Bilgi Bankamdaki Açıklamaları Ekle", "knowledge")}
          {box(comment, setComment, "Uzman Yorumumu Ekle", "expert_comment")}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Sistem Yorumu: bu analiz türü için hesaplama servisi metin yorumu sağlamadığından eklenemez. Özel çalışma notları rapora hiçbir zaman eklenmez.</p>
        <label className="mt-3 block text-xs font-bold text-slate-700">
          Raporu Hazırlayan (isteğe bağlı)
          <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value.slice(0, 120))} maxLength={120} className="mt-1 h-10 w-full rounded-xl border border-indigo-200 px-3 text-base font-normal sm:text-sm" data-hd-rel-report-prepared />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">Vazgeç</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50" data-hd-rel-report-create>
            {busy ? step || "Hazırlanıyor…" : "Raporu Hazırla ve İndir"}
          </button>
        </div>
      </div>
    </div>
  );
}

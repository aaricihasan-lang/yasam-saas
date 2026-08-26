"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { kupaBtnGhost, kupaBtnSuccess, kupaCard, kupaInput } from "../../components/KupaShell";
import { BigNoteEditorDialog } from "../../components/BigNoteEditorDialog";
import {
  createTopicNote,
  deleteTopicNote,
  listTopicNotes,
  updateTopicNote,
  type CuppingCitation,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingSource,
  type CuppingTopic,
  type CuppingTopicNote,
} from "../../lib/api";

/**
 * TOPIC READ VIEW — AMAÇ/RAHATSIZLIK OKUMA GÖRÜNÜMÜ (TEK KAYNAK).
 *
 * Aynı bileşen İKİ yerde kullanılır (duplicate read UI YOK):
 *   1. /kupa/amac-rehberi        → desktop (>=1024px) sağ panel (okuma modu)
 *   2. /kupa/amac-rehberi/[id]   → mobile/tablet ayrı okuma sayfası (edge-to-edge)
 *
 * Böylece "N kaynakta geçiyor" formal DISTINCT-source sayımı ve kaynak-kartı türetimi
 * TEK yerde yaşar; ileride UI değişirse iki versiyon oluşmaz.
 *
 * SEMANTİK: "Kaynaklar Ne Diyor?" = FORMAL cupping_topic_sources (yayın/uzman + atıf).
 *           "Notlarım" = cupping_topic_notes (kullanıcı notu; formal SAYIMA dahil DEĞİL).
 * DİL: "tedavi eder" hükmü üretilmez; kaynak yaklaşımı attribution ile verilir.
 *
 * RESPONSIVE NOT EDİTÖRÜ: not METNİ <1024px'te büyük (full-screen) editörle yazılır;
 * >=1024px'te mevcut inline textarea korunur (aynı nfNote state — duplicate alan YOK).
 */

/** source.source_type → kısa TR rozet (yayın/uzman ayrımı görünür). */
const SOURCE_TYPE_LABEL: Record<string, string> = {
  historical_primary: "Tarihsel Kaynak",
  historical_secondary: "Tarihsel Kaynak",
  book_monograph: "Kitap / Monografi",
  academic_article: "Akademik Makale",
  systematic_review: "Sistematik Derleme",
  clinical_study: "Klinik Çalışma",
  official_guidance: "Resmî Rehber",
  expert_educational: "Uzman / Eğitim",
};

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-600";
const chip =
  "inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800";

/** Uzun disclaimer'ı okuma modunda kaynak bölümüne taşımak için ilk cümleyi ayır. */
function firstSentence(d?: string | null): string {
  if (!d) return "";
  const m = d.match(/^[\s\S]*?\.(?=\s|$)/);
  return (m ? m[0] : d).trim();
}
function restAfterFirst(d?: string | null): string {
  if (!d) return "";
  const first = firstSentence(d);
  return d.slice(first.length).trim();
}

export function TopicReadView({
  topicId,
  topic,
  points,
  relations,
  sources,
  topicSources,
  relCitations,
  onEditTopic,
}: {
  topicId: string;
  topic: CuppingTopic | null;
  points: CuppingPoint[];
  relations: CuppingPointTopic[];
  sources: CuppingSource[];
  topicSources: CuppingCitation[];
  relCitations: Record<string, CuppingCitation[]>;
  /** Desktop okuma panelinde "Düzenle" (Gelişmiş) affordance'ı. Verilmezse gösterilmez. */
  onEditTopic?: () => void;
}) {
  const pointName = useCallback(
    (id: string) => points.find((p) => p.id === id)?.name ?? "?",
    [points],
  );
  const sourceById = useMemo(() => {
    const m = new Map<string, CuppingSource>();
    for (const s of sources) m.set(s.id, s);
    return m;
  }, [sources]);

  /** FORMAL distinct source sayısı (aynı kaynak tekrarı şişmez; kişisel notlar SAYMAZ). */
  const relSourceCount = useCallback(
    (relId: string) => new Set((relCitations[relId] ?? []).map((c) => c.source_id)).size,
    [relCitations],
  );
  const regionRows = useMemo(
    () =>
      relations
        .map((r) => ({ relId: r.id, pointId: r.point_id, count: relSourceCount(r.id) }))
        .sort((a, b) => b.count - a.count),
    [relations, relSourceCount],
  );

  /** FORMAL kaynak kartları — topic-source'lı her DISTINCT source (hard-code YOK). */
  const sourceApproaches = useMemo(() => {
    const pointsBySource = new Map<string, Set<string>>();
    for (const r of relations) {
      for (const c of relCitations[r.id] ?? []) {
        let set = pointsBySource.get(c.source_id);
        if (!set) {
          set = new Set();
          pointsBySource.set(c.source_id, set);
        }
        set.add(r.point_id);
      }
    }
    const seen = new Set<string>();
    const out: { sourceId: string; note?: string | null; locator?: string | null; pointIds: string[] }[] = [];
    for (const ts of topicSources) {
      if (seen.has(ts.source_id)) continue;
      seen.add(ts.source_id);
      out.push({
        sourceId: ts.source_id,
        note: ts.note as string | null,
        locator: ts.locator as string | null,
        pointIds: Array.from(pointsBySource.get(ts.source_id) ?? []),
      });
    }
    return out;
  }, [topicSources, relations, relCitations]);

  // ── Kullanıcı notları (formal citation'dan AYRI; bu bileşen sahiplenir) ──
  const [notes, setNotes] = useState<CuppingTopicNote[]>([]);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [nfNote, setNfNote] = useState("");
  const [nfRegions, setNfRegions] = useState<string[]>([]);
  const [nfSource, setNfSource] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteTextEditor, setNoteTextEditor] = useState(false); // mobil büyük editör

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // topicId değişince eski notları/formu temizle (async gövde → cascading-render değil).
      if (!cancelled) {
        setNotes([]);
        setShowNoteForm(false);
        setNoteId(null);
      }
      if (!topicId) return;
      try {
        const ns = await listTopicNotes(topicId);
        if (!cancelled) setNotes(ns);
      } catch {
        /* okuma görünümü kritik değil */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const closeNoteForm = useCallback(() => {
    setShowNoteForm(false);
    setNoteId(null);
    setNfNote("");
    setNfRegions([]);
    setNfSource("");
    setNoteError(null);
  }, []);
  const openNewNote = useCallback(() => {
    setNoteId(null);
    setNfNote("");
    setNfRegions([]);
    setNfSource("");
    setShowNoteForm(true);
    setNoteError(null);
  }, []);
  const openEditNote = useCallback((n: CuppingTopicNote) => {
    setNoteId(n.id);
    setNfNote(n.note ?? "");
    setNfRegions(n.point_ids ?? []);
    setNfSource(n.source_label ?? "");
    setShowNoteForm(true);
    setNoteError(null);
  }, []);
  const toggleNfRegion = useCallback((pid: string) => {
    setNfRegions((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));
  }, []);
  const handleSaveNote = useCallback(async () => {
    if (!topicId || !nfNote.trim()) {
      setNoteError("Not metni gerekli.");
      return;
    }
    setNoteBusy(true);
    try {
      if (noteId) {
        await updateTopicNote(noteId, {
          note: nfNote.trim(),
          source_label: nfSource.trim() || null,
          point_ids: nfRegions,
        });
      } else {
        await createTopicNote({
          topic_id: topicId,
          note: nfNote.trim(),
          source_label: nfSource.trim() || null,
          point_ids: nfRegions,
        });
      }
      closeNoteForm();
      const ns = await listTopicNotes(topicId);
      setNotes(ns);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Not kaydedilemedi.");
    } finally {
      setNoteBusy(false);
    }
  }, [topicId, nfNote, nfSource, nfRegions, noteId, closeNoteForm]);
  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        await deleteTopicNote(id);
        setNotes((cur) => cur.filter((n) => n.id !== id));
        if (noteId === id) closeNoteForm();
      } catch (e) {
        setNoteError(e instanceof Error ? e.message : "Not silinemedi.");
      }
    },
    [noteId, closeNoteForm],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Başlık */}
      {topic ? (
        <div className={kupaCard}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight text-slate-900">{topic.title}</h2>
              {topic.category ? (
                <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  {topic.category}
                </span>
              ) : null}
              {topic.description ? (
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">
                  {firstSentence(topic.description)}
                </p>
              ) : null}
              <p className="mt-1.5 text-[10.5px] text-slate-400">
                Bilgiler kaynaklar ve kullanıcı notlarından derlenir.
              </p>
            </div>
            {onEditTopic ? (
              <button
                type="button"
                onClick={onEditTopic}
                className="shrink-0 text-[11px] font-semibold text-slate-400 transition hover:text-amber-700"
              >
                Düzenle
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 2. İlişkili Bölgeler */}
      {regionRows.length > 0 ? (
        <div className={kupaCard}>
          <h3 className="mb-2.5 text-[13px] font-bold text-slate-700">İlişkili Bölgeler</h3>
          <div className="flex flex-wrap gap-2">
            {regionRows.map((rr) => (
              <div key={rr.relId} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">{pointName(rr.pointId)}</span>
                {rr.count >= 2 ? (
                  <span className="mt-0.5 block text-[10.5px] font-medium text-amber-700">
                    {rr.count} kaynakta geçiyor
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3. Kaynaklar Ne Diyor? (FORMAL) */}
      {sourceApproaches.length > 0 ? (
        <div className={kupaCard}>
          <h3 className="text-[13px] font-bold text-slate-700">Kaynaklar Ne Diyor?</h3>
          {topic?.description && restAfterFirst(topic.description) ? (
            <p className="mt-1 text-[10.5px] italic text-slate-400">
              {restAfterFirst(topic.description)}
            </p>
          ) : null}
          <div className="mt-2.5 space-y-3">
            {sourceApproaches.map((sa) => {
              const s = sourceById.get(sa.sourceId);
              return (
                <div
                  key={sa.sourceId}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900">
                      {s?.source_name ?? "(kaynak)"}
                    </span>
                    {s?.source_type ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {SOURCE_TYPE_LABEL[s.source_type] ?? s.source_type}
                      </span>
                    ) : null}
                  </div>
                  {sa.note ? (
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{sa.note}</p>
                  ) : null}
                  {sa.pointIds.length > 0 ? (
                    <div className="mt-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Geçen Bölgeler
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {sa.pointIds.map((pid) => (
                          <span key={pid} className={chip}>
                            {pointName(pid)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10.5px] text-slate-400">
                    Kaynak: {s?.source_name ?? "—"}
                    {sa.locator ? ` · ${String(sa.locator)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 4. Notlarım (kullanıcı/uzman notu — formal citation'dan AYRI) */}
      <div className={kupaCard}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold text-slate-700">Notlarım</h3>
          {!showNoteForm ? (
            <button
              type="button"
              onClick={openNewNote}
              className="text-[12px] font-semibold text-amber-700 transition hover:text-amber-800"
            >
              + Yeni Bilgi / Not Ekle
            </button>
          ) : null}
        </div>

        {noteError ? (
          <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
            {noteError}
          </div>
        ) : null}

        {notes.length === 0 && !showNoteForm ? (
          <p className="text-[12px] text-slate-400">Henüz not eklenmedi.</p>
        ) : null}

        <div className="space-y-2.5">
          {notes.map((n) => (
            <div key={n.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-bold text-emerald-800">
                  {n.source_label?.trim() ? n.source_label : "Kendi Notum"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditNote(n)}
                    className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-700"
                  >
                    düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(n.id)}
                    className="text-[11px] font-semibold text-rose-600 transition hover:text-rose-700"
                  >
                    sil
                  </button>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">{n.note}</p>
              {n.point_ids && n.point_ids.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.point_ids.map((pid) => (
                    <span key={pid} className={chip}>
                      {pointName(pid)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Yeni / düzenle not formu */}
        {showNoteForm ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="mb-2.5 text-[12px] font-bold text-slate-700">
              {noteId ? "Notu Düzenle" : "Yeni Bilgi / Not"}
            </h4>

            {/* Not METNİ: <1024px büyük (full-screen) editör tetikleyicisi; >=1024px inline textarea. */}
            <span className={labelCls}>Not</span>
            {/* Mobile/tablet: büyük editör kartı */}
            <button
              type="button"
              onClick={() => setNoteTextEditor(true)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 lg:hidden"
            >
              {nfNote.trim() ? (
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-slate-700">
                    {nfNote.trim().length} karakterlik not
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-[11.5px] leading-snug text-slate-400">
                    {nfNote.trim()}
                  </span>
                </span>
              ) : (
                <span className="text-[13px] text-slate-400">
                  Not yazmak için tıklayın (büyük ekran)
                </span>
              )}
              <span className="shrink-0 text-[11px] font-semibold text-amber-700">
                {nfNote.trim() ? "Düzenle" : "Yaz"}
              </span>
            </button>
            {/* Desktop: mevcut inline textarea (davranış korunur) */}
            <textarea
              value={nfNote}
              onChange={(e) => setNfNote(e.target.value)}
              rows={3}
              placeholder="Bu rahatsızlık için kendi bilgin / yöntemin…"
              className={`${kupaInput} hidden lg:block`}
            />

            {regionRows.length > 0 ? (
              <div className="mt-2.5">
                <span className={labelCls}>İlgili Bölgeler</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {regionRows.map((rr) => {
                    const on = nfRegions.includes(rr.pointId);
                    return (
                      <button
                        key={rr.relId}
                        type="button"
                        onClick={() => toggleNfRegion(rr.pointId)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                          on
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-500 hover:border-emerald-200"
                        }`}
                      >
                        {pointName(rr.pointId)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-2.5">
              <label className={labelCls} htmlFor="nf-source">
                Kaynak / Kimden öğrendim
              </label>
              <input
                id="nf-source"
                value={nfSource}
                onChange={(e) => setNfSource(e.target.value)}
                placeholder="Örn. Kendi Notum, Ahmet Yılmaz…"
                className={kupaInput}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={noteBusy || !nfNote.trim()}
                className={kupaBtnSuccess}
              >
                {noteBusy ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button type="button" onClick={closeNoteForm} disabled={noteBusy} className={kupaBtnGhost}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Not metni büyük editörü (mobile/tablet) — aynı nfNote state'ine yazar. */}
      {noteTextEditor ? (
        <BigNoteEditorDialog
          open
          title="Not"
          value={nfNote}
          placeholder="Bu rahatsızlık için kendi bilgin / yöntemin…"
          onSave={(t) => {
            setNfNote(t);
            setNoteTextEditor(false);
          }}
          onCancel={() => setNoteTextEditor(false)}
        />
      ) : null}
    </div>
  );
}

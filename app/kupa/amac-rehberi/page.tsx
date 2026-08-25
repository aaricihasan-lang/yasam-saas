"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  KupaShell,
  kupaBtnGhost,
  kupaBtnPrimary,
  kupaBtnSuccess,
  kupaCard,
  kupaInput,
} from "../components/KupaShell";
import { CuppingCitationManager } from "../components/CitationManager";
import {
  createPointTopic,
  createTopic,
  createTopicNote,
  deletePointTopic,
  deleteTopicNote,
  listCitations,
  listPoints,
  listPointTopics,
  listSources,
  listTopicNotes,
  listTopics,
  updatePointTopic,
  updateTopic,
  updateTopicNote,
  type CuppingCitation,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingSource,
  type CuppingTopic,
  type CuppingTopicNote,
} from "../lib/api";
import { CUPPING_RELATION_STRENGTHS } from "@/lib/cupping/vocab";

/**
 * AMAÇ / RAHATSIZLIK REHBERİ — SADE OKUMA MODU (default) + Gelişmiş Düzenleme (toggle).
 *
 * Okuma modu (uygulayıcıya dönük): rahatsızlık açılınca önce BİLGİ görünür —
 *   ilişkili bölgeler, kaynakların yaklaşımı (formal), ve kullanıcının kendi notları.
 *   Teknik yönetim (citation/relation/evidence/locator formları) "Gelişmiş Düzenleme"
 *   altında; okuma modunda görünmez ama SİLİNMEZ, davranışı değişmez.
 *
 * SEMANTİK AYRIM:
 *   - "Kaynaklar Ne Diyor?" = FORMAL cupping_topic_sources (yayın/uzman kaynağı + atıf).
 *   - "Notlarım" = cupping_topic_notes (kullanıcı/uzman notu; formal değil, tenant-local).
 *   Formal "N kaynakta geçiyor" sayısı yalnız formal citation'lardan gelir; notlar SAYMAZ.
 *
 * DİL: "tedavi eder" hükmü ÜRETİLMEZ; kaynak yaklaşımı attribution ile verilir.
 */

const RELATION_STRENGTH_LABEL: Record<string, string> = {
  traditional_primary: "Geleneksel Birincil İlişki",
  traditional_secondary: "Geleneksel İkincil İlişki",
  historically_associated: "Tarihsel Olarak İlişkili",
  modern_supported: "Modern Kaynaklarla Desteklenen",
};
const RELATION_STRENGTH_OPTIONS = CUPPING_RELATION_STRENGTHS.map((value) => ({
  value,
  label: RELATION_STRENGTH_LABEL[value] ?? value,
}));

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

const TOPIC_CATEGORY_OPTIONS = [
  "Kas & İskelet",
  "Baş & Boyun",
  "Sindirim",
  "Solunum",
  "Dolaşım",
  "Kadın Sağlığı",
  "Genel / Koruyucu",
  "Psikolojik / Duygusal",
];
const CATEGORY_OTHER = "__other__";

type TopicForm = {
  title: string;
  categorySelect: string;
  categoryOther: string;
  description: string;
  notes: string;
  source_note: string;
};
const EMPTY_TOPIC_FORM: TopicForm = {
  title: "",
  categorySelect: "",
  categoryOther: "",
  description: "",
  notes: "",
  source_note: "",
};
function topicToForm(t: CuppingTopic): TopicForm {
  const cat = t.category ?? "";
  const known = cat === "" || TOPIC_CATEGORY_OPTIONS.includes(cat);
  return {
    title: t.title ?? "",
    categorySelect: cat === "" ? "" : known ? cat : CATEGORY_OTHER,
    categoryOther: known ? "" : cat,
    description: t.description ?? "",
    notes: t.notes ?? "",
    source_note: t.source_note ?? "",
  };
}
function formToTopicBody(f: TopicForm): Partial<CuppingTopic> {
  const category =
    f.categorySelect === CATEGORY_OTHER ? f.categoryOther.trim() : f.categorySelect.trim();
  return {
    title: f.title.trim(),
    category: category || null,
    description: f.description.trim() || null,
    notes: f.notes.trim() || null,
    source_note: f.source_note.trim() || null,
  };
}

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

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-600";
const helperCls = "mt-1 text-[10.5px] leading-snug text-slate-400";
const chip =
  "inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800";

export default function AmacRehberiPage() {
  // useSearchParams (?topic=) statik prerender'da Suspense sınırı ister.
  return (
    <Suspense fallback={null}>
      <AmacRehberiInner />
    </Suspense>
  );
}

function AmacRehberiInner() {
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");

  const [topics, setTopics] = useState<CuppingTopic[]>([]);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [relations, setRelations] = useState<CuppingPointTopic[]>([]);

  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState("");

  const [topicFormMode, setTopicFormMode] = useState<"create" | "edit" | null>(null);
  const [topicForm, setTopicForm] = useState<TopicForm>(EMPTY_TOPIC_FORM);
  const [topicSaving, setTopicSaving] = useState(false);

  const [linkPointId, setLinkPointId] = useState("");
  const [linkStrength, setLinkStrength] = useState("");
  const [linkNote, setLinkNote] = useState("");

  const [editRelId, setEditRelId] = useState<string | null>(null);
  const [editStrength, setEditStrength] = useState("");
  const [editNote, setEditNote] = useState("");
  const [citeRelId, setCiteRelId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Okuma-modu verisi (formal): topic-source (yaklaşım) + her ilişkinin point-topic citation'ları + kaynak kataloğu.
  const [sources, setSources] = useState<CuppingSource[]>([]);
  const [topicSources, setTopicSources] = useState<CuppingCitation[]>([]);
  const [relCitations, setRelCitations] = useState<Record<string, CuppingCitation[]>>({});

  // Kullanıcı notları (formal citation'dan AYRI)
  const [notes, setNotes] = useState<CuppingTopicNote[]>([]);
  const [noteId, setNoteId] = useState<string | null>(null); // düzenlenen not
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [nfNote, setNfNote] = useState("");
  const [nfRegions, setNfRegions] = useState<string[]>([]);
  const [nfSource, setNfSource] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const pointName = useCallback(
    (id: string) => points.find((p) => p.id === id)?.name ?? "?",
    [points],
  );
  const pointMeta = useCallback(
    (id: string) => points.find((p) => p.id === id) ?? null,
    [points],
  );
  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) ?? null,
    [topics, selectedTopicId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, p] = await Promise.all([listTopics(), listPoints()]);
        if (cancelled) return;
        setTopics(t);
        setPoints(p);
        // ?topic=<id> verildiyse (yeni kayıt sonrası dönüş) onu seç; yoksa ilk kayıt.
        const preselect = topicParam && t.some((x) => x.id === topicParam) ? topicParam : "";
        setSelectedTopicId((cur) => cur || preselect || t[0]?.id || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedTopicId) {
        if (!cancelled) setRelations([]);
        return;
      }
      try {
        const rel = await listPointTopics({ topicId: selectedTopicId });
        if (!cancelled) setRelations(rel);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "İlişki yükleme hatası.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId]);

  // Formal kaynak-karşılaştırma verisi + kullanıcı notları (paralel).
  const [dataNonce, setDataNonce] = useState(0);
  const reloadReadData = useCallback(() => setDataNonce((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedTopicId) return;
      try {
        const [srcs, tCits, relPairs, ns] = await Promise.all([
          listSources(),
          listCitations("topic", selectedTopicId),
          Promise.all(
            relations.map(async (r) => [r.id, await listCitations("point-topic", r.id)] as const),
          ),
          listTopicNotes(selectedTopicId),
        ]);
        if (cancelled) return;
        setSources(srcs);
        setTopicSources(tCits);
        setRelCitations(Object.fromEntries(relPairs));
        setNotes(ns);
      } catch {
        /* okuma görünümü kritik değil; düzenlemeyi bozma */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId, relations, dataNonce]);

  const relatedPointIds = useMemo(() => new Set(relations.map((r) => r.point_id)), [relations]);
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

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return q ? topics.filter((t) => t.title.toLocaleLowerCase("tr").includes(q)) : topics;
  }, [topics, search]);

  const closeNoteForm = useCallback(() => {
    setShowNoteForm(false);
    setNoteId(null);
    setNfNote("");
    setNfRegions([]);
    setNfSource("");
  }, []);

  const selectTopic = useCallback(
    (id: string) => {
      setSelectedTopicId(id);
      setEditRelId(null);
      setCiteRelId(null);
      setTopicFormMode(null);
      setError(null);
      setTopicSources([]);
      setRelCitations({});
      setNotes([]);
      closeNoteForm();
    },
    [closeNoteForm],
  );

  // ── Topic (Gelişmiş) ──
  // Yeni kayıt AYRI sayfada (/kupa/amac-rehberi/yeni). Gelişmiş form yalnız EDIT içindir.
  const openEditTopic = useCallback(() => {
    if (!selectedTopic) return;
    setError(null);
    setTopicForm(topicToForm(selectedTopic));
    setTopicFormMode("edit");
  }, [selectedTopic]);
  const handleSaveTopic = useCallback(async () => {
    const body = formToTopicBody(topicForm);
    if (!body.title) {
      setError("Konu başlığı gerekli.");
      return;
    }
    setTopicSaving(true);
    try {
      if (topicFormMode === "edit" && selectedTopicId) {
        const updated = await updateTopic(selectedTopicId, body);
        setTopics((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await createTopic(body);
        setTopics((cur) => [...cur, created]);
        setSelectedTopicId(created.id);
      }
      setTopicFormMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konu kaydedilemedi.");
    } finally {
      setTopicSaving(false);
    }
  }, [topicForm, topicFormMode, selectedTopicId]);

  // ── İlişki (Gelişmiş) ──
  const handleLink = useCallback(async () => {
    if (!selectedTopicId || !linkPointId) return;
    if (relatedPointIds.has(linkPointId)) return;
    try {
      const rel = await createPointTopic({
        topic_id: selectedTopicId,
        point_id: linkPointId,
        relation_strength: linkStrength || null,
        note: linkNote.trim() || null,
      });
      setRelations((cur) => [...cur, rel]);
      setLinkPointId("");
      setLinkStrength("");
      setLinkNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bağlanamadı.");
    }
  }, [selectedTopicId, linkPointId, linkStrength, linkNote, relatedPointIds]);
  const openEditRelation = useCallback((r: CuppingPointTopic) => {
    setEditRelId(r.id);
    setEditStrength(r.relation_strength ?? "");
    setEditNote(r.note ?? "");
  }, []);
  const handleSaveRelation = useCallback(
    async (relId: string) => {
      try {
        const updated = await updatePointTopic(relId, {
          relation_strength: editStrength || null,
          note: editNote.trim() || null,
        });
        setRelations((cur) => cur.map((r) => (r.id === relId ? { ...r, ...updated } : r)));
        setEditRelId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "İlişki güncellenemedi.");
      }
    },
    [editStrength, editNote],
  );
  const handleUnlink = useCallback(async (relId: string) => {
    try {
      await deletePointTopic(relId);
      setRelations((cur) => cur.filter((r) => r.id !== relId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaldırılamadı.");
    }
  }, []);

  // ── Kullanıcı notları (okuma modu) ──
  const openNewNote = useCallback(() => {
    setNoteId(null);
    setNfNote("");
    setNfRegions([]);
    setNfSource("");
    setShowNoteForm(true);
    setError(null);
  }, []);
  const openEditNote = useCallback((n: CuppingTopicNote) => {
    setNoteId(n.id);
    setNfNote(n.note ?? "");
    setNfRegions(n.point_ids ?? []);
    setNfSource(n.source_label ?? "");
    setShowNoteForm(true);
    setError(null);
  }, []);
  const toggleNfRegion = useCallback((pid: string) => {
    setNfRegions((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));
  }, []);
  const handleSaveNote = useCallback(async () => {
    if (!selectedTopicId || !nfNote.trim()) {
      setError("Not metni gerekli.");
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
          topic_id: selectedTopicId,
          note: nfNote.trim(),
          source_label: nfSource.trim() || null,
          point_ids: nfRegions,
        });
      }
      closeNoteForm();
      reloadReadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not kaydedilemedi.");
    } finally {
      setNoteBusy(false);
    }
  }, [selectedTopicId, nfNote, nfSource, nfRegions, noteId, closeNoteForm, reloadReadData]);
  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        await deleteTopicNote(id);
        setNotes((cur) => cur.filter((n) => n.id !== id));
        if (noteId === id) closeNoteForm();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Not silinemedi.");
      }
    },
    [noteId, closeNoteForm],
  );

  return (
    <KupaShell
      title="Amaç / Rahatsızlık Rehberi"
      subtitle="Rahatsızlığı seç → ilişkili bölgeleri, kaynakların yaklaşımını ve kendi notlarını gör. (Bilgi rehberidir; 'tedavi eder' anlamı taşımaz.)"
      breadcrumb={[{ label: "Amaç / Rahatsızlık Rehberi" }]}
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* SOL: Rahatsızlıklar + arama */}
        <div className={kupaCard}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Rahatsızlıklar</h3>
            <Link
              href="/kupa/amac-rehberi/yeni"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-800 no-underline transition hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              + Yeni Kayıt
            </Link>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rahatsızlık ara…"
            className={`${kupaInput} mb-2`}
          />
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-1 py-2 text-xs text-slate-400">Yükleniyor…</p>
            ) : filteredTopics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
                <p className="text-xs text-slate-500">Kayıt yok.</p>
              </div>
            ) : (
              filteredTopics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTopic(t.id)}
                  className={`block w-full truncate rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    selectedTopicId === t.id
                      ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/50"
                  }`}
                >
                  <span className="truncate">{t.title}</span>
                  {t.category ? (
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">
                      {t.category}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        {/* SAĞ */}
        <div className="flex flex-col gap-4">
          {selectedTopicId ? (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAdvanced((a) => !a)}
                aria-pressed={advanced}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  advanced
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:text-amber-700"
                }`}
              >
                {advanced ? "← Okuma Modu" : "Gelişmiş Düzenleme"}
              </button>
            </div>
          ) : null}

          {!selectedTopicId ? (
            <div className={`${kupaCard} flex min-h-[240px] items-center justify-center`}>
              <p className="text-sm text-slate-400">Soldan bir rahatsızlık seçin.</p>
            </div>
          ) : advanced ? (
            /* ══════════ GELİŞMİŞ DÜZENLEME — mevcut teknik yönetim (KORUNDU, tam işlevsel) ══════════ */
            <>
              {topicFormMode ? (
                <div className={kupaCard}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {topicFormMode === "edit" ? "Konuyu Düzenle" : "Yeni Konu"}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="topic-title">
                        Başlık <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="topic-title"
                        value={topicForm.title}
                        onChange={(e) => setTopicForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Örn. Bel ağrısı"
                        className={kupaInput}
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="topic-category">
                        Kategori
                      </label>
                      <select
                        id="topic-category"
                        value={topicForm.categorySelect}
                        onChange={(e) => setTopicForm((f) => ({ ...f, categorySelect: e.target.value }))}
                        className={kupaInput}
                      >
                        <option value="">— seçilmedi —</option>
                        {TOPIC_CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value={CATEGORY_OTHER}>Diğer (serbest)…</option>
                      </select>
                      {topicForm.categorySelect === CATEGORY_OTHER ? (
                        <input
                          value={topicForm.categoryOther}
                          onChange={(e) => setTopicForm((f) => ({ ...f, categoryOther: e.target.value }))}
                          placeholder="Kategori adı"
                          className={`${kupaInput} mt-1.5`}
                        />
                      ) : null}
                      <p className={helperCls}>Konunun sınıfı (UI seçenekleri; serbest için “Diğer”).</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="topic-desc">
                        Açıklama
                      </label>
                      <textarea
                        id="topic-desc"
                        value={topicForm.description}
                        onChange={(e) => setTopicForm((f) => ({ ...f, description: e.target.value }))}
                        rows={3}
                        className={kupaInput}
                      />
                      <p className={helperCls}>Bu amacın/konunun genel açıklaması.</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="topic-notes">
                        Profesyonel / Çalışma Notu
                      </label>
                      <textarea
                        id="topic-notes"
                        value={topicForm.notes}
                        onChange={(e) => setTopicForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        className={kupaInput}
                      />
                      <p className={helperCls}>Uzman çalışma notu (iç kullanım).</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="topic-src">
                        Serbest Kaynak Notu
                      </label>
                      <textarea
                        id="topic-src"
                        value={topicForm.source_note}
                        onChange={(e) => setTopicForm((f) => ({ ...f, source_note: e.target.value }))}
                        rows={3}
                        className={kupaInput}
                      />
                      <p className={helperCls}>
                        Yapısal kaynaklandırma için aşağıdaki Kaynaklar bölümünü kullanın. Bu alan yalnız
                        serbest/editöryal kaynak notu içindir.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTopic}
                      disabled={topicSaving || !topicForm.title.trim()}
                      className={kupaBtnSuccess}
                    >
                      {topicSaving ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopicFormMode(null)}
                      disabled={topicSaving}
                      className={kupaBtnGhost}
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedTopic ? (
                <div className={kupaCard}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-tight text-slate-900">
                        {selectedTopic.title}
                      </h2>
                      {selectedTopic.category ? (
                        <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                          {selectedTopic.category}
                        </span>
                      ) : null}
                      {selectedTopic.description ? (
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          {selectedTopic.description}
                        </p>
                      ) : null}
                      {selectedTopic.notes ? (
                        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Çalışma Notu
                          </span>
                          <p className="text-[12px] leading-relaxed text-slate-600">{selectedTopic.notes}</p>
                        </div>
                      ) : null}
                      {selectedTopic.source_note ? (
                        <p className="mt-1.5 text-[11px] italic text-slate-400">
                          Kaynak notu: {selectedTopic.source_note}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={openEditTopic}
                      className="shrink-0 text-[11px] font-semibold text-amber-700 transition hover:text-amber-800"
                    >
                      düzenle
                    </button>
                  </div>
                  <CuppingCitationManager entity="topic" entityId={selectedTopicId} />
                </div>
              ) : null}

              <div className={kupaCard}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    İlişkili Noktalar
                  </h3>
                  <span className="text-[11px] font-medium text-slate-500">
                    <span className="font-bold text-amber-800">{relations.length}</span> nokta
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="link-point">
                      Nokta
                    </label>
                    <select
                      id="link-point"
                      value={linkPointId}
                      onChange={(e) => setLinkPointId(e.target.value)}
                      className={kupaInput}
                    >
                      <option value="">— nokta seç —</option>
                      {points
                        .filter((p) => !relatedPointIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.code ? ` (${p.code})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="link-strength">
                      İlişki Türü
                    </label>
                    <select
                      id="link-strength"
                      value={linkStrength}
                      onChange={(e) => setLinkStrength(e.target.value)}
                      className={kupaInput}
                    >
                      <option value="">Belirtilmedi</option>
                      {RELATION_STRENGTH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className={helperCls}>
                      Bu değer, noktanın seçili amaç/konu ile ilişkisinin türünü belirtir.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="link-note">
                      İlişki Açıklaması
                    </label>
                    <textarea
                      id="link-note"
                      value={linkNote}
                      onChange={(e) => setLinkNote(e.target.value)}
                      rows={2}
                      placeholder="Kaynakta bu nokta, ilgili amaç için yardımcı/ikincil nokta olarak belirtiliyor."
                      className={kupaInput}
                    />
                    <p className={helperCls}>
                      Bu noktanın seçili amaçla neden veya hangi bağlamda ilişkilendirildiğini yazın.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleLink}
                      disabled={!linkPointId}
                      className={kupaBtnPrimary}
                    >
                      Bağla
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {relations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
                      <p className="text-xs text-slate-500">Bu konuya bağlı nokta yok.</p>
                    </div>
                  ) : (
                    relations.map((r) => {
                      const p = pointMeta(r.point_id);
                      const isEditing = editRelId === r.id;
                      return (
                        <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-slate-800">
                                  {pointName(r.point_id)}
                                </span>
                                {p?.code ? (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                    {p.code}
                                  </span>
                                ) : null}
                                {r.relation_strength ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                    {RELATION_STRENGTH_LABEL[r.relation_strength] ?? r.relation_strength}
                                  </span>
                                ) : null}
                              </div>
                              {p?.anatomical_region ? (
                                <p className="mt-0.5 text-[11px] text-slate-400">{p.anatomical_region}</p>
                              ) : null}
                              {!isEditing && r.note ? (
                                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{r.note}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => (isEditing ? setEditRelId(null) : openEditRelation(r))}
                                className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-700"
                              >
                                {isEditing ? "kapat" : "düzenle"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCiteRelId((cur) => (cur === r.id ? null : r.id))}
                                aria-expanded={citeRelId === r.id}
                                className="text-[11px] font-semibold text-amber-700 transition hover:text-amber-800"
                              >
                                kaynaklar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnlink(r.id)}
                                className="text-[11px] font-semibold text-rose-600 transition hover:text-rose-700"
                              >
                                kaldır
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="mt-2.5 grid grid-cols-1 gap-2 rounded-lg border border-amber-100 bg-amber-50/40 p-2.5 sm:grid-cols-2">
                              <div>
                                <label className={labelCls} htmlFor={`edit-strength-${r.id}`}>
                                  İlişki Türü
                                </label>
                                <select
                                  id={`edit-strength-${r.id}`}
                                  value={editStrength}
                                  onChange={(e) => setEditStrength(e.target.value)}
                                  className={kupaInput}
                                >
                                  <option value="">Belirtilmedi</option>
                                  {RELATION_STRENGTH_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <label className={labelCls} htmlFor={`edit-note-${r.id}`}>
                                  İlişki Açıklaması
                                </label>
                                <textarea
                                  id={`edit-note-${r.id}`}
                                  value={editNote}
                                  onChange={(e) => setEditNote(e.target.value)}
                                  rows={2}
                                  className={kupaInput}
                                />
                              </div>
                              <div className="flex items-center gap-2 sm:col-span-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveRelation(r.id)}
                                  className={kupaBtnSuccess}
                                >
                                  Kaydet
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditRelId(null)}
                                  className={kupaBtnGhost}
                                >
                                  Vazgeç
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {citeRelId === r.id ? (
                            <CuppingCitationManager entity="point-topic" entityId={r.id} />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ══════════════════ OKUMA MODU (default, sade) ══════════════════ */
            <>
              {/* 1. Başlık */}
              {selectedTopic ? (
                <div className={kupaCard}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-black tracking-tight text-slate-900">{selectedTopic.title}</h2>
                      {selectedTopic.category ? (
                        <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                          {selectedTopic.category}
                        </span>
                      ) : null}
                      {selectedTopic.description ? (
                        <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">
                          {firstSentence(selectedTopic.description)}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[10.5px] text-slate-400">
                        Bilgiler kaynaklar ve kullanıcı notlarından derlenir.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdvanced(true)}
                      className="shrink-0 text-[11px] font-semibold text-slate-400 transition hover:text-amber-700"
                    >
                      Düzenle
                    </button>
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
                  {selectedTopic?.description && restAfterFirst(selectedTopic.description) ? (
                    <p className="mt-1 text-[10.5px] italic text-slate-400">
                      {restAfterFirst(selectedTopic.description)}
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
                      <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700">{n.note}</p>
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
                    <label className={labelCls} htmlFor="nf-note">
                      Not
                    </label>
                    <textarea
                      id="nf-note"
                      value={nfNote}
                      onChange={(e) => setNfNote(e.target.value)}
                      rows={3}
                      placeholder="Bu rahatsızlık için kendi bilgin / yöntemin…"
                      className={kupaInput}
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
            </>
          )}
        </div>
      </div>
    </KupaShell>
  );
}

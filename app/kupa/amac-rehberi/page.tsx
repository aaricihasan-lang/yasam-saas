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
import { TopicReadView } from "./components/TopicReadView";
import {
  createPointTopic,
  createTopic,
  deletePointTopic,
  listCitations,
  listPoints,
  listPointTopics,
  listSources,
  listTopics,
  updatePointTopic,
  updateTopic,
  type CuppingCitation,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingSource,
  type CuppingTopic,
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

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-600";
const helperCls = "mt-1 text-[10.5px] leading-snug text-slate-400";

/**
 * Sol rahatsızlık listesi kartı — mobile/tablet'te viewport kenarına yaslanır (edge-to-edge,
 * köşesiz, yalnız border-y; fullBleedBelowLg shell ile birlikte negatif-margin HACK'İ YOK);
 * >=1024px'te köşeli premium kart. İçerik padding'i (p-4) her iki modda korunur.
 */
const sidebarCardCls =
  "w-full border-y border-amber-100/90 bg-white/95 p-4 shadow-sm backdrop-blur-sm " +
  "lg:rounded-2xl lg:border lg:border-amber-100/90 " +
  "lg:shadow-[0_1px_3px_rgba(120,80,40,0.06),0_8px_24px_-16px_rgba(120,80,40,0.12)]";

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
  // (Kullanıcı notları TopicReadView içinde yönetilir — okuma UI'sı tek kaynak.)
  const [sources, setSources] = useState<CuppingSource[]>([]);
  const [topicSources, setTopicSources] = useState<CuppingCitation[]>([]);
  const [relCitations, setRelCitations] = useState<Record<string, CuppingCitation[]>>({});

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

  // Formal kaynak-karşılaştırma verisi (desktop okuma paneli TopicReadView'a beslenir).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedTopicId) return;
      try {
        const [srcs, tCits, relPairs] = await Promise.all([
          listSources(),
          listCitations("topic", selectedTopicId),
          Promise.all(
            relations.map(async (r) => [r.id, await listCitations("point-topic", r.id)] as const),
          ),
        ]);
        if (cancelled) return;
        setSources(srcs);
        setTopicSources(tCits);
        setRelCitations(Object.fromEntries(relPairs));
      } catch {
        /* okuma görünümü kritik değil; düzenlemeyi bozma */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId, relations]);

  const relatedPointIds = useMemo(() => new Set(relations.map((r) => r.point_id)), [relations]);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return q ? topics.filter((t) => t.title.toLocaleLowerCase("tr").includes(q)) : topics;
  }, [topics, search]);

  const selectTopic = useCallback((id: string) => {
    setSelectedTopicId(id);
    setEditRelId(null);
    setCiteRelId(null);
    setTopicFormMode(null);
    setError(null);
    setTopicSources([]);
    setRelCitations({});
  }, []);

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

  return (
    <KupaShell
      title="Amaç / Rahatsızlık Rehberi"
      subtitle="Rahatsızlığı seç → ilişkili bölgeleri, kaynakların yaklaşımını ve kendi notlarını gör. (Bilgi rehberidir; 'tedavi eder' anlamı taşımaz.)"
      breadcrumb={[{ label: "Amaç / Rahatsızlık Rehberi" }]}
      fullBleedBelowLg
    >
      {error ? (
        <div className="mb-3 px-4 sm:px-6 lg:px-0">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </div>
        </div>
      ) : null}

      {/*
       * MOBİL/TABLET (<1024px): LIST-ONLY. Sağ okuma/düzenleme paneli gizlidir; rahatsızlığa
       *   dokununca AYRI /[topicId] okuma sayfasına gidilir (aynı sayfada detay AÇILMAZ).
       * DESKTOP (>=1024px): mevcut iki kolon (sol liste + sağ TopicReadView / Gelişmiş) KORUNUR;
       *   inline selection (selectTopic) beğenildiği için değişmez.
       */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* SOL: Rahatsızlıklar + arama — mobilde edge-to-edge (köşesiz), desktop premium kart */}
        <div className={sidebarCardCls}>
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
              filteredTopics.map((t) => {
                const base =
                  "w-full truncate rounded-xl border px-3 py-2 text-left text-sm font-semibold transition";
                const inner = (
                  <>
                    <span className="truncate">{t.title}</span>
                    {t.category ? (
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">
                        {t.category}
                      </span>
                    ) : null}
                  </>
                );
                return (
                  <div key={t.id}>
                    {/* MOBİL/TABLET (<1024px): ayrı okuma sayfasına GİT (aynı sayfada detay açma).
                        Ayrım saf CSS breakpoint (lg) — ekran-genişliği (JS) / hydration bağımlılığı YOK. */}
                    <Link
                      href={`/kupa/amac-rehberi/${encodeURIComponent(t.id)}`}
                      className={`block no-underline lg:hidden ${base} border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/50`}
                    >
                      {inner}
                    </Link>
                    {/* DESKTOP (>=1024px): beğenilen inline seçim (sağ panelde okuma) korunur. */}
                    <button
                      type="button"
                      onClick={() => selectTopic(t.id)}
                      className={`hidden lg:block ${base} ${
                        selectedTopicId === t.id
                          ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/50"
                      }`}
                    >
                      {inner}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SAĞ — yalnız DESKTOP (>=1024px). Mobil/tablet list-only (detay ayrı sayfada). */}
        <div className="hidden lg:flex lg:flex-col lg:gap-4">
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
            /* ═══ OKUMA MODU (default, sade) — TEK KAYNAK TopicReadView ═══
             * Aynı bileşen mobil/tablet /[topicId] okuma sayfasında da kullanılır (duplicate read UI YOK).
             * Formal "N kaynakta geçiyor" sayımı + kaynak kartları TopicReadView içinde (hard-code YOK). */
            <TopicReadView
              topicId={selectedTopicId}
              topic={selectedTopic}
              points={points}
              relations={relations}
              sources={sources}
              topicSources={topicSources}
              relCitations={relCitations}
              onEditTopic={() => setAdvanced(true)}
            />
          )}
        </div>
      </div>
    </KupaShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  deletePointTopic,
  listPoints,
  listPointTopics,
  listTopics,
  updatePointTopic,
  updateTopic,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingTopic,
} from "../lib/api";
import { CUPPING_RELATION_STRENGTHS } from "@/lib/cupping/vocab";

/**
 * AMAÇ / RAHATSIZLIK REHBERİ — konu detayı + konu ↔ nokta ilişki + kaynak yönetimi.
 *
 * V1 kapsamı: görsel vücut haritası (silhouette/placement) bu ekrandan ÇIKARILDI
 * (Vücut & Nokta Atlası ileri versiyona ertelendi). Bu tur konu detay alanları
 * (kategori/açıklama/not/serbest kaynak) ve ilişki nitelemesi (relation_strength +
 * ilişki açıklaması) UI'ya bağlanır; kaynaklandırma (CitationManager) korunur.
 *
 * DİL: Bu ekran "tedavi eder" dili üretmez. İlişki = geleneksel/tarihsel/kaynaklı
 * bağlantı bilgisidir; klinik tedavi iddiası DEĞİL.
 */

/** relation_strength kontrollü sözlüğü (vocab tek kaynak) → TR etiket. */
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

/**
 * Topic kategori — UI-only kontrollü liste ("Diğer" serbest metne açılır). DB CHECK
 * YOK (category serbest text kolonudur); mevcut/farklı değerler korunur (edit'te
 * listede yoksa serbest metne düşer).
 */
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
  categorySelect: string; // liste değeri veya CATEGORY_OTHER
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

/** Form → API body (kategoriyi tek değere indirger; boşları null yapar). */
function formToTopicBody(f: TopicForm): Partial<CuppingTopic> {
  const category =
    f.categorySelect === CATEGORY_OTHER
      ? f.categoryOther.trim()
      : f.categorySelect.trim();
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

export default function AmacRehberiPage() {
  const [topics, setTopics] = useState<CuppingTopic[]>([]);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [relations, setRelations] = useState<CuppingPointTopic[]>([]);

  // Topic formu (oluştur / düzenle aynı form; mode ile ayrılır)
  const [topicFormMode, setTopicFormMode] = useState<"create" | "edit" | null>(null);
  const [topicForm, setTopicForm] = useState<TopicForm>(EMPTY_TOPIC_FORM);
  const [topicSaving, setTopicSaving] = useState(false);

  // İlişki ekleme formu
  const [linkPointId, setLinkPointId] = useState("");
  const [linkStrength, setLinkStrength] = useState("");
  const [linkNote, setLinkNote] = useState("");

  // İlişki düzenleme (satır içi)
  const [editRelId, setEditRelId] = useState<string | null>(null);
  const [editStrength, setEditStrength] = useState("");
  const [editNote, setEditNote] = useState("");

  const [citeRelId, setCiteRelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setSelectedTopicId((cur) => cur || t[0]?.id || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Seçili konu → ilişkili noktalar
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

  const relatedPointIds = useMemo(() => new Set(relations.map((r) => r.point_id)), [relations]);

  /** Konu seç + açık satır-içi düzenleme/citation/form panellerini kapat. */
  const selectTopic = useCallback((id: string) => {
    setSelectedTopicId(id);
    setEditRelId(null);
    setCiteRelId(null);
    setTopicFormMode(null);
    setError(null);
  }, []);

  // ── Topic: oluştur / düzenle ────────────────────────────────────────────────
  const openCreateTopic = useCallback(() => {
    setError(null);
    setTopicForm(EMPTY_TOPIC_FORM);
    setTopicFormMode("create");
  }, []);

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

  // ── İlişki: bağla / düzenle / kaldır ────────────────────────────────────────
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
      subtitle="Konuyu seç → ilişkili hacamat noktalarını, ilişki niteliğini ve kaynaklarını yönet. (İlişki bilgisidir; 'tedavi eder' anlamı taşımaz.)"
      breadcrumb={[{ label: "Amaç / Rahatsızlık Rehberi" }]}
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* SOL: konu listesi */}
        <div className={kupaCard}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Konular</h3>
            <button
              type="button"
              onClick={openCreateTopic}
              className="text-[11px] font-semibold text-amber-700 transition hover:text-amber-800"
            >
              + Yeni Konu
            </button>
          </div>
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-0.5">
            {loading ? (
              <p className="px-1 py-2 text-xs text-slate-400">Yükleniyor…</p>
            ) : topics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
                <p className="text-xs text-slate-500">Henüz konu yok.</p>
              </div>
            ) : (
              topics.map((t) => (
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

        {/* SAĞ: seçili konu detayı + ilişkili noktalar */}
        <div className="flex flex-col gap-4">
          {/* Topic form (oluştur / düzenle) */}
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

          {!selectedTopicId ? (
            !topicFormMode ? (
              <div className={`${kupaCard} flex min-h-[240px] items-center justify-center`}>
                <p className="text-sm text-slate-400">Soldan bir konu seçin veya yeni konu ekleyin.</p>
              </div>
            ) : null
          ) : (
            <>
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

                  {/* Konunun kendi kaynak atıfları */}
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

                {/* Yeni ilişki: nokta + ilişki türü + açıklama */}
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

                {/* İlişki listesi: Nokta → İlişki Türü → İlişki Açıklaması → Kaynaklar */}
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
                              {/* 1. Nokta */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-slate-800">
                                  {pointName(r.point_id)}
                                </span>
                                {p?.code ? (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                    {p.code}
                                  </span>
                                ) : null}
                                {/* 2. İlişki Türü */}
                                {r.relation_strength ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                    {RELATION_STRENGTH_LABEL[r.relation_strength] ?? r.relation_strength}
                                  </span>
                                ) : null}
                              </div>
                              {p?.anatomical_region ? (
                                <p className="mt-0.5 text-[11px] text-slate-400">{p.anatomical_region}</p>
                              ) : null}
                              {/* 3. İlişki Açıklaması */}
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

                          {/* İlişki düzenleme (satır içi): İlişki Türü + İlişki Açıklaması */}
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

                          {/* 4. Kaynaklar */}
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
          )}
        </div>
      </div>
    </KupaShell>
  );
}

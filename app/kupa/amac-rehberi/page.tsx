"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KupaShell,
  kupaBtnPrimary,
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
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingTopic,
} from "../lib/api";

/**
 * AMAÇ / RAHATSIZLIK REHBERİ — konu ↔ nokta ilişki + kaynak yönetimi.
 *
 * V1 kapsamı: görsel vücut haritası (silhouette/placement) bu ekrandan ÇIKARILDI
 * (Vücut & Nokta Atlası ileri versiyona ertelendi). Konu→ilişkili noktalar ilişkisi
 * ve kaynaklandırma korunur; profesyonel liste/detay düzeni.
 */
export default function AmacRehberiPage() {
  const [topics, setTopics] = useState<CuppingTopic[]>([]);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [relations, setRelations] = useState<CuppingPointTopic[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [linkPointId, setLinkPointId] = useState("");
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

  const handleCreateTopic = useCallback(async () => {
    const title = newTopic.trim();
    if (!title) return;
    try {
      const created = await createTopic({ title });
      setTopics((cur) => [...cur, created]);
      setSelectedTopicId(created.id);
      setNewTopic("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konu eklenemedi.");
    }
  }, [newTopic]);

  const handleLink = useCallback(async () => {
    if (!selectedTopicId || !linkPointId) return;
    if (relatedPointIds.has(linkPointId)) return;
    try {
      const rel = await createPointTopic({ topic_id: selectedTopicId, point_id: linkPointId });
      setRelations((cur) => [...cur, rel]);
      setLinkPointId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bağlanamadı.");
    }
  }, [selectedTopicId, linkPointId, relatedPointIds]);

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
      subtitle="Konuyu seç → ilişkili hacamat noktalarını ve kaynaklarını gör. (İlişki bilgisidir; 'tedavi eder' anlamı taşımaz.)"
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
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Konular</h3>
          <div className="mb-2.5 flex gap-1.5">
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
              placeholder="Yeni konu…"
              className={kupaInput}
            />
            <button type="button" onClick={handleCreateTopic} disabled={!newTopic.trim()} className={kupaBtnPrimary} aria-label="Konu ekle">
              +
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
                  onClick={() => setSelectedTopicId(t.id)}
                  className={`block w-full truncate rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    selectedTopicId === t.id
                      ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/50"
                  }`}
                >
                  {t.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* SAĞ: seçili konu detayı — açıklama + ilişkili noktalar + kaynaklar */}
        <div className="flex flex-col gap-4">
          {!selectedTopicId ? (
            <div className={`${kupaCard} flex min-h-[240px] items-center justify-center`}>
              <p className="text-sm text-slate-400">Soldan bir konu seçin.</p>
            </div>
          ) : (
            <>
              {selectedTopic ? (
                <div className={kupaCard}>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">{selectedTopic.title}</h2>
                  {selectedTopic.description ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{selectedTopic.description}</p>
                  ) : null}
                  {selectedTopic.category ? (
                    <span className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      {selectedTopic.category}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className={kupaCard}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">İlişkili Noktalar</h3>
                  <span className="text-[11px] font-medium text-slate-500">
                    <span className="font-bold text-amber-800">{relations.length}</span> nokta
                  </span>
                </div>
                <div className="mb-3 flex gap-1.5">
                  <select value={linkPointId} onChange={(e) => setLinkPointId(e.target.value)} className={kupaInput}>
                    <option value="">— nokta bağla —</option>
                    {points
                      .filter((p) => !relatedPointIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.code ? ` (${p.code})` : ""}
                        </option>
                      ))}
                  </select>
                  <button type="button" onClick={handleLink} disabled={!linkPointId} className={kupaBtnPrimary}>
                    Bağla
                  </button>
                </div>
                <div className="space-y-2">
                  {relations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center">
                      <p className="text-xs text-slate-500">Bu konuya bağlı nokta yok.</p>
                    </div>
                  ) : (
                    relations.map((r) => {
                      const p = pointMeta(r.point_id);
                      return (
                        <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-slate-800">{pointName(r.point_id)}</span>
                                {p?.code ? (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{p.code}</span>
                                ) : null}
                                {r.relation_strength ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{r.relation_strength}</span>
                                ) : null}
                              </div>
                              {p?.anatomical_region ? (
                                <p className="mt-0.5 text-[11px] text-slate-400">{p.anatomical_region}</p>
                              ) : null}
                              {r.note ? (
                                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{r.note}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setCiteRelId((cur) => (cur === r.id ? null : r.id))}
                                aria-expanded={citeRelId === r.id}
                                className="text-[11px] font-semibold text-amber-700 transition hover:text-amber-800"
                              >
                                kaynaklar
                              </button>
                              <button type="button" onClick={() => handleUnlink(r.id)} className="text-[11px] font-semibold text-rose-600 transition hover:text-rose-700">
                                kaldır
                              </button>
                            </div>
                          </div>
                          {citeRelId === r.id ? (
                            <CuppingCitationManager entity="point-topic" entityId={r.id} />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Konunun kendi kaynak atıfları */}
                <CuppingCitationManager entity="topic" entityId={selectedTopicId} />
              </div>
            </>
          )}
        </div>
      </div>
    </KupaShell>
  );
}

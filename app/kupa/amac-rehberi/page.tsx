"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyMapCanvas, type BodyMark } from "@/lib/bodymap";
import {
  CUPPING_BODY_MAPS,
  CUPPING_MAP_GROUP_LABELS,
  DEFAULT_CUPPING_MAP_KEY,
  getCuppingMap,
  type CuppingMapGroup,
} from "@/lib/cupping/maps";
import {
  KupaShell,
  kupaBtnPrimary,
  kupaCard,
  kupaInput,
  kupaPill,
  kupaPillActive,
} from "../components/KupaShell";
import { CuppingCitationManager } from "../components/CitationManager";
import { BodySilhouette } from "../maps/Silhouettes";
import {
  createPointTopic,
  createTopic,
  deletePointTopic,
  listPlacements,
  listPoints,
  listPointTopics,
  listTopics,
  type CuppingPlacement,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingTopic,
} from "../lib/api";

const GROUP_ORDER: CuppingMapGroup[] = ["govde", "bas", "bacak"];

export default function AmacRehberiPage() {
  const [topics, setTopics] = useState<CuppingTopic[]>([]);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [relations, setRelations] = useState<CuppingPointTopic[]>([]);
  const [mapKey, setMapKey] = useState<string>(DEFAULT_CUPPING_MAP_KEY);
  const [placements, setPlacements] = useState<CuppingPlacement[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [linkPointId, setLinkPointId] = useState("");
  const [citeRelId, setCiteRelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const mapDef = getCuppingMap(mapKey);
  const pointName = useCallback((id: string) => points.find((p) => p.id === id)?.name ?? "?", [points]);

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

  // Seçili harita → yerleşimler
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pl = await listPlacements({ mapKey });
        if (!cancelled) setPlacements(pl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Harita yükleme hatası.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapKey]);

  const relatedPointIds = useMemo(() => new Set(relations.map((r) => r.point_id)), [relations]);

  // İMZA ÖZELLİĞİ: seçili konunun ilişkili noktalarının bu haritadaki yerleşimlerini birlikte göster.
  const marks: BodyMark[] = useMemo(
    () =>
      placements
        .filter((p) => relatedPointIds.has(p.point_id))
        .map((p) => ({
          id: p.id,
          label: pointName(p.point_id),
          mapKey: p.map_key,
          shape: p.shape,
          cx: p.cx,
          cy: p.cy,
          rx: p.rx,
          ry: p.ry,
          angle: p.angle ?? 0,
          meta: { pointId: p.point_id },
        })),
    [placements, relatedPointIds, pointName],
  );

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

  const shownOnMap = marks.length;
  const relatedButNotOnMap = relations.length - new Set(marks.map((m) => (m.meta as { pointId: string }).pointId)).size;

  return (
    <KupaShell
      title="Amaç / Rahatsızlık Rehberi"
      subtitle="Konuyu seç → ilişkili noktaları haritada birlikte gör. (İlişki bilgisidir; 'tedavi eder' anlamı taşımaz.)"
      breadcrumb={[{ label: "Amaç / Rahatsızlık Rehberi" }]}
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        {/* SOL: konular + ilişki yönetimi */}
        <div className="flex flex-col gap-4">
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
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
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

          {selectedTopicId ? (
            <div className={kupaCard}>
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                İlişkili Noktalar
              </h3>
              <div className="mb-2.5 flex gap-1.5">
                <select value={linkPointId} onChange={(e) => setLinkPointId(e.target.value)} className={kupaInput}>
                  <option value="">— nokta bağla —</option>
                  {points
                    .filter((p) => !relatedPointIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button type="button" onClick={handleLink} disabled={!linkPointId} className={kupaBtnPrimary}>
                  Bağla
                </button>
              </div>
              <div className="space-y-1.5">
                {relations.length === 0 ? (
                  <p className="px-1 text-xs text-slate-400">Bu konuya bağlı nokta yok.</p>
                ) : (
                  relations.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium text-slate-700">{pointName(r.point_id)}</span>
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
                  ))
                )}
              </div>

              {/* Konunun kendi kaynak atıfları */}
              <CuppingCitationManager entity="topic" entityId={selectedTopicId} />
            </div>
          ) : null}
        </div>

        {/* SAĞ: harita */}
        <div className={kupaCard}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {GROUP_ORDER.flatMap((g) =>
                CUPPING_BODY_MAPS.filter((m) => m.group === g).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMapKey(m.key)}
                    title={CUPPING_MAP_GROUP_LABELS[g]}
                    aria-pressed={mapKey === m.key}
                    className={mapKey === m.key ? kupaPillActive : kupaPill}
                  >
                    {m.label}
                  </button>
                )),
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500">
              <span className="font-bold text-amber-800">{shownOnMap}</span> nokta bu haritada
              {relatedButNotOnMap > 0 ? ` · ${relatedButNotOnMap} yerleşimsiz` : ""}
            </p>
          </div>
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50/40 shadow-inner"
            style={{ height: "min(74vh, 760px)" }}
          >
            <BodyMapCanvas
              mapKey={mapKey}
              marks={marks}
              background={<BodySilhouette mapKey={mapKey} />}
              contentWidth={mapDef?.contentWidth ?? 480}
              contentHeight={mapDef?.contentHeight ?? 800}
              toolMode="select"
              readOnly
            />
          </div>
        </div>
      </div>
    </KupaShell>
  );
}

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
import { KupaShell, kupaBtnPrimary, kupaCard, kupaInput } from "../components/KupaShell";
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
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
        {/* SOL: konular + ilişki yönetimi */}
        <div className="flex flex-col gap-3">
          <div className={kupaCard}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Konular</h3>
            <div className="mb-2 flex gap-1.5">
              <input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
                placeholder="Yeni konu…"
                className={kupaInput}
              />
              <button type="button" onClick={handleCreateTopic} disabled={!newTopic.trim()} className={kupaBtnPrimary}>
                +
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-slate-500">Yükleniyor…</p>
              ) : topics.length === 0 ? (
                <p className="text-xs text-slate-500">Henüz konu yok.</p>
              ) : (
                topics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTopicId(t.id)}
                    className={`block w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                      selectedTopicId === t.id
                        ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                İlişkili Noktalar
              </h3>
              <div className="mb-2 flex gap-1.5">
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
              <div className="space-y-1">
                {relations.length === 0 ? (
                  <p className="text-xs text-slate-500">Bu konuya bağlı nokta yok.</p>
                ) : (
                  relations.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
                    >
                      <span className="truncate text-xs text-slate-200">{pointName(r.point_id)}</span>
                      <button type="button" onClick={() => handleUnlink(r.id)} className="text-[11px] text-rose-300 hover:text-rose-200">
                        kaldır
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* SAĞ: harita */}
        <div className={`${kupaCard} min-h-[60vh]`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {GROUP_ORDER.flatMap((g) =>
                CUPPING_BODY_MAPS.filter((m) => m.group === g).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMapKey(m.key)}
                    title={CUPPING_MAP_GROUP_LABELS[g]}
                    className={`rounded-lg border px-2 py-1 text-[10px] transition ${
                      mapKey === m.key
                        ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {m.label}
                  </button>
                )),
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {shownOnMap} nokta bu haritada
              {relatedButNotOnMap > 0 ? ` · ${relatedButNotOnMap} nokta bu haritada yerleşimsiz` : ""}
            </p>
          </div>
          <div className="relative w-full rounded-xl border border-white/10 bg-[#0b1330]" style={{ height: "min(70vh, 640px)" }}>
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

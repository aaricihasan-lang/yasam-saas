"use client";

import { useEffect, useState } from "react";
import {
  listCitations,
  listPointTopics,
  listPoints,
  listSources,
  listTopics,
  type CuppingCitation,
  type CuppingPoint,
  type CuppingPointTopic,
  type CuppingSource,
  type CuppingTopic,
} from "../../lib/api";

/**
 * TEK TOPIC OKUMA VERİSİ — ayrı okuma sayfası (/[topicId]) için.
 *
 * Aynı gerçek data'yı (topics, points, point_topics, topic_sources, point_topic_sources,
 * sources) topicId üzerinden yükler; hard-code YOK. TopicReadView'a beslenir (notlar
 * bileşenin kendi içinde yüklenir). Formal sayım/kart mantığı TopicReadView'da (tek kaynak).
 */
export type TopicReadData = {
  topic: CuppingTopic | null;
  points: CuppingPoint[];
  relations: CuppingPointTopic[];
  sources: CuppingSource[];
  topicSources: CuppingCitation[];
  relCitations: Record<string, CuppingCitation[]>;
  loading: boolean;
  notFound: boolean;
  error: string | null;
};

export function useTopicReadData(topicId: string): TopicReadData {
  const [topic, setTopic] = useState<CuppingTopic | null>(null);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [relations, setRelations] = useState<CuppingPointTopic[]>([]);
  const [sources, setSources] = useState<CuppingSource[]>([]);
  const [topicSources, setTopicSources] = useState<CuppingCitation[]>([]);
  const [relCitations, setRelCitations] = useState<Record<string, CuppingCitation[]>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Yükleme durumu reset'i async gövdede (sync effect setState → cascading-render lint'i).
      if (!cancelled) {
        setLoading(true);
        setNotFound(false);
        setError(null);
      }
      try {
        // 1) Ana varlıklar: topic (id ile bul), noktalar, ilişkiler, kaynak kataloğu, topic-source.
        const [allTopics, pts, rel, srcs, tCits] = await Promise.all([
          listTopics(),
          listPoints(),
          listPointTopics({ topicId }),
          listSources(),
          listCitations("topic", topicId),
        ]);
        if (cancelled) return;
        const found = allTopics.find((t) => t.id === topicId) ?? null;
        setTopic(found);
        setNotFound(!found);
        setPoints(pts);
        setRelations(rel);
        setSources(srcs);
        setTopicSources(tCits);

        // 2) Her ilişkinin point-topic citation'ları (formal DISTINCT source sayımı için).
        const relPairs = await Promise.all(
          rel.map(async (r) => [r.id, await listCitations("point-topic", r.id)] as const),
        );
        if (cancelled) return;
        setRelCitations(Object.fromEntries(relPairs));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  return { topic, points, relations, sources, topicSources, relCitations, loading, notFound, error };
}

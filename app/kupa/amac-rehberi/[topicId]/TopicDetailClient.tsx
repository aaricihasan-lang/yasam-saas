"use client";

import { KupaShell, kupaCard } from "../../components/KupaShell";
import { TopicReadView } from "../components/TopicReadView";
import { useTopicReadData } from "../hooks/useTopicReadData";

/**
 * AYRI OKUMA SAYFASI (client) — gerçek data'yı topicId ile yükler ve TEK kaynak
 * TopicReadView'ı render eder (desktop sağ panelle aynı bileşen → duplicate read UI YOK).
 *
 * fullBleedBelowLg: <1024px'te beyaz okuma yüzeyi viewport kenarına yaslanır (edge-to-edge,
 * negatif-margin hack YOK); >=1024px'te premium ferah düzen. Sidebar/liste/form GÖSTERİLMEZ.
 * Not editörü mobilde büyük (full-screen) editör kullanır (TopicReadView içinde).
 */
export function TopicDetailClient({ topicId }: { topicId: string }) {
  const { topic, points, relations, sources, topicSources, relCitations, loading, notFound, error } =
    useTopicReadData(topicId);

  return (
    <KupaShell
      title={topic?.title ?? "Rahatsızlık"}
      subtitle="İlişkili bölgeler, kaynakların yaklaşımı ve kendi notların. (Bilgi rehberidir; 'tedavi eder' anlamı taşımaz.)"
      breadcrumb={[
        { label: "Amaç / Rahatsızlık Rehberi", href: "/kupa/amac-rehberi" },
        { label: topic?.title ?? "Rahatsızlık" },
      ]}
      fullBleedBelowLg
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 lg:rounded-xl">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className={`${kupaCard} flex min-h-[200px] items-center justify-center`}>
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        </div>
      ) : notFound ? (
        <div className={`${kupaCard} flex min-h-[200px] flex-col items-center justify-center gap-2 text-center`}>
          <p className="text-sm text-slate-500">Bu rahatsızlık kaydı bulunamadı.</p>
          <p className="text-[11px] text-slate-400">
            Yukarıdaki “Amaç / Rahatsızlık Rehberi” bağlantısından listeye dönebilirsin.
          </p>
        </div>
      ) : (
        <TopicReadView
          topicId={topicId}
          topic={topic}
          points={points}
          relations={relations}
          sources={sources}
          topicSources={topicSources}
          relCitations={relCitations}
        />
      )}
    </KupaShell>
  );
}

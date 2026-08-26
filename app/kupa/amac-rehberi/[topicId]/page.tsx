import { TopicDetailClient } from "./TopicDetailClient";

/**
 * AYRI TOPIC OKUMA SAYFASI — /kupa/amac-rehberi/[topicId]
 *
 * Mobile/tablet'te rahatsızlığa dokununca açılan TAM GENİŞ, sade okuma sayfası
 * (sidebar/kart-listesi/yeni-form YOK; yalnız seçili rahatsızlığın okuma içeriği).
 * Statik /yeni segmenti App Router'da bu dinamik segmentten önce eşleşir (çakışma yok).
 *
 * Next.js 16: params bir Promise'tir (await edilir), sonra client bileşene geçilir.
 * Özel geri / floating back butonu YOK — kullanıcı tarayıcı ileri/geri kullanır.
 */
type PageProps = {
  params: Promise<{ topicId: string }>;
};

export default async function AmacRehberiDetailPage({ params }: PageProps) {
  const { topicId } = await params;
  return <TopicDetailClient topicId={decodeURIComponent(topicId)} />;
}

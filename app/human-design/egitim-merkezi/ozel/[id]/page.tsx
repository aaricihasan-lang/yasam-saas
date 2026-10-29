"use client";

/** F · Özel eğitim haritası ayrıntısı — eğitmen yüzü (bileşen: _ui/DetailView; owner yönetim ekranı da aynı görünümü kullanır). */
import { useParams } from "next/navigation";
import { PrivateDetailView } from "../../_ui/DetailView";

export default function TrainerDetailPage() {
  const p = useParams<{ id: string }>();
  const id = String(p?.id ?? "");
  return <PrivateDetailView side="trainer" id={id} listHref="/human-design/egitim-merkezi/ozel" editHref={`/human-design/egitim-merkezi/ozel/${id}/duzenle`} />;
}

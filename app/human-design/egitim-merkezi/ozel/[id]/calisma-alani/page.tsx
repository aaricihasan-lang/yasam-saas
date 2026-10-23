"use client";

/**
 * Bana Özel Eğitim Haritaları · EĞİTİM ÇALIŞMA ALANI (FAZ 8). Harita verisi özel kayıt ayrıntısıyla AYNI uçtan (izin geçerli +
 * kaynak değişmemiş; ad ve doğum bilgisi YALNIZ izin kapsamındaysa). İzin geri çekilirse harita da katman da kapanır (404).
 */
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { premiumStateFromChart } from "@/lib/human-design/bodygraph/premiumChartState";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "../../../_ui/Shell";
import { privCall } from "../../../_ui/privApi";
import { AnnotationWorkspace } from "../../../_calisma/AnnotationWorkspace";

export default function PrivateWorkspacePage() {
  const p = useParams<{ id: string }>();
  const id = String(p?.id ?? "");
  const [d, setD] = useState<PrivItemDetail | null>(null);
  const [st, setSt] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  useEffect(() => {
    let live = true;
    void privCall<{ item: PrivItemDetail }>("trainer", `/api/hd/education/private/items/${encodeURIComponent(id)}`).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.body.item); setSt("ok"); } else setSt(r.notFound ? "notfound" : "error");
    });
    return () => { live = false; };
  }, [id]);
  const state = useMemo(() => (d?.chart ? premiumStateFromChart(d.chart.view as unknown as HdComputedChart) : null), [d]);

  if (st === "loading") return <LoadingView />;
  if (st === "notfound" || (d && (d.state !== "ok" || !d.chart))) return <NotFoundView />;
  if (st === "error" || !d || !d.chart) return <ErrorView message="Harita şu anda yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin." />;
  if (!state) return <ErrorView message="Bu haritanın çizimi çalışma alanında kullanılamıyor (kayıtlı veri premium BodyGraph ile birebir doğrulanamadı)." />;
  const s = d.chart.subject;
  const birth = d.chart.birthShown ? [s.localDateTime, s.zoneLabel, s.place].filter(Boolean).join(" · ") : "Doğum bilgisi izin kapsamında gösterilmez";
  return (
    <Shell>
      <AnnotationWorkspace kind="private" sourceId={d.item.id} state={state} title={d.item.title} eyebrow="EĞİTİM ÇALIŞMA ALANI · BANA ÖZEL"
        subtitle={<>{d.displayName}{d.item.displayMode === "named" ? " (açık isim izniyle)" : " (takma ad)"} · {birth}</>}
        backHref={`/human-design/egitim-merkezi/ozel/${encodeURIComponent(d.item.id)}`} />
    </Shell>
  );
}

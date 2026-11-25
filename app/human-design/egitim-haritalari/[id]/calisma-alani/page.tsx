"use client";

/**
 * Hazır Eğitim Haritaları · EĞİTİM ÇALIŞMA ALANI (FAZ 8) — merkezî yayımlı harita üzerinde eğitmenin KENDİ çizim / not katmanı.
 * Harita verisi katalog ayrıntısıyla AYNI uçtan (yayımlı + geçerli kayıt; belgeli doğum bilgisi merkezî arşivde görünür kalır).
 * Onaylı BodyGraph değişmez; katman ayrı kayıttır (yalnız bu eğitmene görünür).
 */
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { premiumStateFromChart } from "@/lib/human-design/bodygraph/premiumChartState";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { EduCatalogDetail } from "@/lib/human-design/education/educationContract";
import { catalogGet, fmtCalendarDate } from "../../catalogApi";
import { EduLoading, EduNotFound, EduShell } from "../../EduShell";
import { AnnotationWorkspace } from "@/app/human-design/egitim-merkezi/_calisma/AnnotationWorkspace";

export default function CentralWorkspacePage() {
  const t = useTranslations("hd.education");
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const [d, setD] = useState<EduCatalogDetail | null>(null);
  const [st, setSt] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  useEffect(() => {
    let live = true;
    void catalogGet(`/api/hd/education/charts/${encodeURIComponent(id)}`, (b) => (b.item && typeof b.item === "object" ? (b.item as EduCatalogDetail) : undefined)).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.data); setSt("ok"); } else setSt(r.notFound ? "notfound" : "error");
    });
    return () => { live = false; };
  }, [id]);
  const state = useMemo(() => (d ? premiumStateFromChart(d.chart.result as unknown as HdComputedChart) : null), [d]);

  if (st === "loading") return <EduLoading />;
  if (st === "notfound") return <EduNotFound />;
  if (st === "error" || !d) return <EduShell><p className={base.err} role="alert">{t("ws.loadError")}</p></EduShell>;
  if (!state) return <EduShell><p className={base.err} role="alert" data-ann-unsupported>{t("ws.unsupported")}</p></EduShell>;
  return (
    <EduShell>
      <AnnotationWorkspace kind="central" sourceId={d.id} state={state} title={d.displayName} eyebrow={t("ws.centralEyebrow")}
        subtitle={<>{fmtCalendarDate(d.birthDate)} · {d.documentedLocalTime}{t("cat.docTimeSuffix")} · {d.birthPlace}</>}
        backHref={`/human-design/egitim-haritalari/${encodeURIComponent(d.id)}`} />
    </EduShell>
  );
}

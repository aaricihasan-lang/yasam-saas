"use client";

// AŞAMA 3C — Danışan Yolculuğu "Human Design" sekmesi: merkezî danışana BAĞLI HD analiz geçmişi.
// Yalnız özet + "Analizi Aç" (Beslenme sekmesi deseni). Harita burada ÇİZİLMEZ; HD'nin kendi
// profesyonel görünümünde açılır. Veri kopyalanmaz. Sekme yalnız human_design izniyle görünür.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatIsoDateTr, getJourneyHdSummary, type JourneyHdAnalysisRow } from "@/lib/human-design/api/journeyClient";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; profile: { id: string; name: string } | null; analyses: JourneyHdAnalysisRow[] };

function summaryLine(a: JourneyHdAnalysisRow): string {
  const c = toAppChartCodes(a);
  const type = c.type_code ? hdTypeLabelFromCode(c.type_code) : a.type_code || "";
  const profile = c.profile_code ? hdProfileLabelFromCode(c.profile_code).split(" — ")[0] : a.profile_code || "";
  return [type, profile].filter(Boolean).join(" · ");
}

export default function HumanDesignTab({ clientId }: { clientId: string }) {
  const t = useTranslations("clients.detail.hd");
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    void getJourneyHdSummary(clientId).then((r) => {
      if (!alive) return;
      setState(r.error ? { phase: "error" } : { phase: "ready", profile: r.profile, analyses: r.analyses });
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (state.phase === "loading") return <p className={`${dyp.kMeta} py-8 text-center`}>{t("loading")}</p>;
  if (state.phase === "error") return <p role="alert" className={`${dyp.kAlertDanger} font-semibold`}>{t("error")}</p>;

  const { profile, analyses } = state;
  if (!profile || analyses.length === 0) {
    return (
      <div className={dyp.kEmpty} data-hd-journey-empty>
        <p className="font-bold text-[#1f3050]">{t("empty")}</p>
        <p className="mt-1 text-[12.5px]">{t("emptyHint")}</p>
        <Link
          href={profile ? `/human-design/danisanlar/${profile.id}` : "/human-design/danisanlar"}
          className={`${dyp.kBtnPrimary} mt-4 inline-flex h-9 items-center no-underline`}
        >
          {t("goCalc")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-hd-journey-tab>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={dyp.kEyebrow}>{t("title")}</h3>
        <Link href={`/human-design/danisanlar/${profile.id}`} className={`${dyp.kBtnGhost} ${dyp.kBtnSm} no-underline`}>
          {t("profileLink")} →
        </Link>
      </div>
      <ul className="m-0 list-none space-y-2 p-0">
        {analyses.map((a) => {
          const kind = a.kind === "roxy" ? t("kindRoxy") : a.kind === "engine" ? t("kindEngine") : t("kindManual");
          const href = a.kind === "manual" ? `/human-design/kayitli-haritalar/${a.id}` : `/human-design/danisanlar/${profile.id}?chart=${encodeURIComponent(a.id)}`;
          return (
            <li key={a.id} className={`${dyp.kCard} flex flex-wrap items-center justify-between gap-3`} data-hd-journey-analysis={a.id}>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-[#0f1d36]">{t("calculatedWith", { date: formatIsoDateTr(a.birth_date) })}</p>
                <p className={`${dyp.kMeta} m-0 mt-0.5 break-words`}>
                  {[summaryLine(a), kind, t("analyzedAt", { date: formatIsoDateTr(a.created_at) })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Link href={href} className={`${dyp.kBtnSecondary} inline-flex h-9 shrink-0 items-center no-underline`}>
                {t("open")}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

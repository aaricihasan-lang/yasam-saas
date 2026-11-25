"use client";

// FAZ 13 — Eğitim Merkezi'nden "Yeni Human Design Analizi" ile gelindiğinde (?egitim=1) Human Design Çalışma Alanı'nda
// görünen yönlendirme bandı. Hesaplama / kayıt bu bant tarafından YAPILMAZ: mevcut "Danışanı Oluştur ve Analiz Et" akışı
// aynen kullanılır. Analiz kaydedilince bant "Eğitim Arşivime Ekle" bağlantısını gösterir (kaynak harita seçili; izin ve
// eğitim bilgisi adımları Eğitim Merkezi'nde). YALNIZ özel arşiv yetkisi olan eğitmende görünür (sunucu yoklaması).
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { privateArchiveVisible } from "./HdAddToEduArchiveButton";

const noop = () => () => {};
const fromEducation = () => new URLSearchParams(window.location.search).get("egitim") === "1";

export function HdEduAnalysisBanner({ chartId }: { chartId: string | null }) {
  const edu = useSyncExternalStore(noop, fromEducation, () => false);
  const [visible, setVisible] = useState(false);
  const t = useTranslations("hd.records.edu");
  useEffect(() => {
    if (!edu) return;
    let live = true;
    void privateArchiveVisible().then((v) => { if (live) setVisible(v); });
    return () => { live = false; };
  }, [edu]);
  if (!edu || !visible) return null;
  return (
    <section className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900" data-hd-edu-banner={chartId ? "done" : "start"}>
      <GraduationCap className="h-5 w-5 shrink-0" aria-hidden />
      <p className="m-0 min-w-0 flex-1">
        {chartId
          ? t("saved")
          : <>
              {t("fromEducation")}{" "}
              <b data-hd-edu-banner-real>{t("realWarning")}</b> {t("fictionalBefore")}{" "}
              <Link href="/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal" className="font-semibold underline" data-hd-edu-banner-fictional>{t("fictionalLink")}</Link>{" "}
              {t("fictionalAfter")}
            </>}
      </p>
      {chartId ? (
        <Link href={`/human-design/egitim-merkezi/ozel/ekle?chart=${encodeURIComponent(chartId)}`} className="inline-flex h-10 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700" data-hd-edu-banner-add>
          {t("addToArchive")}
        </Link>
      ) : null}
      <Link href="/human-design/egitim-merkezi/ozel" className="inline-flex h-10 items-center rounded-xl border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50" data-hd-edu-banner-back>
        {t("back")}
      </Link>
    </section>
  );
}

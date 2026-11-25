"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN aile incelemesi (owner kararı 30.10.2026; owner aile sayfasının eğitmen karşılığı).
 * Aile ve üyeleri YALNIZ eğitmen katalog yanıtından (sunucu: tüm üyeleri yayımlı aileler) alınır; her üyenin haritası ayrıca
 * yetki + yayın kapısından geçen ayrıntı ucundan okunur. Bilinmeyen / eksik üyeli aile → tek tip "Sayfa bulunamadı".
 * Seçili kişilerin KAYITLI BodyGraph'ları tek sayfada yan yana / alt alta; her harita ayrıca büyütülür (Tam Ekran İncele).
 * Yeni ilişki hesabı (Connection / Penta) YOK; sağlayıcı çağrısı YOK.
 */

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import ov from "@/app/admin/hd-egitim-haritalari/ownerViews.module.css";
import { EduBodygraphViewer } from "@/app/admin/hd-egitim-haritalari/EduBodygraphViewer";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { EduCatalogDetail } from "@/lib/human-design/education/educationContract";
import type { EduVisibleFamily } from "@/lib/human-design/education/educationFamilies";
import { catalogGet } from "../../catalogApi";
import { EduLoading, EduNotFound, EduShell } from "../../EduShell";
import { EDU_CATALOG_HREF, useFamilyText } from "../../EduFamilyCards";

function FamilyCompare() {
  const t = useTranslations("hd.education");
  const ft = useFamilyText();
  const params = useParams<{ aile: string }>();
  const sp = useSearchParams();
  const key = String(params?.aile ?? "");
  const [family, setFamily] = useState<EduVisibleFamily | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [details, setDetails] = useState<Record<string, EduCatalogDetail | "err">>({});

  useEffect(() => {
    let live = true;
    void catalogGet("/api/hd/education/charts", (b) => (Array.isArray(b.families) ? (b.families as EduVisibleFamily[]) : undefined)).then((r) => {
      if (!live) return;
      if (!r.ok) { setState(r.notFound ? "notfound" : "error"); return; }
      const f = r.data.find((x) => x.key === key) ?? null;
      setFamily(f);
      setState(f ? "ok" : "notfound");
    });
    return () => { live = false; };
  }, [key]);

  const selected = useMemo(() => {
    if (!family) return [];
    const want = (sp.get("sec") ?? "").split(",").filter(Boolean);
    const pick = want.length ? family.members.filter((m) => want.includes(m.id)) : family.members;
    return pick.length ? pick : family.members;
  }, [family, sp]);

  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const m of selected) {
      if (requested.current.has(m.id)) continue;
      requested.current.add(m.id);
      void catalogGet(`/api/hd/education/charts/${encodeURIComponent(m.id)}`, (b) => (b.item && typeof b.item === "object" ? (b.item as EduCatalogDetail) : undefined)).then((r) => {
        setDetails((d) => ({ ...d, [m.id]: r.ok ? r.data : "err" }));
      });
    }
  }, [selected]);

  if (state === "loading") return <EduLoading />;
  if (state === "notfound" || !family) return <EduNotFound />;
  if (state === "error") return <EduShell><p className={base.err} role="alert">{t("fam.loadError")}</p></EduShell>;
  const nameOf = (id: string) => family.members.find((m) => m.id === id)?.displayName ?? null;
  const famHref = `${EDU_CATALOG_HREF}/aile/${encodeURIComponent(family.key)}`;
  return (
    <EduShell>
      <Link className={css.back} href={EDU_CATALOG_HREF}>{t("cat.back")}</Link>
      <section className={base.hero} aria-labelledby="fam-title">
        <p className={base.eyebrow}>{t("cat.eyebrow")}</p>
        <h1 id="fam-title" className={base.title}>{ft.title(family)}</h1>
        <p className={base.sub}>{t("fam.pageSub", { who: selected.length === family.members.length ? t("fam.whole") : t("fam.selected") })}</p>
      </section>
      <section className={base.panel} aria-label={t("fam.linksAria")} data-edu-family-page={family.key}>
        {family.links.map((l) => {
          const a = nameOf(l.from); const b = nameOf(l.to);
          return a && b ? <p key={`${l.from}-${l.to}`} className={ov.relLine} data-edu-family-link>{a} ⟷ {b} <span>· {ft.link(l.label)}</span></p> : null;
        })}
        <p className={ov.famNote}>{t("fam.note")}</p>
        <div className={ov.famActions}>
          {family.members.map((m) => (
            <Link key={m.id} className={ov.famBtn} href={`${famHref}?sec=${encodeURIComponent(m.id)}`} aria-current={selected.length === 1 && selected[0].id === m.id ? "page" : undefined}>{t("fam.only", { name: m.displayName, role: ft.role(m.role) })}</Link>
          ))}
          <Link className={`${ov.famBtn} ${ov.famBtnMain}`} href={famHref}>{t("fam.reviewAll")}</Link>
        </div>
      </section>
      <div className={ov.cmpGrid} data-edu-family-grid={selected.length}>
        {selected.map((m) => {
          const d = details[m.id];
          return (
            <article key={m.id} className={ov.cmpCard} data-edu-family-member={m.id}>
              <div className={ov.cmpHead}>
                <h2 className={ov.cmpName}>{m.displayName} <span className={ov.famRole}>{ft.role(m.role)}</span></h2>
                <Link className={ov.famOpen} href={`${EDU_CATALOG_HREF}/${encodeURIComponent(m.id)}`}>{t("fam.reviewDetail")}</Link>
              </div>
              {!d ? <p className={base.empty}>{t("fam.chartLoading")}</p>
                : d === "err" ? <p className={base.err}>{t("fam.chartError")}</p>
                : <EduBodygraphViewer result={d.chart.result as unknown as HdComputedChart} roxyRender={d.chart.render} title={`${m.displayName} (${ft.role(m.role)})`} compact={selected.length > 1} />}
            </article>
          );
        })}
      </div>
      <p className={base.note}>{t("cat.disclaimer")}</p>
    </EduShell>
  );
}

export default function EducationFamilyPage() {
  return <Suspense fallback={<EduLoading />}><FamilyCompare /></Suspense>;
}

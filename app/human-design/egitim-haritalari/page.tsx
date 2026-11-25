"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN KATALOĞU (FAZ 2-B3). Owner görsel PASS prototipi: katalogView.
 * Yalnız owner'ın kişi bazında yetki verdiği eğitmen görür; liste YALNIZ yayımlı ve okuma anında hâlâ uygun kayıtlardır
 * (sunucu: listPublishedCards). Yayım yoksa katalog BOŞTUR — bu hata değildir; sahte/örnek kart gösterilmez.
 * Sayfa açılışında sağlayıcı çağrısı YOK; danışan kaydı oluşturulmaz.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useEduLabel } from "@/app/human-design/egitim-merkezi/_ui/labels";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { EDU_CATEGORY_LABEL, type EduCatalogListCard, type EduCategory } from "@/lib/human-design/education/educationContract";
import type { BioCardMeta } from "@/lib/human-design/education/biography/biographyContract";
import type { EduVisibleFamily } from "@/lib/human-design/education/educationFamilies";
import { catalogGet, fmtCalendarDate } from "./catalogApi";
import { EduLoading, EduNotFound, EduShell } from "./EduShell";
import { EduFamilyCards } from "./EduFamilyCards";

type Sort = "az" | "yil";
// FAZ 10: kart + (varsa) yayımlı Hayat Hikâyesi'nden meslek / ülke / dönem — arama bu alanlarda da çalışır.
// Owner kararı 29.10.2026: liste kartında owner yönetim etiketleri (kanıt düzeyi / UTC durumu) YOK — API de taşımaz.
type Card = EduCatalogListCard & { bio?: BioCardMeta | null };
const haystack = (i: Card) => [i.displayName, i.bio?.profession, i.bio?.country, i.bio?.era, i.bio?.lifeSpan, i.birthPlace].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");

export default function EducationCatalogPage() {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const catLabel = (c: EduCategory) => label("eduCategory", c, EDU_CATEGORY_LABEL[c] ?? c);
  const [items, setItems] = useState<Card[] | null>(null);
  // Owner kararı 30.10.2026: aile kartları (sunucu yalnız tüm üyeleri yayımlı aileleri döner) — ana içeriğin en altında.
  const [families, setFamilies] = useState<EduVisibleFamily[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [q, setQ] = useState("");
  const [kat, setKat] = useState<EduCategory | "all">("all");
  const [sort, setSort] = useState<Sort>("az");

  useEffect(() => {
    let live = true;
    void catalogGet("/api/hd/education/charts", (b) => (Array.isArray(b.items) ? { items: b.items as Card[], families: Array.isArray(b.families) ? (b.families as EduVisibleFamily[]) : [] } : undefined)).then((r) => {
      if (!live) return;
      if (r.ok) { setItems(r.data.items); setFamilies(r.data.families); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
    });
    return () => { live = false; };
  }, []);

  const cats = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);
  const rows = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    const r = (items ?? []).filter((i) => (!term || haystack(i).includes(term)) && (kat === "all" || i.category === kat));
    return [...r].sort((a, b) => (sort === "yil" ? a.birthDate.localeCompare(b.birthDate) : a.displayName.localeCompare(b.displayName, "tr")));
  }, [items, q, kat, sort]);

  if (state === "loading") return <EduLoading />;
  if (state === "notfound") return <EduNotFound />;

  return (
    <EduShell>
      <section className={base.hero} aria-labelledby="edu-cat-title">
        <p className={base.eyebrow}>{t("cat.eyebrow")}</p>
        <h1 id="edu-cat-title" className={base.title}>{t("hub.centralTitle")}</h1>
        <p className={base.sub}>{t("cat.sub")}</p>
      </section>
      <p className={base.note}>{t("cat.disclaimer")}</p>
      {state === "error" ? (
        <p className={base.err} role="alert">{t("cat.loadError")}</p>
      ) : (
        <section className={base.panel} aria-label={t("cat.chartsAria")}>
          {items && items.length ? (
            <>
              <div className={base.tools}>
                <input className={`${base.input} ${css.search}`} type="search" placeholder={t("cat.searchPh")} aria-label={t("cat.searchAria")} value={q} onChange={(e) => setQ(e.target.value)} />
                <select className={base.select} aria-label={t("cat.sortAria")} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="az">{t("cat.sortAz")}</option>
                  <option value="yil">{t("cat.sortYear")}</option>
                </select>
              </div>
              {cats.length > 1 ? (
                <div className={css.chips} role="group" aria-label={t("priv.categoryAria")}>
                  <button type="button" className={`${css.chip} ${kat === "all" ? css.chipOn : ""}`} aria-pressed={kat === "all"} onClick={() => setKat("all")}>{t("priv.all")}</button>
                  {cats.map((c) => (
                    <button key={c} type="button" className={`${css.chip} ${kat === c ? css.chipOn : ""}`} aria-pressed={kat === c} onClick={() => setKat(c)}>{catLabel(c)}</button>
                  ))}
                </div>
              ) : null}
              {rows.length ? (
                <div className={css.cards}>
                  {rows.map((i) => (
                    <Link key={i.id} className={css.card} href={`/human-design/egitim-haritalari/${i.id}`}>
                      <span className={css.cKat}>{catLabel(i.category)}</span>
                      <h3>{i.displayName}</h3>
                      {i.bio?.profession ? <p className={css.cMeta} data-edu-card-profession>{i.bio.profession}{i.bio.lifeSpan ? ` · ${i.bio.lifeSpan}` : ""}</p> : null}
                      <p className={css.cMeta}>{fmtCalendarDate(i.birthDate)} · {i.documentedLocalTime}</p>
                      <p className={css.cMeta}>{i.birthPlace}</p>
                      <span className={css.cTags}>
                        {i.bio ? <span className={`${base.tag} ${base.tOk}`} data-edu-card-bio>{t("cat.bioTag")}</span> : null}
                      </span>
                      <span className={css.cGo}>{t("cat.openChart")}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={base.empty}>{t("cat.noMatch")}</p>
              )}
              <p className={base.count}>{t("cat.count", { shown: String(rows.length), total: String(items.length), count: items.length })}</p>
            </>
          ) : (
            <p className={base.empty}>{t("cat.empty")}</p>
          )}
        </section>
      )}
      {state === "ok" ? <EduFamilyCards families={families} /> : null}
    </EduShell>
  );
}

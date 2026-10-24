"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN KATALOĞU (FAZ 2-B3). Owner görsel PASS prototipi: katalogView.
 * Yalnız owner'ın kişi bazında yetki verdiği eğitmen görür; liste YALNIZ yayımlı ve okuma anında hâlâ uygun kayıtlardır
 * (sunucu: listPublishedCards). Yayım yoksa katalog BOŞTUR — bu hata değildir; sahte/örnek kart gösterilmez.
 * Sayfa açılışında sağlayıcı çağrısı YOK; danışan kaydı oluşturulmaz.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import { EDU_CATEGORY_LABEL, type EduCatalogCard, type EduCategory } from "@/lib/human-design/education/educationContract";
import type { BioCardMeta } from "@/lib/human-design/education/biography/biographyContract";
import { catalogGet, fmtCalendarDate } from "./catalogApi";
import { EduLoading, EduNotFound, EduShell } from "./EduShell";

type Sort = "az" | "yil";
// FAZ 10: kart + (varsa) yayımlı Hayat Hikâyesi'nden meslek / ülke / dönem — arama bu alanlarda da çalışır.
type Card = EduCatalogCard & { bio?: BioCardMeta | null };
const haystack = (i: Card) => [i.displayName, i.bio?.profession, i.bio?.country, i.bio?.era, i.bio?.lifeSpan, i.birthPlace].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");

export default function EducationCatalogPage() {
  const [items, setItems] = useState<Card[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [q, setQ] = useState("");
  const [kat, setKat] = useState<EduCategory | "all">("all");
  const [sort, setSort] = useState<Sort>("az");

  useEffect(() => {
    let live = true;
    void catalogGet("/api/hd/education/charts", (b) => (Array.isArray(b.items) ? (b.items as Card[]) : undefined)).then((r) => {
      if (!live) return;
      if (r.ok) { setItems(r.data); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
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
        <p className={base.eyebrow}>YAŞAM SİSTEMİ · HUMAN DESIGN</p>
        <h1 id="edu-cat-title" className={base.title}>Hazır Eğitim Haritaları</h1>
        <p className={base.sub}>Belgeli doğum verisiyle hazırlanmış, eğitim amaçlı örnek haritalar</p>
      </section>
      <p className={base.note}>Eğitim amaçlıdır. Bu kişiler, mirasçıları veya hak sahipleriyle herhangi bir ticari bağlantı, sponsorluk ya da onay ilişkisi yoktur.</p>
      {state === "error" ? (
        <p className={base.err} role="alert">Katalog şu anda yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.</p>
      ) : (
        <section className={base.panel} aria-label="Eğitim haritaları">
          {items && items.length ? (
            <>
              <div className={base.tools}>
                <input className={`${base.input} ${css.search}`} type="search" placeholder="Ad, meslek, ülke veya dönemle ara…" aria-label="Ad, meslek, ülke veya dönemle ara" value={q} onChange={(e) => setQ(e.target.value)} />
                <select className={base.select} aria-label="Sıralama" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="az">Sırala: A → Z</option>
                  <option value="yil">Sırala: Doğum yılı</option>
                </select>
              </div>
              {cats.length > 1 ? (
                <div className={css.chips} role="group" aria-label="Kategori">
                  <button type="button" className={`${css.chip} ${kat === "all" ? css.chipOn : ""}`} aria-pressed={kat === "all"} onClick={() => setKat("all")}>Tümü</button>
                  {cats.map((c) => (
                    <button key={c} type="button" className={`${css.chip} ${kat === c ? css.chipOn : ""}`} aria-pressed={kat === c} onClick={() => setKat(c)}>{EDU_CATEGORY_LABEL[c] ?? c}</button>
                  ))}
                </div>
              ) : null}
              {rows.length ? (
                <div className={css.cards}>
                  {rows.map((i) => (
                    <Link key={i.id} className={css.card} href={`/human-design/egitim-haritalari/${i.id}`}>
                      <span className={css.cKat}>{EDU_CATEGORY_LABEL[i.category] ?? i.category}</span>
                      <h3>{i.displayName}</h3>
                      {i.bio?.profession ? <p className={css.cMeta} data-edu-card-profession>{i.bio.profession}{i.bio.lifeSpan ? ` · ${i.bio.lifeSpan}` : ""}</p> : null}
                      <p className={css.cMeta}>{fmtCalendarDate(i.birthDate)} · {i.documentedLocalTime}</p>
                      <p className={css.cMeta}>{i.birthPlace}</p>
                      <span className={css.cTags}>
                        <span className={`${base.tag} ${base.tOk}`}>Belgeli doğum saati</span>
                        <span className={`${base.tag} ${base.tOk}`}>UTC doğrulandı</span>
                        {i.bio ? <span className={`${base.tag} ${base.tOk}`} data-edu-card-bio>Hayat Hikâyesi</span> : null}
                      </span>
                      <span className={css.cGo}>Haritayı aç →</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={base.empty}>Aramanızla eşleşen harita yok.</p>
              )}
              <p className={base.count}>{rows.length} / {items.length} yayımlı eğitim haritası</p>
            </>
          ) : (
            <p className={base.empty}>Henüz yayımlanmış eğitim haritası yok. Haritalar platform yönetimi tarafından doğrulanıp yayımlandıkça burada görünür.</p>
          )}
        </section>
      )}
    </EduShell>
  );
}

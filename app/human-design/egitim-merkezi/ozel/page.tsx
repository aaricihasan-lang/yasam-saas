"use client";

/**
 * C · Bana Özel Eğitim Haritaları (FAZ 7). Görüntüleme odaklı: kartı aç → harita. Yönetim (Düzenle / Kaldır) yalnız kartın ⋯ menüsünde
 * ve "Seç" modunda. Liste, arama, kategori ve sıralama sunucunun döndürdüğü GERÇEK kayıtlar üzerinde çalışır. Erişimi kapalı kayıt
 * (izin geri çekildi / kaynak değişti / kanıt doğrulanamadı) açılamaz; yalnız kaldırılabilir. Kayıt kartları tek tip (içerik görseli yok).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_CATEGORY_LABEL, PRIV_STATE_LABEL, type PrivItemCard } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "../_ui/Shell";
import { DeleteFlow } from "../_ui/DeleteFlow";
import { NewAnalysisButton } from "../_ui/NewAnalysisEntry";
import { fmtDay, privCall } from "../_ui/privApi";
import { useEduHdLabels, useEduLabel } from "../_ui/labels";

const fold = (t: string) => t.normalize("NFC").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");

function CardMenu({ item, onDelete }: { item: PrivItemCard; onDelete: () => void }) {
  const t = useTranslations("hd.education");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={oz.menuWrap} ref={ref}>
      <button type="button" className={oz.menuBtn} aria-haspopup="menu" aria-expanded={open} aria-label={t("priv.cardMenuAria", { title: item.title })} onClick={() => setOpen(!open)} data-edu-card-menu>⋯</button>
      {open ? (
        <div className={oz.menu} role="menu">
          {item.state === "ok" ? <Link role="menuitem" href={`/human-design/egitim-merkezi/ozel/${item.id}`}>{t("priv.openChart")}</Link> : null}
          {item.state === "ok" ? <Link role="menuitem" href={`/human-design/egitim-merkezi/ozel/${item.id}/duzenle`} data-edu-menu-edit>{t("priv.edit")}</Link> : null}
          <button type="button" role="menuitem" className={oz.menuDanger} onClick={() => { setOpen(false); onDelete(); }} data-edu-menu-delete>{t("priv.remove")}</button>
        </div>
      ) : null}
    </div>
  );
}

export default function PrivateListPage() {
  const t = useTranslations("hd.education");
  const L = useEduHdLabels();
  const label = useEduLabel();
  const catLabel = (c: string) => label("privCategory", c, PRIV_CATEGORY_LABEL[c as keyof typeof PRIV_CATEGORY_LABEL] ?? c);
  const [items, setItems] = useState<PrivItemCard[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("*");
  const [sort, setSort] = useState<"new" | "az">("new");
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [del, setDel] = useState<{ id: string; title: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const sp = useSearchParams();
  const flash = sp.get("kaldirildi") === "1" ? t("priv.flashRemoved")
    : sp.get("izin") === "geri" ? t("priv.flashConsentWithdrawn") : null;
  const fetchList = useCallback(() => privCall<{ items: PrivItemCard[] }>("trainer", "/api/hd/education/private/items"), []);
  const apply = useCallback((r: Awaited<ReturnType<typeof fetchList>>) => {
    if (r.ok) { setItems(r.body.items); setState("ok"); } else setState(r.notFound ? "denied" : "error");
  }, []);
  const load = useCallback(async () => apply(await fetchList()), [apply, fetchList]);
  useEffect(() => {
    let live = true;
    void fetchList().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [fetchList, apply]);

  const cats = useMemo(() => ["*", ...Array.from(new Set((items ?? []).map((x) => x.category as string)))], [items]);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    const list = (items ?? []).filter((x) => (cat === "*" || x.category === cat)
      && (!f || fold(`${x.title} ${x.aliasLabel} ${x.description ?? ""}`).includes(f)));
    return sort === "az" ? [...list].sort((a, b) => a.title.localeCompare(b.title, "tr")) : list;
  }, [items, q, cat, sort]);

  if (state === "loading") return <LoadingView />;
  if (state === "denied") return <NotFoundView />;
  if (state === "error" || !items) return <ErrorView message={t("priv.loadError")} onRetry={() => { setState("loading"); void load(); }} />;
  const closed = items.filter((x) => x.state !== "ok").length;

  return (
    <Shell>
      <Link className={kat.back} href="/human-design/egitim-merkezi">{t("common.backToCenter")}</Link>
      <header className={base.hero}>
        <p className={base.eyebrow}>{t("common.eyebrowCenter")}</p>
        <h1 className={base.title}>{t("hub.privateTitle")}</h1>
        <p className={base.sub}>{t("priv.sub")}</p>
      </header>
      {msg ?? flash ? <p className={base.msg} role="status" data-edu-msg>{msg ?? flash}</p> : null}
      <section className={`${base.panel} ${sel ? oz.selMode : ""}`}>
        <div className={oz.toolbar}>
          <input className={`${base.input} ${oz.search}`} type="search" placeholder={t("priv.searchPh")} aria-label={t("priv.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} data-edu-search />
          <select className={base.select} aria-label={t("priv.sortAria")} value={sort} onChange={(e) => setSort(e.target.value as "new" | "az")}>
            <option value="new">{t("priv.sortNew")}</option><option value="az">{t("priv.sortAz")}</option>
          </select>
          {items.length ? (
            <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setSel(sel ? null : new Set())} aria-pressed={!!sel} data-edu-select-mode>
              {sel ? t("priv.selectDone") : t("priv.select")}
            </button>
          ) : null}
          <Link className={`${base.btn} ${base.save} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal" data-edu-add-fictional>{t("hub.createFictional")}</Link>
          <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href="/human-design/egitim-merkezi/ozel/ekle?tur=gercek" data-edu-add-existing>{t("hub.addReal")}</Link>
          <NewAnalysisButton className={`${base.btn} ${base.ghost} ${oz.touch}`} />
        </div>
        {items.length ? (
          <div className={kat.chips} role="group" aria-label={t("priv.categoryAria")}>
            {cats.map((c) => <button key={c} type="button" className={`${kat.chip} ${c === cat ? kat.chipOn : ""}`} aria-pressed={c === cat} onClick={() => setCat(c)}>{c === "*" ? t("priv.all") : catLabel(c)}</button>)}
          </div>
        ) : null}
        {!items.length ? (
          <div className={base.empty} data-edu-empty>
            <p>{t("priv.emptyTitle")}</p>
            <p>{t("priv.emptyBody")}</p>
          </div>
        ) : !shown.length ? (
          <p className={base.empty} data-edu-noresult>{t("priv.noResult")}</p>
        ) : (
          <div className={kat.cards} data-edu-cards>
            {shown.map((x) => {
              const closedCard = x.state !== "ok";
              return (
                <article key={x.id} className={`${kat.card} ${oz.pCard} ${closedCard ? oz.pCardClosed : ""}`} data-edu-card={x.id} data-edu-state={x.state}>
                  {sel ? (
                    <input type="checkbox" className={oz.selBox} aria-label={t("priv.selectAria", { title: x.title })} checked={sel.has(x.id)}
                      onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(x.id); else n.delete(x.id); setSel(n); }} data-edu-select={x.id} />
                  ) : null}
                  <div className={oz.cTop}>
                    <span className={kat.cKat}>{x.kind === "kurgusal" ? t("priv.fictionalPrefix") : ""}{catLabel(x.category)}</span>
                    <CardMenu item={x} onDelete={() => setDel([{ id: x.id, title: x.title }])} />
                  </div>
                  {closedCard ? <h3>{x.title}</h3> : <h3><Link className={oz.cardLink} href={`/human-design/egitim-merkezi/ozel/${x.id}`}>{x.title}</Link></h3>}
                  <p className={kat.cMeta}>{x.aliasLabel}</p>
                  {closedCard ? <p className={kat.cMeta}>{t("priv.chartHidden")}</p>
                    : <p className={kat.cMeta}>{[L.type(x.typeCode), L.profile(x.profileCode), L.authority(x.authorityCode)].filter(Boolean).join(" · ")}</p>}
                  <span className={kat.cTags}><span className={`${base.tag} ${closedCard ? (x.state === "source_changed" ? base.tWarn : base.tBad) : base.tOk}`}>{label("privState", x.state, PRIV_STATE_LABEL[x.state])}</span></span>
                  <p className={kat.cMeta}>{t("priv.addedOn", { date: fmtDay(x.createdAt) })}</p>
                  {closedCard ? <span className={oz.cMuted}>{t("priv.onlyRemovable")}</span>
                    : <Link className={kat.cGo} href={`/human-design/egitim-merkezi/ozel/${x.id}`}>{t("priv.openChartGo")}</Link>}
                </article>
              );
            })}
          </div>
        )}
        <p className={base.count}>{t("priv.count", { shown: String(shown.length), total: String(items.length), count: items.length })}{closed ? t("priv.countClosed", { n: String(closed), count: closed }) : ""}</p>
        {sel && sel.size ? (
          <div className={oz.bulkBar} data-edu-bulkbar>
            <b>{t("priv.selectedCount", { n: String(sel.size), count: sel.size })}</b>
            <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} data-edu-bulk-delete
              onClick={() => setDel(items.filter((x) => sel.has(x.id)).map((x) => ({ id: x.id, title: x.title })))}>{t("priv.bulkRemove")}</button>
          </div>
        ) : null}
      </section>
      <p className={base.note}>{t("priv.note")}</p>
      {del ? (
        <DeleteFlow side="trainer" endpoint="/api/hd/education/private/items/delete" items={del} onCancel={() => setDel(null)}
          onDone={(n) => { setDel(null); setSel(null); setMsg(t("priv.removedCount", { n: String(n), count: n })); void load(); }} />
      ) : null}
    </Shell>
  );
}

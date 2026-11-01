"use client";

// Analizler ve Yorumlar sekmesi — liste gerçek sunucu kataloğundan üretilir (sabit kodlanmış analiz kartı yok).
import { useState } from "react";
import type { CampaignModule, CatalogEntry } from "@/lib/campaign/catalog";
import { NEVER_PUBLIC } from "@/lib/campaign/catalog";
import { MODULE_UI, READINESS_UI, SOURCE_UI, techniqueUi } from "@/lib/campaign/catalogUi";
import { MODULES, clampInt, commentOn, crText, defaultSel, fmt, maxCr, norm, peopleText, selectable, selectedOf, type Draft, type Sel } from "./model";
import type { PanelCtx } from "./KampanyaPanel";

const LIMITS = { ip: 10000, daily: 1000000, credit: 1000000 } as const;

export function TabAnalizler({ ctx }: { ctx: PanelCtx }) {
  const { d, cat, set } = ctx;
  const [mod, setMod] = useState<CampaignModule>("hd");
  const [filter, setFilter] = useState("hepsi");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"liste" | "matris">("liste");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [phsAsk, setPhsAsk] = useState<string | null>(null);
  const sel = selectedOf(d, cat);
  const maxCredit = sel.reduce((a, x) => a + (maxCr(x.e) > 0 ? Math.min(x.s.credit, x.s.daily * maxCr(x.e)) : 0), 0);
  const modEntries = (m: CampaignModule) => cat.filter((e) => e.module === m);

  const patch = (e: CatalogEntry, p: Partial<Sel>) => set((x) => ({ ...x, sel: { ...x.sel, [e.key]: { ...(x.sel[e.key] ?? defaultSel(e)), ...p } } }));
  function toggle(e: CatalogEntry) {
    if (!selectable(e)) return;
    const on = d.sel[e.key]?.enabled === true;
    if (!on && e.requiresOwnerConfirmation && !d.phsConfirmed) {
      setPhsAsk(e.key);
      return;
    }
    patch(e, { enabled: !on });
  }
  function pickMod(m: CampaignModule) {
    setMod(m);
    const list = modEntries(m);
    setFilter(list.length > 12 ? list[0].group : "hepsi");
    setPhsAsk(null);
  }
  const tctx: TechCtx = { ctx, toggle, patch, open, setOpen, phsAsk, setPhsAsk };

  return (
    <>
      <section className="card">
        <div className="cardHead">
          <div>
            <p className="eyebrow">Ücretsiz analiz seçimi</p>
            <h2 className="h2">Modül, teknik ve yorum</h2>
            <p className="lead">Liste gerçek katalogdan (sürüm {ctx.ov.catalogVersion}) üretilir. Katalogda olmayan teknik seçilemez; sunucu da reddeder.</p>
          </div>
          <div className="seg" role="group" aria-label="Görünüm">
            <button aria-pressed={view === "liste"} onClick={() => setView("liste")}>Liste</button>
            <button aria-pressed={view === "matris"} onClick={() => setView("matris")}>Uygunluk matrisi</button>
          </div>
        </div>
        <div className="searchRow">
          <label className="sr" htmlFor="techSearch">Teknik ara</label>
          <input id="techSearch" className="input" type="search" placeholder="Teknik ara (ör. horary, solar, kalde)…" value={search} autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="selBar">
          <b>Seçilenler ({sel.length})</b>
          {sel.length ? sel.map((x) => (
            <span className="selChip" key={x.e.key}>
              {MODULE_UI[x.e.module].title} — {x.e.title}
              <button className="chipX" onClick={() => patch(x.e, { enabled: false })} aria-label={`${x.e.title} seçimini kaldır`}>×</button>
            </span>
          )) : <span className="muted small">Henüz seçim yok</span>}
          {sel.length ? <span className="small muted selSum">Günlük en çok {fmt(maxCredit)} kredi</span> : null}
        </div>
      </section>
      {search.trim() ? (
        <SearchResults tctx={tctx} q={search} clear={() => setSearch("")} />
      ) : (
        <>
          <section className="card">
            <h3 className="h3" style={{ marginBottom: 10 }}>1 · Modül</h3>
            <div className="modGrid">
              {MODULES.map((m) => {
                const list = modEntries(m);
                const n = list.filter((e) => selectable(e) && d.sel[e.key]?.enabled).length;
                const pkg = list.find((e) => e.package);
                return (
                  <button key={m} className="modBtn" aria-pressed={m === mod} onClick={() => pickMod(m)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={MODULE_UI[m].img} alt="" aria-hidden="true" />
                    <span>
                      <b>{MODULE_UI[m].title}</b>
                      <span>{pkg ? `${pkg.package!.features.length} özellik · tek paket` : `${list.length} kayıt`} · <span className="cnt">{pkg ? (n ? "pakette açık" : "kapalı") : `${n} açık`}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <CommentCard ctx={ctx} m={mod} />
          {view === "matris" ? <Matrix ctx={ctx} m={mod} filter={filter} setFilter={setFilter} /> : <TechSection tctx={tctx} m={mod} filter={filter} setFilter={setFilter} />}
        </>
      )}
    </>
  );
}

type TechCtx = {
  ctx: PanelCtx; toggle: (e: CatalogEntry) => void; patch: (e: CatalogEntry, p: Partial<Sel>) => void;
  open: Record<string, boolean>; setOpen: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  phsAsk: string | null; setPhsAsk: (k: string | null) => void;
};

function CommentCard({ ctx, m }: { ctx: PanelCtx; m: CampaignModule }) {
  const { d, cat, set } = ctx;
  const list = cat.filter((e) => e.module === m && selectable(e));
  const has = list.some((e) => e.comments.length > 0);
  const on = d.modComments[m] === true;
  const srcIds = [...new Set(list.flatMap((e) => e.comments))];
  const title = MODULE_UI[m].title;
  return (
    <section className="card" id="commentCard">
      <div className="cardHead">
        <div>
          <p className="eyebrow">2 · Yorum yönetimi — {title}</p>
          <h2 className="h2">{has ? `Yorumlar ${on ? "açık" : "kapalı"}` : "Bu modülde paylaşılabilir yorum kaynağı yok"}</h2>
          <p className="lead">Yorum kapalıyken ekran ve rapordan çıkarılır. Kural sunucuda da uygulanır: modül anahtarı VE teknik anahtarı VE katalogda yorum kaynağı.</p>
        </div>
        {has && <button className="switch big" role="switch" aria-checked={on} aria-label={`${title} yorumları`} onClick={() => set((x) => ({ ...x, modComments: { ...x.modComments, [m]: !on } }))} />}
      </div>
      <div className="twoCol">
        <div>
          <p className="fieldLabel">Owner kararıyla açılabilen kaynaklar</p>
          {srcIds.length ? (
            <ul className="srcList">{srcIds.map((id) => <li key={id}><b>{SOURCE_UI[id].label}</b><span className="small muted">{SOURCE_UI[id].origin}</span></li>)}</ul>
          ) : (
            <p className="small muted">Bu modülün tekniklerinde ücretsiz akışta kullanılabilecek yorum metni yok. Sahte yorum üretilmez.</p>
          )}
        </div>
        <div>
          <p className="fieldLabel">🔒 Hiçbir koşulda açılmaz</p>
          <ul className="lockList">{NEVER_PUBLIC[m].map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
      {m === "hd" && (
        <div className="libList" style={{ marginTop: 12 }}>
          <div className="libItem">
            <div><p><b>Word raporu (mevcut standart rapor)</b></p><p className="small muted">Ek kredi harcamaz. Yorum kapalıyken mevcut “yorumsuz” seçenekle üretilir. Mevcut sistemde Android uygulamada Word indirme kapalı.</p></div>
            <button className="switch" role="switch" aria-checked={d.hd.word} aria-label="Word raporu" onClick={() => set((x) => ({ ...x, hd: { ...x.hd, word: !x.hd.word } }))} />
          </div>
          <div className="libItem">
            <div><p><b>Kişisel Bilgi Bankası tanıtım kartı</b></p><p className="small muted">Sonuç ekranında görünür, kilitli; içerik asla gösterilmez. Tıklanınca özelliği tanıtır.</p></div>
            <button className="switch" role="switch" aria-checked={d.hd.kb} aria-label="Bilgi Bankası tanıtım kartı" onClick={() => set((x) => ({ ...x, hd: { ...x.hd, kb: !x.hd.kb } }))} />
          </div>
          <div><button className="btn sm" onClick={ctx.openKb}>Bilgi Bankası tanıtımını önizle</button></div>
        </div>
      )}
    </section>
  );
}

function GroupFilter({ list, filter, setFilter, d, withOpen }: { list: CatalogEntry[]; filter: string; setFilter: (g: string) => void; d: Draft; withOpen: boolean }) {
  const groups = ["hepsi", ...new Set(list.map((e) => e.group))];
  const inGroup = (e: CatalogEntry, g: string) => g === "hepsi" || e.group === g;
  return (
    <div className="toolbar" role="group" aria-label="Teknik grupları">
      {groups.map((g) => {
        const openN = list.filter((e) => inGroup(e, g) && selectable(e) && d.sel[e.key]?.enabled).length;
        return (
          <button key={g} className="chipBtn" aria-pressed={filter === g} onClick={() => setFilter(g)}>
            {g === "hepsi" ? "Tümü" : g} <span className="muted">{list.filter((e) => inGroup(e, g)).length}{withOpen && openN ? ` · ${openN} açık` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function TechSection({ tctx, m, filter, setFilter }: { tctx: TechCtx; m: CampaignModule; filter: string; setFilter: (g: string) => void }) {
  const { ctx } = tctx;
  const all = ctx.cat.filter((e) => e.module === m);
  const f = all.some((e) => e.group === filter) ? filter : "hepsi";
  const list = all.filter((e) => f === "hepsi" || e.group === f);
  const eligible = list.filter((e) => selectable(e) && !e.requiresOwnerConfirmation);
  function bulk(on: boolean) {
    ctx.set((x) => {
      const sel = { ...x.sel };
      for (const e of list) {
        if (!selectable(e) || (on && e.requiresOwnerConfirmation)) continue;
        sel[e.key] = { ...(sel[e.key] ?? defaultSel(e)), enabled: on };
      }
      return { ...x, sel };
    });
    if (on && list.some((e) => e.requiresOwnerConfirmation)) ctx.toast("Dört Ok / PHS toplu açılışa dahil edilmedi — ayrı Owner kararı gerekir.");
  }
  return (
    <section className="card">
      <div className="cardHead"><div><p className="eyebrow">3 · {MODULE_UI[m].title} teknikleri</p><h2 className="h2">Teknik seçimi ve limitler</h2><p className="lead">{MODULE_UI[m].note}</p></div></div>
      <GroupFilter list={all} filter={f} setFilter={setFilter} d={ctx.d} withOpen />
      <div className="toolbar">
        <button className="btn sm" disabled={!eligible.length} onClick={() => bulk(true)}>{f === "hepsi" ? "Uygun olanların tümünü aç" : `“${f}” grubunu aç`} ({eligible.length})</button>
        <button className="btn sm ghost" onClick={() => bulk(false)}>{f === "hepsi" ? "Bu modülde tümünü kapat" : "Bu grubu kapat"}</button>
      </div>
      <p className="unitLegend"><span><i className="u-an" /><b>Analiz hakkı</b> = ziyaretçinin yapabileceği analiz sayısı</span><span><i className="u-kr" /><b>Kredi</b> = hesaplama altyapısına ödenen birim</span></p>
      <div className="techList">{list.map((e) => <TechRowView key={e.key} tctx={tctx} e={e} />)}</div>
    </section>
  );
}

function SearchResults({ tctx, q, clear }: { tctx: TechCtx; q: string; clear: () => void }) {
  const n = norm(q.trim());
  const hits = tctx.ctx.cat.filter((e) => norm(`${e.title} ${e.group} ${e.key} ${MODULE_UI[e.module].title}`).includes(n));
  return (
    <section className="card">
      <div className="cardHead"><div><p className="eyebrow">Arama</p><h2 className="h2">“{q}” için {hits.length} sonuç</h2></div><button className="btn sm ghost" onClick={clear}>Aramayı temizle</button></div>
      {hits.length ? <div className="techList" id="searchHits">{hits.map((e) => <TechRowView key={e.key} tctx={tctx} e={e} showMod />)}</div> : <p className="muted">Sonuç yok. Katalogda olmayan bir teknik ücretsiz kampanyada açılamaz.</p>}
    </section>
  );
}

function TechRowView({ tctx, e, showMod }: { tctx: TechCtx; e: CatalogEntry; showMod?: boolean }) {
  const { ctx, toggle, patch, open, setOpen, phsAsk, setPhsAsk } = tctx;
  const { d } = ctx;
  const s = d.sel[e.key];
  const on = !!s?.enabled && selectable(e);
  const r = READINESS_UI[e.readiness];
  const ui = techniqueUi(e.key);
  const modOn = d.modComments[e.module] === true;
  const isOpen = !!open[e.key];
  const idp = e.key.replace(/[^a-z0-9]/g, "-");
  const comState = e.comments.length ? (commentOn(d, e) ? <span className="tag vio">Yorum açık</span> : <span className="tag no">Yorum kapalı</span>) : <span className="tag no">Yorum kaynağı yok</span>;
  const limitField = (key: "ip" | "daily" | "credit", label: string) => (
    <div className="field">
      <label htmlFor={`l-${idp}-${key}`}>{label}</label>
      <input
        id={`l-${idp}-${key}`} className="input num" type="number" min={0} max={LIMITS[key]} step={1} inputMode="numeric" value={s![key]}
        onChange={(ev) => patch(e, { [key]: clampInt(ev.target.value, 0, LIMITS[key]) } as Partial<Sel>)}
      />
    </div>
  );
  return (
    <div className={`tech ${on ? "on" : ""} ${selectable(e) ? "" : "dis"}`} data-tech={e.key}>
      <div className="techRow">
        <button className="switch" role="switch" aria-checked={on} aria-label={`${e.title} ücretsiz analiz`} disabled={!selectable(e)} onClick={() => toggle(e)} />
        <div className="techName">
          <b>{showMod ? <span className="muted">{MODULE_UI[e.module].title} · </span> : null}{e.title}</b>
          <div className="meta">
            <span className={`tag ${r.cls}`}>{r.label}</span><span className="tag">{e.group}</span><span className="tag">{peopleText(e)}</span>
            {e.needsTime && <span className="tag">Saat zorunlu</span>}{comState}
          </div>
          {e.package && <div className="pkgList" aria-label="Paketteki özellikler">{e.package.features.map((f) => <span className="pkgChip" key={f.id}>{f.name}</span>)}</div>}
        </div>
        <div className="techCredit"><b>{crText(e)}</b><span>kredi / analiz</span></div>
      </div>
      {!selectable(e) && <div className="techReason">⛔ {ui.why || r.hint}</div>}
      {e.package && <div className="notice warn inlineConfirm pkgNote">Hacamat Takvimi pakete dahildir. Gerçek yayından önce sağlık iddiaları ve hukuki uygunluk incelenecek; inceleme tamamlanana kadar ziyaretçiye yalnız tarafsız takvim bilgisi (Hicri gün + Ay evresi) gösterilir, kural metni ve yarar ifadesi gösterilmez.</div>}
      {phsAsk === e.key && (
        <div className="notice warn inlineConfirm" role="alertdialog" aria-labelledby={`phsQ-${idp}`}>
          <div>
            <b id={`phsQ-${idp}`}>Tam analiz kararı gerekir.</b> {e.title} her analizde {crText(e)} kredi harcar, ayrı izin ister ve mevcut Word raporuna girmez. Owner kararı olmadan varsayılan kapalı kalır. Sunucu bu onay olmadan kaydı reddeder.
            <div className="actionRow" style={{ marginTop: 8 }}>
              <button className="btn sm primary" autoFocus onClick={() => { ctx.set((x) => ({ ...x, phsConfirmed: true, sel: { ...x.sel, [e.key]: { ...(x.sel[e.key] ?? defaultSel(e)), enabled: true } } })); setPhsAsk(null); }}>Kararı onaylıyorum, aç</button>
              <button className="btn sm" onClick={() => setPhsAsk(null)}>Kapalı kalsın</button>
            </div>
          </div>
        </div>
      )}
      {on && s && (
        <>
          <div className={`techLimits ${maxCr(e) === 0 ? "two" : ""}`}>
            {limitField("ip", e.package ? "IP başına / gün (ortak)" : "IP başına / gün")}
            {limitField("daily", e.package ? "Günlük kullanım kontenjanı (ortak)" : "Günlük analiz hakkı")}
            {maxCr(e) > 0 && limitField("credit", "Günlük kredi bütçesi")}
          </div>
          <div className="techReason"><LimitHint e={e} s={s} /></div>
          {e.comments.length > 0 && (
            <div className="techCom">
              <span>Bu teknikte yorum <span className="small muted">({e.comments.map((id) => SOURCE_UI[id].label).join(", ")})</span></span>
              <button className="switch" role="switch" aria-checked={commentOn(d, e)} aria-label={`${e.title} yorumu`} disabled={!modOn} onClick={() => patch(e, { comments: !s.comments })} />
              {!modOn && <span className="small muted">Önce modül yorumlarını açın</span>}
            </div>
          )}
        </>
      )}
      <div className="techFoot">
        <button className="linkBtn" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [e.key]: !o[e.key] }))}>{isOpen ? "Ayrıntıları gizle" : "Girdiler, rapor ve uygunluk"}</button>
      </div>
      {isOpen && <TechDetails d={d} e={e} />}
    </div>
  );
}

function LimitHint({ e, s }: { e: CatalogEntry; s: Sel }) {
  const cr = maxCr(e);
  if (cr === 0)
    return e.package
      ? <>Sağlayıcı kredisi 0 — kredi bütçesi alanı yok. Altı özellik için ortak: günde {s.daily} kullanım, IP başına {s.ip}.</>
      : <>0 kredi harcar — kredi bütçesi alanı yok; yalnız analiz hakkı ({s.daily}) ve IP sınırı ({s.ip}) uygulanır.</>;
  const need = s.daily * cr;
  if (s.credit < need) return <>⚠ {s.daily} analiz hakkı için en çok {need} kredi gerekir; bütçe {s.credit} → günde en az <b>{Math.floor(s.credit / cr)}</b> analiz garanti.</>;
  return <>{s.daily} analiz hakkı × en çok {cr} kredi = en çok <b>{need}</b> kredi (bütçe {s.credit}).</>;
}

function TechDetails({ d, e }: { d: Draft; e: CatalogEntry }) {
  const ui = techniqueUi(e.key);
  return (
    <div className="techDetails">
      <dl className="dlGrid">
        <dt>Girdiler</dt><dd>{e.package ? e.package.features.map((f) => f.name).join(" · ") : ui.form}</dd>
        <dt>Kişi</dt><dd>{peopleText(e)}{e.needsTime ? " · doğum saati zorunlu" : ""}</dd>
        <dt>Kredi</dt><dd>{crText(e)} kredi / analiz{e.credit[0] !== e.credit[1] ? " (değişken — bütçede üst sınır kullanılır)" : ""}</dd>
        <dt>Yorum kaynağı</dt><dd>{e.comments.length ? e.comments.map((id) => `${SOURCE_UI[id].label} — ${SOURCE_UI[id].origin}`).join(" · ") : "Yok — sahte yorum üretilmez"}</dd>
        <dt>Uygunluk</dt><dd>{READINESS_UI[e.readiness].label}{ui.why ? ` — ${ui.why}` : ""}</dd>
      </dl>
      {e.package && (
        <div>
          <p className="fieldLabel">Paket içeriği ({e.package.features.length} özellik)</p>
          <ul className="srcList">{e.package.features.map((f) => <li key={f.id}><b>{f.name}</b><span className="small muted">{f.neutralOnly ? "Yalnız tarafsız takvim bilgisi (hukuki inceleme öncesi)" : "Tarayıcıda yerel hesap"}</span></li>)}</ul>
        </div>
      )}
      <ReportScope d={d} e={e} owner />
    </div>
  );
}

/** Rapor kapsamı: yorum kapalıysa yorum bölümleri çıkarılır; uzmana özel bölümler hiç yer almaz. */
export function ReportScope({ d, e, owner }: { d: Draft; e: CatalogEntry; owner: boolean }) {
  const rep = techniqueUi(e.key).report;
  const hdOff = e.module === "hd" && rep.formats[0] === "Word" && !d.hd.word;
  const com = commentOn(d, e);
  return (
    <div className="repScope" data-report={e.key}>
      <p className="fieldLabel">Rapor kapsamı · {hdOff ? "Rapor bu kampanyada kapalı" : rep.formats.join(" · ")}</p>
      {hdOff ? (
        <p className="small muted">Word raporu Owner tarafından kapatıldı; yalnız ekran sonucu gösterilir.</p>
      ) : (
        <ul className="secList">
          {rep.sections.filter(([, k]) => owner || k !== "gizli").map(([label, k]) => {
            if (k === "gizli") return <li key={label} className="sx-lock" data-sx="gizli">🔒 {label} — hiçbir koşulda dahil edilmez</li>;
            if (k === "yok") return <li key={label} className="sx-off" data-sx="yok">— {label}</li>;
            if (k === "yorum") return com
              ? <li key={label} className="sx-com" data-sx="yorum-acik">✓ {label} <span className="tag vio">yorum</span></li>
              : <li key={label} className="sx-off" data-sx="yorum-kapali">— {label} <span className="small">(yorumlar kapalı — raporda yer almaz)</span></li>;
            return <li key={label} className="sx-on" data-sx="veri">✓ {label}</li>;
          })}
        </ul>
      )}
      {owner && rep.note && <p className="small muted">{rep.note}</p>}
      {!owner && <p className="small muted">Uzmana özel bölümler (kişisel notlar, Bilgi Bankası kayıtları) raporda yer almaz.</p>}
    </div>
  );
}

function Matrix({ ctx, m, filter, setFilter }: { ctx: PanelCtx; m: CampaignModule; filter: string; setFilter: (g: string) => void }) {
  const { d, cat } = ctx;
  const all = cat.filter((e) => e.module === m);
  const f = all.some((e) => e.group === filter) ? filter : "hepsi";
  const list = all.filter((e) => f === "hepsi" || e.group === f);
  const cnt = (r: string) => all.filter((e) => e.readiness === r).length;
  return (
    <section className="card">
      <div className="cardHead">
        <div>
          <p className="eyebrow">Gerçek teknik uygunluk matrisi</p>
          <h2 className="h2">{MODULE_UI[m].title} — {all.length} kayıt</h2>
          <p className="lead">Hazır aday {cnt("hazir")} · Doğrulama gerekli {cnt("dogrulama")} · Henüz uygun değil {cnt("uygun_degil")}. Kaynak: sunucu kataloğu sürüm {ctx.ov.catalogVersion}.</p>
        </div>
      </div>
      <GroupFilter list={all} filter={f} setFilter={setFilter} d={d} withOpen={false} />
      <table className="mx" id="matrix">
        <thead><tr><th>Teknik</th><th>Uygunluk</th><th>Kişi</th><th>Saat</th><th>Kredi</th><th>Yorum kaynağı</th><th>Rapor</th><th>Seçili</th><th>Not</th></tr></thead>
        <tbody>
          {list.map((e) => {
            const ui = techniqueUi(e.key);
            return (
              <tr key={e.key} className={selectable(e) ? "" : "mxDis"}>
                <td data-l="Teknik"><b>{e.title}</b><span className="small muted"> · {e.group}</span>{e.package && <><br /><span className="small">{e.package.features.map((x) => x.name).join(" · ")}</span></>}</td>
                <td data-l="Uygunluk"><span className={`tag ${READINESS_UI[e.readiness].cls}`}>{READINESS_UI[e.readiness].label}</span></td>
                <td data-l="Kişi">{peopleText(e)}</td>
                <td data-l="Saat">{e.needsTime ? "Zorunlu" : "—"}</td>
                <td data-l="Kredi">{crText(e)}</td>
                <td data-l="Yorum">{e.comments.length ? e.comments.map((id) => SOURCE_UI[id].label).join(", ") : "Yok"}</td>
                <td data-l="Rapor">{ui.report.formats.join(", ")}</td>
                <td data-l="Seçili">{d.sel[e.key]?.enabled && selectable(e) ? "✓" : "—"}</td>
                <td data-l="Not" className="small">{ui.why ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

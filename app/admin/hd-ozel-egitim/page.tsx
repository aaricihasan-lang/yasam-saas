"use client";

/**
 * I / J · Eğitmen Özel Eğitim Arşivleri — OWNER yönetim merkezi (FAZ 7).
 * Kapsam YALNIZ danışan izniyle eğitim arşivine eklenmiş kayıtlardır (24.08 politikasının dar, yazılı istisnası); uzmanın diğer
 * danışanları / notları / analizleri bu ekranda YOKTUR. Filtreler (eğitmen · durum · arama) SUNUCUDA uygulanır ve URL'de tutulur.
 * Masaüstü: profesyonel tablo. ≤900 px: her kayıt ayrı yönetim kartı (tablo sıkıştırılmaz). Sahte işlem / sahte başarı yok.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_CATEGORY_LABEL, PRIV_STATE_LABEL, type PrivItemCard, type PrivStateFilter } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "@/app/human-design/egitim-merkezi/_ui/Shell";
import { DeleteFlow, Modal, TwoStepConfirm } from "@/app/human-design/egitim-merkezi/_ui/DeleteFlow";
import { fmtDay, privCall, privDownload } from "@/app/human-design/egitim-merkezi/_ui/privApi";

type Overview = {
  archiveOpen: boolean;
  texts: { version: string; title: string; approved: boolean; approvedAt: string | null; sha256: string }[];
  grants: { userId: string; name: string; grantedAt: string; items: number }[];
  trainers: { userId: string; name: string; items: number }[];
};
type Expert = { id: string; name: string; email: string; eligible: boolean; reason: string | null; granted: boolean };
const STATE_OPTS: { v: PrivStateFilter; t: string }[] = [
  { v: "all", t: "Tüm durumlar" }, { v: "ok", t: "Aktif kayıtlar" }, { v: "consent_withdrawn", t: "İzni geri çekilmiş" }, { v: "invalid", t: "Geçersiz kaynak / kanıt" },
];
const API = "/api/admin/hd/education/private";
const tagCls = (s: PrivItemCard["state"]) => (s === "ok" ? base.tOk : s === "source_changed" ? base.tWarn : base.tBad);
const shortState = (s: PrivItemCard["state"]) => (s === "ok" ? "Erişime açık" : s === "consent_withdrawn" ? "İzin geri çekildi" : s === "source_changed" ? "Kaynak değişti" : "Kanıt / izin geçersiz");

function RowMenu({ x, onDelete, onConsent }: { x: PrivItemCard; onDelete: () => void; onConsent: () => void }) {
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
      <button type="button" className={oz.menuBtn} aria-haspopup="menu" aria-expanded={open} aria-label={`${x.title} — işlemler`} onClick={() => setOpen(!open)} data-owner-menu={x.id}>⋯</button>
      {open ? (
        <div className={oz.menu} role="menu">
          <Link role="menuitem" href={`/admin/hd-ozel-egitim/${x.id}`}>Görüntüle</Link>
          <Link role="menuitem" href={`/admin/hd-ozel-egitim/${x.id}/duzenle`}>Düzenle</Link>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onConsent(); }} data-owner-consent={x.id}>İzin durumunu incele</button>
          <button type="button" role="menuitem" className={oz.menuDanger} onClick={() => { setOpen(false); onDelete(); }} data-owner-delete={x.id}>Arşivden kaldır</button>
        </div>
      ) : null}
    </div>
  );
}

function OwnerCenter() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const trainer = sp.get("egitmen") ?? "";
  const stateF = (sp.get("durum") ?? "all") as PrivStateFilter;
  const qParam = sp.get("q") ?? "";
  const [qInput, setQInput] = useState(() => qParam);
  const [ov, setOv] = useState<Overview | null>(null);
  const [items, setItems] = useState<PrivItemCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const listKey = `${trainer}|${stateF}|${qParam}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState<PrivItemCard | null>(null);
  const [consentOf, setConsentOf] = useState<PrivItemCard | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "close" | "open" } | { kind: "revoke"; userId: string; name: string } | { kind: "grant"; userId: string; name: string }
    | { kind: "approve"; version: string } | { kind: "journal"; journal: Record<string, unknown> }>(null);
  const [legalRef, setLegalRef] = useState("");
  const [expQ, setExpQ] = useState("");
  const [experts, setExperts] = useState<Expert[] | null>(null);

  const setParams = useCallback((p: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(p)) { if (v && v !== "all") n.set(k, v); else n.delete(k); }
    router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false });
  }, [sp, router, pathname]);

  const loadOverview = useCallback(async () => {
    const r = await privCall<{ overview: Overview }>("owner", `${API}/overview`);
    if (r.ok) { setOv(r.body.overview); return true; }
    setPhase(r.notFound ? "denied" : "error");
    return false;
  }, []);
  const fetchList = useCallback(() => {
    const qs = new URLSearchParams();
    if (trainer) qs.set("trainer", trainer);
    if (stateF !== "all") qs.set("state", stateF);
    if (qParam) qs.set("q", qParam);
    return privCall<{ items: PrivItemCard[]; total: number }>("owner", `${API}/items${qs.toString() ? `?${qs}` : ""}`);
  }, [trainer, stateF, qParam]);
  const applyList = useCallback((r: Awaited<ReturnType<typeof fetchList>>, key: string) => {
    setLoadedKey(key);
    if (r.ok) { setItems(r.body.items); setTotal(r.body.total); setListErr(null); } else if (r.notFound) setPhase("denied"); else setListErr(r.error);
  }, []);
  const loadList = useCallback(async () => applyList(await fetchList(), listKey), [applyList, fetchList, listKey]);

  useEffect(() => {
    let live = true;
    void privCall<{ overview: Overview }>("owner", `${API}/overview`).then((r) => {
      if (!live) return;
      if (r.ok) { setOv(r.body.overview); setPhase("ok"); } else setPhase(r.notFound ? "denied" : "error");
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (phase !== "ok") return;
    let live = true;
    void fetchList().then((r) => { if (live) applyList(r, listKey); });
    return () => { live = false; };
  }, [phase, fetchList, applyList, listKey]);
  useEffect(() => {
    const t = setTimeout(() => { if (qInput.trim() !== qParam) setParams({ q: qInput.trim() }); }, 350);
    return () => clearTimeout(t);
  }, [qInput, qParam, setParams]);
  const listBusy = loadedKey !== listKey;

  if (phase === "loading") return <LoadingView />;
  if (phase === "denied") return <NotFoundView home="/admin" />;
  if (phase === "error" || !ov) return <ErrorView message="Yönetim ekranı yüklenemedi." onRetry={() => { setPhase("loading"); void loadOverview().then((ok) => ok && setPhase("ok")); }} />;

  const trainerOpts = Array.from(new Map([...ov.trainers.map((t) => [t.userId, { id: t.userId, name: t.name, items: t.items }] as const),
    ...ov.grants.filter((g) => !ov.trainers.some((t) => t.userId === g.userId)).map((g) => [g.userId, { id: g.userId, name: g.name, items: 0 }] as const)]).values())
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const selTrainer = trainerOpts.find((t) => t.id === trainer) ?? null;
  const openCount = (items ?? []).filter((x) => x.state === "ok").length;
  const text = ov.texts[ov.texts.length - 1] ?? null;
  const refreshAll = async (m: string) => { setMsg(m); await loadOverview(); await loadList(); };

  async function searchExperts() {
    const r = await privCall<{ experts: Expert[] }>("owner", `${API}/overview?experts=${encodeURIComponent(expQ.trim())}`);
    setExperts(r.ok ? r.body.experts : []);
    if (!r.ok) setMsg(r.error);
  }
  async function act(body: Record<string, unknown>): Promise<string | null> {
    const r = await privCall("owner", `${API}/overview`, { method: "POST", body });
    return r.ok ? null : r.error;
  }

  return (
    <Shell>
      <header className={base.hero}>
        <p className={base.eyebrow}>OWNER · HUMAN DESIGN</p>
        <h1 className={base.title}>Eğitmen Özel Eğitim Arşivleri</h1>
        <p className={base.sub}>Yalnız danışan izniyle eğitim arşivine eklenmiş kayıtlar · uzmanın diğer verileri burada yer almaz</p>
      </header>
      {msg ? <p className={base.msg} role="status" data-owner-msg>{msg}</p> : null}
      <section className={base.stats} aria-label="Özet">
        <div className={base.stat}><b data-owner-total>{total}</b><span>Özel kayıt (toplam)</span></div>
        <div className={base.stat}><b>{ov.grants.length}</b><span>Yetkili eğitmen</span></div>
        <div className={`${base.stat} ${base.sOk}`}><b>{openCount}</b><span>Erişime açık (görünen)</span></div>
        <div className={`${base.stat} ${base.sBad}`}><b>{(items ?? []).length - openCount}</b><span>Erişim kapalı (görünen)</span></div>
      </section>

      <div className={base.split}>
        <section className={base.panel} aria-label="Özel eğitim kayıtları">
          <div className={oz.ownerFilters}>
            <input type="search" placeholder="Başlık, takma ad veya eğitmen ara" aria-label="Başlık, takma ad veya eğitmen ara" value={qInput} onChange={(e) => setQInput(e.target.value)} data-owner-search />
            <select aria-label="Eğitmen" value={trainer} onChange={(e) => setParams({ egitmen: e.target.value })} data-owner-trainer>
              <option value="">Tüm yetkili eğitmenler</option>
              {trainerOpts.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.items})</option>)}
            </select>
            <select aria-label="Kayıt durumu" value={stateF} onChange={(e) => setParams({ durum: e.target.value })} data-owner-state>
              {STATE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          </div>
          {selTrainer || stateF !== "all" || qParam ? (
            <p className={oz.filterNote} data-owner-filter-note>
              <span>{[selTrainer ? `${selTrainer.name}` : null, stateF !== "all" ? STATE_OPTS.find((o) => o.v === stateF)?.t : null, qParam ? `“${qParam}”` : null].filter(Boolean).join(" · ")}
                {" "}· {(items ?? []).length} kayıt gösteriliyor</span>
              <button type="button" className={base.linkBtn} onClick={() => { setQInput(""); setParams({ egitmen: "", durum: "", q: "" }); }}>Filtreyi kaldır</button>
            </p>
          ) : null}
          {listErr ? <p className={base.err} role="alert">{listErr} <button type="button" className={base.linkBtn} onClick={() => void loadList()}>Tekrar dene</button></p> : null}
          {items === null || listBusy ? <p className={base.empty} aria-live="polite" data-owner-loading>Yükleniyor…</p> : !items.length ? (
            <p className={base.empty} data-owner-empty>{total ? "Filtreyle eşleşen kayıt yok." : "Henüz hiçbir eğitmenin özel eğitim kaydı yok."}</p>
          ) : (
            <>
              <div className={`${base.tableWrap} ${oz.ownerTable}`}>
                <table className={base.tbl} data-owner-table>
                  <thead><tr><th>Eğitim başlığı</th><th>Eğitmen</th><th>Kategori</th><th>İzin</th><th>Erişim</th><th>Eklendi</th><th><span className={oz.srOnly}>İşlemler</span></th></tr></thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id} data-owner-row={x.id}>
                        <td><Link className={oz.cardLink} href={`/admin/hd-ozel-egitim/${x.id}`}><b>{x.title}</b></Link><small>{x.aliasLabel}</small></td>
                        <td>{x.trainer?.name ?? "—"}</td>
                        <td>{PRIV_CATEGORY_LABEL[x.category] ?? x.category}</td>
                        <td>{x.consent?.withdrawnAt ? <span className={`${base.tag} ${base.tBad}`}>Geri çekildi</span> : <span className={`${base.tag} ${base.tOk}`}>{x.consent?.displayScope === "acik_isim" ? "Açık isim" : "Anonim"} · {fmtDay(x.consent?.givenOn)}</span>}</td>
                        <td><span className={`${base.tag} ${tagCls(x.state)}`} title={PRIV_STATE_LABEL[x.state]}>{shortState(x.state)}</span></td>
                        <td>{fmtDay(x.createdAt)}</td>
                        <td><RowMenu x={x} onDelete={() => setDel(x)} onConsent={() => setConsentOf(x)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className={oz.ownerCards} data-owner-cards>
                {items.map((x) => (
                  <li key={x.id} className={oz.oCard} data-owner-card={x.id}>
                    <div className={oz.oCardMenu}><RowMenu x={x} onDelete={() => setDel(x)} onConsent={() => setConsentOf(x)} /></div>
                    <h3>{x.title}</h3>
                    <dl>
                      <dt>Eğitmen</dt><dd>{x.trainer?.name ?? "—"}</dd>
                      <dt>Takma ad</dt><dd>{x.aliasLabel}</dd>
                      <dt>İzin</dt><dd>{x.consent?.withdrawnAt ? <span className={`${base.tag} ${base.tBad}`}>Geri çekildi</span> : <span className={`${base.tag} ${base.tOk}`}>{x.consent?.displayScope === "acik_isim" ? "Açık isim" : "Anonim"}</span>}</dd>
                      <dt>Durum</dt><dd><span className={`${base.tag} ${tagCls(x.state)}`}>{shortState(x.state)}</span></dd>
                      <dt>Eklendi</dt><dd>{fmtDay(x.createdAt)}</dd>
                    </dl>
                    <div className={oz.oCardActions}>
                      <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href={`/admin/hd-ozel-egitim/${x.id}`}>Görüntüle</Link>
                      <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setConsentOf(x)}>İzin durumu</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={base.count}>{(items ?? []).length} / {total} kayıt</p>
        </section>

        <aside>
          <section className={base.panel} aria-labelledby="ow-switch">
            <h2 id="ow-switch" className={base.h2}>Arşiv anahtarı</h2>
            <p className={base.lead}>Kapatıldığında tüm eğitmenlerin özel arşiv erişimi anında kapanır; owner yönetimi sürer.</p>
            <div className={oz.switchRow}>
              <span className={`${oz.sw} ${ov.archiveOpen ? oz.swOn : ""}`} aria-hidden="true" />
              <b data-owner-archive={ov.archiveOpen ? "open" : "closed"}>{ov.archiveOpen ? "Açık" : "Kapalı"}</b>
              <button type="button" className={`${base.btn} ${ov.archiveOpen ? base.danger : base.save} ${oz.touch}`} onClick={() => setConfirm({ kind: ov.archiveOpen ? "close" : "open" })} data-owner-toggle>
                {ov.archiveOpen ? "Tüm erişimi kapat" : "Arşivi aç"}
              </button>
            </div>
          </section>
          <section className={base.panel} aria-labelledby="ow-text">
            <h2 id="ow-text" className={base.h2}>İzin metni</h2>
            {text ? (
              <dl className={base.dl}>
                <dt>Sürüm</dt><dd>{text.version}</dd>
                <dt>Durum</dt><dd>{text.approved ? <span className={`${base.tag} ${base.tOk}`}>Kullanıma açık · {fmtDay(text.approvedAt)}</span> : <span className={`${base.tag} ${base.tWarn}`}>Hukuk onayı bekliyor</span>}</dd>
              </dl>
            ) : <p className={base.lead}>Metin yok.</p>}
            {text && !text.approved ? (
              <>
                <p className={`${base.note} ${base.warn}`}>Metin owner onayı ve hukuk referansı olmadan kullanıma açılamaz; onaysız metinle hiçbir eğitmen izin kaydedemez.</p>
                <label className={oz.field}>Hukuk inceleme referansı<input value={legalRef} onChange={(e) => setLegalRef(e.target.value)} placeholder="ör. avukat görüş yazısı no / tarihi" data-owner-legal-ref /></label>
                <div className={base.actions}><button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!legalRef.trim()} onClick={() => setConfirm({ kind: "approve", version: text.version })} data-owner-approve>Kullanıma onayla</button></div>
              </>
            ) : null}
          </section>
          <section className={base.panel} aria-labelledby="ow-grants">
            <h2 id="ow-grants" className={base.h2}>Özel arşiv yetkileri</h2>
            <p className={base.lead}>Merkezî Hazır Eğitim Haritaları yetkisinden ayrıdır.</p>
            {ov.grants.length ? (
              <ul className={oz.trainerList} data-owner-grants>
                {ov.grants.map((g) => (
                  <li key={g.userId}>
                    <span><b>{g.name}</b><small>Yetki {fmtDay(g.grantedAt)} · {g.items} kayıt</small></span>
                    <span className={base.uAct}>
                      <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => setParams({ egitmen: g.userId })}>Kayıtlar</button>
                      <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setConfirm({ kind: "revoke", userId: g.userId, name: g.name })} data-owner-revoke={g.userId}>İptal et</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className={base.empty}>Etkin yetki yok.</p>}
            <div className={oz.toolbar}>
              <input className={`${base.input} ${oz.search}`} type="search" placeholder="Uzman adı veya e-posta" aria-label="Yetki verilecek uzmanı ara" value={expQ} onChange={(e) => setExpQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void searchExperts(); }} data-owner-expert-q />
              <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => void searchExperts()} data-owner-expert-search>Uzman ara</button>
            </div>
            {experts ? (experts.length ? (
              <ul className={oz.trainerList} data-owner-experts>
                {experts.map((e) => (
                  <li key={e.id}>
                    <span><b>{e.name}</b><small>{e.email}{e.reason ? ` · ${e.reason}` : ""}</small></span>
                    {e.granted ? <span className={`${base.tag} ${base.tOk}`}>Yetkili</span>
                      : <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} disabled={!e.eligible} onClick={() => setConfirm({ kind: "grant", userId: e.id, name: e.name })} data-owner-grant={e.id}>Yetki ver</button>}
                  </li>
                ))}
              </ul>
            ) : <p className={base.empty}>Eşleşen uzman yok.</p>) : null}
          </section>
          <section className={base.panel} aria-labelledby="ow-dr">
            <h2 id="ow-dr" className={base.h2}>Felaket kurtarma günlüğü</h2>
            <p className={base.lead}>Geri çekilen izinler, silinen kayıtlar ve iptal edilen yetkilerin içerik taşımayan listesi. Yedek klasöründe saklayın; eski yedekten geri yüklemeden sonra arşiv kapalıyken uygulanır.</p>
            <div className={base.actions}>
              <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} data-owner-journal-dl onClick={async () => {
                const r = await privDownloadJson();
                setMsg(r);
              }}>Günlüğü indir</button>
              <input id="ow-journal" className={oz.fileInput} type="file" accept="application/json" disabled={ov.archiveOpen} onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                try { setConfirm({ kind: "journal", journal: JSON.parse(await f.text()) as Record<string, unknown> }); } catch { setMsg("Günlük dosyası okunamadı (geçerli JSON değil)."); }
              }} />
              <label htmlFor="ow-journal" className={oz.fileLabel} aria-disabled={ov.archiveOpen} title={ov.archiveOpen ? "Önce arşivi kapatın" : undefined}>Günlüğü uygula</label>
            </div>
            {ov.archiveOpen ? <p className={oz.hint}>Uygulama yalnız arşiv KAPALIYKEN yapılabilir.</p> : null}
          </section>
        </aside>
      </div>

      {del ? (
        <DeleteFlow side="owner" endpoint={`${API}/items/delete`} items={[{ id: del.id, title: del.title }]} onCancel={() => setDel(null)}
          onDone={() => { setDel(null); void refreshAll("Kayıt eğitim arşivinden kaldırıldı. Danışanın haritası ve kayıtları korunuyor."); }} />
      ) : null}
      {consentOf ? <ConsentReview item={consentOf} onClose={() => setConsentOf(null)} onChanged={(m) => { setConsentOf(null); void refreshAll(m); }} /> : null}
      {confirm ? (
        <TwoStepConfirm
          title={confirm.kind === "close" ? "Tüm özel arşiv erişimi kapatılsın mı?" : confirm.kind === "open" ? "Özel arşiv açılsın mı?" : confirm.kind === "revoke" ? `${confirm.name} için yetki iptal edilsin mi?`
            : confirm.kind === "grant" ? `${confirm.name} için özel arşiv yetkisi verilsin mi?` : confirm.kind === "approve" ? "İzin metni kullanıma onaylansın mı?" : "İptal günlüğü uygulansın mı?"}
          danger={confirm.kind === "close" || confirm.kind === "revoke"}
          confirmLabel={confirm.kind === "close" ? "Erişimi kapat" : confirm.kind === "open" ? "Arşivi aç" : confirm.kind === "revoke" ? "Yetkiyi iptal et" : confirm.kind === "grant" ? "Yetki ver" : confirm.kind === "approve" ? "Onayla" : "Günlüğü uygula"}
          body1={<p>{confirm.kind === "close" ? "Kapatıldığında hiçbir eğitmen özel arşivini açamaz; kayıtlar silinmez." : confirm.kind === "open" ? "Yetkili eğitmenler kendi özel arşivlerini yeniden kullanabilir."
            : confirm.kind === "revoke" ? "Eğitmen özel arşivine artık erişemez (açık oturumlarda da). Kayıtları silinmez; buradan yönetilebilir." : confirm.kind === "grant" ? "Bu, gerçek bir eğitmene erişim verir. Merkezî Hazır Eğitim Haritaları yetkisi vermez."
            : confirm.kind === "approve" ? "Onaylanan metin kullanıma açılır ve geri alınamaz; değişiklik yeni sürümle yapılır." : "Geri yüklemeden sonra geri çekilmiş izinler kapatılır, silinmiş kayıtlar ve iptal edilmiş yetkiler kaldırılır."}</p>}
          body2={<p>Bu işlem sunucuda gerçek olarak uygulanacak. Onaylıyor musunuz?</p>}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            let e: string | null = null; let m = "";
            if (confirm.kind === "close" || confirm.kind === "open") { e = await act({ action: confirm.kind, confirm: true }); m = confirm.kind === "close" ? "Özel arşiv erişimi kapatıldı." : "Özel arşiv açıldı."; }
            else if (confirm.kind === "revoke") { e = await act({ action: "revoke", userId: confirm.userId }); m = `${confirm.name} için yetki iptal edildi.`; }
            else if (confirm.kind === "grant") { e = await act({ action: "grant", userId: confirm.userId }); m = `${confirm.name} için yetki verildi.`; setExperts(null); }
            else if (confirm.kind === "approve") { e = await act({ action: "approveText", version: confirm.version, legalRef: legalRef.trim(), confirm: true }); m = "İzin metni kullanıma onaylandı."; }
            else if (confirm.kind === "journal") {
              const r = await privCall<{ result: Record<string, number> }>("owner", `${API}/journal`, { method: "POST", body: { journal: confirm.journal, confirm: true } });
              e = r.ok ? null : r.error;
              if (r.ok) m = `Günlük uygulandı: ${r.body.result.consents_withdrawn} izin kapatıldı, ${r.body.result.items_deleted} kayıt ve ${r.body.result.consents_deleted} izin kaldırıldı, ${r.body.result.grants_revoked} yetki iptal edildi.`;
            }
            if (e) return e;
            setConfirm(null); void refreshAll(m);
            return null;
          }} />
      ) : null}
    </Shell>
  );
}

async function privDownloadJson(): Promise<string> {
  const r = await privCall<{ journal: Record<string, unknown> }>("owner", `${API}/journal`);
  if (!r.ok) return r.error;
  const blob = new Blob([JSON.stringify(r.body.journal, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hd-ozel-egitim-iptal-gunlugu-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "Günlük indirildi. Yedek klasöründe saklayın.";
}

function ConsentReview({ item, onClose, onChanged }: { item: PrivItemCard; onClose: () => void; onChanged: (m: string) => void }) {
  const [stage, setStage] = useState<"view" | "withdraw">("view");
  const [err, setErr] = useState<string | null>(null);
  const k = item.consent;
  if (stage === "withdraw" && k) {
    return (
      <TwoStepConfirm title="Danışan izni geri çekilsin mi?" confirmLabel="İzni geri çek" onCancel={() => setStage("view")}
        body1={<p>Bu izne bağlı eğitim kayıtları <b>anında</b> erişime kapanır. Geri çekme geri alınamaz.</p>}
        body2={<p>İzin <b>sistem sahibi kararı</b> olarak geri çekilecek. Onaylıyor musunuz?</p>}
        onConfirm={async () => {
          const r = await privCall("owner", `${API}/consents/${k.id}/withdraw`, { method: "POST", body: { channel: "owner_karari", confirm: true } });
          if (!r.ok) return r.error;
          onChanged("İzin geri çekildi; bağlı kayıtlar erişime kapandı.");
          return null;
        }} />
    );
  }
  return (
    <Modal labelId="ow-consent-title" onClose={onClose}>
      <h2 id="ow-consent-title">İzin durumu</h2>
      <p><b>{item.title}</b> · {item.trainer?.name}</p>
      {k ? (
        <dl className={base.dl} data-owner-consent-dl>
          <dt>Kapsam</dt><dd>{k.displayScope === "acik_isim" ? "Açık isim" : "Anonim · takma ad"}</dd>
          <dt>İzin tarihi</dt><dd>{fmtDay(k.givenOn)}</dd>
          <dt>Durum</dt><dd>{k.withdrawnAt ? `Geri çekildi (${fmtDay(k.withdrawnAt)})` : "Geçerli"}</dd>
          <dt>Kayıt erişimi</dt><dd>{PRIV_STATE_LABEL[item.state]}</dd>
        </dl>
      ) : <p>İzin bilgisi yok.</p>}
      <p className={base.lead}>İzni verenin adı ve belge içeriği yalnız imzalı kopyadadır; bu ekranda gösterilmez.</p>
      {err ? <p className={base.err} role="alert">{err}</p> : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={onClose}>Kapat</button>
        {k ? <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} data-owner-evidence-dl
          onClick={async () => { const r = await privDownload("owner", `${API}/consents/${k.id}/evidence`, "izin-kaniti"); setErr(r.ok ? null : r.error ?? null); }}>İmzalı kopyayı indir</button> : null}
        {k && !k.withdrawnAt ? <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setStage("withdraw")} data-owner-withdraw>İzni geri çek</button> : null}
      </div>
    </Modal>
  );
}

export default function OwnerPrivateEducationPage() {
  return <Suspense fallback={<LoadingView />}><OwnerCenter /></Suspense>;
}

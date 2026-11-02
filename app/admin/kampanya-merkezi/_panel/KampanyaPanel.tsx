"use client";

/**
 * Kampanya Merkezi — gerçek Owner paneli (KM-2). Tasarım: KM-P0 v2 görsel PASS prototipi.
 * Yalnız Owner'a render edilir (layout.tsx). Tüm yazmalar sunucuda yeniden doğrulanır; bu ekran ücretsiz analizi
 * ziyaretçiye AÇMAZ (public uç yok — KM-3). Sağlayıcı çağrısı yapılmaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry } from "@/lib/campaign/catalog";
import { AFFIRMATIONS, IMAGE_OPTIONS, MODULE_UI, SLOGANS } from "@/lib/campaign/catalogUi";
import { campaignGet, campaignPost } from "./api";
import {
  STATUS_LABEL, commentOn, draftFrom, effective, fieldsOf, fmt, fmtDT, fmtShort, isPast, itemsOf, maxCr, newRequestId, sameDraft,
  selectedOf, type CampaignRow, type Draft, type Overview, type Status,
} from "./model";
import { TabAnalizler } from "./Analyses";
import { TabKota } from "./Quota";
import { TabIstatistik } from "./Stats";
import { KbModal, PreviewPanel } from "./Preview";

type Tab = "genel" | "icerik" | "analizler" | "kota" | "istatistik";
const TABS: [Tab, string][] = [["genel", "Kampanya"], ["icerik", "Reklam İçeriği"], ["analizler", "Analizler ve Yorumlar"], ["kota", "Kota ve Maliyet"], ["istatistik", "İstatistikler"]];

export type PanelCtx = {
  ov: Overview; cat: CatalogEntry[]; cur: CampaignRow; d: Draft; nowMs: number; busy: boolean;
  set: (fn: (d: Draft) => Draft) => void; toast: (m: string) => void; openKb: () => void;
  /** Sunucudan yeniden yükler ve taslağı sunucu durumuna sıfırlar (silme sonrası). */
  reload: () => Promise<void>;
  /** Yalnız genel bakışı yeniler; kaydedilmemiş kampanya taslağı KORUNUR (şablon / ortak ayar sonrası). */
  refresh: () => Promise<void>;
};

export default function KampanyaPanel() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [curId, setCurId] = useState<string | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [base, setBase] = useState<Draft | null>(null);
  const [tab, setTab] = useState<Tab>("genel");
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const createIdRef = useRef<string | null>(null);
  const dupIdRef = useRef<{ src: string; id: string } | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 3200);
  }, []);

  const load = useCallback(async (selectId?: string | null, keepDraft = false) => {
    const r = await campaignGet<Overview>();
    if (!r.ok) {
      setLoadErr(r.status === 404 ? "Bu ekran yalnız platform sahibine açıktır." : r.error);
      return;
    }
    setLoadErr(null);
    setOv(r.data);
    const list = r.data.campaigns;
    if (keepDraft && selectId && list.some((c) => c.id === selectId)) return;
    const id = selectId && list.some((c) => c.id === selectId) ? selectId : list[0]?.id ?? null;
    setCurId(id);
    const c = list.find((x) => x.id === id);
    const nd = c ? draftFrom(c, r.data.techniques) : null;
    setD(nd);
    setBase(nd);
  }, []);

  useEffect(() => {
    // İlk yükleme: durum, await sonrasında (sunucu yanıtıyla) güncellenir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const dirty = !!d && !!base && !sameDraft(d, base);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const cur = ov?.campaigns.find((c) => c.id === curId) ?? null;
  const nowMs = useMemo(() => (ov ? Date.parse(ov.now) : 0), [ov]);
  const cat = ov?.catalog ?? [];

  const set = useCallback((fn: (x: Draft) => Draft) => setD((x) => (x ? fn(x) : x)), []);

  function pick(id: string) {
    if (id === curId) return;
    if (dirty) {
      setPendingPick(id);
      return;
    }
    doPick(id);
  }
  function doPick(id: string) {
    if (!ov) return;
    const c = ov.campaigns.find((x) => x.id === id);
    if (!c) return;
    setCurId(id);
    const nd = draftFrom(c, ov.techniques);
    setD(nd);
    setBase(nd);
    setPendingPick(null);
    setErr(null);
  }

  function validateDraft(x: Draft): string | null {
    if (!x.name.trim()) return "Kampanya adı boş olamaz.";
    if (!x.undated) {
      if (!x.start) return "Tarihli kampanyada başlangıç tarihi zorunlu.";
      if (x.end && x.end <= x.start) return "Bitiş tarihi başlangıçtan sonra olmalı.";
    }
    const phs = cat.find((e) => e.requiresOwnerConfirmation && x.sel[e.key]?.enabled);
    if (phs && !x.phsConfirmed) return `${phs.title} için Owner tam analiz onayı gerekli.`;
    return null;
  }

  /** Kampanya alanları + teknik seçimi (sürüm denetimli, sırayla). Başarıda sunucudan yeniden yüklenir. */
  async function saveAll(): Promise<boolean> {
    if (!cur || !d) return false;
    const bad = validateDraft(d);
    if (bad) {
      setErr(bad);
      return false;
    }
    setErr(null);
    let version = cur.version;
    const r1 = await campaignPost<{ version: number }>({ action: "save", id: cur.id, expectedVersion: version, fields: fieldsOf(d) });
    if (!r1.ok) {
      setErr(r1.error + (r1.detail ? ` (${r1.detail})` : ""));
      return false;
    }
    version = r1.data.version;
    const items = itemsOf(d, cat);
    const serverHad = (ov?.techniques ?? []).some((t) => t.campaign_id === cur.id);
    if (items.length || serverHad) {
      const r2 = await campaignPost<{ version: number }>({ action: "setTechniques", id: cur.id, expectedVersion: version, items });
      if (!r2.ok) {
        setErr(`Metinler kaydedildi; analiz seçimi kaydedilemedi: ${r2.error}${r2.detail ? ` (${r2.detail})` : ""}`);
        await load(cur.id);
        return false;
      }
    }
    await load(cur.id);
    return true;
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const onSave = () => run(async () => {
    if (await saveAll()) toast("Kampanya kaydedildi.");
  });

  const onStatus = (st: Status) => run(async () => {
    if (!cur) return;
    if (dirty && !(await saveAll())) return;
    const fresh = await campaignGet<Overview>();
    const v = fresh.ok ? fresh.data.campaigns.find((c) => c.id === cur.id)?.version ?? cur.version : cur.version;
    const r = await campaignPost<{ closed: string[] }>({ action: "setStatus", id: cur.id, expectedVersion: v, status: st });
    if (!r.ok) {
      setErr(r.error);
      await load(cur.id);
      return;
    }
    const closed = r.data.closed?.length ?? 0;
    await load(cur.id);
    toast(`${cur.name}: ${STATUS_LABEL[st]}.${closed ? " Yayındaki diğer kampanya otomatik Kapalı'ya alındı." : ""}`);
  });

  const onCreate = () => run(async () => {
    if (dirty) {
      setErr("Önce kaydedilmemiş değişiklikleri kaydedin veya vazgeçin.");
      return;
    }
    createIdRef.current = createIdRef.current ?? newRequestId();
    const r = await campaignPost<{ id: string }>({
      action: "create", requestId: createIdRef.current,
      fields: { name: "Yeni kampanya taslağı", undated: true, cta_text: "Ücretsiz Analizi Başlat", cta_target: "bolum" },
    });
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    createIdRef.current = null;
    setTab("genel");
    await load(r.data.id);
    toast("Yeni taslak oluşturuldu (Kapalı).");
  });

  const onDuplicate = (srcId: string) => run(async () => {
    if (dirty) {
      setErr("Önce kaydedilmemiş değişiklikleri kaydedin veya vazgeçin.");
      return;
    }
    if (!dupIdRef.current || dupIdRef.current.src !== srcId) dupIdRef.current = { src: srcId, id: newRequestId() };
    const r = await campaignPost<{ id: string }>({ action: "duplicate", requestId: dupIdRef.current.id, sourceId: srcId });
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    dupIdRef.current = null;
    setTab("genel");
    await load(r.data.id);
    toast("Kampanya kopyalandı — yeni taslak Kapalı.");
  });

  if (loadErr) {
    return (
      <Frame>
        <section className="card stateCard" role="alert">
          <p className="eyebrow">Kampanya Merkezi</p>
          <h2 className="h2">Panel yüklenemedi</h2>
          <p className="lead">{loadErr}</p>
          <button className="btn" onClick={() => { setLoadErr(null); setOv(null); void load(curId); }}>Tekrar dene</button>
        </section>
      </Frame>
    );
  }
  if (!ov) {
    return (
      <Frame>
        <section className="card stateCard" aria-busy="true">
          <p className="eyebrow">Kampanya Merkezi</p>
          <h2 className="h2">Yükleniyor…</h2>
          <div className="loadingBar" />
          <div className="loadingBar" />
        </section>
      </Frame>
    );
  }

  const ctx: PanelCtx | null = cur && d ? { ov, cat, cur, d, nowMs, busy, set, toast, reload: () => load(cur.id), refresh: () => load(cur.id, true), openKb: () => setKbOpen(true) } : null;
  const showPreview = tab !== "istatistik" && !!ctx;

  return (
    <Frame>
      <div className={`shell ${showPreview ? "withPreview" : ""}`}>
        <aside className="side" aria-label="Kampanyalar">
          <Sidebar ov={ov} cat={cat} curId={curId} nowMs={nowMs} dirty={dirty} busy={busy} onPick={pick} onNew={onCreate} onDup={onDuplicate} />
        </aside>
        <main className="main" id="main">
          {pendingPick && (
            <div className="notice warn confirmBox" role="alertdialog" aria-labelledby="pendQ" style={{ marginBottom: 12 }}>
              <div>
                <b id="pendQ">Kaydedilmemiş değişiklikler var.</b> Başka kampanyaya geçerseniz bu değişiklikler kaybolur.
                <div className="actionRow" style={{ marginTop: 8 }}>
                  <button className="btn sm primary" disabled={busy} onClick={() => run(async () => { if (await saveAll()) doPick(pendingPick); })}>Kaydet ve geç</button>
                  <button className="btn sm danger" onClick={() => doPick(pendingPick)}>Kaydetmeden geç</button>
                  <button className="btn sm" onClick={() => setPendingPick(null)}>Vazgeç</button>
                </div>
              </div>
            </div>
          )}
          {err && <div className="notice err" role="alert" style={{ marginBottom: 12 }}>{err} <button className="linkBtn" onClick={() => setErr(null)}>Kapat</button></div>}
          {ov.settings?.kill_switch && <div className="notice err" role="status" style={{ marginBottom: 12 }}>Acil durdurma açık — hiçbir kampanya analizi kabul edilmez (Kota ve Maliyet sekmesi).</div>}
          {!ctx ? (
            <section className="card stateCard">
              <p className="eyebrow">Henüz kampanya yok</p>
              <h2 className="h2">İlk kampanyanızı oluşturun</h2>
              <p className="lead">Yeni kampanya Kapalı taslak olarak başlar; ziyaretçiye hiçbir şey görünmez.</p>
              <button className="btn primary" disabled={busy} onClick={onCreate}>+ Yeni kampanya</button>
            </section>
          ) : (
            <>
              <Tabs tab={tab} setTab={setTab} />
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "genel" && <TabGenel ctx={ctx} dirty={dirty} onSave={onSave} onStatus={onStatus} goTab={setTab} />}
                {tab === "icerik" && <TabIcerik ctx={ctx} dirty={dirty} onSave={onSave} />}
                {tab === "analizler" && <TabAnalizler ctx={ctx} />}
                {tab === "kota" && <TabKota key={`${ov.settings?.version ?? 0}`} ctx={ctx} />}
                {tab === "istatistik" && <TabIstatistik ctx={ctx} />}
              </div>
              {dirty && tab !== "genel" && tab !== "istatistik" && (
                <div className="notice warn" style={{ marginTop: 12 }} role="status">
                  Kaydedilmemiş değişiklik var. <button className="btn sm primary" disabled={busy} onClick={onSave}>Kampanyayı kaydet</button>
                </div>
              )}
            </>
          )}
        </main>
        {showPreview && ctx && (
          <aside className="previewCol" id="previewCol" aria-label="Canlı ziyaretçi önizlemesi">
            <PreviewPanel ctx={ctx} />
          </aside>
        )}
      </div>
      <p className="footNote">Kampanya Merkezi · Yalnız platform sahibi · Ücretsiz analizin ziyaretçiye açılması ayrı aşamadır (KM-3); bu panel hiçbir sağlayıcı çağrısı yapmaz.</p>
      {kbOpen && <KbModal onClose={() => setKbOpen(false)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <span className="brandPlate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/premium/brand/yasam-sistemi-logo.webp" alt="Yaşam Sistemi" width={120} height={34} />
        </span>
        <div className="topTitle">
          <b>Kampanya Merkezi</b>
          <span>Owner yönetimi · ücretsiz analiz kampanyaları</span>
        </div>
        <span className="topSpacer" />
        <span className="demoBadge" title="Bu ekran yalnız platform sahibine görünür"><span className="long">YALNIZ </span>OWNER</span>
      </header>
      {children}
    </>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[n][0]);
    refs.current[TABS[n][0]]?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label="Kampanya bölümleri">
      {TABS.map(([id, l], i) => (
        <button
          key={id} ref={(el) => { refs.current[id] = el; }} className="tab" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`}
          aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => onKey(e, i)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Sidebar(p: { ov: Overview; cat: CatalogEntry[]; curId: string | null; nowMs: number; dirty: boolean; busy: boolean; onPick: (id: string) => void; onNew: () => void; onDup: (id: string) => void }) {
  const { ov, nowMs } = p;
  const groups: [string, CampaignRow[]][] = [
    ["Yayında", ov.campaigns.filter((c) => effective(c, nowMs).st !== "kapali")],
    ["Taslaklar", ov.campaigns.filter((c) => effective(c, nowMs).st === "kapali" && !isPast(c, nowMs))],
    ["Geçmiş kampanyalar", ov.campaigns.filter((c) => effective(c, nowMs).st === "kapali" && isPast(c, nowMs))],
  ];
  const count = (c: CampaignRow) => ov.techniques.filter((t) => t.campaign_id === c.id && t.enabled).length;
  return (
    <div className="card">
      <div className="cardHead"><div><p className="eyebrow">Kampanyalar</p><h2 className="h2">Taslaklar ve yayın</h2></div></div>
      {ov.campaigns.length === 0 && <p className="muted small">Henüz kampanya yok.</p>}
      {groups.map(([g, list]) =>
        list.length ? (
          <div key={g}>
            <p className="groupLabel">{g} <span className="muted">{list.length}</span></p>
            <div className="campList">
              {list.map((c) => {
                const e = effective(c, nowMs);
                return (
                  <div className="campRow" key={c.id}>
                    <button className="campItem" aria-current={c.id === p.curId} onClick={() => p.onPick(c.id)}>
                      <b>{c.name || "Adsız kampanya"}</b>
                      <span className="campMeta"><span className={`pill ${e.st}`}>{STATUS_LABEL[e.st]}</span>{c.undated ? "Tarihsiz" : `${fmtShort(c.starts_at)} – ${fmtShort(c.ends_at)}`}</span>
                      <span className="campMeta">{count(c)} analiz{c.id === p.curId && p.dirty ? <> · <span className="dirty">kaydedilmedi</span></> : null}</span>
                    </button>
                    {isPast(c, nowMs) && <button className="btn sm reuse" disabled={p.busy} onClick={() => p.onDup(c.id)} aria-label={`${c.name} kampanyasını yeniden kullan`}>Yeniden kullan</button>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
      <div className="sideActions">
        <button className="btn primary" disabled={p.busy} onClick={p.onNew}>+ Yeni kampanya</button>
        {p.curId && <button className="btn" disabled={p.busy} onClick={() => p.onDup(p.curId!)}>Seçiliyi kopyala</button>}
      </div>
      <p className="small muted" style={{ margin: "12px 0 0" }}>
        Ziyaretçiye aynı anda yalnız <b>bir</b> kampanya görünür. Başka bir kampanyayı Aktif/Yakında yaptığınızda yayındaki kampanya otomatik Kapalı&apos;ya alınır (veritabanı kuralı).
      </p>
    </div>
  );
}

/* ── Kampanya (Genel) ── */
function TabGenel({ ctx, dirty, onSave, onStatus, goTab }: { ctx: PanelCtx; dirty: boolean; onSave: () => void; onStatus: (s: Status) => void; goTab: (t: Tab) => void }) {
  const { cur, d, set, nowMs, busy } = ctx;
  const e = effective(cur, nowMs);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delText, setDelText] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const dateErr = !d.undated && d.start && d.end && d.end <= d.start;
  const canArchive = cur.status === "kapali" && e.st === "kapali";

  async function archive() {
    if (delText !== cur.name || busy) return;
    const r = await campaignPost({ action: "archive", id: cur.id, expectedVersion: cur.version, confirmName: delText });
    if (!r.ok) {
      setDelErr(r.error);
      return;
    }
    setConfirmDel(false);
    await ctx.reload();
    ctx.toast("Kampanya silindi (arşivlendi; sayaç ve denetim kayıtları korunur).");
  }

  return (
    <>
      <section className="card">
        <div className="cardHead">
          <div>
            <p className="eyebrow">Kampanya yönetimi</p>
            <h2 className="h2 longTitle">{d.name || "Adsız kampanya"}</h2>
            <p className="lead">Durum, tarih ve yayın kontrolü. Tarihsiz kampanya Owner kapatana kadar sürer; zorunlu otomatik kapanış yoktur.</p>
          </div>
          <span className="saveState">{dirty ? <span className="tag warn">Kaydedilmemiş değişiklik</span> : <span className="tag ok">Kaydedildi · {fmtDT(cur.updated_at)}</span>}</span>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="f-name">Kampanya adı <span className="hint">yalnız panelde görünür</span></label>
            <input id="f-name" className="input" maxLength={80} value={d.name} onChange={(ev) => set((x) => ({ ...x, name: ev.target.value }))} />
          </div>
          <div className="field">
            <span className="fieldLabel" id="lbl-status">Durum <span className="hint">kayıtlı: {STATUS_LABEL[cur.status]}</span></span>
            <div className="seg" role="group" aria-labelledby="lbl-status">
              {(["kapali", "yakinda", "aktif"] as Status[]).map((s) => (
                <button key={s} className={`s-${s}`} aria-pressed={cur.status === s} disabled={busy} onClick={() => onStatus(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }} className="field">
          <span className="fieldLabel">Yayın tarihleri <span className="hint">Türkiye saati</span></span>
          <label className="check"><input type="checkbox" checked={d.undated} onChange={(ev) => set((x) => ({ ...x, undated: ev.target.checked }))} /> Tarihsiz kullan (Owner manuel kapatana kadar)</label>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="f-start">Başlangıç</label>
            <input id="f-start" type="datetime-local" className="input" value={d.start} disabled={d.undated} onChange={(ev) => set((x) => ({ ...x, start: ev.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="f-end">Bitiş <span className="hint">boş bırakılabilir</span></label>
            <input id="f-end" type="datetime-local" className="input" value={d.end} disabled={d.undated} onChange={(ev) => set((x) => ({ ...x, end: ev.target.value }))} />
          </div>
        </div>
        {dateErr && <div className="notice err" style={{ marginTop: 10 }} role="alert" id="dateErr">Bitiş tarihi başlangıçtan önce olamaz.</div>}
        <div className="stateBox" style={{ marginTop: 16 }} id="stateBox">
          <span className={`pill ${e.st}`}>Ziyaretçi şu an: {STATUS_LABEL[e.st]}</span>
          <span className="small muted">{e.why} · Sunucu saati: {fmtDT(ctx.ov.now)}</span>
        </div>
        <div className="actionRow">
          <button className="btn" disabled={busy || !dirty} onClick={onSave}>Taslağı kaydet</button>
          <button className="btn primary" disabled={busy} onClick={() => onStatus("aktif")}>Şimdi yayımla (Aktif)</button>
          <button className="btn" disabled={busy} onClick={() => onStatus("yakinda")}>Yakında olarak duyur</button>
          <button className="btn danger" disabled={busy} onClick={() => onStatus("kapali")}>Durdur (Kapalı)</button>
          <button className="btn ghost" disabled={!canArchive || busy} title={canArchive ? undefined : "Yayındaki kampanya silinemez — önce durdurun"} onClick={() => { setConfirmDel(true); setDelText(""); setDelErr(null); }}>Kampanyayı sil</button>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>Yayın düğmeleri önce kaydedilmemiş değişiklikleri kaydeder. KM-3 tamamlanana kadar “Aktif” kampanya ziyaretçiye ücretsiz analiz AÇMAZ; yalnız durum kaydedilir.</p>
        {confirmDel && (
          <div className="notice err confirmBox" role="alertdialog" aria-labelledby="delQ" style={{ marginTop: 12 }}>
            <div>
              <b id="delQ">“{cur.name}” silinsin mi?</b> Kampanya listeden kaldırılır (arşivlenir); geri alınamaz. Onaylamak için kampanya adını aynen yazın.
              <input className="input" style={{ marginTop: 8 }} id="delConfirm" autoFocus aria-label="Silmek için kampanya adını yazın" value={delText} onChange={(ev) => setDelText(ev.target.value)} />
              {delErr && <p className="fieldErr" role="alert">{delErr}</p>}
              <div className="actionRow" style={{ marginTop: 8 }}>
                <button className="btn sm danger" disabled={delText !== cur.name || busy} onClick={() => void archive()}>Kalıcı olarak sil</button>
                <button className="btn sm" onClick={() => setConfirmDel(false)}>Vazgeç</button>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Yayın kontrolü</p><h2 className="h2">Yayımlamadan önce</h2></div><button className="btn sm" onClick={() => goTab("analizler")}>Analizleri düzenle →</button></div>
        <Checklist ctx={ctx} />
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Özet</p><h2 className="h2">Bu kampanyada açık analizler</h2></div></div>
        <SummaryList ctx={ctx} />
      </section>
    </>
  );
}

function Checklist({ ctx }: { ctx: PanelCtx }) {
  const { d, cat, ov } = ctx;
  const sel = selectedOf(d, cat);
  const items: [string, string][] = [];
  items.push([sel.length ? "ok" : "err", sel.length ? `${sel.length} analiz seçili` : "Hiç analiz seçilmedi — Aktif durumda ziyaretçi kampanya bölümü yerine normal tanıtımı görür."]);
  items.push([d.slogan ? "ok" : "warn", d.slogan ? "Ana slogan yazıldı" : "Ana slogan boş"]);
  const notLive = sel.filter((x) => (x.e as { visitorReady?: boolean }).visitorReady !== true);
  if (notLive.length) items.push(["warn", `${notLive.length} seçili analiz ziyaretçi akışına henüz bağlı değil ve ziyaretçiye görünmez: ${notLive.map((x) => x.e.title).join(", ")}.`]);
  const ver = sel.filter((x) => x.e.readiness === "dogrulama");
  if (ver.length) items.push(["warn", `Entegrasyon doğrulaması gereken ${ver.length} teknik: ${ver.map((x) => x.e.title).join(", ")}. Gerçek yayında doğrulama tamamlanmadan ziyaretçiye açılamaz.`]);
  if (sel.some((x) => x.e.package)) items.push(["warn", "Kozmik Takvim paketi Hacamat Takvimi'ni içerir: gerçek yayından önce sağlık iddiaları ve hukuki uygunluk incelemesi tamamlanmalı (yalnız tarafsız takvim bilgisi)."]);
  const com = sel.filter((x) => commentOn(d, x.e));
  if (com.length) items.push(["info", `${com.length} teknikte yorum açık. Sağlayıcı metinlerinin herkese açık kullanım izni ve kitap kataloğu yayın hakkı doğrulanmadı (Owner kararı).`]);
  const short = sel.filter((x) => maxCr(x.e) > 0 && x.s.credit < x.s.daily * maxCr(x.e));
  if (short.length) items.push(["warn", `${short.length} teknikte kredi bütçesi analiz hakkını karşılamıyor — kredi bitince yeni analiz durur.`]);
  const sum = sel.reduce((a, x) => a + (maxCr(x.e) > 0 ? x.s.credit : 0), 0);
  const g = ov.settings?.global_daily_credit_budget ?? 0;
  if (sum > g) items.push(["info", `Teknik bütçeleri toplamı (${fmt(sum)}) ortak günlük bütçeyi (${fmt(g)}) aşıyor; ortak bütçe dolunca hepsi durur.`]);
  if (!ov.settings?.provider_monthly_quota) items.push(["warn", "Aylık sağlayıcı kotası girilmedi — kredi harcayan analizler fail-closed kalır (Kota ve Maliyet)."]);
  if (!d.undated && !d.start) items.push(["warn", "Tarihli kampanyada başlangıç tarihi boş."]);
  return <ul className="checks" id="checklist">{items.map(([k, t], i) => <li key={i} className={`ck-${k}`}>{t}</li>)}</ul>;
}

function SummaryList({ ctx }: { ctx: PanelCtx }) {
  const { d, cat } = ctx;
  const sel = selectedOf(d, cat);
  if (!sel.length) return <p className="muted">Henüz analiz seçilmedi.</p>;
  const by: { m: string; items: typeof sel }[] = [];
  sel.forEach((x) => {
    let g = by.find((b) => b.m === x.e.module);
    if (!g) by.push((g = { m: x.e.module, items: [] }));
    g.items.push(x);
  });
  return (
    <div className="sumList">
      {by.map((g) => (
        <div className="qRow" key={g.m}>
          <div className="qHead"><b>{MODULE_UI[g.m as keyof typeof MODULE_UI].title}</b><span className="small muted">{g.items.length} teknik · yorumlar {d.modComments[g.m] ? "açık" : "kapalı"}</span></div>
          <div className="chipWrap">
            {g.items.map((x) => (
              <span className="tag ok wrap" key={x.e.key}>
                {x.e.title} · {x.s.ip}/IP · {x.s.daily} hak{maxCr(x.e) > 0 ? ` · ${x.s.credit} kredi` : " · 0 kredi"}{x.e.comments.length ? ` · yorum ${commentOn(d, x.e) ? "açık" : "kapalı"}` : ""}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Reklam içeriği ── */
function TabIcerik({ ctx, dirty, onSave }: { ctx: PanelCtx; dirty: boolean; onSave: () => void }) {
  const { d, set, ov, cat, busy } = ctx;
  const [confirmTpl, setConfirmTpl] = useState<string | null>(null);
  const [tplBusy, setTplBusy] = useState(false);
  const counter = (v: string, max: number) => <span className="hint">{v.length}/{max}</span>;
  const sel = selectedOf(d, cat);
  const targets = [{ id: "bolum", label: "Ücretsiz analiz bölümü (sayfa içi)" }, ...sel.map((x) => ({ id: x.e.key, label: `${MODULE_UI[x.e.module].title} — ${x.e.title}` })), { id: "register", label: "Profesyonel üyelik kaydı (/register)" }];
  if (d.ctaTarget && !targets.some((t) => t.id === d.ctaTarget)) targets.unshift({ id: d.ctaTarget, label: "⚠ Seçili analiz artık kapalı — yeni hedef seçin" });

  async function saveTpl() {
    if (tplBusy) return;
    setTplBusy(true);
    const r = await campaignPost({ action: "saveTemplate", fields: { slogan: d.slogan, alt_slogan: d.alt, description: d.description, affirmation: d.affirmation, cta_text: d.ctaText } });
    setTplBusy(false);
    if (!r.ok) return ctx.toast(r.error);
    ctx.toast("Metinler “Kayıtlı metinlerim”e kaydedildi.");
    await ctx.refresh();
  }
  async function delTpl(id: string) {
    if (tplBusy) return;
    setTplBusy(true);
    const r = await campaignPost({ action: "archiveTemplate", templateId: id });
    setTplBusy(false);
    setConfirmTpl(null);
    if (!r.ok) return ctx.toast(r.error);
    ctx.toast("Kayıtlı metin silindi.");
    await ctx.refresh();
  }

  return (
    <>
      <section className="card">
        <div className="cardHead">
          <div><p className="eyebrow">Reklam içeriği</p><h2 className="h2">Ziyaretçiye görünen metinler</h2><p className="lead">Yazdıkça önizleme anında değişir. Kaydedene kadar yalnız bu ekranda kalır.</p></div>
          <div className="actionRow" style={{ margin: 0 }}>
            <button className="btn sm" disabled={tplBusy} onClick={() => void saveTpl()}>Bu metinleri kütüphaneye kaydet</button>
            <button className="btn sm primary" disabled={busy || !dirty} onClick={onSave}>Kampanyayı kaydet</button>
          </div>
        </div>
        <div className="grid2">
          <div className="field wide"><label htmlFor="c-slogan">Ana slogan {counter(d.slogan, 90)}</label><input id="c-slogan" className="input" maxLength={90} value={d.slogan} onChange={(e) => set((x) => ({ ...x, slogan: e.target.value }))} /></div>
          <div className="field wide"><label htmlFor="c-alt">Alt slogan {counter(d.alt, 110)}</label><input id="c-alt" className="input" maxLength={110} value={d.alt} onChange={(e) => set((x) => ({ ...x, alt: e.target.value }))} /></div>
          <div className="field wide"><label htmlFor="c-sub">Açıklama {counter(d.description, 220)}</label><textarea id="c-sub" className="textarea" maxLength={220} value={d.description} onChange={(e) => set((x) => ({ ...x, description: e.target.value }))} /></div>
          <div className="field">
            <label htmlFor="c-aff">Olumlama / ilham cümlesi {counter(d.affirmation, 120)}</label>
            <input id="c-aff" className="input" maxLength={120} value={d.affirmation} onChange={(e) => set((x) => ({ ...x, affirmation: e.target.value }))} />
            <div className="chipWrap" style={{ marginTop: 4 }}>
              {AFFIRMATIONS.map((a) => <button key={a} className="chipBtn" onClick={() => set((x) => ({ ...x, affirmation: a }))}>{a}</button>)}
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-cta">Düğme metni {counter(d.ctaText, 32)}</label>
            <input id="c-cta" className="input" maxLength={32} value={d.ctaText} onChange={(e) => set((x) => ({ ...x, ctaText: e.target.value }))} />
            <label htmlFor="c-target" style={{ marginTop: 8 }}>Düğme hedefi <span className="hint">yalnız güvenli iç hedefler</span></label>
            <select id="c-target" className="select" value={d.ctaTarget} onChange={(e) => set((x) => ({ ...x, ctaTarget: e.target.value }))}>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span className="fieldLabel">Kampanya görseli <span className="hint">isteğe bağlı</span></span>
          <div className="imgPick">
            {IMAGE_OPTIONS.map((im) => (
              <button key={im.ref ?? "yok"} className="imgOpt" aria-pressed={d.image === im.ref} onClick={() => set((x) => ({ ...x, image: im.ref }))}>
                <span className="th" style={im.src ? { backgroundImage: `url('${im.src}')` } : undefined}>{im.src ? "" : "—"}</span>{im.label}
              </button>
            ))}
          </div>
          <span className="hint">Yalnız sitedeki onaylı görseller seçilebilir. Yeni görsel yükleme bu sürümde yok (ayrı güvenli depolama kararı gerekir).</span>
        </div>
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Kayıtlı metinlerim</p><h2 className="h2">Kendi slogan setleriniz</h2></div></div>
        {ov.templates.length ? (
          <div className="libList" id="savedTexts">
            {ov.templates.map((t) => (
              <div className="libItem" key={t.id}>
                <div>
                  <p><b>{t.slogan || "(slogansız)"}</b></p>
                  <p className="small muted">{[t.alt_slogan, t.affirmation].filter(Boolean).join(" · ")}</p>
                  <p className="small muted">Kaydedildi: {fmtDT(t.created_at)}</p>
                </div>
                <div className="libActs">
                  {confirmTpl === t.id ? (
                    <>
                      <button className="btn sm danger" disabled={tplBusy} onClick={() => void delTpl(t.id)}>Evet, sil</button>
                      <button className="btn sm" onClick={() => setConfirmTpl(null)}>Vazgeç</button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm" onClick={() => { set((x) => ({ ...x, slogan: t.slogan, alt: t.alt_slogan, description: t.description, affirmation: t.affirmation, ctaText: t.cta_text })); ctx.toast("Kayıtlı metinler uygulandı (kaydetmeyi unutmayın)."); }}>Kullan</button>
                      <button className="btn sm ghost" onClick={() => setConfirmTpl(t.id)} aria-label={`${t.slogan || "slogansız"} metnini sil`}>Sil</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Henüz kayıtlı metin yok. Üstteki “Bu metinleri kütüphaneye kaydet” ile ekleyin.</p>
        )}
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Hazır slogan kütüphanesi</p><h2 className="h2">{SLOGANS.length} hazır slogan</h2></div></div>
        <div className="libList">
          {SLOGANS.map((s) => (
            <div className="libItem" key={s.text}>
              <div><p className="g">{s.group}</p><p><b>{s.text}</b></p><p className="small muted">{s.sub}</p></div>
              <button className="btn sm" onClick={() => set((x) => ({ ...x, slogan: s.text, description: s.sub }))}>Kullan</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

"use client";

/**
 * Eğitim Merkezi — OWNER AÇILIŞ DURUMU (owner kararı 31.10.2026).
 * Owner, hukuki süreç sonrasında SQL / Vercel / yeniden deploy olmadan buradan: global uzman kataloğunu açar / kapatır,
 * açılış hazırlığını sayılarla görür, uzmanlara açık kişi + Hayat Hikâyesi listesini izler. Kişi yayını kişi sayfasında,
 * biyografi yayını "Hayat Hikâyeleri" sekmesinde, uzman yetkisi Modül İzinleri'ndedir (bağlantılar aşağıda).
 * Mevcut owner teması (egitimYonetim.module.css) — yeni tasarım varlığı yok. Yetki her istekte sunucuda (requireEducationOwner).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { ownerGet, ownerPost } from "./ownerApi";

export type ControlOverview = {
  ready: boolean;
  catalogOpen: boolean;
  envOverride: "open" | "closed" | null;
  catalogChangedAt: string | null;
  privateArchiveOpen: boolean;
  counts: {
    active: number; archived: number; legalReviewed: number; technicalOk: number; readyToApprove: number;
    approved: number; published: number; visibleToExperts: number; publishedBios: number; visibleBios: number; grants: number;
  };
  openToExperts: Array<{ id: string; name: string; bio: boolean }>;
  notes: Array<{ level: "block" | "info"; text: string }>;
  archivedSubjects: Array<{ id: string; name: string; archivedAt: string | null; reason: string | null }>;
  events: Array<{ at: string; action: string; subjectName: string | null; reason: string | null }>;
};

export const CONTROL_API = "/api/admin/hd/education/control";
const EVENT_LABEL: Record<string, string> = {
  catalog_opened: "Uzman kataloğu açıldı", catalog_closed: "Uzman kataloğu kapatıldı",
  subject_archived: "Kişi kapsam dışı bırakıldı", subject_restored: "Kişi kapsama geri alındı",
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function useControlOverview(): { data: ControlOverview | null; err: string | null; reload: () => void } {
  const [data, setData] = useState<ControlOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void ownerGet<ControlOverview>(CONTROL_API).then((r) => {
      if (!live) return;
      if (r.ok) { setData(r.data); setErr(null); } else setErr(r.error);
    });
    return () => { live = false; };
  }, [tick]);
  return { data, err, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function OwnerControlPanel({ data, err, onChanged }: { data: ControlOverview | null; err: string | null; onChanged: () => void }) {
  const [modal, setModal] = useState<null | "open" | "close">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (err) return <section className={css.panel}><p className={css.err} role="alert">{err}</p></section>;
  if (!data) return <section className={css.panel}><p className={css.empty}>Açılış durumu yükleniyor…</p></section>;
  const c = data.counts;
  const canToggle = data.ready && data.envOverride === null;

  const submit = async () => {
    if (!modal || busy) return;
    setBusy(true);
    const r = await ownerPost(CONTROL_API, { action: "catalog", open: modal === "open", reason });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: modal === "open" ? "Uzman kataloğu açıldı. Yalnız yetkili uzmanlar, yalnız yayımlanmış kişileri görür." : "Uzman kataloğu kapatıldı. Açık oturumlar dahil tüm uzman erişimi kapandı." });
      setModal(null); setReason(""); onChanged();
    } else setMsg({ ok: false, text: r.error });
  };

  return (
    <section className={css.panel} aria-labelledby="edu-open-title" data-edu-control>
      <div className={css.detailHead}>
        <div>
          <h2 id="edu-open-title" className={css.h2}>Eğitim Merkezi Açılış Durumu</h2>
          <p className={css.lead}>Hukuki görüş sonrasında kişi yayını kişi sayfasından, biyografi yayını Hayat Hikâyeleri sekmesinden, uzman yetkisi Modül İzinleri ekranından yapılır. Uzman kataloğu bu alandan açılıp kapatılır.</p>
        </div>
        <div className={css.headTags}>
          <span className={`${css.tag} ${data.catalogOpen ? css.tOk : css.tMute} ${css.big}`} data-edu-catalog-state={data.catalogOpen ? "open" : "closed"}>
            Uzman kataloğu: {data.catalogOpen ? "AÇIK" : "KAPALI"}
          </span>
          {data.catalogOpen
            ? <button type="button" className={`${css.btn} ${css.danger}`} disabled={!canToggle} onClick={() => { setMsg(null); setModal("close"); }} data-edu-catalog-close>Kataloğu Kapat…</button>
            : <button type="button" className={`${css.btn} ${css.save}`} disabled={!canToggle} onClick={() => { setMsg(null); setModal("open"); }} data-edu-catalog-open>Kataloğu Aç…</button>}
        </div>
      </div>
      {msg ? <p className={msg.ok ? css.msg : css.err} role="status" data-edu-control-msg>{msg.text}</p> : null}
      <div className={css.stats} data-edu-control-stats>
        <div className={css.stat} data-edu-count="active"><b>{c.active}</b><span>Aktif eğitim kişisi</span></div>
        <div className={css.stat} data-edu-count="legalReviewed"><b>{c.legalReviewed}</b><span>Hukuki incelemesi tamamlanan</span></div>
        <div className={css.stat} data-edu-count="technicalOk"><b>{c.technicalOk}</b><span>Teknik doğrulaması tamamlanan</span></div>
        <div className={css.stat} data-edu-count="readyToApprove"><b>{c.readyToApprove}</b><span>Yayın onayına hazır</span></div>
        <div className={`${css.stat} ${css.sOk}`} data-edu-count="published"><b>{c.published}</b><span>Yayımlanan kişi</span></div>
        <div className={`${css.stat} ${css.sOk}`} data-edu-count="publishedBios"><b>{c.publishedBios}</b><span>Yayımlanan biyografi</span></div>
        <div className={css.stat} data-edu-count="grants"><b>{c.grants}</b><span>Yetkili uzman</span></div>
        <div className={css.stat} data-edu-count="archived"><b>{c.archived}</b><span>Kapsam dışı (arşiv)</span></div>
      </div>
      {data.notes.length ? (
        <ul className={css.gList} data-edu-control-notes>
          {data.notes.map((n, i) => <li key={i}><b>{n.level === "block" ? "Açılamaz" : "Bilgi"}</b><small data-edu-note-level={n.level}>{n.text}</small></li>)}
        </ul>
      ) : null}
      <div className={css.grid2}>
        <div className={css.box}>
          <h3>Uzmanlara açık içerik ({c.visibleToExperts} kişi · {c.visibleBios} Hayat Hikâyesi)</h3>
          {data.openToExperts.length ? (
            <ul className={css.gList} data-edu-open-list>
              {data.openToExperts.map((p) => (
                <li key={p.id}><Link href={`/admin/hd-egitim-haritalari/kisi/${p.id}`}><b>{p.name}</b></Link><small>{p.bio ? "Harita + Hayat Hikâyesi" : "Yalnız harita (Hayat Hikâyesi yayımlı değil)"}</small></li>
              ))}
            </ul>
          ) : <p className={css.lead} data-edu-open-empty>Henüz yayımlanmış kişi yok. Katalog açılırsa yetkili uzmanlar boş katalog mesajı görür.</p>}
          <p className={css.note}>{data.catalogOpen ? "Katalog açık: yalnız yetkili uzmanlar bu listeyi görür." : "Katalog kapalı: bu liste hiçbir uzmana gösterilmez."}</p>
        </div>
        <div className={css.box}>
          <h3>Erişim yönetimi</h3>
          <ul className={css.gList}>
            <li><b>Uzman yetkisi</b><small>Kullanıcılar → uzman → Modül İzinleri → &quot;HUMAN DESIGN EĞİTİM HARİTALARI&quot; ({c.grants} yetkili uzman) · <Link href="/admin/hd-egitim-haritalari?sekme=erisim">Eğitmen Erişim Yetkileri</Link></small></li>
            <li><b>Bana Özel Eğitim Arşivi</b><small>{data.privateArchiveOpen ? "Açık" : "Kapalı"} — ayrı anahtar: <Link href="/admin/hd-ozel-egitim">Özel Eğitim Arşivi yönetimi</Link></small></li>
            <li><b>Son katalog değişikliği</b><small>{fmt(data.catalogChangedAt)}</small></li>
          </ul>
          {data.events.length ? (
            <details>
              <summary className={css.lead}>Yönetim geçmişi ({data.events.length})</summary>
              <ul className={css.gList} data-edu-control-events>
                {data.events.map((e, i) => <li key={i}><small>{fmt(e.at)}</small><b>{EVENT_LABEL[e.action] ?? e.action}</b><small>{[e.subjectName, e.reason].filter(Boolean).join(" · ")}</small></li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </div>

      {modal ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="eduCatalogModalTitle">
          <div className={css.mdl}>
            <h2 id="eduCatalogModalTitle">{modal === "open" ? "Uzman kataloğunu aç" : "Uzman kataloğunu kapat"}</h2>
            <p className={css.lead}>
              {modal === "open"
                ? `Yetkili ${c.grants} uzman, yayımlanmış ${c.visibleToExperts} kişiyi görmeye başlar. Yayımlanmamış, hukuk engelli veya kapsam dışı kişiler görünmez.`
                : "Tüm uzmanların eğitim kataloğu erişimi hemen kapanır (açık oturumlar dahil). Yetkiler ve yayın durumları silinmez."}
            </p>
            <label className={css.fld}>Gerekçe (zorunlu)<input className={css.input} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} data-edu-catalog-reason placeholder={modal === "open" ? "ör. hukuki görüş no / tarih" : "ör. geçici bakım"} /></label>
            <div className={css.actions}>
              <button type="button" className={`${css.btn} ${css.ghost}`} onClick={() => { setModal(null); setReason(""); }} disabled={busy}>Vazgeç</button>
              <button type="button" className={`${css.btn} ${modal === "open" ? css.save : css.danger}`} disabled={busy || reason.trim().length < 5} onClick={() => void submit()} data-edu-catalog-confirm>
                {busy ? "Kaydediliyor…" : modal === "open" ? "Kataloğu Aç" : "Kataloğu Kapat"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Kapsam dışı (arşiv) kişiler — aktif envanterin altında; "Kapsama geri al" ile geri döner (veri silinmez). */
export function ArchivedSubjects({ data, onChanged }: { data: ControlOverview | null; onChanged: () => void }) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data || !data.archivedSubjects.length) return null;
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    const r = await ownerPost(CONTROL_API, { action: "scope", subjectId: target.id, archived: false, reason });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: `${target.name} aktif envantere geri alındı (yayın durumu taslak kalır).` }); setTarget(null); setReason(""); onChanged(); }
    else setMsg({ ok: false, text: r.error });
  };
  return (
    <section className={css.panel} aria-labelledby="edu-archived-title" data-edu-archived>
      <h2 id="edu-archived-title" className={css.h2}>Kapsam Dışı Kişiler ({data.archivedSubjects.length})</h2>
      <p className={css.lead}>Aktif envanterde sayılmaz, yayımlanamaz ve hiçbir uzman yanıtında yer almaz. Kayıtları (harita, kaynak, biyografi, geçmiş) silinmez.</p>
      {msg ? <p className={msg.ok ? css.msg : css.err} role="status">{msg.text}</p> : null}
      <ul className={css.uList}>
        {data.archivedSubjects.map((s) => (
          <li key={s.id} className={css.uRow} data-edu-archived-row={s.id}>
            <div><b>{s.name}</b><small>{s.reason ?? ""} · {fmt(s.archivedAt)}</small></div>
            <div className={css.uAct}>
              <Link className={`${css.btn} ${css.ghost}`} href={`/admin/hd-egitim-haritalari/kisi/${s.id}`}>Ayrıntı</Link>
              <button type="button" className={`${css.btn} ${css.ghost}`} onClick={() => { setMsg(null); setTarget({ id: s.id, name: s.name }); }} data-edu-restore={s.id}>Kapsama geri al…</button>
            </div>
          </li>
        ))}
      </ul>
      {target ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="eduRestoreTitle">
          <div className={css.mdl}>
            <h2 id="eduRestoreTitle">Kapsama geri al: {target.name}</h2>
            <p className={css.lead}>Kişi aktif envantere döner; yayın durumu taslak kalır ve tüm hukuk / yayın engelleri aynen geçerlidir.</p>
            <label className={css.fld}>Gerekçe (zorunlu)<input className={css.input} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></label>
            <div className={css.actions}>
              <button type="button" className={`${css.btn} ${css.ghost}`} onClick={() => { setTarget(null); setReason(""); }} disabled={busy}>Vazgeç</button>
              <button type="button" className={`${css.btn} ${css.save}`} disabled={busy || reason.trim().length < 5} onClick={() => void submit()}>{busy ? "Kaydediliyor…" : "Kapsama geri al"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

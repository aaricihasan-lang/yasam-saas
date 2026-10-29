"use client";

/**
 * Hazır Eğitim Haritaları — OWNER yönetim ekranı (FAZ 2-B1).
 * Yalnız platform owner'a render edilir (layout.tsx: katı owner → aksi notFound). Veri yetkisi her API
 * çağrısında sunucuda yeniden verilir (requireEducationOwner). Envanter SALT-OKUNUR: hesaplama, yayınlama
 * ve Roxy çağrısı bu aşamada YOK. Eğitmen erişimi yalnız owner tarafından kişi bazında verilir/kaldırılır.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { premiumFontVars } from "@/app/_premium/fonts";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { OwnerSubjectDetail } from "./OwnerSubjectDetail";
import { OwnerBiographies } from "./OwnerBiographies";
import {
  EDU_BLOCKER_LABEL, EDU_CATEGORY_LABEL, EDU_LEGAL_LABEL, EDU_PUBLICATION_LABEL,
  type EduAccessEvent, type EduAccessUserRow, type EduInventoryRow, type EduInventorySummary,
} from "@/lib/human-design/education/educationContract";

type Tab = "envanter" | "erisim" | "hayat";
type Inventory = { rows: EduInventoryRow[]; summary: EduInventorySummary };
type Access = { users: EduAccessUserRow[]; events: EduAccessEvent[]; activeCount: number };

function headers(): Record<string, string> {
  return { "x-admin-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() };
}
async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { headers: headers(), cache: "no-store", credentials: "same-origin" });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
    if (res.ok && body?.ok) return { ok: true, data: body.data as T };
    return { ok: false, error: body?.error ?? "Veri alınamadı." };
  } catch {
    return { ok: false, error: "Ağ hatası — bağlantıyı kontrol edip tekrar deneyin." };
  }
}
const fmtTime = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
const ACTION_LABEL: Record<string, string> = { access_granted: "Erişim verildi", access_revoked: "Erişim kaldırıldı", access_auto_revoked: "Erişim otomatik kapatıldı (uygunluk değişti)" };

export default function EducationOwnerPage() {
  const [tab, setTab] = useState<Tab>("envanter");
  return (
    <main className={`${css.page} ${premiumFontVars}`}>
      <div className={css.inner}>
        <header className={css.hero}>
          <p className={css.eyebrow}>YAŞAM SİSTEMİ · OWNER YÖNETİMİ</p>
          <h1 className={css.title}>Hazır Eğitim Haritaları</h1>
          <p className={css.sub}>Yalnız platform owner&apos;a açık yönetim alanı</p>
        </header>
        <nav className={css.tabs} aria-label="Owner yönetim bölümleri">
          <button type="button" className={`${css.tab} ${tab === "envanter" ? css.tabOn : ""}`} onClick={() => setTab("envanter")}>Hazır Eğitim Haritaları</button>
          <button type="button" className={`${css.tab} ${tab === "erisim" ? css.tabOn : ""}`} onClick={() => setTab("erisim")}>Eğitmen Erişim Yetkileri</button>
          <button type="button" className={`${css.tab} ${tab === "hayat" ? css.tabOn : ""}`} onClick={() => setTab("hayat")} data-owner-tab-bio>Hayat Hikâyeleri</button>
        </nav>
        {tab === "envanter" ? <InventoryView /> : tab === "erisim" ? <AccessView /> : <OwnerBiographies />}
      </div>
    </main>
  );
}

function InventoryView() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [utc, setUtc] = useState("all");
  const [legal, setLegal] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    void getJson<Inventory>("/api/admin/hd/education/subjects").then((r) => {
      if (!live) return;
      if (r.ok) setInv(r.data); else setErr(r.error);
    });
    return () => { live = false; };
  }, [tick]);
  const rows = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return (inv?.rows ?? []).filter((r) => (!term || r.displayName.toLocaleLowerCase("tr-TR").includes(term))
      && (utc === "all" || (utc === "ok") === (r.utcStatus === "VERIFIED"))
      && (legal === "all" || r.legalStatus === legal));
  }, [inv, q, utc, legal]);
  const selected = inv?.rows.find((r) => r.id === sel) ?? null;
  if (err) return <p className={css.err} role="alert">{err}</p>;
  if (!inv) return <p className={css.empty}>Yükleniyor…</p>;
  const s = inv.summary;
  return (
    <>
      <div className={css.stats}>
        <div className={css.stat}><b>{s.total}</b><span>Toplam kişi</span></div>
        <div className={`${css.stat} ${css.sOk}`}><b>{s.utcVerified}</b><span>UTC doğrulandı</span></div>
        <div className={`${css.stat} ${css.sWarn}`}><b>{s.utcPending}</b><span>UTC teyit bekliyor</span></div>
        <div className={`${css.stat} ${css.sBad}`}><b>{s.legalE}</b><span>Hukuk E</span></div>
        <div className={`${css.stat} ${css.sWarn}`}><b>{s.legalUnreviewed}</b><span>Avukat incelemesi yok</span></div>
        <div className={css.stat}><b>{s.published}</b><span>Yayında</span></div>
      </div>
      <section className={css.panel}>
        <div className={css.tools}>
          <input className={css.input} type="search" placeholder="Kişi adı ara..." value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} aria-label="Kişi adı ara" />
          <select className={css.select} value={utc} onChange={(e) => setUtc(e.target.value)} aria-label="UTC durumu">
            <option value="all">UTC: Tümü</option><option value="ok">UTC doğrulandı</option><option value="pending">UTC teyit bekliyor</option>
          </select>
          <select className={css.select} value={legal} onChange={(e) => setLegal(e.target.value)} aria-label="Hukuk durumu">
            <option value="all">Hukuk: Tümü</option><option value="E">{EDU_LEGAL_LABEL.E}</option><option value="LOW_UNREVIEWED">{EDU_LEGAL_LABEL.LOW_UNREVIEWED}</option><option value="LOW_REVIEWED">{EDU_LEGAL_LABEL.LOW_REVIEWED}</option>
          </select>
        </div>
        {inv.rows.length === 0 ? (
          <p className={css.empty}>Envanter henüz içe aktarılmadı. Kayıtlar yalnız owner onaylı, kontrollü taslak içe aktarımıyla eklenir.</p>
        ) : (
          <div className={css.tableWrap}>
            <table className={css.tbl}>
              <thead><tr><th>Kişi</th><th>Kanıt</th><th>UTC</th><th>Hukuk</th><th>Süreç</th><th>Yayın kaydı</th><th>Yayın engelleri</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={sel === r.id ? css.rowOn : ""} tabIndex={0} onClick={() => setSel(sel === r.id ? null : r.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSel(sel === r.id ? null : r.id); }}>
                    <td><b>{r.displayName}</b><small>{EDU_CATEGORY_LABEL[r.category]}{r.isLiving ? " · yaşıyor" : ""}</small></td>
                    <td><span className={`${css.tag} ${css.tOk}`}>A · belgeli saat</span></td>
                    <td>{r.utcStatus === "VERIFIED" ? <span className={`${css.tag} ${css.tOk}`}>Doğrulandı</span> : <span className={`${css.tag} ${css.tWarn}`}>Teyit bekliyor</span>}</td>
                    <td><span className={`${css.tag} ${r.legalStatus === "E" ? css.tBad : r.legalStatus === "LOW_REVIEWED" ? css.tOk : css.tWarn}`}>{EDU_LEGAL_LABEL[r.legalStatus]}</span></td>
                    <td><span className={`${css.tag} ${r.stage === "Taslak" || r.stage === "Pilot adayı" ? css.tMute : r.stage === "Yayında" ? css.tOk : css.tInfo}`}>{r.stage}</span>{r.computed ? null : <small>hesap yok</small>}</td>
                    <td><span className={`${css.tag} ${r.publicationStatus === "draft" ? css.tMute : css.tInfo}`}>{EDU_PUBLICATION_LABEL[r.publicationStatus]}</span></td>
                    <td>{r.blockers.length ? r.blockers.map((b) => <span key={b} className={`${css.tag} ${css.tLine}`}>{EDU_BLOCKER_LABEL[b] ?? b}</span>) : <span className={`${css.tag} ${css.tOk}`}>Engel yok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={css.count}>{rows.length} / {inv.rows.length} kişi</p>
      </section>
      {selected ? <OwnerSubjectDetail key={selected.id} id={selected.id} onChanged={reload} /> : null}
    </>
  );
}

function AccessView() {
  const [data, setData] = useState<Access | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyHd, setOnlyHd] = useState(true);
  const load = useCallback(async (term: string) => {
    const r = await getJson<Access>(`/api/admin/hd/education/access?q=${encodeURIComponent(term)}`);
    if (r.ok) { setData(r.data); setErr(null); } else setErr(r.error);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { void load(q); }, 250);
    return () => clearTimeout(t);
  }, [q, load]);
  const users = (data?.users ?? []).filter((u) => !onlyHd || u.humanDesign);
  const active = (data?.users ?? []).filter((u) => u.grant);
  if (err) return <p className={css.err} role="alert">{err}</p>;
  return (
    <>
      <div className={css.stats}>
        <div className={css.stat}><b>{data?.users.length ?? "…"}</b><span>Listelenen üye</span></div>
        <div className={`${css.stat} ${css.sOk}`}><b>{data?.activeCount ?? "…"}</b><span>Eğitim yetkisi açık</span></div>
      </div>
      <div className={css.split}>
        <section className={css.panel}>
          <h2 className={css.h2}>Uzmanlar</h2>
          <p className={css.lead}>TEK yetki: <b>Human Design Eğitim Haritaları</b>. Açma/kapama yalnız üyenin <b>Modül İzinleri</b> ekranından yapılır; bu liste salt-okunurdur. Varsayılan: KAPALI.</p>
          <div className={css.tools} style={{ marginTop: 12 }}>
            <input className={css.input} type="search" placeholder="İsim veya e-posta ara..." value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} aria-label="Uzman ara" />
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
              <input type="checkbox" checked={onlyHd} onChange={(e) => setOnlyHd(e.target.checked)} /> Yalnız Human Design erişimi olanlar
            </label>
          </div>
          <ul className={css.uList}>
            {users.map((u) => (
              <li key={u.id} className={css.uRow}>
                <div><b>{u.name}</b><small>{u.email}</small>
                  <span className={`${css.tag} ${css.tLine}`}>{u.role === "expert" ? "Uzman" : u.role === "admin" ? "Admin" : u.role}</span>
                  {u.humanDesign ? <span className={`${css.tag} ${css.tLine}`}>Human Design: açık</span> : <span className={`${css.tag} ${css.tMute}`}>Human Design: kapalı</span>}
                  {!u.active ? <span className={`${css.tag} ${css.tBad}`}>Pasif hesap</span> : null}
                </div>
                <div className={css.uAct}>
                  {u.grant ? <span className={`${css.tag} ${css.tOk} ${css.big}`}>ERİŞİM AÇIK</span> : <span className={`${css.tag} ${css.tMute} ${css.big}`}>ERİŞİM KAPALI</span>}
                  <Link className={`${css.btn} ${css.ghost}`} href={`/admin/users/${u.id}#uye-erisim`}>Modül İzinleri’nde değiştir</Link>
                  {!u.grant && !u.eligible && u.ineligibleReason ? <small className={css.why}>{u.ineligibleReason}</small> : null}
                </div>
              </li>
            ))}
            {data && users.length === 0 ? <li className={css.empty}>Eşleşen üye yok.</li> : null}
          </ul>
        </section>
        <aside>
          <section className={css.panel}>
            <h2 className={css.h2}>Yetkili eğitmenler</h2>
            <ul className={css.gList}>
              {active.map((u) => <li key={u.id}><b>{u.name}</b><small>Verildi: {u.grant ? fmtTime(u.grant.grantedAt) : ""}</small></li>)}
              {data && active.length === 0 ? <li className={css.empty}>Aktif yetki yok.</li> : null}
            </ul>
          </section>
          <section className={css.panel}>
            <h2 className={css.h2}>Değişiklik geçmişi</h2>
            <ul className={css.gList}>
              {(data?.events ?? []).map((e, i) => <li key={i}><small>{fmtTime(e.at)}</small><b>{ACTION_LABEL[e.action] ?? e.action}</b><small>{e.targetName ?? "—"} · {e.actorKind === "owner" ? "Platform Owner" : "Sistem"}</small></li>)}
              {data && data.events.length === 0 ? <li className={css.empty}>Henüz kayıt yok.</li> : null}
            </ul>
          </section>
          <p className={css.note}>Platform owner dışındaki admin hesapları ve demo hesaplar bu alanı göremez; yetki veremez veya kaldıramaz. Admin yapılan eğitmenin erişimi kalıcı kapanır; yeniden uzman yapılması erişimi geri getirmez.</p>
        </aside>
      </div>
    </>
  );
}

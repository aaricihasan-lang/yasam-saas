"use client";

/**
 * Hazır Eğitim Haritaları — OWNER yönetim ekranı (FAZ 2-B1).
 * Yalnız platform owner'a render edilir (layout.tsx: katı owner → aksi notFound). Veri yetkisi her API
 * çağrısında sunucuda yeniden verilir (requireEducationOwner). Envanter SALT-OKUNUR: hesaplama, yayınlama
 * ve Roxy çağrısı bu aşamada YOK. Eğitmen erişimi yalnız owner tarafından kişi bazında verilir/kaldırılır.
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";
import { premiumFontVars } from "@/app/_premium/fonts";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { OwnerBiographies } from "./OwnerBiographies";
import { ArchivedSubjects, OwnerControlPanel, useControlOverview } from "./OwnerControlPanel";
import ov from "./ownerViews.module.css";
import { restoreListScroll, saveListReturn } from "./listState";
import { EDU_FAMILIES, type EduFamily } from "@/lib/human-design/education/educationFamilies";
import {
  EDU_BLOCKER_LABEL, EDU_CATEGORY_LABEL, EDU_LEGAL_LABEL, EDU_PUBLICATION_LABEL,
  type EduAccessEvent, type EduAccessUserRow, type EduInventoryRow, type EduInventorySummary,
} from "@/lib/human-design/education/educationContract";

type Tab = "envanter" | "erisim" | "hayat";
type Inventory = { rows: EduInventoryRow[]; summary: EduInventorySummary };
type Access = { users: EduAccessUserRow[]; events: EduAccessEvent[]; activeCount: number; gates?: { catalogEnabled: boolean; privateEnabled: boolean } };

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

/** Liste durumu URL'de (sekme / arama / filtre): kişi veya aile sayfasından geri dönüşte aynı görünüm açılır. */
function useListParam(name: string, fallback: string): [string, (v: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = sp.get(name) ?? fallback;
  const set = useCallback((v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v === fallback || v === "") next.delete(name); else next.set(name, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [name, fallback, pathname, router]);
  return [value, set];
}

export default function EducationOwnerPage() {
  return <Suspense fallback={null}><EducationOwnerPageInner /></Suspense>;
}

function EducationOwnerPageInner() {
  const [tabRaw, setTabRaw] = useListParam("sekme", "envanter");
  const tab: Tab = tabRaw === "erisim" || tabRaw === "hayat" ? tabRaw : "envanter";
  const setTab = (t: Tab) => setTabRaw(t);
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
  const router = useRouter();
  const [inv, setInv] = useState<Inventory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Arama / filtre yerel durumda (anlık süzme); URL'ye yansıtılır → kişi sayfasından geri dönüşte aynı görünüm.
  const [qUrl, setQUrl] = useListParam("ara", "");
  const [utcUrl, setUtcUrl] = useListParam("utc", "all");
  const [legalUrl, setLegalUrl] = useListParam("hukuk", "all");
  const [q, setQ] = useState(qUrl);
  const [utc, setUtc] = useState(utcUrl);
  const [legal, setLegal] = useState(legalUrl);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== qUrl) setQUrl(q); }, 300);
    return () => clearTimeout(t);
  }, [q, qUrl, setQUrl]);
  useEffect(() => { if (utc !== utcUrl) setUtcUrl(utc); }, [utc, utcUrl, setUtcUrl]);
  useEffect(() => { if (legal !== legalUrl) setLegalUrl(legal); }, [legal, legalUrl, setLegalUrl]);
  const restored = useRef(false);
  // Owner kararı 31.10.2026: açılış durumu + kapsam dışı kişiler; işlem sonrası envanter ve özet birlikte yenilenir.
  const control = useControlOverview();
  const [invTick, setInvTick] = useState(0);
  const changed = useCallback(() => { control.reload(); setInvTick((t) => t + 1); }, [control]);
  useEffect(() => {
    let live = true;
    void getJson<Inventory>("/api/admin/hd/education/subjects").then((r) => {
      if (!live) return;
      if (r.ok) setInv(r.data); else setErr(r.error);
    });
    return () => { live = false; };
  }, [invTick]);
  useEffect(() => {
    // Açılış paneli de yüklendikten sonra (yüksekliği sabitlenince) liste konumu geri yüklenir.
    if (inv && (control.data || control.err) && !restored.current) { restored.current = true; restoreListScroll(); }
  }, [inv, control.data, control.err]);
  // Kişi ayrıntısı AYRI sayfada (owner kararı 29.10.2026); liste konumu geri dönüş için saklanır.
  const open = (id: string) => { saveListReturn(); router.push(`/admin/hd-egitim-haritalari/kisi/${id}`); };
  // Aktif envanter: kapsam dışı (arşiv) kişiler listede, filtrelerde ve aile kartlarında yer almaz.
  const activeRows = useMemo(() => (inv?.rows ?? []).filter((r) => !r.archived), [inv]);
  const rows = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return activeRows.filter((r) => (!term || r.displayName.toLocaleLowerCase("tr-TR").includes(term))
      && (utc === "all" || (utc === "ok") === (r.utcStatus === "VERIFIED"))
      && (legal === "all" || r.legalStatus === legal));
  }, [activeRows, q, utc, legal]);
  if (err) return <p className={css.err} role="alert">{err}</p>;
  if (!inv) return <p className={css.empty}>Yükleniyor…</p>;
  const s = inv.summary;
  return (
    <>
      <OwnerControlPanel data={control.data} err={control.err} onChanged={changed} />
      <div className={css.stats}>
        <div className={css.stat}><b>{s.total}</b><span>Toplam kişi</span></div>
        <div className={`${css.stat} ${css.sOk}`}><b>{s.utcVerified}</b><span>UTC doğrulandı</span></div>
        <div className={`${css.stat} ${css.sWarn}`}><b>{s.utcPending}</b><span>UTC teyit bekliyor</span></div>
        <div className={`${css.stat} ${css.sBad}`} data-edu-stat="legalE"><b>{s.legalE}</b><span>{EDU_LEGAL_LABEL.E}</span></div>
        <div className={`${css.stat} ${css.sWarn}`} data-edu-stat="legalUnreviewed"><b>{s.legalUnreviewed}</b><span>{EDU_LEGAL_LABEL.LOW_UNREVIEWED}</span></div>
        <div className={css.stat}><b>{s.published}</b><span>Yayında</span></div>
      </div>
      <section className={css.panel}>
        <div className={css.tools}>
          <input className={css.input} type="search" placeholder="Kişi adı ara..." value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} aria-label="Kişi adı ara" />
          <select className={css.select} value={utc} onChange={(e) => setUtc(e.target.value)} aria-label="UTC durumu">
            <option value="all">UTC: Tümü</option><option value="ok">UTC doğrulandı</option><option value="pending">UTC teyit bekliyor</option>
          </select>
          <select className={css.select} value={legal} onChange={(e) => setLegal(e.target.value)} aria-label="Hukuki durum">
            <option value="all">Hukuki durum: Tümü</option><option value="E">{EDU_LEGAL_LABEL.E}</option><option value="LOW_UNREVIEWED">{EDU_LEGAL_LABEL.LOW_UNREVIEWED}</option><option value="LOW_REVIEWED">{EDU_LEGAL_LABEL.LOW_REVIEWED}</option>
          </select>
        </div>
        {activeRows.length === 0 ? (
          <p className={css.empty}>Envanter henüz içe aktarılmadı. Kayıtlar yalnız owner onaylı, kontrollü taslak içe aktarımıyla eklenir.</p>
        ) : (
          <div className={css.tableWrap}>
            <table className={css.tbl}>
              <thead><tr><th>Kişi</th><th>Kanıt</th><th>UTC</th><th>Hukuki durum</th><th>Süreç</th><th>Yayın kaydı</th><th>Yayın engelleri</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => open(r.id)} data-edu-row={r.naturalKey}
                    onKeyDown={(e) => { if (e.key === "Enter") open(r.id); }}>
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
        <p className={css.count}>{rows.length} / {activeRows.length} kişi</p>
      </section>
      <ArchivedSubjects data={control.data} onChanged={changed} />
      {/* Owner kararı 30.10.2026: Aile Haritaları ana içeriğin EN ALTINDA (yalnız aktif kişilerle). */}
      <FamilySection rows={activeRows} />
    </>
  );
}

/** Kaynakla doğrulanmış aile kartları (educationFamilies). Kayıtta bulunmayan üye gösterilmez; aile dışı kişiler listede aynen kalır. */
function FamilySection({ rows }: { rows: EduInventoryRow[] }) {
  const byKey = useMemo(() => new Map(rows.map((r) => [r.naturalKey, r])), [rows]);
  const fams = EDU_FAMILIES
    .map((f) => ({ f, members: f.members.flatMap((m) => { const r = byKey.get(m.naturalKey); return r ? [{ ...m, row: r }] : []; }) }))
    .filter((x) => x.members.length >= 2);
  if (!fams.length) return null;
  return (
    <section className={`${css.panel} ${ov.famSection}`} aria-labelledby="edu-fam-title" data-edu-families>
      <div className={ov.famHead}>
        <h2 id="edu-fam-title" className={css.h2}>Aile Haritaları</h2>
        <small className={css.lead}>Yalnız kaynakla doğrulanmış aile bağları · bireyler aşağıdaki listede de yer alır</small>
      </div>
      <div className={ov.famGrid}>
        {fams.map(({ f, members }) => <FamilyCard key={f.key} family={f} members={members} />)}
      </div>
    </section>
  );
}

function FamilyCard({ family, members }: { family: EduFamily; members: Array<{ naturalKey: string; role: string; row: EduInventoryRow }> }) {
  const [sel, setSel] = useState<string[]>([]);
  const all = members.map((m) => m.row.id);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const base = `/admin/hd-egitim-haritalari/aile/${family.key}`;
  const selHref = sel.length === 1 ? `/admin/hd-egitim-haritalari/kisi/${sel[0]}` : `${base}?sec=${sel.join(",")}`;
  const linkText = family.links.map((l) => {
    const a = members.find((m) => m.naturalKey === l.from)?.row.displayName;
    const b = members.find((m) => m.naturalKey === l.to)?.row.displayName;
    return a && b ? `${a} ⟷ ${b} (${l.label})` : null;
  }).filter(Boolean).join(" · ");
  return (
    <article className={ov.famCard} data-edu-family={family.key}>
      <h3 className={ov.famTitle}>{family.title}</h3>
      {linkText ? <p className={ov.famLink} data-edu-family-link>{linkText}</p> : null}
      <ul className={ov.famMembers}>
        {members.map((m) => (
          <li key={m.row.id} className={ov.famMember}>
            <label>
              <input type="checkbox" checked={sel.includes(m.row.id)} onChange={() => toggle(m.row.id)} data-edu-family-pick={m.naturalKey} aria-label={`${m.row.displayName} seç`} />
              <span className={ov.famName}>{m.row.displayName}</span>
            </label>
            <span className={ov.famRole} data-edu-family-role={m.role}>{m.role}</span>
            <Link className={ov.famOpen} href={`/admin/hd-egitim-haritalari/kisi/${m.row.id}`} onClick={saveListReturn}>Ayrıntı →</Link>
          </li>
        ))}
      </ul>
      <div className={ov.famActions}>
        <button type="button" className={ov.famBtn} onClick={() => setSel(sel.length === all.length ? [] : all)} data-edu-family-all>
          {sel.length === all.length ? "Seçimi temizle" : "Ailenin Tamamını Seç"}
        </button>
        <Link className={ov.famBtn} href={selHref} aria-disabled={sel.length === 0} tabIndex={sel.length === 0 ? -1 : undefined} onClick={saveListReturn} data-edu-family-selected>
          {sel.length === 1 ? "Seçili kişiyi incele" : `Seçilenleri İncele (${sel.length})`}
        </Link>
        <Link className={`${ov.famBtn} ${ov.famBtnMain}`} href={base} onClick={saveListReturn} data-edu-family-review>Ailenin Tamamını İncele</Link>
      </div>
    </article>
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
  const live = !!(data?.gates?.catalogEnabled || data?.gates?.privateEnabled);
  return (
    <>
      {data && !live ? (
        <p className={css.note} role="note" data-edu-access-gate="closed">Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı. Yetkiler uzmanın Modül İzinleri ekranından verilip kaldırılabilir ve değişiklik geçmişine işlenir; Eğitim Merkezi yayına açılana kadar hiçbir uzman eğitim içeriği göremez.</p>
      ) : null}
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

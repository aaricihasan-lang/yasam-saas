"use client";

/**
 * Taş Yönetimi (owner). Liste + arama + durum / köken filtresi + çoklu seçim.
 * Silme: 1–2 taş tek adım (yayındaysa önce yayından kaldırılır) + bildirimde "Geri al"; 3+ taş üç aşamalı onay
 * (seçim → sayılı uyarı → "SİL" yazma) + sonrasında "Geri al". Sayılar API'den gelir (sabit taş sayısı yok).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthImage } from "@/app/dogaltas/kutuphane/_shared/AuthImage";
import { OwnerHealthNotice, OwnerNotFound, OwnerShell, useToast } from "./_components/OwnerShell";
import { ownerErrorText, ownerGet, ownerPost } from "./_components/ownerApi";
import { statusPill } from "./_components/StatusPill";
import s from "./_components/owner.module.css";
import { useOwnerRoutes } from "./_components/ownerRoutes";

type CatalogStone = {
  id: string;
  slug: string;
  name_tr: string;
  name_en: string | null;
  status: string;
  origin: "source" | "owner";
  deleted: boolean;
  owner_version_current: number | null;
  owner_versions: number;
  translations_published: number;
  translations_total: number;
  image_choice: string;
  has_published_image: boolean;
};
type Counts = { total: number; published: number; owner_created: number; deleted: number; translation_fields: number; translation_published: number; translation_fallback: number };
type Catalog = { stones: CatalogStone[]; counts: Counts };
type DeleteOp = { id: string; entity: string; entity_id: string; restored_at: string | null; created_at: string };
type StatusFilter = "all" | "draft" | "published" | "hidden" | "deleted";
type Prepared = { token: string; count: number; names: string[]; published: number };
type BulkModal = { step: 1 | 2 | 3; ids: string[]; prepared: Prepared | null; typed: string; busy: boolean; err: string | null };

const fold = (v: string) => v.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
const isDraftish = (st: string) => st === "draft" || st === "review" || st === "ready";

export default function CatalogClient() {
  const routes = useOwnerRoutes();
  const [data, setData] = useState<Catalog | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [origin, setOrigin] = useState<"all" | "source" | "owner">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<BulkModal | null>(null);
  const [deleteOps, setDeleteOps] = useState<DeleteOp[] | null>(null);
  const { show: showToast, view: toastView } = useToast();

  const load = useCallback(async () => {
    const r = await ownerGet<{ ok: true } & Catalog>("/katalog");
    if (r.ok) setData({ stones: r.data.stones ?? [], counts: r.data.counts });
    else if (r.status === 404) setNotFound(true);
    else showToast(ownerErrorText(r), { tone: "err" });
  }, [showToast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (status !== "deleted") return;
    let live = true;
    void (async () => {
      const r = await ownerGet<{ ok: true; overview: { delete_ops?: DeleteOp[] } | null }>("");
      if (live && r.ok) setDeleteOps(r.data.overview?.delete_ops ?? []);
    })();
    return () => {
      live = false;
    };
  }, [status, data]);

  const list = useMemo(() => {
    if (!data) return [];
    const fq = fold(q.trim());
    return data.stones
      .filter((x) => (status === "deleted" ? x.deleted : !x.deleted))
      .filter((x) => status === "all" || status === "deleted" || (status === "draft" ? isDraftish(x.status) : x.status === status))
      .filter((x) => origin === "all" || x.origin === origin)
      .filter((x) => !fq || fold(`${x.name_tr} ${x.name_en ?? ""}`).includes(fq));
  }, [data, q, status, origin]);

  const selected = useMemo(() => list.filter((x) => sel.has(x.id)), [list, sel]);

  if (notFound) {
    return (
      <OwnerShell section="list">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const toggleSel = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setPublished = async (st: CatalogStone, publish: boolean, quiet = false): Promise<boolean> => {
    const r = await ownerPost(`/katman/${st.id}`, { action: publish ? "publish" : "unpublish" });
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      return false;
    }
    if (!quiet) {
      showToast(`${st.name_tr}: ${publish ? "yayınlandı" : "yayından kaldırıldı"}.`, {
        undo: async () => {
          const u = await ownerPost(`/katman/${st.id}`, { action: publish ? "unpublish" : "publish" });
          if (!u.ok) showToast(ownerErrorText(u), { tone: "err" });
          await load();
        },
      });
    }
    return true;
  };

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      await load();
    }
  };

  const deleteFew = (stones: CatalogStone[]) =>
    runAction(async () => {
      const ops: string[] = [];
      for (const st of stones) {
        if (st.status === "published" && !(await setPublished(st, false, true))) return;
        const r = await ownerPost<{ ok: true; op_id: string }>("/silme", { action: "delete", entity: "stone", id: st.id, cascade: true });
        if (!r.ok) {
          showToast(ownerErrorText(r), { tone: "err" });
          break;
        }
        ops.push(r.data.op_id);
      }
      if (!ops.length) return;
      setSel(new Set());
      showToast(`${ops.length} taş silindi (geri alınabilir).`, {
        undo: async () => {
          for (const op of ops) {
            const u = await ownerPost("/silme", { action: "restore", op_id: op });
            if (!u.ok) showToast(ownerErrorText(u), { tone: "err" });
          }
          showToast("Silme geri alındı. Geri getirilen taşlar yayında değildir.");
          await load();
        },
      });
    });

  const restoreDeleted = (st: CatalogStone) =>
    runAction(async () => {
      const op = (deleteOps ?? [])
        .filter((o) => o.entity === "stone" && o.entity_id === st.id && !o.restored_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!op) {
        showToast("Bu taş için geri alınabilir silme kaydı bulunamadı.", { tone: "err" });
        return;
      }
      const r = await ownerPost("/silme", { action: "restore", op_id: op.id });
      showToast(r.ok ? `${st.name_tr} geri getirildi (yayında değil).` : ownerErrorText(r), { tone: r.ok ? "ok" : "err" });
    });

  const startDelete = () => {
    if (!selected.length) return;
    if (selected.length < 3) void deleteFew(selected);
    else setModal({ step: 1, ids: selected.map((x) => x.id), prepared: null, typed: "", busy: false, err: null });
  };

  const bulkNext = async () => {
    if (!modal) return;
    if (modal.step === 1) {
      setModal({ ...modal, busy: true, err: null });
      const r = await ownerPost<{ ok: true; result: Prepared }>("/toplu-silme", { step: "prepare", stone_ids: modal.ids });
      if (!r.ok) setModal({ ...modal, busy: false, err: ownerErrorText(r) });
      else setModal({ ...modal, step: 2, prepared: r.data.result, busy: false, err: null });
      return;
    }
    if (modal.step === 2) {
      setModal({ ...modal, step: 3, err: null });
      return;
    }
    if (modal.typed.trim() !== "SİL" || !modal.prepared) {
      setModal({ ...modal, err: "Onaylamak için tam olarak SİL yazın." });
      return;
    }
    setModal({ ...modal, busy: true, err: null });
    const token = modal.prepared.token;
    const r = await ownerPost<{ ok: true; result: { deleted: number } }>("/toplu-silme", { step: "confirm", token, confirm_text: "SİL" });
    if (!r.ok) {
      setModal({ ...modal, busy: false, err: ownerErrorText(r) });
      return;
    }
    setModal(null);
    setSel(new Set());
    await load();
    showToast(`${r.data.result.deleted} taş silindi (geri alınabilir).`, {
      undo: async () => {
        const u = await ownerPost<{ ok: true; result: { restored: number } }>("/toplu-silme", { step: "restore", token });
        showToast(u.ok ? `${u.data.result.restored} taş geri getirildi. Geri getirilen taşlar yayında değildir.` : ownerErrorText(u), { tone: u.ok ? "ok" : "err" });
        await load();
      },
    });
  };

  const c = data?.counts;
  const rowActions = (st: CatalogStone) =>
    st.deleted ? (
      <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy || deleteOps === null} onClick={() => void restoreDeleted(st)}>
        Geri getir
      </button>
    ) : (
      <>
        <Link className={`btn-outline ${s.btn} ${s.btnSm}`} href={routes.stone(st.id)}>
          Düzenle
        </Link>
        {st.status === "published" ? (
          <button type="button" className={`btn-danger ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void runAction(() => setPublished(st, false))}>
            Yayından kaldır
          </button>
        ) : (
          <button type="button" className={`btn-success ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void runAction(() => setPublished(st, true))}>
            Yayınla
          </button>
        )}
      </>
    );
  const contentCell = (st: CatalogStone) =>
    st.origin === "owner" ? (
      <span className={s.muted}>Owner içeriği · {st.owner_versions} sürüm</span>
    ) : (
      <span className={s.muted}>
        Çeviri {st.translations_published}/{st.translations_total} yayında
        {st.owner_version_current ? " · Owner sürümü etkin" : ""}
      </span>
    );
  const thumb = (st: CatalogStone) =>
    // Owner kapak önizlemesi: taslakta da görünür (yalnız owner; uzman görsel kapısı ayrıdır).
    !st.deleted ? (
      <AuthImage src={`/api/admin/dogaltas-kutuphane/taslar/${st.id}/kapak?v=${st.image_choice}`} kind="owner" alt="" lazy className={s.thumb} placeholderClassName={s.thumb} />
    ) : (
      <span className={s.thumb} aria-hidden="true" />
    );
  const chk = (st: CatalogStone) =>
    st.deleted ? null : (
      <label className={s.rowchk}>
        <input type="checkbox" checked={sel.has(st.id)} onChange={() => toggleSel(st.id)} />
        <span className={s.srOnly}>{st.name_tr} seç</span>
      </label>
    );
  const nameCell = (st: CatalogStone) => (
    <Link className={s.stoneCell} href={st.deleted ? "#" : routes.stone(st.id)} aria-disabled={st.deleted || undefined}>
      {thumb(st)}
      <span>
        <b>{st.name_tr}</b>
        {st.name_en ? <small>{st.name_en}</small> : null}
        {st.origin === "owner" ? <span className={`${s.pill} ${s.pillViolet}`}>Owner tarafından oluşturuldu</span> : null}
      </span>
    </Link>
  );
  const kpi = (k: StatusFilter, n: number | undefined, label: string) => (
    <button type="button" className={s.kpi} aria-pressed={status === k} onClick={() => setStatus(status === k ? "all" : k)}>
      <b>{n ?? "–"}</b>
      <span>{label}</span>
    </button>
  );
  const draftCount = data ? data.stones.filter((x) => !x.deleted && isDraftish(x.status)).length : undefined;
  const hiddenCount = data ? data.stones.filter((x) => !x.deleted && x.status === "hidden").length : undefined;

  return (
    <OwnerShell section="list">
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>Owner · Doğaltaş Kütüphanesi</span>
          <h1>Taş Yönetimi</h1>
          <p>Taşları düzenleyin, yeni taş ekleyin, yayınlayın. Kaynak metinler ve özgün adlar değişmez; düzenlemeleriniz ayrı Owner katmanında, sürüm geçmişiyle saklanır.</p>
        </div>
        <div className={s.heroSide}>
          <Link className={`btn-success ${s.btn} ${s.btnBig}`} href={routes.newStone}>
            + Yeni Taş Ekle
          </Link>
          {c ? (
            <div className={s.heroStats}>
              <div className={s.statPill}>
                <b>{c.total}</b>
                <span>Toplam taş</span>
              </div>
              <div className={s.statPill}>
                <b>{c.published}</b>
                <span>Yayında</span>
              </div>
              {c.owner_created ? (
                <div className={s.statPill}>
                  <b>{c.owner_created}</b>
                  <span>Owner taşı</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className={s.kpis}>
        {kpi("draft", draftCount, "Taslak")}
        {kpi("published", c?.published, "Yayında")}
        {kpi("hidden", hiddenCount, "Yayından kaldırıldı")}
        {kpi("deleted", c?.deleted, "Silinmiş (geri alınabilir)")}
      </div>
      <OwnerHealthNotice />

      <div className={s.cols}>
        <section>
          <div className={s.toolbar}>
            <label className={s.search}>
              <span className={s.srOnly}>Taş ara</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Taş adıyla ara…" autoComplete="off" />
            </label>
            <label>
              <span className={s.srOnly}>Durum</span>
              <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="all">Tüm durumlar</option>
                <option value="draft">Taslak</option>
                <option value="published">Yayında</option>
                <option value="hidden">Yayından kaldırıldı</option>
                <option value="deleted">Silinmiş</option>
              </select>
            </label>
            <label>
              <span className={s.srOnly}>Köken</span>
              <select className={s.select} value={origin} onChange={(e) => setOrigin(e.target.value as "all" | "source" | "owner")}>
                <option value="all">Tüm kökenler</option>
                <option value="source">Lisanslı kaynak</option>
                <option value="owner">Owner tarafından oluşturuldu</option>
              </select>
            </label>
          </div>

          {selected.length ? (
            <div className={s.selbar}>
              <b>{selected.length} taş seçildi</b>
              <div className={s.rowActions}>
                <button type="button" className={`btn-outline ${s.btn}`} onClick={() => setSel(new Set())}>
                  Seçimi temizle
                </button>
                <button type="button" className={`btn-danger ${s.btn}`} disabled={busy} onClick={startDelete}>
                  Seçilenleri sil (geri alınabilir)
                </button>
              </div>
            </div>
          ) : null}

          {!data ? (
            <p className={s.loading}>Yükleniyor…</p>
          ) : list.length ? (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.cChk}>
                      <span className={s.srOnly}>Seç</span>
                    </th>
                    <th>Taş</th>
                    <th>Durum</th>
                    <th>İçerik</th>
                    <th style={{ textAlign: "right" }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((st) => (
                    <tr key={st.id}>
                      <td className={s.cChk}>{chk(st)}</td>
                      <td>{nameCell(st)}</td>
                      <td>{statusPill(st.status, st.deleted)}</td>
                      <td>{contentCell(st)}</td>
                      <td>
                        <div className={s.rowActions}>{rowActions(st)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={s.oCards}>
                {list.map((st) => (
                  <article key={st.id} className={s.oCard}>
                    <div className={s.oCardTop}>
                      {chk(st)}
                      {nameCell(st)}
                    </div>
                    <div className={s.meta}>
                      {statusPill(st.status, st.deleted)} {contentCell(st)}
                    </div>
                    <div className={s.rowActions}>{rowActions(st)}</div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={s.emptyState}>
              <b>Bu ölçütlere uyan taş yok.</b>
            </div>
          )}
        </section>

        <aside className={s.side}>
          <div className={s.panel}>
            <h2>Çeviri yönetimi</h2>
            <div className={s.modeRow}>
              <span>Çeviri alanı</span>
              <b>{c?.translation_fields ?? "–"}</b>
            </div>
            <div className={s.modeRow}>
              <span>Yayında</span>
              <b>{c?.translation_published ?? "–"}</b>
            </div>
            <div className={s.modeRow}>
              <span>Kaynak metin gösterimi</span>
              <b>{c?.translation_fallback ?? "–"}</b>
            </div>
            <Link className={`btn-outline ${s.btn}`} style={{ width: "100%", marginTop: 8 }} href={routes.translations}>
              Çeviri yönetimi
            </Link>
          </div>
          <div className={s.panel}>
            <h2>Uzman erişimi</h2>
            <p className={s.note} style={{ marginTop: 0 }}>
              Varsayılan olarak hiçbir uzmanın erişimi yok.
            </p>
            <Link className={`btn-outline ${s.btn}`} style={{ width: "100%", marginTop: 8 }} href={routes.experts}>
              Uzman erişimini yönet
            </Link>
          </div>
        </aside>
      </div>

      {modal ? (
        <div className={s.modalBg}>
          <div className={s.modal} role="alertdialog" aria-modal="true" aria-labelledby="bulk-title">
            <h2 id="bulk-title">Toplu silme · adım {modal.step} / 3</h2>
            {modal.step === 1 ? (
              <p>
                <b>{modal.ids.length}</b> taş seçildi. Devam ederseniz silinecek taşlar ve yayındaki taş sayısı gösterilir. Silme geri alınabilir.
              </p>
            ) : null}
            {modal.step >= 2 && modal.prepared ? (
              <>
                <p>
                  <b>{modal.prepared.count}</b> taş silinecek
                  {modal.prepared.published ? (
                    <>
                      ; bunların <b>{modal.prepared.published}</b> tanesi yayında ve önce yayından kaldırılacak
                    </>
                  ) : null}
                  .
                </p>
                <ul>
                  {modal.prepared.names.slice(0, 12).map((n, i) => (
                    <li key={`${n}-${i}`}>{n}</li>
                  ))}
                  {modal.prepared.names.length > 12 ? <li>ve {modal.prepared.names.length - 12} taş daha</li> : null}
                </ul>
              </>
            ) : null}
            {modal.step === 3 ? (
              <label className={s.fl}>
                <span>
                  Onaylamak için <b>SİL</b> yazın
                </span>
                <input className={s.input} value={modal.typed} autoComplete="off" onChange={(e) => setModal({ ...modal, typed: e.target.value })} aria-invalid={!!modal.err} />
              </label>
            ) : null}
            {modal.err ? <p className={s.errText}>{modal.err}</p> : null}
            <div className={s.acts}>
              <button type="button" className={`btn-outline ${s.btn}`} onClick={() => setModal(null)}>
                Vazgeç
              </button>
              <button type="button" className={`btn-danger ${s.btn}`} disabled={modal.busy || (modal.step === 3 && modal.typed.trim() !== "SİL")} onClick={() => void bulkNext()}>
                {modal.step === 3 ? `${modal.prepared?.count ?? modal.ids.length} taşı sil` : "Devam et"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toastView}
    </OwnerShell>
  );
}

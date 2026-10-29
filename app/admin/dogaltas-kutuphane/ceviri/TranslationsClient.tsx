"use client";

/**
 * Katalog genelinde çeviri yönetimi. Önce sunucuda deneme (dry_run) ile etkilenecek / hariç sayılar gösterilir;
 * toplu yayın sayılı özet + açık owner onayı (onay kutusu) ister; sonrasında bildirimde "Geri al" sunulur. Eskimiş ve kaynak metin (fallback) alanları
 * sunucuda hariç tutulur. Tüm sayılar API'den gelir.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerHealthNotice, OwnerNotFound, OwnerPublishRelation, OwnerShell, useToast } from "../_components/OwnerShell";
import { ownerErrorText, ownerGet, ownerPost } from "../_components/ownerApi";
import s from "../_components/owner.module.css";
import { useOwnerRoutes } from "../_components/ownerRoutes";

type Counts = { total: number; translation_fields: number; translation_published: number; translation_fallback: number };
type Row = { id: string; name_tr: string; name_en: string | null; origin: string; deleted: boolean; translations_published: number; translations_total: number };
type Preview = { affected: number; already: number; excluded_fallback: number; excluded_stale: number; scope_total: number };

export default function TranslationsClient() {
  const routes = useOwnerRoutes();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  // Toplu yayın AÇIK owner onayı ister: önce sayılı özet, sonra onay kutusu + "Onayla ve yayınla". Otomatik toplu yayın yok.
  const [confirm, setConfirm] = useState<{ checked: boolean } | null>(null);
  const { show: showToast, view: toastView } = useToast();

  const load = useCallback(async () => {
    const [cat, pre] = await Promise.all([
      ownerGet<{ ok: true; stones: Row[]; counts: Counts }>("/katalog"),
      ownerPost<{ ok: true; result: Preview }>("/ceviri", { op: "publish", dry_run: true }),
    ]);
    if (!cat.ok && cat.status === 404) {
      setNotFound(true);
      return;
    }
    if (cat.ok) {
      setCounts(cat.data.counts);
      setRows((cat.data.stones ?? []).filter((x) => !x.deleted && x.origin !== "owner" && x.translations_total > 0));
    }
    if (pre.ok) setPreview(pre.data.result);
    else showToast(ownerErrorText(pre), { tone: "err" });
  }, [showToast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const list = useMemo(() => {
    const fq = q.trim().toLocaleLowerCase("tr");
    return rows.filter((r) => !fq || `${r.name_tr} ${r.name_en ?? ""}`.toLocaleLowerCase("tr").includes(fq));
  }, [rows, q]);

  if (notFound) {
    return (
      <OwnerShell section="translations">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const publishAll = async () => {
    if (!preview || !confirm?.checked) return;
    setConfirm(null);
    const exactUndo = preview.already === 0;
    setBusy(true);
    const r = await ownerPost<{ ok: true; result: Preview }>("/ceviri", { op: "publish", dry_run: false });
    setBusy(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      return;
    }
    await load();
    showToast(`${r.data.result.affected} çeviri alanı yayınlandı.`, {
      undo: exactUndo
        ? async () => {
            const u = await ownerPost<{ ok: true; result: Preview }>("/ceviri", { op: "unpublish", dry_run: false });
            showToast(u.ok ? `${u.data.result.affected} alan yayından kaldırıldı.` : ownerErrorText(u), { tone: u.ok ? "ok" : "err" });
            await load();
          }
        : undefined,
    });
  };

  return (
    <OwnerShell section="translations">
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>Owner · Doğaltaş Kütüphanesi</span>
          <h1>Çeviri yönetimi</h1>
          <p>Doğrulanmış Türkçe çevirileri taş sayfasında alan bazında ya da burada katalog genelinde (sayılı özet ve açık onayla) yayınlayın. Kaynak metinler değişmez; kaynağı değişen alanlar yeniden doğrulanmadan yayınlanmaz.</p>
        </div>
        {counts ? (
          <div className={s.heroStats}>
            <div className={s.statPill}>
              <b>{counts.translation_fields}</b>
              <span>Alan</span>
            </div>
            <div className={s.statPill}>
              <b>{counts.translation_published}</b>
              <span>Yayında</span>
            </div>
            <div className={s.statPill}>
              <b>{counts.translation_fallback}</b>
              <span>Kaynak metin gösterimi</span>
            </div>
          </div>
        ) : null}
      </section>
      <div style={{ height: 14 }} />
      <OwnerHealthNotice />
      <OwnerPublishRelation />

      <div className={s.trGlobal}>
        {preview ? (
          <span>
            Katalog genelinde <b>{preview.affected}</b> alan yayınlanabilir. Zaten yayında: {preview.already}. Hariç: {preview.excluded_stale} alan yeniden doğrulama bekliyor,{" "}
            {preview.excluded_fallback} alan kaynak metin (Türkçe) gösterimi olduğu için çeviri olarak yayınlanmaz. Kapsam: {preview.scope_total} alan.
          </span>
        ) : (
          <span>Önizleme yükleniyor…</span>
        )}
        <div className={s.rowActions}>
          <button type="button" className={`btn-success ${s.btn}`} disabled={busy || !preview || preview.affected === 0 || !!confirm} onClick={() => setConfirm({ checked: false })}>
            Toplu yayını hazırla{preview ? ` (${preview.affected} alan)` : ""}
          </button>
        </div>
      </div>
      {confirm && preview ? (
        <div className={`${s.panel} ${s.confirmPanel}`} role="group" aria-label="Toplu çeviri yayını onayı">
          <h2>Toplu çeviri yayını — onay gerekli</h2>
          <ul>
            <li>
              <b>{preview.affected}</b> doğrulanmış Türkçe çeviri alanı yayınlanacak.
            </li>
            <li>Zaten yayında: {preview.already} alan (değişmez).</li>
            <li>
              Hariç: {preview.excluded_fallback} kaynak metin (Türkçe) alanı, {preview.excluded_stale} yeniden doğrulama bekleyen alan.
            </li>
            <li>Taşların yayın durumu değişmez. Uzman, yalnız yayındaki taşlarda ve yalnız yetki verilmişse görür.</li>
          </ul>
          <label className={s.check}>
            <input type="checkbox" checked={confirm.checked} onChange={(e) => setConfirm({ checked: e.target.checked })} /> {preview.affected} alanın yayınlanmasını onaylıyorum.
          </label>
          <div className={`${s.rowActions} ${s.rowActionsLeft}`}>
            <button type="button" className={`btn-outline ${s.btn}`} onClick={() => setConfirm(null)}>
              Vazgeç
            </button>
            <button type="button" className={`btn-success ${s.btn}`} disabled={busy || !confirm.checked} onClick={() => void publishAll()}>
              Onayla ve yayınla ({preview.affected} alan)
            </button>
          </div>
        </div>
      ) : null}
      {preview && preview.already > 0 ? (
        <p className={s.note} style={{ marginTop: -6, marginBottom: 12 }}>
          Daha önce yayınlanmış alanlar olduğu için toplu yayın sonrası katalog genelinde &quot;Geri al&quot; sunulmaz; alan bazında geri almak için taş sayfasındaki Çeviri sekmesini kullanın.
        </p>
      ) : null}

      <div className={s.toolbar}>
        <label className={s.search}>
          <span className={s.srOnly}>Taş ara</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Taş ara…" autoComplete="off" />
        </label>
      </div>
      {list.length ? (
        <div className={s.nlist}>
          {list.map((r) => (
            <div key={r.id} className={s.oCard} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>
                <b>{r.name_tr}</b> <small className={s.muted}>{r.name_en}</small>
                <br />
                <small className={s.muted}>
                  {r.translations_published}/{r.translations_total} alan yayında
                </small>
              </span>
              <Link className={`btn-outline ${s.btn} ${s.btnSm}`} href={routes.stone(r.id)}>
                Taş sayfasında aç
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.emptyState}>{counts ? <b>Sonuç yok.</b> : <span>Yükleniyor…</span>}</div>
      )}
      {toastView}
    </OwnerShell>
  );
}

"use client";

/**
 * Owner taş yönetim sayfası: Düzenle / Yayın / İçerik (notlar) / Görseller / Çeviri sekmeleri.
 * Tüm değişiklikler ayrı owner katmanına yazılır (kaynak kayıtları değişmez). Günlük işlemler onay penceresi açmaz;
 * bildirimde "Geri al" sunulur.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthImage } from "@/app/dogaltas/kutuphane/_shared/AuthImage";
import { OwnerHealthNotice, OwnerNotFound, OwnerShell, useToast } from "../../_components/OwnerShell";
import type { StoneRef } from "../../_components/StoneForm";
import { ownerErrorText, ownerGet, ownerPost, readinessText, type Readiness } from "../../_components/ownerApi";
import { statusPill } from "../../_components/StatusPill";
import s from "../../_components/owner.module.css";
import { EditTab } from "./EditTab";
import { ImagesTab } from "./ImagesTab";
import { NotesTab } from "./NotesTab";
import { TranslationTab } from "./TranslationTab";
import type { ActFn, Layers, SourceDetail } from "./types";

type Tab = "duzenle" | "yayin" | "icerik" | "gorseller" | "ceviri";

export default function StoneManageClient({ id }: { id: string }) {
  const [layers, setLayers] = useState<Layers | null>(null);
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [stones, setStones] = useState<StoneRef[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("duzenle");
  const [busy, setBusy] = useState(false);
  const { show: showToast, view: toastView } = useToast();

  const reload = useCallback(async () => {
    const [l, src, cat] = await Promise.all([
      ownerGet<{ ok: true } & Layers>(`/katman/${id}`),
      ownerGet<{ ok: true } & SourceDetail>(`/taslar/${id}`),
      ownerGet<{ ok: true; stones: (StoneRef & { deleted: boolean })[] }>("/katalog"),
    ]);
    if (!l.ok) {
      if (l.status === 404 || l.status === 400) setNotFound(true);
      else showToast(ownerErrorText(l), { tone: "err" });
      return;
    }
    setLayers(l.data);
    if (src.ok) setSource({ stone: src.data.stone, records: src.data.records ?? [], facets: src.data.facets ?? [] });
    if (cat.ok) setStones((cat.data.stones ?? []).filter((x) => !x.deleted));
  }, [id, showToast]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  const act: ActFn = useCallback(
    async (body, opts = {}) => {
      setBusy(true);
      const r = await ownerPost<{ ok: true; result: unknown; readiness: Readiness }>(`/katman/${id}`, body);
      setBusy(false);
      if (!r.ok) {
        showToast(ownerErrorText(r), { tone: "err" });
        return false;
      }
      await reload();
      if (opts.success) {
        const undo = opts.undo;
        showToast(opts.success, {
          undo: undo
            ? async () => {
                let failed: string | null = null;
                for (const b of Array.isArray(undo) ? undo : [undo]) {
                  const u = await ownerPost(`/katman/${id}`, b);
                  if (!u.ok) failed = ownerErrorText(u);
                }
                showToast(failed ?? "Geri alındı.", { tone: failed ? "err" : "ok" });
                await reload();
              }
            : undefined,
        });
      }
      return true;
    },
    [id, reload, showToast],
  );

  if (notFound) {
    return (
      <OwnerShell section="stone">
        <OwnerNotFound />
      </OwnerShell>
    );
  }
  if (!layers) {
    return (
      <OwnerShell section="stone">
        <p className={s.loading}>Yükleniyor…</p>
      </OwnerShell>
    );
  }

  const st = layers.stone;
  if (st.deleted_at) {
    return (
      <OwnerShell section="stone">
        <Link className={s.crumb} href="/admin/dogaltas-kutuphane">
          ‹ Taş yönetimine dön
        </Link>
        <div className={s.emptyState}>
          <b>Bu taş silinmiş.</b> Taş yönetimi listesindeki &quot;Silinmiş&quot; filtresinden geri getirebilirsiniz.
        </div>
      </OwnerShell>
    );
  }
  const own = st.origin === "owner";
  const liveNotes = layers.notes.filter((n) => !n.deleted_at).length;
  const liveImgs = layers.owner_images.filter((i) => !i.deleted_at).length;
  const trTotal = layers.translations.filter((t) => t.display_kind === "verified_translation").length;
  const trPub = layers.translations.filter((t) => t.published).length;
  const r = layers.readiness;
  const published = st.status === "published";

  const publishButtons = (
    <>
      {published ? (
        <button type="button" className={`btn-danger ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "unpublish" }, { success: "Taş yayından kaldırıldı.", undo: { action: "publish" } })}>
          Yayından kaldır
        </button>
      ) : (
        <button
          type="button"
          className={`btn-success ${s.btn} ${s.btnSm}`}
          disabled={busy || !r.ready}
          title={r.ready ? undefined : r.blockers.map(readinessText).join(" · ")}
          onClick={() => void act({ action: "publish" }, { success: "Taş yayınlandı.", undo: { action: "unpublish" } })}
        >
          {st.status === "hidden" ? "Yeniden yayınla" : "Yayınla"}
        </button>
      )}
    </>
  );

  const thumbSrc = st.image_choice === "owner" && st.primary_owner_image_id
    ? { src: `/api/admin/dogaltas-kutuphane/katman/${id}/gorsel?image_id=${st.primary_owner_image_id}`, kind: "owner" as const }
    : published
      ? { src: `/api/dogaltas/kutuphane/${st.slug}/gorsel`, kind: "viewer" as const }
      : null;

  const tabBtn = (k: Tab, label: string, n?: string | number) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
      {label}
      {n !== undefined ? <span className={s.tabN}>{n}</span> : null}
    </button>
  );

  return (
    <OwnerShell section="stone">
      <Link className={s.crumb} href="/admin/dogaltas-kutuphane">
        ‹ Taş yönetimine dön
      </Link>
      <header className={s.osHead}>
        {thumbSrc ? <AuthImage src={thumbSrc.src} kind={thumbSrc.kind} alt="" className={s.thumbLg} placeholderClassName={s.thumbLg} /> : <span className={s.thumbLg} aria-hidden="true" />}
        <div>
          <h1>{st.name_tr}</h1>
          {st.name_en ? <p className={s.muted} style={{ margin: "2px 0 0" }}>{st.name_en}</p> : null}
          <div className={s.osMeta}>
            {statusPill(st.status)}
            {own ? <span className={`${s.pill} ${s.pillViolet}`}>Owner tarafından oluşturuldu</span> : null}
            {!own && st.owner_version_current ? <span className={`${s.pill} ${s.pillViolet}`}>Owner sürümü etkin</span> : null}
            {publishButtons}
            {published ? (
              <Link className={`btn-outline ${s.btn} ${s.btnSm}`} href={`/dogaltas/kutuphane/${st.slug}`}>
                Önizle
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      {own ? null : (
        <p className={s.lockNote}>Kaynak metinler (Türkçe / İngilizce) ve özgün adlar değiştirilemez. Düzenlemeleriniz ayrı Owner katmanında saklanır ve her an özgün kaynağa dönülebilir.</p>
      )}
      <OwnerHealthNotice />

      <nav className={s.tabs} role="tablist" aria-label="Taş yönetimi">
        {tabBtn("duzenle", "Düzenle")}
        {tabBtn("yayin", "Yayın")}
        {tabBtn("icerik", "İçerik (notlar)", liveNotes)}
        {tabBtn("gorseller", "Görseller", liveImgs)}
        {own ? null : tabBtn("ceviri", "Çeviri", `${trPub}/${trTotal}`)}
      </nav>

      <div role="tabpanel">
        {tab === "duzenle" ? <EditTab layers={layers} source={source} stones={stones} busy={busy} act={act} showToast={showToast} /> : null}
        {tab === "yayin" ? (
          <div className={s.two}>
            <div className={s.panel}>
              <h2>Taş yayını ve hazırlık</h2>
              <p style={{ margin: "0 0 8px" }}>{statusPill(st.status)}</p>
              {r.blockers.length ? (
                <>
                  <p className={s.badMark}>Yayın engeli:</p>
                  <ul>
                    {r.blockers.map((b) => (
                      <li key={b}>{readinessText(b)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={s.okMark}>Yayın engeli yok.</p>
              )}
              {r.warnings.length ? (
                <>
                  <p className={s.warnMark} style={{ margin: "6px 0 0" }}>
                    Uyarılar:
                  </p>
                  <ul>
                    {r.warnings.map((w) => (
                      <li key={w}>{readinessText(w)}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className={`${s.rowActions} ${s.rowActionsLeft}`}>{publishButtons}</div>
              <p className={s.note}>Taş yayını ile içerik yayını ayrıdır: taş yayındayken uzman, alan bazında yalnız yayınlanmış çeviriyi, Owner sürümünü ya da kaynak Türkçe metni görür.</p>
            </div>
            <div className={s.panel}>
              <h2>Köken</h2>
              {own ? (
                <p className={s.note} style={{ marginTop: 0 }}>
                  Owner tarafından oluşturulan taş. İçerik, Owner&apos;ın yayınladığı sürümdür.
                </p>
              ) : (
                <p className={s.note} style={{ marginTop: 0 }}>
                  Lisanslı kaynaktan aktarılan taş. Kaynak metinler değiştirilemez; Owner sürümü ayrı katmandır.
                </p>
              )}
            </div>
          </div>
        ) : null}
        {tab === "icerik" ? <NotesTab notes={layers.notes} busy={busy} act={act} /> : null}
        {tab === "gorseller" ? <ImagesTab layers={layers} busy={busy} act={act} reload={reload} showToast={showToast} /> : null}
        {tab === "ceviri" && !own ? <TranslationTab translations={layers.translations} records={source?.records ?? []} busy={busy} act={act} /> : null}
      </div>
      {toastView}
    </OwnerShell>
  );
}

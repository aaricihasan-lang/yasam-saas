"use client";

/**
 * Kütüphaneyi kullanıma açma (owner). Tek ekran: önizleme sayıları + etki → tek açık onay → uygulama → "Geri al".
 * Taş yayını doğrulanmış çevirileri de yayınlar; bekleyen kaynak görselleri onaylanır (onay ≠ lisans). Uzman yetkisi verilmez.
 * Sağlık / hukuk kısıtları ve görsel lisans kapısı DB yayın yüzeyinde aynen uygulanır; bu ekran onları kaldırmaz.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OwnerHealthNotice, OwnerNotFound, OwnerPublishRelation, OwnerShell, useToast } from "../_components/OwnerShell";
import { ownerErrorText, ownerPost, readinessText } from "../_components/ownerApi";
import { useOwnerRoutes } from "../_components/ownerRoutes";
import s from "../_components/owner.module.css";

type License = { id: string; evidence_status: string; granted_on: string | null; grantor_label: string | null; document_title: string | null; document_kind: string | null };
type Preview = {
  stones_total: number;
  published: number;
  to_publish: number;
  blocked: { id: string; name: string; blockers: string[] }[];
  translations: { affected: number; already: number; excluded_fallback: number; excluded_stale: number; scope_total: number };
  images_total: number;
  images_pending: number;
  image_licenses: License[];
};
const DOC_KIND_TR: Record<string, string> = { correspondence: "e-posta yazışması", contract: "sözleşme", terms_snapshot: "kullanım koşulları kopyası", permission_letter: "izin yazısı", other: "belge" };
type ApplyResult = { published: number; failed: { id: string; name: string; error: string }[]; translations_published: number; images_approved: number };

export default function BulkPublishClient() {
  const routes = useOwnerRoutes();
  const [p, setP] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok1, setOk1] = useState(false);
  const [okRevert, setOkRevert] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [licOk, setLicOk] = useState(false);
  const { show: showToast, view: toastView } = useToast();

  const load = useCallback(async () => {
    const r = await ownerPost<{ ok: true; preview: Preview }>("/toplu-yayin", { step: "preview" });
    if (r.ok) setP(r.data.preview);
    else if (r.status === 404) setNotFound(true);
    else showToast(ownerErrorText(r), { tone: "err" });
  }, [showToast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (notFound) {
    return (
      <OwnerShell section="bulk">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const apply = async () => {
    if (!p || !ok1) return;
    setBusy(true);
    const r = await ownerPost<{ ok: true; result: ApplyResult }>("/toplu-yayin", { step: "apply", expected: { stones: p.to_publish, translations: p.translations.affected } });
    setBusy(false);
    setOk1(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      await load();
      return;
    }
    setResult(r.data.result);
    showToast(`${r.data.result.published} taş ve ${r.data.result.translations_published} çeviri alanı yayınlandı.`);
    await load();
  };

  const revert = async () => {
    if (!p || !okRevert) return;
    setBusy(true);
    const r = await ownerPost<{ ok: true; result: { unpublished: number; translations_unpublished: number } }>("/toplu-yayin", { step: "revert", expected: { stones: p.published } });
    setBusy(false);
    setOkRevert(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      await load();
      return;
    }
    setResult(null);
    showToast(`${r.data.result.unpublished} taş ve ${r.data.result.translations_unpublished} çeviri alanı yayından kaldırıldı.`);
    await load();
  };

  const verify = async (id: string) => {
    if (!licOk) return;
    setBusy(true);
    const r = await ownerPost("/toplu-yayin", { step: "license_verify", grant_id: id });
    setBusy(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      return;
    }
    setLicOk(false);
    showToast("Görseller yetkili uzmanlara açıldı (Owner onayı).");
    await load();
  };

  const pendingLic = (p?.image_licenses ?? []).filter((l) => l.evidence_status !== "verified");

  return (
    <OwnerShell section="bulk">
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>Owner · Doğaltaş Kütüphanesi</span>
          <h1>Kullanıma açma</h1>
          <p>Taşları ve doğrulanmış Türkçe çevirileri tek onayla yayınlayın; istediğiniz an geri alın. Uzman yetkisi bu ekrandan verilmez.</p>
        </div>
        {p ? (
          <div className={s.heroStats}>
            <div className={s.statPill}>
              <b>{p.stones_total}</b>
              <span>Toplam taş</span>
            </div>
            <div className={s.statPill}>
              <b>{p.published}</b>
              <span>Yayında</span>
            </div>
          </div>
        ) : null}
      </section>
      <div style={{ height: 14 }} />
      <OwnerHealthNotice />
      <OwnerPublishRelation />

      {!p ? (
        <p className={s.loading}>Hazırlanıyor… (taşların yayın hazırlığı denetleniyor)</p>
      ) : (
        <>
          <div className={`${s.panel} ${s.confirmPanel}`} role="group" aria-label="Kullanıma açma onayı">
            <h2>Tek onay: yapılacaklar</h2>
            <ul>
              <li>
                <b>{p.to_publish}</b> taş yayınlanacak (bekleyen kaynak kayıtları sizin adınıza onaylanır; kaynak metinler değişmez).
              </li>
              <li>
                <b>{p.translations.affected}</b> doğrulanmış Türkçe çeviri alanı yayınlanacak. Hariç: {p.translations.excluded_fallback} kaynak metin (Türkçe) alanı,{" "}
                {p.translations.excluded_stale} yeniden doğrulama bekleyen alan. Zaten yayında: {p.translations.already}.
              </li>
              <li>
                <b>{p.images_pending}</b> kaynak görsel kaydı onaylanacak. Bu onay görsel iznini kapsamaz; görsel izni aşağıda ayrıca onaylanır.
              </li>
              <li>Sağlıkla ilgili alanlar hukuki inceleme tamamlanana kadar uzmanlara gösterilmez (değişmez).</li>
              <li>Hiçbir uzmana erişim verilmez; erişim yalnız Uzman erişimi ekranından kişi bazında verilir.</li>
              {p.blocked.length ? <li>{p.blocked.length} taş engel nedeniyle yayınlanmayacak (aşağıda).</li> : null}
            </ul>
            <label className={s.check}>
              <input type="checkbox" checked={ok1} onChange={(e) => setOk1(e.target.checked)} disabled={p.to_publish === 0 && p.translations.affected === 0} /> {p.to_publish} taşın ve{" "}
              {p.translations.affected} çeviri alanının yayınlanmasını onaylıyorum.
            </label>
            <div className={`${s.rowActions} ${s.rowActionsLeft}`}>
              <button type="button" className={`btn-success ${s.btn}`} disabled={busy || !ok1} onClick={() => void apply()}>
                {busy ? "Uygulanıyor…" : `Onayla ve kullanıma aç (${p.to_publish} taş)`}
              </button>
            </div>
          </div>

          {result ? (
            <div className={s.panel} role="status">
              <h2>Sonuç</h2>
              <p style={{ margin: 0 }}>
                {result.published} taş yayınlandı · {result.translations_published} çeviri alanı yayınlandı · {result.images_approved} görsel kaydı onaylandı.
                {result.failed.length ? ` ${result.failed.length} taş yayınlanamadı.` : ""}
              </p>
              {result.failed.length ? (
                <ul style={{ margin: "8px 0 0" }}>
                  {result.failed.map((f) => (
                    <li key={f.id}>
                      <b>{f.name}</b> — {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {p.published > 0 ? (
            <div className={s.panel}>
              <h2>Geri alma</h2>
              <p className={s.note} style={{ marginTop: 0 }}>
                Yayındaki {p.published} taş yayından kaldırılır ve çevirilerin yayını kaldırılır. Veriler, sürümler ve onaylar silinmez; yeniden yayınlayabilirsiniz.
              </p>
              <label className={s.check}>
                <input type="checkbox" checked={okRevert} onChange={(e) => setOkRevert(e.target.checked)} /> {p.published} taşın yayından kaldırılmasını onaylıyorum.
              </label>
              <div className={`${s.rowActions} ${s.rowActionsLeft}`}>
                <button type="button" className={`btn-danger ${s.btn}`} disabled={busy || !okRevert} onClick={() => void revert()}>
                  Geri al: tümünü yayından kaldır
                </button>
              </div>
            </div>
          ) : null}

          {p.blocked.length ? (
            <div className={s.panel}>
              <h2>Yayınlanamayan taşlar ({p.blocked.length})</h2>
              {p.blocked.map((b) => (
                <div key={b.id} className={s.delRow}>
                  <span>
                    <b>{b.name}</b>
                    <br />
                    <small className={s.muted}>{b.blockers.map(readinessText).join(" · ")}</small>
                  </span>
                  <Link className={`btn-outline ${s.btn} ${s.btnSm}`} href={routes.stone(b.id)}>
                    Taşı aç
                  </Link>
                </div>
              ))}
            </div>
          ) : null}

          <div className={s.panel}>
            <h2>Fotoğraflar ve görsel izni</h2>
            <p className={s.note} style={{ marginTop: 0 }}>
              {p.images_total} kaynak görsel kaydı var. Owner tüm görselleri her durumda görür. Uzman, görseli yalnız taş yayındaysa, görsel onaylıysa ve görsel izni
              <b> Owner onaylıysa</b> görür; erişim yine kişi bazındadır (Uzman erişimi).
            </p>
            {p.image_licenses.map((l) => (
              <div key={l.id} className={s.delRow}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <b>Kaynak görselleri kullanım izni</b> {l.granted_on ? `· ${l.granted_on}` : ""}
                  <br />
                  <small className={l.evidence_status === "verified" ? s.muted : s.unverified}>
                    {l.evidence_status === "verified" ? "Owner onaylı — görseller yetkili uzmanlara gösterilir." : "Owner onayı bekliyor — görseller uzmanlara gösterilmez."}
                    {l.document_kind ? ` Kayıtlı kanıt: ${DOC_KIND_TR[l.document_kind] ?? "belge"}.` : ""}
                  </small>
                </span>
              </div>
            ))}
            {pendingLic.length ? (
              <div className={s.upload} style={{ marginTop: 10 }}>
                <b>Görselleri yetkili uzmanlara aç</b>
                <small className={s.muted}>
                  Görsel kullanım izni sağlayıcı tarafından e-postayla verildi; kanıt sizde saklı ve kullanım sorumluluğu sizde. Onayınız bu beyanla kayda geçer; yeni belge
                  istenmez. Görseller yalnız erişim verdiğiniz uzmanlara gösterilir.
                </small>
                <label className={s.check}>
                  <input type="checkbox" checked={licOk} onChange={(e) => setLicOk(e.target.checked)} /> Görsel kullanım iznini Owner olarak onaylıyorum.
                </label>
                <button type="button" className={`btn-success ${s.btn}`} disabled={busy || !licOk} onClick={() => void verify(pendingLic[0].id)}>
                  {busy ? "Uygulanıyor…" : "Onayla ve görselleri aç"}
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
      {toastView}
    </OwnerShell>
  );
}

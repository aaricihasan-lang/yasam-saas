"use client";

/**
 * Görseller: owner görseli yükleme (özel depo; tür / boyut / SHA sunucuda), birincil seçimi, kaynak görseline dönüş,
 * geri alınabilir silme, lisans belgesi durumu. Belgesiz görsel "Lisans belgesi yok" olarak etiketlenir (asla "doğrulandı"
 * değil). Mevcut kaynak görselleri bu ekrandan silinmez veya değiştirilmez.
 */

import { useRef, useState } from "react";
import { AuthImage } from "@/app/dogaltas/kutuphane/_shared/AuthImage";
import { fmtDate, ownerErrorText, ownerPost, ownerUpload } from "../../_components/ownerApi";
import s from "../../_components/owner.module.css";
import type { ActFn, ImageLicense, Layers, OwnerImage, SourceImage } from "./types";

type ShowToast = (msg: string, opts?: { tone?: "ok" | "err" }) => void;
type Props = {
  layers: Layers;
  sourceImages: SourceImage[];
  licenses: ImageLicense[];
  busy: boolean;
  act: ActFn;
  reload: () => Promise<void>;
  showToast: ShowToast;
};

const REVIEW_TR: Record<string, string> = { approved: "Onaylı", pending: "Onay bekliyor", rejected: "Reddedildi" };
const LICENSE_TR: Record<string, string> = {
  verified: "Lisans doğrulandı",
  owner_verification_pending: "Lisans doğrulaması bekliyor",
  revoked: "Lisans iptal edildi",
};
type LicenseEdit = { id: string; status: "documented" | "undocumented"; note: string };

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function ImagesTab({ layers, sourceImages, licenses, busy, act, reload, showToast }: Props) {
  const id = layers.stone.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [license, setLicense] = useState<"documented" | "undocumented">("undocumented");
  const [licenseNote, setLicenseNote] = useState("");
  const [makePrimary, setMakePrimary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<LicenseEdit | null>(null);

  const live = layers.owner_images.filter((i) => !i.deleted_at);
  const deleted = layers.owner_images.filter((i) => i.deleted_at);
  const usingSource = layers.stone.image_choice !== "owner";
  const published = layers.stone.status === "published";

  // Kaynak (lisanslı aktarım) görseli: owner HER durumda önizler (taslak dahil). Uzmana gösterim ayrı kapıdır:
  // taş yayında + görsel onaylı ve görünür + bağlı görsel izni "doğrulandı". Bu ekran o kapıyı değiştirmez, yalnız açıklar.
  const srcLive = (Array.isArray(sourceImages) ? sourceImages : []).filter((i) => !i.deleted_at);
  const srcShown = srcLive.find((i) => i.variant === "optimized") ?? srcLive.find((i) => i.variant === "original");
  const srcOriginal = srcLive.find((i) => i.variant === "original");
  const grant = srcShown?.license_grant_id && Array.isArray(licenses) ? licenses.find((l) => l.id === srcShown.license_grant_id) : undefined;
  const expertBlock: string[] = [];
  if (srcShown) {
    if (!published) expertBlock.push("taş yayında değil");
    if (grant?.evidence_status !== "verified") expertBlock.push("görsel lisansı doğrulanmadı");
    if (srcShown.review_state !== "approved") expertBlock.push("görsel onaylı değil");
    if (srcShown.visibility !== "visible") expertBlock.push("görsel gizli");
  }
  const duplicate = !!srcShown?.quality_flags?.includes("duplicate_image");
  const srcPending = srcLive.filter((i) => i.review_state === "pending");
  const [approving, setApproving] = useState(false);
  // Kaynak görselini onaylamak uzmana açmaz: uzman görseli ayrıca yayın + DOĞRULANMIŞ lisans ister (DB kapısı).
  const approveSource = async () => {
    setApproving(true);
    let failed: string | null = null;
    for (const im of srcPending) {
      const r = await ownerPost("/inceleme", { entity: "image", id: im.id, action: "approve", note: "Owner: kaynak görseli onaylandı (taş ekranı)" });
      if (!r.ok) failed = ownerErrorText(r);
    }
    setApproving(false);
    await reload();
    showToast(failed ?? "Kaynak görseli onaylandı. Uzmana gösterim için lisans doğrulaması ayrıca gerekir.", { tone: failed ? "err" : "ok" });
  };

  const upload = async () => {
    setErr(null);
    if (!file) {
      setErr("Bir görsel dosyası seçin.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr("Görsel en çok 2 MB olabilir.");
      return;
    }
    if (license === "documented" && !licenseNote.trim()) {
      setErr("Belgeli görsel için belge açıklaması zorunlu.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("license_status", license);
    if (licenseNote.trim()) form.set("license_note", licenseNote.trim());
    form.set("make_primary", makePrimary ? "true" : "false");
    setUploading(true);
    const r = await ownerUpload<{ ok: true; image_id: string }>(`/katman/${id}/gorsel`, form);
    setUploading(false);
    if (!r.ok) {
      setErr(ownerErrorText(r));
      return;
    }
    setFile(null);
    setLicenseNote("");
    setLicense("undocumented");
    if (fileRef.current) fileRef.current.value = "";
    await reload();
    showToast("Görsel eklendi.");
  };

  const licenseLabel = (i: OwnerImage) =>
    i.license_status === "documented" ? (
      <dd>Belgeli{i.license_note ? ` — ${i.license_note}` : ""}</dd>
    ) : (
      <dd className={s.unverified}>Lisans belgesi yok</dd>
    );

  return (
    <>
      <div className={s.tabToolbar}>
        <div>
          <h2>Görseller</h2>
          <p className={s.note} style={{ margin: "2px 0 0" }}>
            Kaynak görselleri silinmez veya otomatik değiştirilmez. Owner görseli birincil yapılırsa uzmana o gösterilir; istediğiniz an kaynak görseline dönebilirsiniz.
          </p>
        </div>
      </div>

      <div className={s.flag}>
        {usingSource ? (
          <>
            <b>Şu an kaynak görseli kullanılıyor.</b>{" "}
            {!srcShown
              ? "Bu taşın kaynak görseli yok."
              : expertBlock.length
                ? `Uzmanlara gösterilmez: ${expertBlock.join(", ")}.`
                : "Uzmanlara gösterilir."}
          </>
        ) : (
          <>
            <b>Şu an owner görseli birincil.</b>{" "}
            <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "image_primary", image_id: null }, { success: "Kaynak görseline dönüldü.", undo: { action: "image_primary", image_id: layers.stone.primary_owner_image_id } })}>
              Kaynak görseline dön
            </button>
          </>
        )}
      </div>

      <div className={s.gallery}>
        {srcShown ? (
          <figure className={`${s.gcard} ${usingSource ? s.gcardPrimary : ""}`}>
            <span className={s.gimg}>
              <AuthImage src={`/api/admin/dogaltas-kutuphane/gorseller/${srcShown.id}`} kind="owner" alt={`${layers.stone.name_tr} — kaynak görseli`} className={s.gimgImg} placeholderClassName={s.gimgEmpty} placeholder="Önizleme yok" />
            </span>
            <figcaption className={s.gcap}>
              <div className={s.chips}>
                {usingSource ? <span className={`${s.pill} ${s.pillTeal}`}>Birincil</span> : null}
                <span className={s.pill}>Kaynak görseli</span>
                {duplicate ? <span className={`${s.pill} ${s.pillGold}`}>Başka taşta da kullanılıyor</span> : null}
              </div>
              <dl className={s.ginfo}>
                <dt>Lisans</dt>
                <dd className={grant?.evidence_status === "verified" ? undefined : s.unverified}>{grant ? LICENSE_TR[grant.evidence_status] ?? grant.evidence_status : "İzin kaydı yok"}</dd>
                <dt>Onay</dt>
                <dd>{REVIEW_TR[srcShown.review_state] ?? srcShown.review_state}</dd>
                <dt>Uzman</dt>
                <dd className={expertBlock.length ? s.unverified : undefined}>{expertBlock.length ? "Gösterilmez" : "Gösterilir"}</dd>
                <dt>Boyut</dt>
                <dd>
                  {srcShown.width}×{srcShown.height} · {kb(srcShown.bytes)}
                  {srcOriginal && srcOriginal.id !== srcShown.id ? ` (özgün ${srcOriginal.width}×${srcOriginal.height} · ${kb(srcOriginal.bytes)})` : ""}
                </dd>
              </dl>
              {usingSource && !srcPending.length ? null : (
                <div className={s.rowActions} style={{ justifyContent: "flex-start" }}>
                  {srcPending.length ? (
                    <button type="button" className={`btn-success ${s.btn} ${s.btnSm}`} disabled={busy || approving} onClick={() => void approveSource()}>
                      {approving ? "Onaylanıyor…" : "Kaynak görselini onayla"}
                    </button>
                  ) : null}
                  {usingSource ? null : (
                    <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "image_primary", image_id: null }, { success: "Kaynak görseline dönüldü.", undo: { action: "image_primary", image_id: layers.stone.primary_owner_image_id } })}>
                      Kaynak görselini birincil yap
                    </button>
                  )}
                </div>
              )}
            </figcaption>
          </figure>
        ) : null}
        {live.map((i) => (
          <figure key={i.id} className={`${s.gcard} ${i.primary ? s.gcardPrimary : ""}`}>
            <span className={s.gimg}>
              <AuthImage src={`/api/admin/dogaltas-kutuphane/katman/${id}/gorsel?image_id=${i.id}`} kind="owner" alt={`${layers.stone.name_tr} — owner görseli`} className={s.gimgImg} placeholderClassName={s.gimgEmpty} placeholder="Önizleme yok" />
            </span>
            <figcaption className={s.gcap}>
              <div className={s.chips}>
                {i.primary ? <span className={`${s.pill} ${s.pillTeal}`}>Birincil</span> : null}
                <span className={s.pill}>Owner görseli</span>
              </div>
              <dl className={s.ginfo}>
                <dt>Lisans</dt>
                {licenseLabel(i)}
                <dt>Boyut</dt>
                <dd>
                  {i.width}×{i.height} · {kb(i.bytes)}
                </dd>
                <dt>Eklenme</dt>
                <dd>{fmtDate(i.created_at)}</dd>
              </dl>
              {edit?.id === i.id ? (
                <div className={s.upload}>
                  <label className={s.check}>
                    <input type="radio" checked={edit.status === "documented"} onChange={() => setEdit({ ...edit, status: "documented" })} /> Lisans belgesi var
                  </label>
                  <label className={s.check}>
                    <input type="radio" checked={edit.status === "undocumented"} onChange={() => setEdit({ ...edit, status: "undocumented" })} /> Lisans belgesi yok
                  </label>
                  {edit.status === "documented" ? (
                    <input className={s.input} value={edit.note} maxLength={2000} placeholder="Belge açıklaması (zorunlu)" onChange={(e) => setEdit({ ...edit, note: e.target.value })} aria-label="Belge açıklaması" />
                  ) : null}
                  <div className={s.rowActions} style={{ justifyContent: "flex-start" }}>
                    <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} onClick={() => setEdit(null)}>
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      className={`btn-success ${s.btn} ${s.btnSm}`}
                      disabled={busy || (edit.status === "documented" && !edit.note.trim())}
                      onClick={async () => {
                        const ok = await act(
                          { action: "image_license", image_id: i.id, license_status: edit.status, license_note: edit.status === "documented" ? edit.note.trim() : null },
                          { success: "Lisans bilgisi kaydedildi.", undo: { action: "image_license", image_id: i.id, license_status: i.license_status, license_note: i.license_note } },
                        );
                        if (ok) setEdit(null);
                      }}
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              ) : (
                <div className={s.rowActions} style={{ justifyContent: "flex-start" }}>
                  {i.primary ? null : (
                    <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "image_primary", image_id: i.id }, { success: "Birincil görsel değiştirildi.", undo: { action: "image_primary", image_id: layers.stone.primary_owner_image_id } })}>
                      Birincil yap
                    </button>
                  )}
                  <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} onClick={() => setEdit({ id: i.id, status: i.license_status, note: i.license_note ?? "" })}>
                    Lisans bilgisi
                  </button>
                  <button type="button" className={`btn-danger ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "image_delete", image_id: i.id }, { success: "Görsel silindi.", undo: { action: "image_restore", image_id: i.id } })}>
                    Sil
                  </button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
        <div className={`${s.gcard}`} style={{ padding: 14 }}>
          <div className={s.upload}>
            <b>Yeni görsel ekle</b>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Görsel dosyası" style={{ maxWidth: "100%" }} />
            <small className={s.muted}>JPEG, PNG veya WebP · en çok 2 MB · en çok 4000 px</small>
            <label className={s.check}>
              <input type="radio" checked={license === "undocumented"} onChange={() => setLicense("undocumented")} /> Lisans belgesi yok
            </label>
            <label className={s.check}>
              <input type="radio" checked={license === "documented"} onChange={() => setLicense("documented")} /> Lisans belgesi var
            </label>
            {license === "documented" ? (
              <input className={s.input} value={licenseNote} maxLength={2000} placeholder="Belge açıklaması (zorunlu)" onChange={(e) => setLicenseNote(e.target.value)} aria-label="Belge açıklaması" />
            ) : null}
            <label className={s.check}>
              <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} /> Birincil görsel yap
            </label>
            {err ? <p className={s.errText}>{err}</p> : null}
            <button type="button" className={`btn-success ${s.btn}`} disabled={uploading || !file} onClick={() => void upload()}>
              {uploading ? "Yükleniyor…" : "Görseli kaydet"}
            </button>
          </div>
        </div>
      </div>

      {deleted.length ? (
        <details className={s.deleted}>
          <summary>Silinen görseller ({deleted.length}) — geri getirilebilir</summary>
          {deleted.map((i) => (
            <div key={i.id} className={s.delRow}>
              <span>
                Owner görseli · {i.width}×{i.height} · <small className={s.muted}>{fmtDate(i.created_at)}</small>
              </span>
              <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "image_restore", image_id: i.id }, { success: "Görsel geri getirildi.", undo: { action: "image_delete", image_id: i.id } })}>
                Geri getir
              </button>
            </div>
          ))}
        </details>
      ) : null}
    </>
  );
}

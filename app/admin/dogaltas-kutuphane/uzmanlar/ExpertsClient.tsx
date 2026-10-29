"use client";

/**
 * Uzman erişimi (owner). Kişi bazlı erişim: POST /yetkiler { grant | revoke }. Mevcut yetkiler genel görünüm ucundan
 * (GET /api/admin/dogaltas-kutuphane → overview.grants) okunur. Uzman listesi / ad araması için kütüphaneye özel uç yoktur;
 * erişim kullanıcı kimliği (UUID) ile verilir. Uygunluk (aktif, onaylı, Doğaltaş izinli, demo değil) sunucuda doğrulanır.
 */

import { useCallback, useEffect, useState } from "react";
import { OwnerNotFound, OwnerShell, useToast } from "../_components/OwnerShell";
import { fmtDate, ownerErrorText, ownerGet, ownerPost } from "../_components/ownerApi";
import s from "../_components/owner.module.css";

type Grant = { id: string; user_id: string; granted_at: string; revoked_at: string | null; revoke_reason: string | null; note: string | null };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_TR: Record<string, string> = { owner_revoked: "Owner kaldırdı", role_changed: "Rol değişti", tenant_changed: "Hesap değişti", other: "Uygunluk değişti" };

export default function ExpertsClient() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { show: showToast, view: toastView } = useToast();

  const load = useCallback(async () => {
    const r = await ownerGet<{ ok: true; overview: { grants?: Grant[] } | null }>("");
    if (r.ok) setGrants(r.data.overview?.grants ?? []);
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
      <OwnerShell section="experts">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const call = async (action: "grant" | "revoke", uid: string, n?: string | null) => {
    setBusy(true);
    const r = await ownerPost("/yetkiler", action === "grant" ? { action, user_id: uid, note: n || undefined } : { action, user_id: uid });
    setBusy(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      return false;
    }
    await load();
    return true;
  };

  const grant = async () => {
    setErr(null);
    const uid = userId.trim();
    if (!UUID_RE.test(uid)) {
      setErr("Geçerli bir kullanıcı kimliği (UUID) girin.");
      return;
    }
    if (await call("grant", uid, note.trim())) {
      setUserId("");
      setNote("");
      showToast("Erişim verildi.", { undo: async () => void (await call("revoke", uid)) });
    }
  };

  const active = (grants ?? []).filter((g) => !g.revoked_at);
  const history = (grants ?? []).filter((g) => g.revoked_at).slice(0, 20);

  return (
    <OwnerShell section="experts">
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>Owner · Doğaltaş Kütüphanesi</span>
          <h1>Uzman erişimi</h1>
          <p>Doğaltaş Kütüphanesi&apos;ni uzmanlara kişi bazında açın veya kapatın. Uzman yalnız yayındaki taşları salt-okunur görür.</p>
        </div>
        <div className={s.heroStats}>
          <div className={s.statPill}>
            <b>{grants ? active.length : "–"}</b>
            <span>Erişimi açık</span>
          </div>
        </div>
      </section>
      <div style={{ height: 14 }} />
      <p className={s.healthNote}>
        <b>Varsayılan olarak hiçbir uzmanın erişimi yok.</b> Uygunluk (aktif hesap, onaylı üyelik, Doğaltaş modül izni, demo olmayan hesap) sunucuda her istekte yeniden doğrulanır; uygunluğu bozulan erişim kendiliğinden kapanır.
      </p>

      <div className={s.cols}>
        <section>
          <div className={s.panel}>
            <h2>Erişimi açık uzmanlar</h2>
            {!grants ? (
              <p className={s.loading}>Yükleniyor…</p>
            ) : active.length ? (
              active.map((g) => (
                <div key={g.id} className={s.delRow}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <b>{g.user_id}</b>
                    <br />
                    <small className={s.muted}>
                      {fmtDate(g.granted_at)}
                      {g.note ? ` · ${g.note}` : ""}
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`btn-danger ${s.btn} ${s.btnSm}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await call("revoke", g.user_id)) showToast("Erişim kaldırıldı.", { undo: async () => void (await call("grant", g.user_id, g.note)) });
                    }}
                  >
                    Erişimi kaldır
                  </button>
                </div>
              ))
            ) : (
              <p className={s.note} style={{ marginTop: 0 }}>
                Varsayılan olarak hiçbir uzmanın erişimi yok.
              </p>
            )}
          </div>
          {history.length ? (
            <details className={s.deleted}>
              <summary>Kapatılan erişimler ({history.length})</summary>
              {history.map((g) => (
                <div key={g.id} className={s.delRow}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {g.user_id}
                    <br />
                    <small className={s.muted}>
                      {fmtDate(g.revoked_at)} · {REASON_TR[g.revoke_reason ?? ""] ?? "Kapatıldı"}
                    </small>
                  </span>
                </div>
              ))}
            </details>
          ) : null}
        </section>
        <aside className={s.side}>
          <div className={s.panel}>
            <h2>Erişim ver</h2>
            <label className={s.fl}>
              <span>Uzman kullanıcı kimliği (UUID)</span>
              <input className={s.input} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" aria-invalid={!!err} />
            </label>
            <label className={s.fl}>
              <span>
                Not <small>(isteğe bağlı)</small>
              </span>
              <input className={s.input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </label>
            {err ? <p className={s.errText}>{err}</p> : null}
            <button type="button" className={`btn-success ${s.btn}`} style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={() => void grant()}>
              Erişim ver
            </button>
            <p className={s.note}>Kullanıcı kimliğini Kullanıcı Yönetimi ekranındaki üye ayrıntısından alabilirsiniz. Uygun olmayan hesaba erişim verilemez.</p>
          </div>
        </aside>
      </div>
      {toastView}
    </OwnerShell>
  );
}

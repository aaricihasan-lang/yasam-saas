"use client";

/**
 * Uzman erişimi (owner). Uygun uzmanlar listeden seçilir (GET /uzmanlar — yalnız owner; ad, e-posta, Doğaltaş izni);
 * erişim POST /yetkiler { grant | revoke } ile kişi bazında verilir / kaldırılır (tek uzman veya seçilen birden fazla uzman; her biri
 * ayrı istek → DB uygunluğu her kişi için ayrı doğrulanır). Mevcut yetkiler genel görünüm ucundan okunur.
 * Varsayılan: hiçbir uzmanın erişimi yok; otomatik / toplu yetki YOK. Uygunluk sunucuda (DB) her istekte yeniden doğrulanır.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerNotFound, OwnerShell, useToast } from "../_components/OwnerShell";
import { fmtDate, ownerErrorText, ownerGet, ownerPost } from "../_components/ownerApi";
import s from "../_components/owner.module.css";

type Grant = { id: string; user_id: string; granted_at: string; revoked_at: string | null; revoke_reason: string | null; note: string | null };
type Expert = { id: string; name: string; email: string; stones: boolean; approved: boolean; demo: boolean; eligible: boolean };
const REASON_TR: Record<string, string> = { owner_revoked: "Owner kaldırdı", role_changed: "Rol değişti", tenant_changed: "Hesap değişti", other: "Uygunluk değişti" };

export default function ExpertsClient() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [experts, setExperts] = useState<Expert[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { show: showToast, view: toastView } = useToast();

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      ownerGet<{ ok: true; overview: { grants?: Grant[] } | null }>(""),
      ownerGet<{ ok: true; experts: Expert[] }>("/uzmanlar"),
    ]);
    if (r.ok) setGrants(Array.isArray(r.data.overview?.grants) ? r.data.overview.grants : []);
    else if (r.status === 404) setNotFound(true);
    else showToast(ownerErrorText(r), { tone: "err" });
    if (e.ok) setExperts(Array.isArray(e.data.experts) ? e.data.experts : []);
    else if (e.status !== 404) showToast(ownerErrorText(e), { tone: "err" });
  }, [showToast]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const active = useMemo(() => (grants ?? []).filter((g) => !g.revoked_at), [grants]);
  const activeIds = useMemo(() => new Set(active.map((g) => g.user_id)), [active]);
  const byId = useMemo(() => new Map((experts ?? []).map((x) => [x.id, x])), [experts]);
  const list = useMemo(() => {
    const fq = q.trim().toLocaleLowerCase("tr");
    return (experts ?? [])
      .filter((x) => !fq || `${x.name} ${x.email}`.toLocaleLowerCase("tr").includes(fq))
      .sort((a, b) => Number(activeIds.has(b.id)) - Number(activeIds.has(a.id)) || Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name, "tr"));
  }, [experts, q, activeIds]);

  if (notFound) {
    return (
      <OwnerShell section="experts">
        <OwnerNotFound />
      </OwnerShell>
    );
  }

  const call = async (action: "grant" | "revoke", uid: string) => {
    setBusy(true);
    const r = await ownerPost("/yetkiler", { action, user_id: uid });
    setBusy(false);
    if (!r.ok) {
      showToast(ownerErrorText(r), { tone: "err" });
      return false;
    }
    await load();
    return true;
  };
  /** Seçilen uzmanlar: her biri ayrı istek; başarısız olan atlanır ve sayısı bildirilir. */
  const callMany = async (action: "grant" | "revoke", ids: string[]) => {
    setBusy(true);
    const done: string[] = [];
    let err = "";
    for (const uid of ids) {
      const r = await ownerPost("/yetkiler", { action, user_id: uid });
      if (r.ok) done.push(uid);
      else err = ownerErrorText(r);
    }
    setBusy(false);
    setSel(new Set());
    await load();
    if (err) showToast(`${ids.length - done.length} uzmanda işlem yapılamadı: ${err}`, { tone: "err" });
    return done;
  };
  const toggle = (uid: string, on: boolean) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (on) next.add(uid);
      else next.delete(uid);
      return next;
    });
  const selGrant = (experts ?? []).filter((x) => sel.has(x.id) && !activeIds.has(x.id) && x.eligible).map((x) => x.id);
  const selRevoke = (experts ?? []).filter((x) => sel.has(x.id) && activeIds.has(x.id)).map((x) => x.id);
  const label = (uid: string) => {
    const x = byId.get(uid);
    return x ? `${x.name || "Adsız uzman"}${x.email ? ` · ${x.email}` : ""}` : uid;
  };
  const why = (x: Expert) => (x.demo ? "Demo hesap" : !x.approved ? "Üyeliği onaylı değil" : !x.stones ? "Doğaltaş modül izni yok" : "");
  const history = (grants ?? []).filter((g) => g.revoked_at).slice(0, 20);

  return (
    <OwnerShell section="experts">
      <section className={s.hero}>
        <div>
          <span className={s.eyebrow}>Owner · Doğaltaş Kütüphanesi</span>
          <h1>Uzman erişimi</h1>
          <p>Doğaltaş Kütüphanesi&apos;ni seçtiğiniz uzmanlara açın veya kapatın. Uzman yalnız yayındaki taşları salt-okunur görür.</p>
        </div>
        <div className={s.heroStats}>
          <div className={s.statPill}>
            <b>{grants ? active.length : "–"}</b>
            <span>Erişimi açık</span>
          </div>
          <div className={s.statPill}>
            <b>{experts ? experts.filter((x) => x.eligible).length : "–"}</b>
            <span>Uygun uzman</span>
          </div>
        </div>
      </section>
      <div style={{ height: 14 }} />
      <p className={s.healthNote}>
        <b>Varsayılan olarak hiçbir uzmanın erişimi yok; otomatik yetki verilmez.</b> Uygunluk (aktif hesap, onaylı üyelik, Doğaltaş modül izni, demo olmayan hesap) sunucuda her istekte yeniden doğrulanır; uygunluğu bozulan erişim kendiliğinden kapanır.
      </p>
      <div className={s.toolbar}>
        <label className={s.search}>
          <span className={s.srOnly}>Uzman ara</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Uzman adı veya e-posta…" autoComplete="off" />
        </label>
      </div>
      {sel.size ? (
        <div className={`${s.rowActions} ${s.rowActionsLeft}`} role="group" aria-label="Seçilen uzmanlar">
          <button
            type="button"
            className={`btn-success ${s.btn} ${s.btnSm}`}
            disabled={busy || !selGrant.length}
            onClick={async () => {
              const done = await callMany("grant", selGrant);
              if (done.length) showToast(`${done.length} uzmana erişim verildi.`, { undo: async () => void (await callMany("revoke", done)) });
            }}
          >
            Seçilenlere erişim ver ({selGrant.length})
          </button>
          <button
            type="button"
            className={`btn-danger ${s.btn} ${s.btnSm}`}
            disabled={busy || !selRevoke.length}
            onClick={async () => {
              const done = await callMany("revoke", selRevoke);
              if (done.length) showToast(`${done.length} uzmanın erişimi kaldırıldı.`, { undo: async () => void (await callMany("grant", done)) });
            }}
          >
            Seçilenlerin erişimini kaldır ({selRevoke.length})
          </button>
          <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => setSel(new Set())}>
            Seçimi temizle
          </button>
        </div>
      ) : null}
      <div className={s.panel}>
        {!experts || !grants ? (
          <p className={s.loading}>Yükleniyor…</p>
        ) : list.length ? (
          list.map((x) => {
            const on = activeIds.has(x.id);
            return (
              <div key={x.id} className={s.delRow}>
                <input
                  type="checkbox"
                  aria-label={`${x.name || "Adsız uzman"} seç`}
                  checked={sel.has(x.id)}
                  disabled={busy || (!on && !x.eligible)}
                  onChange={(e) => toggle(x.id, e.target.checked)}
                  style={{ width: 20, height: 20, flex: "0 0 auto" }}
                />
                <span style={{ minWidth: 0, overflowWrap: "anywhere", flex: "1 1 auto" }}>
                  <b>{x.name || "Adsız uzman"}</b> {on ? <span className={`${s.pill} ${s.pillTeal}`}>Erişimi açık</span> : null}
                  <br />
                  <small className={s.muted}>
                    {x.email}
                    {x.eligible ? "" : ` · ${why(x)}`}
                  </small>
                </span>
                {on ? (
                  <button
                    type="button"
                    className={`btn-danger ${s.btn} ${s.btnSm}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await call("revoke", x.id)) showToast(`${x.name}: erişim kaldırıldı.`, { undo: async () => void (await call("grant", x.id)) });
                    }}
                  >
                    Erişimi kaldır
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`btn-success ${s.btn} ${s.btnSm}`}
                    disabled={busy || !x.eligible}
                    title={x.eligible ? undefined : why(x)}
                    onClick={async () => {
                      if (await call("grant", x.id)) showToast(`${x.name}: erişim verildi.`, { undo: async () => void (await call("revoke", x.id)) });
                    }}
                  >
                    Erişim ver
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className={s.note} style={{ marginTop: 0 }}>
            {q ? "Aramayla eşleşen uzman yok." : "Aktif uzman hesabı yok."}
          </p>
        )}
      </div>
      {history.length ? (
        <details className={s.deleted}>
          <summary>Kapatılan erişimler ({history.length})</summary>
          {history.map((g) => (
            <div key={g.id} className={s.delRow}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {label(g.user_id)}
                <br />
                <small className={s.muted}>
                  {fmtDate(g.revoked_at)} · {REASON_TR[g.revoke_reason ?? ""] ?? "Kapatıldı"}
                </small>
              </span>
            </div>
          ))}
        </details>
      ) : null}
      {toastView}
    </OwnerShell>
  );
}

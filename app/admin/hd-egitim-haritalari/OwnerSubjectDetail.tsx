"use client";

/**
 * Hazır Eğitim Haritaları — OWNER kişi ayrıntısı (FAZ 2-B2).
 * Kaynaklar · doğum ve UTC · hesaplama (snapshot sürümleri + gerçek BodyGraph önizlemesi) · hukuk · yayın kontrol listesi
 * · onay geçmişi. Her eylem sunucuda owner kapısı + DB kilitleriyle yeniden doğrulanır; bu ekran yalnız arayüzdür.
 * Ücretli hesaplama düğmesi, sunucudaki ayrı çağrı izni (HD_EDUCATION_PROVIDER_CALLS_ENABLED) KAPALIYSA pasiftir.
 */

import { useEffect, useState } from "react";
import css from "@/app/_premium/hd-education/egitimYonetim.module.css";
import { EduBodygraphViewer, EduChartFacts } from "./EduBodygraphViewer";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import {
  EDU_BLOCKER_LABEL, EDU_CATEGORY_LABEL, EDU_CHECKLIST_LABEL, EDU_LEGAL_LABEL, EDU_OWNER_CLEARABLE_BLOCKERS, EDU_OWNER_VERIFIABLE_BLOCKERS, EDU_PUBLICATION_LABEL,
  type EduChecklist, type EduOwnerSubjectDetail,
} from "@/lib/human-design/education/educationContract";
import { EDU_BIRTH_EVIDENCE_LABEL, deriveBirthTimeEvidence, splitTimeStandard } from "@/lib/human-design/education/birthEvidence";
import { ownerGet, ownerPost } from "./ownerApi";

const ROLE_LABEL: Record<string, string> = { birth_time: "Doğum saati belgesi", date_place: "Tarih / yer", utc_standard: "Saat standardı kanıtı", extra: "Ek kaynak" };
const ACTION_LABEL: Record<string, string> = {
  subject_revised: "Kanıt revizyonu", legal_updated: "Hukuk kaydı güncellendi", chart_recorded: "Hesap snapshot'ı kaydedildi",
  chart_failed: "Hesaplama başarısız (kayıt yok)", chart_verified: "Hesap sonucu doğrulandı", publication_changed: "Yayın durumu değişti",
  takedown_requested: "Kaldırma talebi", takedown_handled: "Kaldırma talebi işlendi",
};
const CALC_LABEL: Record<string, string> = { OK: "Başarılı", PROVIDER_ERROR: "Sağlayıcı hatası", TIME_MISMATCH: "Zaman uyuşmazlığı", BLOCKED_UTC: "UTC engeli" };
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtDate = (d: string) => { const [y, m, g] = d.slice(0, 10).split("-"); return `${g}.${m}.${y}`; };
function fmtOffset(sec: number | null): string {
  if (sec === null) return "—";
  const a = Math.abs(sec);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sec < 0 ? "−" : "+"}${p(Math.floor(a / 3600))}:${p(Math.floor((a % 3600) / 60))}:${p(a % 60)}`;
}

type Modal =
  | { kind: "compute" }
  | { kind: "legal_review" }
  | { kind: "clear_blocker"; blocker: string }
  | { kind: "verify_blocker"; blocker: string }
  | { kind: "approve" }
  | { kind: "publish" }
  | { kind: "withdraw" }
  | null;

export function OwnerSubjectDetail({ id, onChanged = () => undefined }: { id: string; onChanged?: () => void }) {
  const [d, setD] = useState<EduOwnerSubjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [field1, setField1] = useState("");
  const [field2, setField2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void ownerGet<EduOwnerSubjectDetail>(`/api/admin/hd/education/subjects/${id}`).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.data); setErr(null); } else setErr(r.error);
    });
    return () => { live = false; };
  }, [id, tick]);

  const run = async (payload: Record<string, unknown> | "compute", done: string) => {
    if (busy) return;
    setBusy(true);
    const r = payload === "compute"
      ? await ownerPost<{ reused?: boolean; version?: number }>(`/api/admin/hd/education/subjects/${id}/compute`)
      : await ownerPost(`/api/admin/hd/education/subjects/${id}`, payload);
    // Sonuç mesajı yalnız güncel ayrıntı ekrana geldikten sonra (eski aşama + yeni mesaj aynı anda görünmez).
    const fresh = await ownerGet<EduOwnerSubjectDetail>(`/api/admin/hd/education/subjects/${id}`);
    if (fresh.ok) { setD(fresh.data); setErr(null); } else setTick((t) => t + 1);
    setBusy(false);
    setModal(null);
    setField1("");
    setField2("");
    onChanged();
    if (r.ok) {
      const extra = payload === "compute" && (r.data as { reused?: boolean }).reused ? " (kayıtlı snapshot kullanıldı — yeni çağrı yapılmadı)" : "";
      setMsg({ ok: true, text: done + extra });
    } else setMsg({ ok: false, text: r.error });
  };

  if (err) return <section className={css.panel}><p className={css.err} role="alert">{err}</p></section>;
  if (!d) return <section className={css.panel}><p className={css.empty}>Ayrıntılar yükleniyor…</p></section>;

  const st = d.publication.status;
  const editable = st === "draft" || st === "pilot_candidate" || st === "withdrawn";
  const currentOk = d.charts.filter((c) => c.current && c.calcStatus === "OK");
  const verifiedId = d.checklist.snapshotVerified ? d.publication.chartId : null;
  const computeBlock = !d.utcComputable ? d.utcMethodology
    : !d.providerCallsEnabled ? "Gerçek hesaplama çağrısı kapalı — owner'ın ayrı ücretli çağrı izni gerekir."
    : null;
  const checklistKeys = Object.keys(EDU_CHECKLIST_LABEL) as Array<keyof EduChecklist>;
  // Owner kararı 30.10.2026: ön koşullar tamamlanmadan "Yayın onayı ver" kullanılabilir görünmez; eksikler açıkça yazılır.
  // (Sunucu ve DB yayın kilitleri aynen geçerlidir — bu yalnız arayüz kılavuzudur.)
  const approveMissing = checklistKeys.filter((k) => k !== "ownerApproved" && !d.checklist[k]).map((k) => EDU_CHECKLIST_LABEL[k]);

  return (
    <section className={css.panel} aria-label={`${d.displayName} ayrıntıları`}>
      <div className={css.detailHead}>
        <div>
          <h2 className={css.h2}>{d.displayName}</h2>
          <p className={css.lead}>{EDU_CATEGORY_LABEL[d.category]} · {fmtDate(d.birthDate)} · {d.birthPlace}{d.isLiving ? " · yaşıyor" : ""}</p>
        </div>
        <div className={css.headTags}>
          <span className={`${css.tag} ${css.tInfo} ${css.big}`} title="Türetilmiş süreç aşaması">{d.stage}</span>
          <span className={`${css.tag} ${css.tLine}`} title="Veritabanındaki yayın kaydı">Yayın kaydı: {EDU_PUBLICATION_LABEL[st]}</span>
        </div>
      </div>
      {msg ? <p className={msg.ok ? css.msg : css.err} role="status">{msg.text}</p> : null}

      <div className={css.grid2}>
        <div className={css.box}><h3>Doğum verisi ve UTC</h3>
          <dl className={css.dl}>
            <dt>Belgedeki yerel saat</dt><dd>{d.documentedLocalTime}</dd>
            <dt>Orijinal ifade</dt><dd className={css.quote}>{d.documentQuote}</dd>
            <dt>Saat standardı</dt><dd data-edu-time-standard>{splitTimeStandard(d.timeStandard).standard ?? "—"}</dd>
            {splitTimeStandard(d.timeStandard).sensitivity ? (<><dt>Harita duyarlılığı</dt><dd data-edu-sensitivity>{splitTimeStandard(d.timeStandard).sensitivity}</dd></>) : null}
            <dt>Doğum saati kaynağı</dt><dd data-edu-birth-evidence={deriveBirthTimeEvidence(d.sources)}>{EDU_BIRTH_EVIDENCE_LABEL[deriveBirthTimeEvidence(d.sources)]}</dd>
            <dt>Kullanılan ofset</dt><dd>{fmtOffset(d.utcOffsetSeconds)}</dd>
            <dt>Nihai UTC anı</dt><dd>{d.birthUtc ?? "—"} · <span className={`${css.tag} ${d.utcStatus === "VERIFIED" ? css.tOk : css.tWarn}`}>{d.utcStatus === "VERIFIED" ? "Doğrulandı" : "Teyit bekliyor"}</span></dd>
            <dt>Koordinat</dt><dd>{d.latitude !== null && d.longitude !== null ? `${d.latitude}, ${d.longitude}` : "—"}</dd>
            {d.calendarNote ? (<><dt>Takvim notu</dt><dd>{d.calendarNote}</dd></>) : null}
            <dt>Metodoloji</dt><dd>{d.utcMethodology}</dd>
            <dt>Kanıt revizyonu</dt><dd>{d.revision}</dd>
          </dl></div>
        <div className={css.box}><h3>Kaynaklar</h3>
          {d.sources.length ? (
            <ul className={css.srcList}>
              {d.sources.map((s, i) => (
                <li key={i}>
                  <b>{ROLE_LABEL[s.role] ?? s.role}</b>
                  <a className={css.ext} href={s.url} target="_blank" rel="noopener noreferrer">{s.institution ?? s.url}</a>
                  <small>{[s.documentTitle, s.archiveRef, s.documentDate, s.primarySecondary, s.timeExplicit === true ? "saat belgede açık" : null, s.accessedOn ? `erişim ${s.accessedOn}` : null].filter(Boolean).join(" · ")}</small>
                  {s.seenHow ? <small data-edu-seen-how>Belge nasıl görüldü: {s.seenHow}</small> : s.role === "birth_time" ? <small data-edu-seen-how="yok">Belge nasıl görüldü: kayıt yok</small> : null}
                  {s.usageRestriction || s.license ? <small>Kullanım / lisans: {[s.usageRestriction, s.license].filter(Boolean).join(" · ")}</small> : null}
                </li>
              ))}
            </ul>
          ) : <p className={css.lead}>Güncel revizyonda kaynak kaydı yok.</p>}
        </div>
      </div>

      <div className={css.box}><h3>Hesaplama</h3>
        {d.charts.length ? (
          <div className={css.tableWrap}>
            <table className={`${css.tbl} ${css.tblCompact}`}>
              <thead><tr><th>Sürüm</th><th>Revizyon</th><th>Sonuç</th><th>Zaman denetimi</th><th>Tarih</th><th></th></tr></thead>
              <tbody>
                {d.charts.map((c) => (
                  <tr key={c.id} className={c.id === verifiedId ? css.rowOn : ""}>
                    <td>v{c.version}{c.current ? "" : <small>eski revizyon</small>}</td>
                    <td>{c.revision}</td>
                    <td><span className={`${css.tag} ${c.calcStatus === "OK" ? css.tOk : css.tBad}`}>{CALC_LABEL[c.calcStatus] ?? c.calcStatus}</span>{c.secondsSent ? <small>saniyeli UTC · saniye işleme doğrulanmadı</small> : null}</td>
                    <td>{c.timeCheck?.durum === "consistent" ? `tutarlı (${Number(c.timeCheck.farkDakika ?? 0).toFixed(2)} dk)` : c.timeCheck?.durum ?? "—"}</td>
                    <td>{fmtTime(c.computedAt)}</td>
                    <td>{c.id === verifiedId ? <span className={`${css.tag} ${css.tOk}`}>Doğrulandı</span>
                      : c.current && c.calcStatus === "OK" && editable ? <button type="button" className={`${css.btn} ${css.ghost}`} disabled={busy} onClick={() => void run({ action: "verify_chart", chartId: c.id }, `Sürüm v${c.version} doğrulandı.`)}>Sonucu doğrula</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={css.lead}>Henüz hesap yok. Bu kişi için &quot;Hesaplandı&quot; gösterilmez.</p>}
        <div className={css.actions}>
          {computeBlock ? <small className={css.why}>{computeBlock}</small> : null}
          <button type="button" className={`${css.btn} ${css.ghost}`} disabled={!!computeBlock || busy} onClick={() => setModal({ kind: "compute" })}>
            {currentOk.length ? "Yeniden hesapla (aynı istekse kayıtlı sonuç)" : "BodyGraph hesapla"}
          </button>
        </div>
        {d.preview ? (
          <div className={css.preview}>
            <p className={css.lead}>Önizleme — snapshot v{d.preview.version}{verifiedId === d.preview.chartId ? " (doğrulanmış)" : " (doğrulama bekliyor)"} · kayıtlı sonuçtan çizilir, sağlayıcı çağrısı yapılmaz.</p>
            {/* 29.10.2026 owner kararı: büyük, odaklı BodyGraph (yakınlaştır / uzaklaştır / sıfırla / Tam Ekran İncele). Çizim ve
                renkler kişisel HD ile aynı bileşen; sağlayıcı satırı yok (FAZ 19 P2-h). */}
            <EduBodygraphViewer result={d.preview.result as unknown as HdComputedChart} title={d.displayName} />
            <EduChartFacts result={d.preview.result as unknown as HdComputedChart} />
          </div>
        ) : null}
      </div>

      <div className={css.grid2}>
        <div className={css.box}><h3>Hukuki durum ve yayın engelleri</h3>
          <dl className={css.dl}>
            <dt>Hukuki durum</dt><dd><span className={`${css.tag} ${d.legalStatus === "E" ? css.tBad : d.legalStatus === "LOW_REVIEWED" ? css.tOk : css.tWarn}`}>{EDU_LEGAL_LABEL[d.legalStatus]}</span></dd>
            {d.legalReviewRef ? (<><dt>İnceleme kaydı</dt><dd>{d.legalReviewRef} · {fmtTime(d.legalReviewedAt)}</dd></>) : null}
            {d.legalNote ? (<><dt>Hukuk notu</dt><dd className={css.pre}>{d.legalNote}</dd></>) : null}
            <dt>Engeller</dt>
            <dd>{d.blockers.length ? d.blockers.map((b) => (
              <span key={b} className={css.blockerRow}>
                <span className={`${css.tag} ${css.tLine}`}>{EDU_BLOCKER_LABEL[b] ?? b}</span>
                {editable && (EDU_OWNER_CLEARABLE_BLOCKERS as readonly string[]).includes(b)
                  ? <button type="button" className={css.linkBtn} onClick={() => setModal({ kind: "clear_blocker", blocker: b })}>Kaldır…</button> : null}
                {editable && (EDU_OWNER_VERIFIABLE_BLOCKERS as readonly string[]).includes(b)
                  ? <button type="button" className={css.linkBtn} onClick={() => setModal({ kind: "verify_blocker", blocker: b })} data-edu-verify-blocker={b}>Kanıtı doğrula…</button> : null}
              </span>
            )) : <span className={`${css.tag} ${css.tOk}`}>Engel yok</span>}</dd>
          </dl>
          {editable && d.legalStatus !== "LOW_REVIEWED" ? (
            <div className={css.actions}>
              <button type="button" className={`${css.btn} ${css.ghost}`} onClick={() => setModal({ kind: "legal_review" })}>Avukat incelemesini kaydet…</button>
            </div>
          ) : null}
          <p className={css.note}>Hukuk incelemesini yazılım tamamlamaz; yalnız owner, inceleme referansıyla kaydeder. Kaynak lisansı (kaynak satırlarında) ile yayın izni ayrı değerlendirilir.</p>
        </div>
        <div className={css.box}><h3>Yayın kontrol listesi</h3>
          <ul className={css.check}>
            {checklistKeys.map((k) => (
              <li key={k} className={d.checklist[k] ? css.checkOk : css.checkNo}><span aria-hidden="true">{d.checklist[k] ? "✓" : "✗"}</span>{EDU_CHECKLIST_LABEL[k]}</li>
            ))}
          </ul>
          {d.publication.withdrawReason ? <p className={css.lead}>Kaldırma gerekçesi: {d.publication.withdrawReason} · {fmtTime(d.publication.withdrawnAt)}</p> : null}
          <div className={css.actions}>
            {st === "draft" ? <button type="button" className={`${css.btn} ${css.ghost}`} disabled={busy} onClick={() => void run({ action: "pilot" }, "Pilot adayı olarak işaretlendi.")}>Pilot adayı yap</button> : null}
            {st === "pilot_candidate" ? <button type="button" className={`${css.btn} ${css.ghost}`} disabled={busy} onClick={() => void run({ action: "unpilot" }, "Pilot adaylığı kaldırıldı.")}>Pilot adaylığını kaldır</button> : null}
            {editable ? <button type="button" className={`${css.btn} ${css.ghost}`} disabled={busy || approveMissing.length > 0} onClick={() => setModal({ kind: "approve" })} data-edu-approve>Yayın onayı ver…</button> : null}
            {st === "approved" ? <button type="button" className={`${css.btn} ${css.save}`} disabled={busy} onClick={() => setModal({ kind: "publish" })}>Yayımla…</button> : null}
            {st === "approved" || st === "published" ? <button type="button" className={`${css.btn} ${css.danger}`} disabled={busy} onClick={() => setModal({ kind: "withdraw" })}>Yayından kaldır…</button> : null}
          </div>
          {editable && approveMissing.length ? (
            <p className={css.note} role="note" data-edu-approve-missing>Yayın onayı için önce tamamlanmalı: {approveMissing.join(" · ")}.</p>
          ) : null}
          <p className={css.note}>Şartlar veritabanında da kilitlidir: eksik şartla onay/yayın reddedilir.</p>
        </div>
      </div>

      <div className={css.box}><h3>Onay geçmişi</h3>
        {d.history.length ? (
          <ul className={css.gList}>
            {d.history.map((h, i) => (
              <li key={i}><small>{fmtTime(h.at)} · {h.actorKind === "owner" ? "Platform Owner" : h.actorKind === "import" ? "İçe aktarım" : "Sistem"}</small>
                <b>{ACTION_LABEL[h.action] ?? h.action}</b>
                {h.action === "publication_changed" ? <small>{String(h.detail.onceki ?? "")} → {String(h.detail.yeni ?? "")}{h.detail.gerekce ? ` · ${String(h.detail.gerekce)}` : ""}</small> : null}
                {h.action === "chart_failed" ? <small>{String(h.detail.kod ?? "")}</small> : null}
                {h.action === "chart_recorded" || h.action === "chart_verified" ? <small>v{String(h.detail.surum ?? "")} · revizyon {String(h.detail.revizyon ?? "")}</small> : null}
              </li>
            ))}
          </ul>
        ) : <p className={css.lead}>Henüz kayıt yok.</p>}
      </div>

      {modal ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="eduOwnerModalTitle">
          <div className={css.mdl}>
            {modal.kind === "compute" ? (<>
              <h2 id="eduOwnerModalTitle">BodyGraph hesapla</h2>
              <p><b>{d.displayName}</b> · UTC {d.birthUtc}</p>
              <p className={css.lead}>Hesaplama sağlayıcısına <b>1 ücretli istek</b> gönderilir (UTC tarih/saat, &quot;UTC&quot; saat dilimi). Aynı istek için kayıtlı sonuç varsa yeni istek yapılmaz. Hata olursa sonuç kaydedilmez ve otomatik tekrar yapılmaz.</p>
            </>) : null}
            {modal.kind === "legal_review" ? (<>
              <h2 id="eduOwnerModalTitle">Avukat incelemesini kaydet</h2>
              <p className={css.lead}>Bu kayıt, avukat incelemesinin tamamlandığını owner olarak beyan eder. Hukuki durum &quot;{EDU_LEGAL_LABEL.LOW_REVIEWED}&quot; olur; &quot;{EDU_BLOCKER_LABEL["AVUKAT-GÖRMEDİ"]}&quot; ve &quot;{EDU_BLOCKER_LABEL["HUKUK-E"]}&quot; engelleri kalkar. Diğer engeller kalır.</p>
              <label className={css.fld}>İnceleme referansı (zorunlu)<input className={css.input} value={field1} maxLength={500} onChange={(e) => setField1(e.target.value)} placeholder="ör. avukat görüş yazısı no / tarih" /></label>
            </>) : null}
            {modal.kind === "clear_blocker" ? (<>
              <h2 id="eduOwnerModalTitle">Engeli kaldır: {EDU_BLOCKER_LABEL[modal.blocker] ?? modal.blocker}</h2>
              <label className={css.fld}>Gerekçe (zorunlu)<input className={css.input} value={field1} maxLength={500} onChange={(e) => setField1(e.target.value)} /></label>
            </>) : null}
            {modal.kind === "verify_blocker" ? (<>
              <h2 id="eduOwnerModalTitle">Kanıtı doğrula: {EDU_BLOCKER_LABEL[modal.blocker] ?? modal.blocker}</h2>
              <p className={css.lead}>Doğum kanıtı, UTC anı ve kayıtlı harita DEĞİŞMEZ. Yalnız bu teknik engel, aşağıdaki kayıtlı kanıtın yeterli olduğunu owner olarak teyit etmenizle kalkar; kayıt onay geçmişine işlenir. Hukuk engelleri bu işlemden etkilenmez.</p>
              {modal.blocker === "TAKVİM" ? (
                <dl className={css.dl}>
                  <dt>Takvim notu</dt><dd data-edu-verify-evidence>{d.calendarNote ?? "— (kayıtlı değil: doğrulanamaz)"}</dd>
                  <dt>Belge ifadesi</dt><dd className={css.quote}>{d.documentQuote}</dd>
                  <dt>Kayıtlı Gregoryen tarih</dt><dd>{fmtDate(d.birthDate)}</dd>
                </dl>
              ) : (
                <dl className={css.dl}>
                  <dt>Saat standardı</dt><dd data-edu-verify-evidence>{d.timeStandard ?? "—"}</dd>
                  <dt>Metodoloji</dt><dd>{d.utcMethodology}</dd>
                  <dt>Kayıtlı UTC anı</dt><dd>{d.birthUtc ?? "—"} · {d.utcStatus === "VERIFIED" ? "UTC doğrulandı" : "UTC teyit bekliyor (doğrulanamaz)"}</dd>
                </dl>
              )}
              <label className={css.fld}>{modal.blocker === "TAKVİM" ? "Belgeden teyit ettiğiniz Gregoryen tarih (GG.AA.YYYY, zorunlu)" : "Teyit ettiğiniz UTC anı (YYYY-AA-GGTSS:DD, zorunlu)"}
                <input className={css.input} value={field1} maxLength={40} onChange={(e) => setField1(e.target.value)} placeholder={modal.blocker === "TAKVİM" ? "ör. 26.02.1802" : "ör. 1879-03-14T10:50"} data-edu-verify-confirm /></label>
              <label className={css.fld}>Kanıt referansı (zorunlu, en az 10 karakter)<input className={css.input} value={field2} maxLength={1000} onChange={(e) => setField2(e.target.value)} placeholder="ör. belge / kaynak ve doğrulama yöntemi" data-edu-verify-reference /></label>
            </>) : null}
            {modal.kind === "approve" ? (<>
              <h2 id="eduOwnerModalTitle">Yayın onayı</h2>
              <p className={css.lead}>Onay, yayın şartlarının tamamı sağlanıyorsa kaydedilir; ardından ayrıca &quot;Yayımla&quot; gerekir.</p>
              <label className={css.fld}>Hukuki izin referansı (zorunlu)<input className={css.input} value={field1} maxLength={500} onChange={(e) => setField1(e.target.value)} /></label>
              <label className={css.fld}>Not (isteğe bağlı)<input className={css.input} value={field2} maxLength={2000} onChange={(e) => setField2(e.target.value)} /></label>
            </>) : null}
            {modal.kind === "publish" ? (<>
              <h2 id="eduOwnerModalTitle">Yayımla</h2>
              <p className={css.lead}>Kayıt, yalnız owner&apos;ın erişim verdiği eğitmenlerin kataloğunda görünür.</p>
            </>) : null}
            {modal.kind === "withdraw" ? (<>
              <h2 id="eduOwnerModalTitle">Yayından kaldır</h2>
              <p className={css.lead}>Kayıt eğitmen kataloğundan anında kaybolur; eski bağlantılar artık veri döndürmez.</p>
              <label className={css.fld}>Gerekçe (zorunlu)<input className={css.input} value={field1} maxLength={2000} onChange={(e) => setField1(e.target.value)} /></label>
            </>) : null}
            <div className={css.actions}>
              <button type="button" className={`${css.btn} ${css.ghost}`} onClick={() => { setModal(null); setField1(""); setField2(""); }} disabled={busy}>Vazgeç</button>
              <button type="button" className={`${css.btn} ${css.save}`} disabled={busy} onClick={() => {
                if (modal.kind === "compute") void run("compute", "Hesap tamamlandı ve snapshot kaydedildi.");
                else if (modal.kind === "legal_review") void run({ action: "legal_review", reference: field1 }, "Hukuk inceleme kaydı eklendi.");
                else if (modal.kind === "clear_blocker") void run({ action: "clear_blocker", blocker: modal.blocker, reason: field1 }, "Engel kaldırıldı.");
                else if (modal.kind === "verify_blocker") void run({ action: "verify_blocker", blocker: modal.blocker, confirm: field1, evidence: field2 }, "Kanıt doğrulandı; teknik engel kaldırıldı.");
                else if (modal.kind === "approve") void run({ action: "approve", legalClearanceRef: field1, note: field2 || undefined }, "Yayın onayı kaydedildi.");
                else if (modal.kind === "publish") void run({ action: "publish" }, "Kayıt yayımlandı.");
                else void run({ action: "withdraw", reason: field1 }, "Kayıt yayından kaldırıldı.");
              }}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

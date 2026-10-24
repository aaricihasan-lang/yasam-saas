"use client";

/**
 * OWNER · Eğitim Çizim Katmanları (FAZ 8–9).
 * - Eğitmen başına: eğitim yetkisi açık mı + eğitim verisi var mı (yalnız SAYILAR; içerik okunmaz).
 * - Katman listesi: harita ve eğitmen bazında; inceleme (merkezî kayıtta yayımlı KAYITLI snapshot ile GERÇEK BodyGraph);
 *   izni geri çekilmiş / geçersiz özel kayıtta içerik ve başlık sunucudan gelmez (yalnız idari durum).
 * - Tek katman kaldırma ve AYRI "Eğitim verilerini kalıcı sil" (yalnız yetki KAPALIYKEN; 3 aşamalı onay; izinler,
 *   izin kanıtları ve denetim izleri korunur). YETKİ KAPATMAK VERİ SİLMEZ; süreye bağlı otomatik silme YOKTUR.
 * Normal admin bu sayfayı ve uçları göremez (layout + API + DB).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { premiumFontVars } from "@/app/_premium/fonts";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/calismaAlani.module.css";
import { premiumStateFromChart } from "@/lib/human-design/bodygraph/premiumChartState";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import {
  ANN_COLORS, anchorLabel, type AnnEl, type AnnOwnerLayerRow, type AnnOwnerTrainerRow, type AnnPurgePreview,
} from "@/lib/human-design/education/annotations/annotationContract";
import type { PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { AnnotationStage } from "@/app/human-design/egitim-merkezi/_calisma/AnnotationStage";
import { annOwnerDelete, annOwnerGet, annOwnerList, annOwnerPurge, annOwnerPurgePreview, annOwnerTrainers } from "@/app/human-design/egitim-merkezi/_calisma/annApi";
import { blankPremiumState } from "@/app/human-design/egitim-merkezi/_calisma/blankState";
import { privCall } from "@/app/human-design/egitim-merkezi/_ui/privApi";
import { bulkPhraseMatches } from "@/lib/ui/bulkDeleteGuard";

const STATE_LABEL: Record<string, [string, string]> = {
  ok: ["Erişime açık", base.tOk], published: ["Yayında", base.tOk], consent_withdrawn: ["İzin geri çekildi", base.tBad],
  consent_invalid: ["İzin geçersiz", base.tBad], evidence_invalid: ["Kanıt doğrulanamadı", base.tBad], source_changed: ["Kaynak değişti", base.tWarn],
  withdrawn: ["Yayından kaldırıldı", base.tWarn], draft: ["Taslak", base.tMute], approved: ["Onaylı (yayında değil)", base.tMute], missing: ["Kaynak yok", base.tBad],
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const TYPE_LABEL: Record<AnnEl["t"], string> = { pen: "Kalem", arrow: "Ok", circle: "Daire", bubble: "Baloncuk", text: "Metin" };

type View =
  | { row: AnnOwnerLayerRow; closed: true }
  | { row: AnnOwnerLayerRow; closed: false; els: AnnEl[]; notes: string; state: CbgState; onRealChart: boolean };
type Purge = { trainer: AnnOwnerTrainerRow; preview: AnnPurgePreview; phrase: string; stage: 1 | 2 | 3; typed: string };

export default function AnnotationOwnerPage() {
  const [rows, setRows] = useState<AnnOwnerLayerRow[] | null>(null);
  const [trainers, setTrainers] = useState<AnnOwnerTrainerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "central" | "private">("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [del, setDel] = useState<AnnOwnerLayerRow | null>(null);
  const [purge, setPurge] = useState<Purge | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [openBubble, setOpenBubble] = useState<string | null>(null);

  const load = useCallback(() => Promise.all([
    annOwnerList(kind === "all" ? "" : `?kind=${kind}`).then((r) => { if (r.ok) { setRows(r.body.layers); setErr(null); } else setErr(r.error); }),
    annOwnerTrainers().then((r) => { if (r.ok) setTrainers(r.body.trainers); else setErr(r.error); }),
  ]), [kind]);
  useEffect(() => { void load(); }, [load]);

  const fold = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || fold(`${r.trainerName} ${r.sourceTitle ?? ""}`).includes(fold(q.trim()))), [rows, q]);
  const perChart = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.sourceId, (m.get(r.sourceId) ?? 0) + 1);
    return m;
  }, [rows]);

  const inspect = async (row: AnnOwnerLayerRow) => {
    setMsg(null); setOpenBubble(null);
    const r = await annOwnerGet(row.id);
    if (!r.ok) { setMsg(r.error); return; }
    const L = r.body.layer;
    if (L.contentClosed) { setView({ row, closed: true }); return; }
    let state: CbgState | null = null;
    if (row.sourceKind === "central" && L.chartView) state = premiumStateFromChart(L.chartView as unknown as HdComputedChart);
    if (row.sourceKind === "private") {
      const it = await privCall<{ item: PrivItemDetail }>("owner", `/api/admin/hd/education/private/items/${encodeURIComponent(row.sourceId)}`);
      if (it.ok && it.body.item.chart) state = premiumStateFromChart(it.body.item.chart.view as unknown as HdComputedChart);
    }
    setView({ row, closed: false, els: L.doc?.els ?? [], notes: L.doc?.notes ?? "", state: state ?? blankPremiumState(), onRealChart: !!state });
  };

  const startPurge = async (t: AnnOwnerTrainerRow) => {
    setMsg(null);
    const r = await annOwnerPurgePreview(t.userId);
    if (!r.ok) { setMsg(r.error); return; }
    setPurge({ trainer: t, preview: r.body.preview, phrase: r.body.phrase, stage: 1, typed: "" });
  };

  return (
    <div className={`${base.page} ${premiumFontVars}`} data-ann-owner>
      <div className={base.inner}>
        <header className={base.hero}>
          <p className={base.eyebrow}>OWNER · HUMAN DESIGN</p>
          <h1 className={base.title}>Eğitim Çizim Katmanları</h1>
          <p className={base.sub}>Eğitmenlerin eğitim haritaları üzerindeki kişisel çizim ve notları · yalnız platform owner görür</p>
        </header>
        <div className={base.stats}>
          <div className={base.stat}><b>{rows?.length ?? "…"}</b><span>Katman</span></div>
          <div className={base.stat}><b>{trainers?.length ?? "…"}</b><span>Eğitmen (veri veya yetki)</span></div>
          <div className={`${base.stat} ${base.sWarn}`}><b>{trainers ? trainers.filter((t) => !t.grantActive && t.centralLayers + t.privateLayers + t.privateItems > 0).length : "…"}</b><span>Yetkisi kapalı, verisi korunan</span></div>
        </div>
        {msg ? <p className={base.msg} role="status" data-ann-owner-msg>{msg}</p> : null}
        {err ? <p className={base.err} role="alert">{err}</p> : null}

        <section className={base.panel} aria-labelledby="ann-trainers">
          <h2 id="ann-trainers" className={base.h2}>Eğitmenlerin eğitim verileri</h2>
          <p className={base.lead}>Yetkiyi kapatmak veriyi SİLMEZ (pasif, erişime kapalı). Yetki yeniden açılınca geçerli kayıtlar aynen döner. Kalıcı silme ayrı bir işlemdir; yalnız yetki kapalıyken yapılır, izin kayıtları ve denetim izleri korunur. Süreye bağlı otomatik silme yoktur.</p>
          <div className={base.tableWrap}>
            <table className={base.tbl} data-ann-owner-trainers>
              <thead><tr><th>Eğitmen</th><th>Eğitim yetkisi</th><th>Hazır harita katmanı</th><th>Özel eğitim kaydı</th><th>Özel kayıt katmanı</th><th>Son çalışma</th><th aria-label="İşlemler" /></tr></thead>
              <tbody>
                {(trainers ?? []).map((t) => {
                  const total = t.centralLayers + t.privateLayers + t.privateItems;
                  return (
                    <tr key={t.userId} data-ann-owner-trainer={t.userId} style={{ cursor: "default" }}>
                      <td><b>{t.name || "—"}</b>{!t.accountActive ? <small>Hesap pasif</small> : null}</td>
                      <td><span className={`${base.tag} ${t.grantActive ? base.tOk : base.tMute} ${base.big}`} data-ann-owner-grant={t.grantActive ? "on" : "off"}>{t.grantActive ? "AÇIK" : "KAPALI"}</span></td>
                      <td>{t.centralLayers}</td>
                      <td>{t.privateItems}{t.privateItemsClosed ? <small>{t.privateItemsClosed} erişime kapalı (izin/kaynak)</small> : null}</td>
                      <td>{t.privateLayers}</td>
                      <td>{fmt(t.lastActivity)}</td>
                      <td>
                        <span className={base.uAct}>
                          <a className={`${base.btn} ${base.ghost}`} href={`/admin/users/${t.userId}#uye-erisim`}>Modül İzinleri</a>
                          <button type="button" className={`${base.btn} ${base.danger}`} disabled={t.grantActive || total === 0}
                            title={t.grantActive ? "Önce eğitim yetkisini kapatın" : total === 0 ? "Silinecek eğitim verisi yok" : undefined}
                            onClick={() => void startPurge(t)} data-ann-owner-purge={t.userId}>Eğitim verilerini kalıcı sil</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {trainers && trainers.length === 0 ? <tr><td colSpan={7} className={base.empty}>Eğitim verisi veya yetkisi olan eğitmen yok.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={base.panel} aria-label="Katmanlar">
          <div className={base.tools}>
            <input className={base.input} type="search" placeholder="Eğitmen veya harita ara…" value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} aria-label="Ara" data-ann-owner-q />
            <select className={base.select} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Harita türü" data-ann-owner-kind>
              <option value="all">Tüm haritalar</option>
              <option value="central">Hazır eğitim haritaları</option>
              <option value="private">Özel eğitim arşivi</option>
            </select>
          </div>
          <div className={base.tableWrap}>
            <table className={base.tbl} data-ann-owner-table>
              <thead><tr><th>Harita</th><th>Eğitmen</th><th>Tür</th><th>Durum</th><th>Öğe</th><th>Güncellendi</th><th aria-label="İşlemler" /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const [lbl, cls] = STATE_LABEL[r.sourceState] ?? [r.sourceState, base.tMute];
                  return (
                    <tr key={r.id} data-ann-owner-row={r.id} onClick={() => void inspect(r)}>
                      <td><b>{r.sourceTitle ?? (r.contentClosed ? "Özel kayıt (içerik kapalı)" : "—")}</b><small>{perChart.get(r.sourceId) ?? 1} eğitmen katmanı</small></td>
                      <td>{r.trainerName}<small>{r.grantActive ? "Yetki açık" : "Yetki kapalı — veri korunuyor"}</small></td>
                      <td><span className={`${base.tag} ${base.tLine}`}>{r.sourceKind === "central" ? "Hazır eğitim" : "Özel arşiv"}</span></td>
                      <td><span className={`${base.tag} ${cls}`}>{lbl}</span></td>
                      <td>{r.elCount}</td>
                      <td>{fmt(r.updatedAt)}<small>rev {r.revision}</small></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className={base.uAct}>
                          <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => void inspect(r)} data-ann-owner-view={r.id}>{r.contentClosed ? "Durum" : "İncele"}</button>
                          <button type="button" className={`${base.btn} ${base.danger}`} onClick={() => setDel(r)} data-ann-owner-del={r.id}>Kaldır</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows && shown.length === 0 ? <tr><td colSpan={7} className={base.empty}>Katman yok.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className={base.note}>Kaldırma yalnız eğitmenin çizim / not katmanını siler; BodyGraph, danışan ve merkezî kayıt etkilenmez. İnceleme ve kaldırma denetim izine yazılır (içerik yazılmaz).</p>
        </section>

        {view ? (
          <section className={base.panel} aria-label="Katman incelemesi" data-ann-owner-viewer={view.row.id} data-ann-owner-real-chart={!view.closed && view.onRealChart ? "1" : "0"}>
            <div className={base.tools} style={{ justifyContent: "space-between" }}>
              <div>
                <h2 className={base.h2}>{view.row.sourceTitle ?? "Özel kayıt"} · {view.row.trainerName}</h2>
                {!view.closed ? (
                  <p className={css.hint}>{view.onRealChart ? "Eğitmenin gördüğü gerçek BodyGraph üzerinde (salt okunur)." : "Harita verisi şu an kullanılamıyor (yayından kaldırılmış / kaynak yok); aynı koordinat düzleminde boş BodyGraph üzerinde (salt okunur)."}</p>
                ) : null}
              </div>
              <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setView(null)}>Kapat</button>
            </div>
            {view.closed ? (
              <div className={base.box} role="status" data-ann-owner-closed>
                <h3>İçerik kapalı</h3>
                <p className={css.hint}>Bu özel eğitim kaydının danışan izni geri çekilmiş veya kaynak/izin doğrulanamıyor. Harita, çizim ve not içeriği gösterilmez (sunucudan gönderilmez). Kayıt mevcut · ilgili eğitmen: {view.row.trainerName} · son değişiklik: {fmt(view.row.updatedAt)} · {view.row.elCount} öğe.</p>
              </div>
            ) : (
              <div className={base.split} style={{ marginTop: 12 }}>
                <div className={css.stageCard}>
                  <AnnotationStage state={view.state} front={view.state.front ?? null} els={view.els} tool="none" color="red" width={4} selectedId={null}
                    interactive={false} openBubbleId={openBubble} onBubble={setOpenBubble} />
                </div>
                <aside>
                  <h3 className={base.h2}>İçerik ({view.els.length} öğe)</h3>
                  <p className={css.hint}>{(["pen", "arrow", "circle", "bubble", "text"] as const).map((t) => `${TYPE_LABEL[t]}: ${view.els.filter((x) => x.t === t).length}`).join(" · ")}</p>
                  {view.notes.trim() ? (
                    <div className={base.box} data-ann-owner-notes><h3>Eğitim notları</h3><p className={css.noteTxt}>{view.notes}</p></div>
                  ) : null}
                  <p className={css.hint} style={{ marginTop: 8 }}>
                    {view.els.filter((x) => x.t === "circle" || x.t === "arrow").map((x) => x.t === "circle" ? `Daire: ${anchorLabel(x.a) ?? "serbest"}` : x.t === "arrow" ? `Ok: ${anchorLabel(x.a1) ?? "serbest"} → ${anchorLabel(x.a2) ?? "serbest"}` : "").join(" · ")}
                  </p>
                  <ul className={css.notes} style={{ marginTop: 8 }}>
                    {view.els.filter((x): x is Extract<AnnEl, { t: "bubble" | "text" }> => x.t === "bubble" || x.t === "text").map((x) => (
                      <li key={x.id} className={css.noteRow} style={{ cursor: "default" }}>
                        <span className={css.num} style={{ background: ANN_COLORS[x.c] }}>{x.t === "bubble" ? "N" : "T"}</span>
                        <span className={css.noteTxt}><small>{anchorLabel(x.a) ?? "Serbest konum"}</small>{x.t === "bubble" ? x.n || "(boş not)" : x.s}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            )}
          </section>
        ) : null}

        {del ? (
          <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-del" data-ann-owner-confirm>
            <div className={css.mdl}>
              <h2 id="ann-del">Katman kaldırılsın mı?</h2>
              <p><b>{del.trainerName}</b> eğitmeninin <b>{del.sourceTitle ?? "özel kayıt"}</b> haritasındaki {del.elCount} öğelik çizim / not katmanı kalıcı olarak silinir.</p>
              <p>BodyGraph, danışan ve merkezî kayıt etkilenmez. Eğitmen bu haritada boş bir çalışma alanı görür.</p>
              <div className={css.row}>
                <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={busy} data-ann-owner-del-confirm onClick={async () => {
                  setBusy(true);
                  const r = await annOwnerDelete(del.id);
                  setBusy(false);
                  if (r.ok) { setMsg("Katman kaldırıldı."); if (view?.row.id === del.id) setView(null); setDel(null); await load(); }
                  else { setMsg(r.error); setDel(null); }
                }}>Evet, katmanı kaldır</button>
                <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setDel(null)}>Vazgeç</button>
              </div>
            </div>
          </div>
        ) : null}

        {purge ? (
          <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-purge" data-ann-purge-stage={purge.stage}>
            <div className={css.mdl}>
              {purge.stage === 1 ? (
                <>
                  <h2 id="ann-purge">Eğitim verileri kalıcı olarak silinsin mi? (1/3)</h2>
                  <p><b>{purge.preview.name}</b> eğitmeninin eğitim verileri silinecek:</p>
                  <ul className={css.hint} style={{ margin: "0 0 10px 18px" }}>
                    <li><b>{purge.preview.layers}</b> çizim / not katmanı</li>
                    <li><b>{purge.preview.items}</b> özel eğitim arşivi kaydı</li>
                  </ul>
                  <p>Korunacak (silinmez): {purge.preview.keptConsents} danışan izni kaydı ve kanıtı, {purge.preview.keptAudit} denetim kaydı, danışanlar, Human Design haritaları, Danışan Yolculuğu, merkezî eğitim haritaları ve kullanıcı hesabı.</p>
                  <p><b>Bu işlem geri alınamaz.</b></p>
                  <div className={css.row}>
                    <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} onClick={() => setPurge({ ...purge, stage: 2 })} data-ann-purge-next>Devam Et</button>
                    <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setPurge(null)}>Vazgeç</button>
                  </div>
                </>
              ) : purge.stage === 2 ? (
                <>
                  <h2 id="ann-purge">Elle doğrulama (2/3)</h2>
                  <p>Devam etmek için aşağıya <b>{purge.phrase}</b> yazın.</p>
                  <input className={css.inp} value={purge.typed} onChange={(e) => setPurge({ ...purge, typed: e.target.value.slice(0, 40) })} aria-label="Onay ifadesi" data-ann-purge-phrase />
                  <div className={css.row}>
                    <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={!bulkPhraseMatches(purge.typed, purge.phrase)} onClick={() => setPurge({ ...purge, stage: 3 })} data-ann-purge-next>Devam Et</button>
                    <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setPurge(null)}>Vazgeç</button>
                  </div>
                </>
              ) : (
                <>
                  <h2 id="ann-purge">Son onay — Bu işlem geri alınamaz (3/3)</h2>
                  <p><b>{purge.preview.layers + purge.preview.items}</b> eğitim kaydı ({purge.preview.layers} katman + {purge.preview.items} özel kayıt) kalıcı olarak silinecek.</p>
                  <div className={css.row}>
                    <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={busy} data-ann-purge-final onClick={async () => {
                      setBusy(true);
                      const r = await annOwnerPurge(purge.trainer.userId, purge.preview.layers, purge.preview.items, purge.typed);
                      setBusy(false);
                      setPurge(null);
                      if (r.ok) { setMsg(`${purge.preview.name}: ${r.body.deleted.layers} katman ve ${r.body.deleted.items} özel kayıt kalıcı olarak silindi. İzin ve denetim kayıtları korundu.`); setView(null); await load(); }
                      else setMsg(r.error);
                    }}>Kalıcı Olarak Sil</button>
                    <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setPurge(null)}>Vazgeç</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

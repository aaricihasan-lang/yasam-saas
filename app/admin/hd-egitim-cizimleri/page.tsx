"use client";

/**
 * OWNER · Eğitim Çizim Katmanları (FAZ 8). Eğitmenlerin merkezî / özel eğitim haritaları üzerindeki çizim / not katmanlarını
 * harita ve eğitmen bazında listeler, içeriğiyle inceler ve kaldırır (yalnız eğitim içeriği; harita / danışan / merkezî kayıt
 * ETKİLENMEZ). Normal admin bu sayfayı ve uçları göremez (layout + API + DB). İnceleme denetime yazılır.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { premiumFontVars } from "@/app/_premium/fonts";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/calismaAlani.module.css";
import { premiumStateFromChart } from "@/lib/human-design/bodygraph/premiumChartState";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { ANN_COLORS, anchorLabel, type AnnEl, type AnnOwnerLayerRow } from "@/lib/human-design/education/annotations/annotationContract";
import type { PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { AnnotationStage } from "@/app/human-design/egitim-merkezi/_calisma/AnnotationStage";
import { annOwnerDelete, annOwnerGet, annOwnerList } from "@/app/human-design/egitim-merkezi/_calisma/annApi";
import { blankPremiumState } from "@/app/human-design/egitim-merkezi/_calisma/blankState";
import { privCall } from "@/app/human-design/egitim-merkezi/_ui/privApi";

const STATE_LABEL: Record<string, [string, string]> = {
  ok: ["Erişime açık", base.tOk], published: ["Yayında", base.tOk], consent_withdrawn: ["İzin geri çekildi", base.tBad],
  consent_invalid: ["İzin geçersiz", base.tBad], evidence_invalid: ["Kanıt doğrulanamadı", base.tBad], source_changed: ["Kaynak değişti", base.tWarn],
  withdrawn: ["Yayından kaldırıldı", base.tWarn], draft: ["Taslak", base.tMute], approved: ["Onaylı (yayında değil)", base.tMute], missing: ["Kaynak yok", base.tBad],
};
const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const TYPE_LABEL: Record<AnnEl["t"], string> = { pen: "Kalem", arrow: "Ok", circle: "Daire", bubble: "Baloncuk", text: "Metin" };

type View = { row: AnnOwnerLayerRow; els: AnnEl[]; state: CbgState; onRealChart: boolean };

export default function AnnotationOwnerPage() {
  const [rows, setRows] = useState<AnnOwnerLayerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "central" | "private">("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [del, setDel] = useState<AnnOwnerLayerRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [openBubble, setOpenBubble] = useState<string | null>(null);

  const load = useCallback(() => annOwnerList(kind === "all" ? "" : `?kind=${kind}`).then((r) => {
    if (r.ok) { setRows(r.body.layers); setErr(null); } else setErr(r.error);
  }), [kind]);
  useEffect(() => { void load(); }, [load]);

  const fold = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || fold(`${r.trainerName} ${r.sourceTitle}`).includes(fold(q.trim()))), [rows, q]);
  const perChart = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.sourceId, (m.get(r.sourceId) ?? 0) + 1);
    return m;
  }, [rows]);

  const inspect = async (row: AnnOwnerLayerRow) => {
    setMsg(null); setOpenBubble(null);
    const r = await annOwnerGet(row.id);
    if (!r.ok) { setMsg(r.error); return; }
    let state: CbgState | null = null;
    if (row.sourceKind === "private") {
      const it = await privCall<{ item: PrivItemDetail }>("owner", `/api/admin/hd/education/private/items/${encodeURIComponent(row.sourceId)}`);
      if (it.ok && it.body.item.chart) state = premiumStateFromChart(it.body.item.chart.view as unknown as HdComputedChart);
    }
    setView({ row, els: r.body.layer.doc?.els ?? [], state: state ?? blankPremiumState(), onRealChart: !!state });
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
          <div className={base.stat}><b>{rows ? new Set(rows.map((r) => r.trainerUserId)).size : "…"}</b><span>Eğitmen</span></div>
          <div className={base.stat}><b>{rows ? perChart.size : "…"}</b><span>Harita</span></div>
        </div>
        {msg ? <p className={base.msg} role="status" data-ann-owner-msg>{msg}</p> : null}
        <section className={base.panel} aria-label="Katmanlar">
          <div className={base.tools}>
            <input className={base.input} type="search" placeholder="Eğitmen veya harita ara…" value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} aria-label="Ara" data-ann-owner-q />
            <select className={base.select} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Harita türü" data-ann-owner-kind>
              <option value="all">Tüm haritalar</option>
              <option value="central">Hazır eğitim haritaları</option>
              <option value="private">Özel eğitim arşivi</option>
            </select>
          </div>
          {err ? <p className={base.err} role="alert">{err}</p> : null}
          <div className={base.tableWrap}>
            <table className={base.tbl} data-ann-owner-table>
              <thead><tr><th>Harita</th><th>Eğitmen</th><th>Tür</th><th>Durum</th><th>Öğe</th><th>Güncellendi</th><th aria-label="İşlemler" /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const [lbl, cls] = STATE_LABEL[r.sourceState] ?? [r.sourceState, base.tMute];
                  return (
                    <tr key={r.id} data-ann-owner-row={r.id} onClick={() => void inspect(r)}>
                      <td><b>{r.sourceTitle || "—"}</b><small>{perChart.get(r.sourceId) ?? 1} eğitmen katmanı</small></td>
                      <td>{r.trainerName}</td>
                      <td><span className={`${base.tag} ${base.tLine}`}>{r.sourceKind === "central" ? "Hazır eğitim" : "Özel arşiv"}</span></td>
                      <td><span className={`${base.tag} ${cls}`}>{lbl}</span></td>
                      <td>{r.elCount}</td>
                      <td>{fmt(r.updatedAt)}<small>rev {r.revision}</small></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className={base.uAct}>
                          <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => void inspect(r)} data-ann-owner-view={r.id}>İncele</button>
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
          <section className={base.panel} aria-label="Katman incelemesi" data-ann-owner-viewer={view.row.id}>
            <div className={base.tools} style={{ justifyContent: "space-between" }}>
              <div>
                <h2 className={base.h2}>{view.row.sourceTitle} · {view.row.trainerName}</h2>
                <p className={css.hint}>{view.onRealChart ? "Eğitmenin gördüğü harita üzerinde (salt okunur)." : "Harita verisi gösterilmeden, aynı koordinat düzleminde boş BodyGraph üzerinde (salt okunur)."}</p>
              </div>
              <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setView(null)}>Kapat</button>
            </div>
            <div className={base.split} style={{ marginTop: 12 }}>
              <div className={css.stageCard}>
                <AnnotationStage state={view.state} front={view.state.front ?? null} els={view.els} tool="none" color="red" width={4} selectedId={null}
                  interactive={false} openBubbleId={openBubble} onBubble={setOpenBubble} />
              </div>
              <aside>
                <h3 className={base.h2}>İçerik ({view.els.length} öğe)</h3>
                <p className={css.hint}>{(["pen", "arrow", "circle", "bubble", "text"] as const).map((t) => `${TYPE_LABEL[t]}: ${view.els.filter((x) => x.t === t).length}`).join(" · ")}</p>
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
          </section>
        ) : null}

        {del ? (
          <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-del" data-ann-owner-confirm>
            <div className={css.mdl}>
              <h2 id="ann-del">Katman kaldırılsın mı?</h2>
              <p><b>{del.trainerName}</b> eğitmeninin <b>{del.sourceTitle}</b> haritasındaki {del.elCount} öğelik çizim / not katmanı kalıcı olarak silinir.</p>
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
      </div>
    </div>
  );
}

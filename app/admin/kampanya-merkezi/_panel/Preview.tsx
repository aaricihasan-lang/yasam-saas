"use client";

// Canlı ziyaretçi önizlemesi — yalnız Owner ekranında, kaydedilmemiş taslaktan çizilir. Etkileşimsiz (inert); ziyaretçiye
// hiçbir şey yayımlamaz. Kontenjan bugünkü GERÇEK sayaçlardan hesaplanır.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MODULE_UI, imageSrc, techniqueUi } from "@/lib/campaign/catalogUi";
import { STATUS_LABEL, effective, fieldsOf, fmtDT, selectedOf, techUsage, type Status } from "./model";
import { VisitorCampaignView, type VisitorView } from "@/app/_campaign/VisitorCampaignView";
import type { PanelCtx } from "./KampanyaPanel";

export function PreviewPanel({ ctx }: { ctx: PanelCtx }) {
  const { d, nowMs } = ctx;
  const [device, setDevice] = useState<"masaustu" | "telefon">("masaustu");
  const [override, setOverride] = useState<Status | "">("");
  const f = fieldsOf(d);
  const e = effective({ status: ctx.cur.status, undated: f.undated, starts_at: f.starts_at, ends_at: f.ends_at }, nowMs);
  const st = override || e.st;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const fr = frame.current, cv = canvas.current;
    if (!fr || !cv) return;
    const fit = () => {
      const pe = fr.parentElement;
      if (!pe) return;
      const cs = getComputedStyle(pe);
      const avail = pe.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const w = cv.offsetWidth;
      const target = device === "telefon" ? Math.min(avail, 340) : avail;
      const fw = Math.floor(Math.min(target, w));
      const s = fw / w;
      cv.style.transform = `scale(${s})`;
      fr.style.width = `${fw}px`;
      fr.style.height = `${Math.ceil(cv.offsetHeight * s)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    if (fr.parentElement) ro.observe(fr.parentElement);
    return () => ro.disconnect();
  });

  return (
    <div className="card">
      <div className="pvHead">
        <div><p className="eyebrow">Canlı ziyaretçi önizlemesi</p><h2 className="h2" style={{ fontSize: 18 }}>Ana sayfa · {STATUS_LABEL[st]}</h2></div>
        <div className="seg" role="group" aria-label="Cihaz">
          <button aria-pressed={device === "masaustu"} onClick={() => setDevice("masaustu")}>Masaüstü</button>
          <button aria-pressed={device === "telefon"} onClick={() => setDevice("telefon")}>Telefon</button>
        </div>
      </div>
      <div className="seg" role="group" aria-label="Önizlenen durum" style={{ marginBottom: 10 }}>
        <button aria-pressed={!override} onClick={() => setOverride("")}>Gerçek ({STATUS_LABEL[e.st]})</button>
        {(["kapali", "yakinda", "aktif"] as Status[]).map((s) => <button key={s} aria-pressed={override === s} onClick={() => setOverride(s)}>{STATUS_LABEL[s]}</button>)}
      </div>
      <div className="pvFrame" id="pvFrame" ref={frame} aria-hidden="true" inert>
        <div className="pvCanvas" id="pvCanvas" ref={canvas} style={{ width: device === "telefon" ? 390 : 1280 }}>
          <Visitor ctx={ctx} st={st} />
        </div>
      </div>
      <p className="pvNote">Önizleme ana sayfanın üst bölümünü kaydedilmemiş taslaktan gösterir. Ziyaretçi sayfası KM-3&apos;te bağlanacak; bu önizleme hiçbir şey yayımlamaz.</p>
    </div>
  );
}

/** Taslak → ziyaretçi görünüm modeli. Yalnız ziyaretçiye GERÇEKTEN bağlı teknikler (visitorReady) gösterilir — canlı sayfayla aynı. */
function draftView(ctx: PanelCtx, st: Status): VisitorView {
  const { d, cat, ov, cur } = ctx;
  const sel = selectedOf(d, cat).filter((x) => (x.e as { visitorReady?: boolean }).visitorReady === true);
  const by: VisitorView["modules"] = [];
  for (const x of sel) {
    let g = by.find((b) => b.module === x.e.module);
    if (!g) by.push((g = { module: x.e.module, title: MODULE_UI[x.e.module].title, visitorShort: MODULE_UI[x.e.module].visitorShort, img: MODULE_UI[x.e.module].img, techniques: [] }));
    const ui = techniqueUi(x.e.key);
    g.techniques.push({
      key: x.e.key,
      name: ui.visitorName || x.e.title,
      small: x.e.package ? "Altı özellik tek pakette — kayıt gerekmez" : ui.form,
      remaining: Math.max(0, x.s.daily - techUsage(ov.usageToday, cur.id, x.e.key).an),
      total: x.s.daily,
      ipDaily: x.s.ip,
      features: x.e.package ? x.e.package.features.map((f) => f.name) : undefined,
    });
  }
  const startIso = !d.undated ? fieldsOf(d).starts_at : null;
  return {
    state: st,
    slogan: d.slogan,
    altSlogan: d.alt,
    description: d.description,
    affirmation: d.affirmation,
    ctaText: d.ctaText,
    imageSrc: imageSrc(d.image),
    startsLabel: startIso && Date.parse(startIso) > ctx.nowMs ? fmtDT(startIso) : null,
    modules: by,
  };
}

function Visitor({ ctx, st }: { ctx: PanelCtx; st: Status }) {
  return <VisitorCampaignView v={draftView(ctx, st)} />;
}

export function KbModal({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    box.current?.querySelector<HTMLButtonElement>("#kbClose")?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
        return;
      }
      if (ev.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button")];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modalBack" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kbT" aria-describedby="kbD" ref={box}>
        <p className="eyebrow">Uzmanlara özel · Profesyonel üyelik</p>
        <h3 id="kbT">Kişisel Bilgi Bankası</h3>
        <p id="kbD">Eğitim notlarınızı ve kendi bilgi birikiminizi size özel Bilgi Bankanıza kaydedin. Yaşam Sistemi, danışanınızın haritasındaki ilgili <b>tip, otorite, profil, tanım, merkez, kanal ve kapılara</b> ait kendi notlarınızı otomatik olarak önünüze getirsin.</p>
        <ul className="kbList">
          <li><b>Uzmanlara özel:</b> profesyonel üyelikle kullanılır.</li>
          <li><b>Notlarınız gizli kalır:</b> yalnız sizin hesabınızda görünür, başka kimseyle paylaşılmaz.</li>
          <li><b>Eğitim notları sizindir:</b> içerik size aittir; isterseniz kendi raporunuza eklersiniz.</li>
          <li><b>Zaman kazandırır:</b> aynı notları her analizde yeniden aramanız gerekmez.</li>
        </ul>
        <p className="small muted">Merkezler tanımlı, tanımsız ve tamamen açık durumlarıyla ayrı eşleşir. (Önizleme — ziyaretçiye KM-3&apos;te gösterilecek.)</p>
        <div className="modalActions"><button className="btn" id="kbClose" onClick={onClose}>Kapat</button></div>
      </div>
    </div>
  );
}

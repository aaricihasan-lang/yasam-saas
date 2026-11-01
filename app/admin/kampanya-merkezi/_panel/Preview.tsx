"use client";

// Canlı ziyaretçi önizlemesi — yalnız Owner ekranında, kaydedilmemiş taslaktan çizilir. Etkileşimsiz (inert); ziyaretçiye
// hiçbir şey yayımlamaz. Kontenjan bugünkü GERÇEK sayaçlardan hesaplanır.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CampaignModule } from "@/lib/campaign/catalog";
import { MODULE_UI, imageSrc, techniqueUi } from "@/lib/campaign/catalogUi";
import { STATUS_LABEL, effective, fieldsOf, fmt, fmtDT, selectedOf, techUsage, type Status } from "./model";
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

function Visitor({ ctx, st }: { ctx: PanelCtx; st: Status }) {
  const { d, cat } = ctx;
  const sel = selectedOf(d, cat);
  const header = (
    <div className="vzHeader">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="brandPlate"><img src="/premium/brand/yasam-sistemi-logo.webp" alt="Yaşam Sistemi" width={127} height={36} /></span>
      <nav className="vzNav" aria-label="Sayfa bölümleri">{st === "aktif" && sel.length ? <span className="on">Ücretsiz Analiz</span> : null}<span>Modüller</span><span>Mobil Uygulama</span><span>Güvenlik</span></nav>
      <div className="vzHActions"><span className="vzLogin">Giriş</span><span className="vzBtn sm vzGold">3 Gün Ücretsiz Deneyin</span></div>
    </div>
  );
  const hero = (compact: boolean) => (
    <section className="vzHero">
      <div>
        <p className="vzEyebrow">Profesyoneller için tek merkez</p>
        <h1 className="vzH1">Danışan, analiz ve seans süreçlerinizi <em>tek merkezden yönetin</em></h1>
        {!compact && <p className="vzSub">Danışan kayıtlarından yaşam analizlerine, seans takibinden içerik ve raporlama araçlarına kadar tüm süreçlerinizi Yaşam Sistemi ile daha düzenli, daha verimli ve daha anlamlı bir şekilde yönetin.</p>}
        <div className="vzCtaRow"><span className="vzBtn">3 Gün Ücretsiz Deneyin →</span><span className="vzBtn glass">Test Hesabını İncele</span></div>
        <ul className="vzTrust"><li>Kredi kartı gerekmez</li><li>Yönetici onayıyla başlar</li><li>3 gün ücretsiz keşif</li></ul>
      </div>
      <div className="vzScene" style={{ backgroundImage: "url('/premium/landing/hero-sahne.webp')" }} aria-hidden="true" />
    </section>
  );
  let body: React.ReactNode;
  if (st === "kapali" || (st === "aktif" && !sel.length)) body = hero(false);
  else if (st === "yakinda") {
    const mods = [...new Set(sel.map((x) => MODULE_UI[x.e.module].title))];
    const startIso = !d.undated ? fieldsOf(d).starts_at : null;
    const dateLine = startIso && Date.parse(startIso) > ctx.nowMs ? `Açılış: ${fmtDT(startIso)}.` : "";
    body = (
      <>
        <div className="vzSoon" data-state="yakinda">
          <span className="vzSoonBadge">✦ YAKINDA</span>
          <div>
            <h3>{d.slogan || "Yeni ücretsiz analiz kampanyası"}</h3>
            {d.alt && <p className="vzSoonAlt">{d.alt}</p>}
            {(dateLine || d.affirmation) && <p>{dateLine}{dateLine && d.affirmation ? " " : ""}{d.affirmation && <em>{d.affirmation}</em>}</p>}
            {mods.length > 0 && <div className="vzSoonMods">{mods.map((m) => <span className="tag" key={m}>{m}</span>)}</div>}
          </div>
          <span className="vzBtn sm" aria-disabled="true">Yakında açılıyor</span>
        </div>
        {hero(true)}
      </>
    );
  } else body = <CampaignSection ctx={ctx} />;
  return <div className="vz" data-vz-state={st}><div className="vzWrap">{header}{body}</div></div>;
}

function CampaignSection({ ctx }: { ctx: PanelCtx }) {
  const { d, cat, ov, cur } = ctx;
  const sel = selectedOf(d, cat);
  const img = imageSrc(d.image);
  const by: { m: CampaignModule; items: typeof sel }[] = [];
  sel.forEach((x) => {
    let g = by.find((b) => b.m === x.e.module);
    if (!g) by.push((g = { m: x.e.module, items: [] }));
    g.items.push(x);
  });
  return (
    <section className="vzCamp" id="ucretsiz-analiz" aria-labelledby="vzCampT">
      <div className={`vzCampHead ${img ? "hasImg" : ""}`}>
        <div>
          <p className="vzEyebrow">Ücretsiz analiz · sınırlı kontenjan</p>
          <h2 className="vzCampTitle" id="vzCampT">{d.slogan || "Kampanya sloganı"}</h2>
          {d.alt && <p className="vzAlt">{d.alt}</p>}
          {d.description && <p className="vzSub">{d.description}</p>}
          {d.affirmation && <p className="vzAff">{d.affirmation}</p>}
          <ul className="vzFree"><li>Kayıt gerekmez</li><li>Kredi kartı yok</li><li>Gerçek profesyonel hesaplama</li></ul>
          <div className="vzCtaRow"><span className="vzBtn">{d.ctaText || "Ücretsiz Analizi Başlat"} →</span></div>
        </div>
        {img && <div className="vzCampImg" style={{ backgroundImage: `url('${img}')` }} aria-hidden="true" />}
      </div>
      <div className="vzModTitle"><h3>Bugün ücretsiz açık analizler</h3></div>
      <div className={`vzMods n${by.length}`}>
        {by.map((g) => {
          const remain = g.items.reduce((a, x) => a + Math.max(0, x.s.daily - techUsage(ov.usageToday, cur.id, x.e.key).an), 0);
          const total = g.items.reduce((a, x) => a + x.s.daily, 0);
          const ip = Math.max(...g.items.map((x) => x.s.ip));
          const pkg = g.items.find((x) => x.e.package);
          return (
            <article className="vzMod" key={g.m}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div className="vzModTop"><img src={MODULE_UI[g.m].img} alt="" aria-hidden="true" /><div><h3 className="vzModName">{MODULE_UI[g.m].title}</h3><span>{MODULE_UI[g.m].visitorShort}</span></div></div>
              {pkg?.e.package && <ul className="vzPkg" aria-label="Kozmik Takvim içeriği">{pkg.e.package.features.map((f) => <li key={f.id}>{f.name}</li>)}</ul>}
              <ul className="vzTechs">
                {g.items.map((x) => {
                  const ui = techniqueUi(x.e.key);
                  return (
                    <li key={x.e.key}>
                      <span className="vzTech">
                        <span><b>{ui.visitorName || x.e.title}</b><small>{x.e.package ? "Altı özellik tek pakette — kayıt gerekmez" : ui.form}</small></span>
                        <span className="go">{x.e.package ? "Gir →" : "Başla →"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="vzQuota">
                <div className="row"><span>Bugünkü ücretsiz kontenjan</span><b>{remain ? `${fmt(remain)} / ${fmt(total)}` : "Bugün doldu"}</b></div>
                <div className="track"><div className="fill" style={{ width: `${total ? (remain / total) * 100 : 0}%` }} /></div>
                <div className="row"><span>Kişi başı günlük hak: {ip} {pkg ? "kullanım" : "analiz"}</span></div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="vzFoot"><p><b>Danışanlarınızla profesyonel çalışıyor musunuz?</b> Danışan arşivi, kendi Bilgi Bankanız, yorumlu raporlar ve tüm teknikler profesyonel üyelikte.</p><span className="vzBtn sm glass">Profesyonel üyeliği incele</span></div>
      <p className="vzPrivacy">Girdiğiniz bilgiler yalnız bu analiz için kullanılır ve kısa süre sonra silinir (süre Owner kararı bekliyor). Kötüye kullanımı önlemek için bağlantı bilgileri şifrelenmiş olarak sayılır. Ayrıntılar Gizlilik Politikası&apos;nda.</p>
    </section>
  );
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

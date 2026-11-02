// Kampanya Merkezi — ZİYARETÇİ GÖRÜNÜMÜ (ortak sunum bileşeni). Hem gerçek ziyaretçi sayfası (/ucretsiz-analiz) hem Owner
// panelindeki önizleme BU bileşeni kullanır → önizleme ile canlı görünüm aynıdır. Hook / veri erişimi yok; yalnız props.
// Stil: app/admin/kampanya-merkezi/kampanya.module.css (.km kökü altında .vz* sınıfları; KM-P0 v2 onaylı tasarım).
import type { ReactNode } from "react";

export type VisitorViewTechnique = {
  key: string;
  name: string;
  small: string;
  remaining: number;
  total: number;
  ipDaily: number;
  features?: string[];
};
export type VisitorViewModule = { module: string; title: string; visitorShort: string; img: string; techniques: VisitorViewTechnique[] };
export type VisitorView = {
  state: "kapali" | "yakinda" | "aktif";
  slogan: string;
  altSlogan: string;
  description: string;
  affirmation: string;
  ctaText: string;
  imageSrc: string | null;
  startsLabel: string | null;
  modules: VisitorViewModule[];
};

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function VisitorHeader({ highlight, right }: { highlight: boolean; right?: ReactNode }) {
  return (
    <div className="vzHeader">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="brandPlate"><img src="/premium/brand/yasam-sistemi-logo.webp" alt="Yaşam Sistemi" width={127} height={36} /></span>
      <nav className="vzNav" aria-label="Sayfa bölümleri">{highlight ? <span className="on">Ücretsiz Analiz</span> : null}<span>Modüller</span><span>Mobil Uygulama</span><span>Güvenlik</span></nav>
      <div className="vzHActions">{right ?? <><span className="vzLogin">Giriş</span><span className="vzBtn sm vzGold">3 Gün Ücretsiz Deneyin</span></>}</div>
    </div>
  );
}

export function VisitorHero({ compact }: { compact: boolean }) {
  return (
    <section className="vzHero">
      <div>
        <p className="vzEyebrow">Profesyoneller için tek merkez</p>
        <h1 className="vzH1">Danışan, analiz ve seans süreçlerinizi <em>tek merkezden yönetin</em></h1>
        {!compact && <p className="vzSub">Danışan kayıtlarından yaşam analizlerine, seans takibinden içerik ve raporlama araçlarına kadar tüm süreçlerinizi Yaşam Sistemi ile daha düzenli, daha verimli ve daha anlamlı bir şekilde yönetin.</p>}
        <ul className="vzTrust"><li>Kredi kartı gerekmez</li><li>Yönetici onayıyla başlar</li><li>3 gün ücretsiz keşif</li></ul>
      </div>
      <div className="vzScene" style={{ backgroundImage: "url('/premium/landing/hero-sahne.webp')" }} aria-hidden="true" />
    </section>
  );
}

export function VisitorSoon({ v }: { v: VisitorView }) {
  return (
    <div className="vzSoon" data-state="yakinda">
      <span className="vzSoonBadge">✦ YAKINDA</span>
      <div>
        <h3>{v.slogan || "Yeni ücretsiz analiz kampanyası"}</h3>
        {v.altSlogan && <p className="vzSoonAlt">{v.altSlogan}</p>}
        {(v.startsLabel || v.affirmation) && <p>{v.startsLabel ? `Açılış: ${v.startsLabel}.` : ""}{v.startsLabel && v.affirmation ? " " : ""}{v.affirmation && <em>{v.affirmation}</em>}</p>}
        {v.modules.length > 0 && <div className="vzSoonMods">{v.modules.map((m) => <span className="tag" key={m.module}>{m.title}</span>)}</div>}
      </div>
      <span className="vzBtn sm" aria-disabled="true">Yakında açılıyor</span>
    </div>
  );
}

/**
 * Kampanya bölümü. `onPick` verilirse teknik satırları düğme olur (gerçek sayfa); verilmezse etkileşimsiz (önizleme).
 * `children`: seçilen tekniğin formu / sonucu (gerçek sayfa) — modül kartlarının altında gösterilir.
 */
export function VisitorCampaignSection({ v, onPick, selected, onCta, children }: { v: VisitorView; onPick?: (key: string) => void; selected?: string | null; onCta?: () => void; children?: ReactNode }) {
  return (
    <section className="vzCamp" id="ucretsiz-analiz" aria-labelledby="vzCampT">
      <div className={`vzCampHead ${v.imageSrc ? "hasImg" : ""}`}>
        <div>
          <p className="vzEyebrow">Ücretsiz analiz · sınırlı kontenjan</p>
          <h2 className="vzCampTitle" id="vzCampT">{v.slogan || "Kampanya sloganı"}</h2>
          {v.altSlogan && <p className="vzAlt">{v.altSlogan}</p>}
          {v.description && <p className="vzSub">{v.description}</p>}
          {v.affirmation && <p className="vzAff">{v.affirmation}</p>}
          <ul className="vzFree"><li>Kayıt gerekmez</li><li>Kredi kartı yok</li><li>Gerçek profesyonel hesaplama</li></ul>
          <div className="vzCtaRow">
            {onCta ? <button type="button" className="vzBtn" onClick={onCta}>{v.ctaText || "Ücretsiz Analizi Başlat"} →</button> : <span className="vzBtn">{v.ctaText || "Ücretsiz Analizi Başlat"} →</span>}
          </div>
        </div>
        {v.imageSrc && <div className="vzCampImg" style={{ backgroundImage: `url('${v.imageSrc}')` }} aria-hidden="true" />}
      </div>
      <div className="vzModTitle"><h3>Bugün ücretsiz açık analizler</h3></div>
      {v.modules.length === 0 ? (
        <p className="vzSub" style={{ padding: "0 4px" }}>Şu anda açık analiz yok.</p>
      ) : (
        <div className={`vzMods n${v.modules.length}`} id="vzMods">
          {v.modules.map((g) => {
            const remain = g.techniques.reduce((a, t) => a + t.remaining, 0);
            const total = g.techniques.reduce((a, t) => a + t.total, 0);
            const ip = Math.max(...g.techniques.map((t) => t.ipDaily));
            const pkg = g.techniques.find((t) => t.features?.length);
            return (
              <article className="vzMod" key={g.module} data-module={g.module}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="vzModTop"><img src={g.img} alt="" aria-hidden="true" /><div><h3 className="vzModName">{g.title}</h3><span>{g.visitorShort}</span></div></div>
                {pkg?.features && <ul className="vzPkg" aria-label={`${g.title} içeriği`}>{pkg.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                <ul className="vzTechs">
                  {g.techniques.map((t) => {
                    const inner = (
                      <>
                        <span><b>{t.name}</b><small>{t.small}</small></span>
                        <span className="go">{t.remaining > 0 ? (t.features?.length ? "Gir →" : "Başla →") : "Doldu"}</span>
                      </>
                    );
                    return (
                      <li key={t.key}>
                        {onPick ? (
                          <button type="button" className="vzTech" data-technique={t.key} aria-pressed={selected === t.key} disabled={t.remaining <= 0} onClick={() => onPick(t.key)}>{inner}</button>
                        ) : (
                          <span className="vzTech">{inner}</span>
                        )}
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
      )}
      {children}
      <div className="vzFoot"><p><b>Danışanlarınızla profesyonel çalışıyor musunuz?</b> Danışan arşivi, kendi Bilgi Bankanız, yorumlu raporlar ve tüm teknikler profesyonel üyelikte.</p><a className="vzBtn sm glass" href="/register">Profesyonel üyeliği incele</a></div>
      <p className="vzPrivacy">Girdiğiniz bilgiler yalnız bu analizi hesaplamak için kullanılır; kaydedilmez ve analiz bittiğinde sunucuda tutulmaz. Kötüye kullanımı önlemek için bağlantı bilgileriniz yalnız günlük değişen, geri çözülemez bir özet olarak sayılır (30 gün sonra silinir); otomatik kötüye kullanıma karşı Cloudflare Turnstile güvenlik doğrulaması kullanılır. Ziyaret istatistikleri kişisel veri içermeyen toplu sayaçlardır. Ayrıntılar <a href="/gizlilik-politikasi">Gizlilik Politikası</a>&apos;nda.</p>
    </section>
  );
}

/** Tam görünüm (başlık + duruma göre gövde). Gerçek sayfa `section` slot'unu kendi etkileşimli bölümüyle değiştirir. */
export function VisitorCampaignView({ v, section, headerRight }: { v: VisitorView; section?: ReactNode; headerRight?: ReactNode }) {
  let body: ReactNode;
  if (v.state === "kapali" || (v.state === "aktif" && v.modules.length === 0)) body = <VisitorHero compact={false} />;
  else if (v.state === "yakinda") body = <><VisitorSoon v={v} /><VisitorHero compact /></>;
  else body = section ?? <VisitorCampaignSection v={v} />;
  return <div className="vz" data-vz-state={v.state}><div className="vzWrap"><VisitorHeader highlight={v.state === "aktif" && v.modules.length > 0} right={headerRight} />{body}</div></div>;
}

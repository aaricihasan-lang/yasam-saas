"use client";

import Link from "next/link";
import { runInEffect } from "@/lib/runInEffect";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FileText, Sprout } from "lucide-react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { fetchOilCounts } from "@/lib/aromaterapi/aromatherapyData";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import { useToast } from "@/components/ui/ToastProvider";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getDemoOilStats } from "@/lib/demo/demoAromaterapi";
import { AromaterapiBreadcrumb } from "@/app/aromaterapi/_components/AromaterapiBreadcrumb";
import { AROMATERAPI_HUB_MODULES } from "@/lib/aromaterapi/aromaterapiModules";
import styles from "./aromaterapiHub.module.css";

type OilStats = {
  total: number;
  essential: number;
  carrier: number;
  maceration: number;
  other: number;
};

// 2026-10-18 premium görünüm (owner onaylı prototip eee0af3) — yalnız görsel eşleme: registry kimliği → görsel + ton.
// Eşleşmeyen (gelecekte eklenecek) bölüm varsayılan amber tonla ve görselsiz çizilir.
const PREMIUM_ASSET = "/premium/aromaterapi";
const CARD_VISUAL: Record<string, { art: string; w: number; h: number; tone: string }> = {
  yaglar: { art: "yaglar", w: 175, h: 152, tone: "amber" },
  karisimlar: { art: "karisimlar", w: 229, h: 192, tone: "sky" },
  "bilgi-kayitlari": { art: "bilgi-kayitlari", w: 219, h: 192, tone: "mint" },
  kaynaklar: { art: "kaynaklar", w: 194, h: 166, tone: "lilac" },
  katalog: { art: "bitki-katalog", w: 212, h: 166, tone: "teal" },
  "bilgi-bankasi": { art: "bilgi-bankasi", w: 243, h: 168, tone: "rose" },
};

const TILT_MAX_X = 2;
const TILT_MAX_Y = 2.6;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py"];

/** Hover'da ~2–3° eğim + görsel parallax'ı (dokunmatik / "hareketi azalt" açıkken yok). Yalnız görsel. */
function onTiltMove(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const px = Math.min(Math.max((e.clientX - r.left) / r.width - 0.5, -0.5), 0.5);
  const py = Math.min(Math.max((e.clientY - r.top) / r.height - 0.5, -0.5), 0.5);
  el.dataset.tilting = "true";
  el.style.setProperty("--rx", `${(-py * 2 * TILT_MAX_X).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${(px * 2 * TILT_MAX_Y).toFixed(2)}deg`);
  el.style.setProperty("--px", px.toFixed(3));
  el.style.setProperty("--py", py.toFixed(3));
}

function onTiltLeave(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  delete el.dataset.tilting;
  for (const prop of TILT_PROPS) el.style.removeProperty(prop);
}

export default function AromaTerapiHubPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [stats, setStats] = useState<OilStats>(() =>
    isDemo
      ? getDemoOilStats()
      : { total: 0, essential: 0, carrier: 0, maceration: 0, other: 0 },
  );
  const [loading, setLoading] = useState(!isDemo);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isDemo) return;
    runInEffect(() => {
      void (async () => {
        setLoading(true);
        setErrorMsg("");
        const tenantId = await getSyncedTenantId();
        if (!tenantId) {
          setLoading(false);
          setErrorMsg("Oturum açmanız gerekiyor. Lütfen sayfayı yenileyin.");
          return;
        }

        // Sayaçlar güvenli server API'den tek çağrıda gelir (service_role;
        // PostgREST 1000 tavanından bağımsız gerçek toplam).
        const { counts, error } = await fetchOilCounts();

        setLoading(false);

        if (error || !counts) {
          setErrorMsg("İstatistikler yüklenemedi.");
          return;
        }

        const other = Math.max(
          0,
          counts.total - counts.essential - counts.carrier - counts.maceration,
        );
        setStats({ ...counts, other });
      })();
    });
  }, [isDemo]);

  useBfcacheRefresh();

  const { showToast } = useToast();
  const [exportingGeneral, setExportingGeneral] = useState(false);
  async function exportGeneralWord() {
    if (exportingGeneral) return;
    setExportingGeneral(true);
    const { ok, error } = await downloadWord("/api/aromaterapi/word-report", {});
    setExportingGeneral(false);
    if (ok) showToast({ title: "Word hazırlandı", message: "Aromaterapi genel katalog raporu indiriliyor.", type: "success" });
    else showToast({ title: "Word oluşturulamadı", message: error ?? "Rapor oluşturulamadı.", type: "error" });
  }

  const statTiles = [
    { label: "Toplam", value: stats.total, tone: "ink" },
    { label: "Uçucu", value: stats.essential, tone: "amber" },
    { label: "Sabit", value: stats.carrier, tone: "teal" },
    { label: "Maserasyon", value: stats.maceration, tone: "rose" },
    { label: "Diğer", value: stats.other, tone: "violet" },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <AromaterapiBreadcrumb className="mb-1.5" />

        {isDemo ? (
          <div className="mb-3">
            <DemoModuleBanner message="Aromaterapi modülü demo hesabı için temsili verilerle gösterilmektedir. İçerikler görüntülenebilir; düzenleme ve yeni kayıt işlemleri demo hesabında çalışmaz." />
          </div>
        ) : null}

        <section className={styles.hero} aria-labelledby="aromaterapi-hub-title">
          <div>
            <p className={styles.heroBadge}>
              <Sprout className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
              Terapötik Yağ Kütüphanesi
            </p>
            <h1 id="aromaterapi-hub-title" className={styles.heroTitle}>
              Aromaterapi Merkezi
            </h1>
            <p className={styles.heroSub}>
              Uçucu, sabit ve maserasyon yağı kütüphaneleri, karışım oluşturucu, kaynaklar ve bilgi kayıtları.
              Profesyonel referans ve çalışma merkezi.
            </p>
          </div>
          <div className={styles.heroArt} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${PREMIUM_ASSET}/hero-sahne.webp`} width={350} height={234} alt="" decoding="async" draggable={false} />
          </div>
          <div className={styles.heroPanel}>
            {!isDemo && (
              <button
                type="button"
                onClick={() => void exportGeneralWord()}
                disabled={exportingGeneral}
                className={styles.wordBtn}
                title="Tüm Aromaterapi kaynaklarını tek profesyonel Word dosyasında indir"
              >
                <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                <span>{exportingGeneral ? "Hazırlanıyor…" : "Aromaterapi Kataloğunu Word'e Aktar"}</span>
              </button>
            )}
            <ul className={styles.counts} aria-label="Yağ türü sayaçları">
              {statTiles.map((s) => (
                <li key={s.label} className={styles.count} data-tone={s.tone}>
                  <strong>{loading ? "—" : s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {errorMsg ? <div className={styles.alert}>{errorMsg}</div> : null}

        {/* Bölüm kartları — tek registry'den üretilir (hard-code YOK). */}
        <section className={styles.cards} aria-label="Aromaterapi bölümleri">
          {AROMATERAPI_HUB_MODULES.map((module) => {
            const visual = CARD_VISUAL[module.id];
            const badge = module.id === "yaglar" && !loading ? `${stats.total} yağ` : undefined;
            const preparing = module.status === "preparing";
            return (
              <Link
                key={module.id}
                href={module.href}
                className={styles.card}
                data-tone={visual?.tone ?? "amber"}
                onPointerMove={onTiltMove}
                onPointerLeave={onTiltLeave}
              >
                {visual ? (
                  <span className={styles.cardArt} aria-hidden>
                    <span className={styles.artLayer}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${PREMIUM_ASSET}/${visual.art}.webp`}
                        width={visual.w}
                        height={visual.h}
                        alt=""
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                    <span className={styles.sheen} />
                  </span>
                ) : null}
                {badge || preparing ? (
                  <span className={styles.badges}>
                    {badge ? <span className={styles.countBadge}>{badge}</span> : null}
                    {preparing ? <span className={styles.soonBadge}>Yakında</span> : null}
                  </span>
                ) : null}
                <span className={styles.cardBody}>
                  <span className={styles.cardIcon} aria-hidden>
                    {visual ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${PREMIUM_ASSET}/ic-${visual.art}.webp`} width={60} height={58} alt="" decoding="async" draggable={false} />
                    ) : (
                      <span className="text-3xl">{module.icon}</span>
                    )}
                  </span>
                  <h2 className={styles.cardTitle}>{module.label}</h2>
                  <p className={styles.cardDesc}>{module.description}</p>
                  {module.facets && module.facets.length > 0 ? (
                    <ul className={styles.tags}>
                      {module.facets.map((facet) => (
                        <li key={facet.href}>{facet.label}</li>
                      ))}
                    </ul>
                  ) : null}
                </span>
                <span className={styles.cardStrip} aria-hidden />
              </Link>
            );
          })}
        </section>

        <footer className={styles.footNote}>
          <Sprout className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
          <p>
            Aromaterapi Merkezi — yağ kütüphanesi, karışım oluşturucu ve kaynak temelli bilgi sistemi. Bölümler
            hazırlandıkça bu merkezden açılır.
          </p>
        </footer>
      </div>
    </main>
  );
}

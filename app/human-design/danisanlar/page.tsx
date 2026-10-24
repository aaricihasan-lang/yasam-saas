"use client";

// HUMAN DESIGN ÇALIŞMA ALANI — Human Design'daki TEK danışan listesi (route korunur: /human-design/danisanlar).
//   • 2026-10-20 premium görünüm (owner GÖRSEL PASS prototipi human-design-calisma-alani): iki alan yan yana —
//     "Yeni Hesaplama" (HdClientForm; alanlar, doğrulama, mükerrer kontrolü ve tek eylemli analiz aynen) ve
//     "Danışan Listesi" (HdAnalysisGroupList; tek liste + tek arama, Türkçe alfabetik). Altında "Hızlı İşlemler"
//     mevcut modüllere bağlantıdır (İlişki ve Grup Analizleri, Günün ve Kişisel Transitleri).
//   • "Detayı Aç" kayıtlı profesyonel haritayı doğrudan açar; analiz geçmişi ve TEK "Sil" aynı pencerede.
//   • "Danışanı Oluştur ve Analiz Et" danışanı oluşturur, haritayı hesaplar ve profesyonel haritayı DOĞRUDAN açar.
//     Kayıt sonrası liste HD_CHART_SAVED_EVENT ile sunucudan yenilenir.
//   • "Tüm liste" yalnız görünümü değiştirir: form gizlenir ama bağlı kalır (girilen bilgiler kaybolmaz).
//   • Connection / Penta analizleri danışan listesine eklenmez (İlişki ve Grup Analizleri'nde tutulur).

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Link2, List, Orbit, UserPlus, Users, UsersRound, Zap } from "lucide-react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientForm, type HdAnalyzedResult } from "./components/HdClientForm";
import { HdAnalysisGroupList } from "./components/HdAnalysisGroupList";
import { HdComputedChartModal } from "../kayitli-haritalar/components/HdComputedChartModal";
import { HdEduAnalysisBanner } from "../kayitli-haritalar/components/HdEduAnalysisBanner";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import s from "@/app/_premium/human-design/calismaAlani.module.css";

export default function HdHesaplamaPage() {
  useBfcacheRefresh();
  const { showToast } = useToast();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [full, setFull] = useState(false);
  const [analyzed, setAnalyzed] = useState<HdAnalyzedResult | null>(null);
  const onlyList = full || isDemo;

  return (
    <main className={`${s.page} ${energyFontVars}`}>
      <div className={s.inner}>
        {isDemo && (
          <DemoModuleBanner className="mb-3" message="Human Design demo hesabında görüntüleme modundadır. Yeni danışan ekleme, düzenleme ve hesaplama yapılamaz." />
        )}
        <header className={s.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.heroL} src="/premium/human-design/hero-sol.webp" width={532} height={254} alt="" aria-hidden decoding="async" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.heroR} src="/premium/human-design/hero-sag.webp" width={510} height={254} alt="" aria-hidden decoding="async" draggable={false} />
          <div className={s.heroBody}>
            <p className={s.eyebrow}>YAŞAM SİSTEMİ · HUMAN DESIGN</p>
            <h1 className={s.title}>Human Design Çalışma Alanı</h1>
            <p className={s.sub}>Yeni analiz oluşturun veya kayıtlı danışanlarınızla çalışın.</p>
          </div>
        </header>

        <HdEduAnalysisBanner chartId={analyzed?.chartId ?? null} />

        <div className={`${s.work} ${onlyList ? s.onlyList : ""}`}>
          {!isDemo ? (
            <section className={s.panel} aria-label="Yeni Hesaplama" hidden={full} id="hd-new-client-panel" data-hd-workspace-client>
              <div className={s.pHead}>
                <span className={s.pIcon} aria-hidden>
                  <UserPlus className="h-[22px] w-[22px]" strokeWidth={2} />
                </span>
                <div className={s.pTxt}>
                  <h2>Yeni Hesaplama</h2>
                  <p>Yeni bireysel analiz başlat.</p>
                </div>
              </div>
              <HdClientForm onAnalyzed={(r) => setAnalyzed(r)} />
            </section>
          ) : null}

          <HdAnalysisGroupList
            full={onlyList}
            head={
              <div className={s.pHead}>
                <span className={`${s.pIcon} ${s.pBlue}`} aria-hidden>
                  <Users className="h-[22px] w-[22px]" strokeWidth={2} />
                </span>
                <div className={s.pTxt}>
                  <h2>Danışan Listesi</h2>
                  <p>Kayıtlı kişiler, detay ve yeni analiz işlemleri.</p>
                </div>
                {!isDemo ? (
                  <button type="button" className={s.link} onClick={() => { setFull((v) => !v); window.scrollTo(0, 0); }} aria-pressed={full} data-hd-list-full>
                    {full ? <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden /> : <List className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />}
                    {full ? "Çalışma alanına dön" : "Tüm liste"}
                  </button>
                ) : null}
              </div>
            }
          />
        </div>

        {!full ? (
          <section className={s.quick} aria-label="Hızlı İşlemler">
            <div className={s.qHead}>
              <span className={s.qIcon} aria-hidden>
                <Zap className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              <div>
                <h2>Hızlı İşlemler</h2>
                <p>Mevcut analiz modüllerine geçiş.</p>
              </div>
            </div>
            <div className={s.qBtns}>
              <Link href="/human-design/iliski-grup" className={s.q} data-hd-quick="connection">
                <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                Connection Başlat
              </Link>
              <Link href="/human-design/iliski-grup" className={s.q} data-hd-quick="penta">
                <UsersRound className="h-4 w-4" strokeWidth={2} aria-hidden />
                Penta Başlat
              </Link>
              <Link href="/human-design/transit" className={`${s.q} ${s.qWarm}`} data-hd-quick="transit">
                <Orbit className="h-4 w-4" strokeWidth={2} aria-hidden />
                Kişisel Transit
              </Link>
            </div>
          </section>
        ) : null}

        <p className={s.info}>
          <Info className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Connection ve Penta analizleri danışan listesine eklenmez; İlişki ve Grup Analizleri&apos;ndeki kayıtlı analiz listesinde tutulur.
        </p>
      </div>

      {analyzed ? (
        <HdComputedChartModal
          id={analyzed.chartId}
          profile={analyzed.hdClientId ? { hdClientId: analyzed.hdClientId, name: analyzed.name } : undefined}
          onClose={() => setAnalyzed(null)}
          onDeleted={() => setAnalyzed(null)}
          onProfileDeleted={(res) => {
            setAnalyzed(null);
            showToast({
              message: `Human Design kayıtları silindi: ${res.deletedAnalyses} analiz ve ${res.deletedReports} Word raporu. Danışan Yolculuğu ana kaydı korundu.`,
              type: "success",
            });
          }}
        />
      ) : null}
    </main>
  );
}

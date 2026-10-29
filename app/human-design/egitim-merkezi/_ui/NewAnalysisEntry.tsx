"use client";

/**
 * FAZ 13 (owner incelemesi) — "Yeni Human Design Analizi" giriş noktası.
 * Eğitmeni Yaşam Sistemi'nin MEVCUT gerçek analiz ekranına (Human Design Çalışma Alanı → "Yeni Hesaplama") götürür: aynı
 * doğum bilgisi formu, aynı doğrulama, aynı hesaplama hattı ve normal kayıt. Burada hesaplama / kayıt / ikinci bir motor YOK.
 * Analiz kaydedilince açılan haritadaki "Eğitim Arşivime Ekle" düğmesi mevcut izin + eğitim bilgisi adımlarına döner.
 * Hesaplama yetkisi (Human Design modül izni) yoksa düğme yetki VERMEZ; yalnız açıklama gösterir (sunucu ayrıca reddeder).
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readYasamUser } from "@/lib/auth/yasamUser";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";

export const NEW_ANALYSIS_HREF = "/human-design/danisanlar?egitim=1#hd-new-client-panel";

type Calc = "checking" | "ok" | "no-permission" | "demo";
const noop = () => () => {};

/** İstemci tarafı ön kontrol (yalnız görünüm): asıl yetki kararı hesaplama ucunda (requireModuleAccess "human_design"). */
function calcState(): Calc {
  const u = readYasamUser();
  if (!u) return "no-permission";
  if (u.is_demo_account) return "demo";
  if (u.role === "admin") return "ok";
  return u.module_permissions?.human_design === true ? "ok" : "no-permission";
}

export function NewAnalysisButton({ className }: { className?: string }) {
  // Sunucu çiziminde "checking"; istemcide oturumdaki kullanıcıdan (hidrasyon uyumsuzluğu yok).
  const s = useSyncExternalStore(noop, calcState, () => "checking" as Calc);
  if (s === "ok") {
    return (
      <Link className={className ?? `${base.btn} ${base.save} ${oz.touch}`} href={NEW_ANALYSIS_HREF} data-edu-new-analysis>
        Yeni Human Design Analizi
      </Link>
    );
  }
  return (
    <span className={oz.newAnalysisOff} data-edu-new-analysis-off={s}>
      <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} disabled aria-describedby="edu-new-analysis-why">Yeni Human Design Analizi</button>
      {s === "checking" ? null : (
        <small id="edu-new-analysis-why">
          {s === "demo"
            ? "Demo hesabında yeni Human Design hesaplaması yapılamaz."
            : "Yeni Human Design hesaplaması için Human Design modül izniniz yok. Bu izni yalnız platform yöneticisi verebilir; mevcut kayıtlı haritalarınızı eklemeye devam edebilirsiniz."}
        </small>
      )}
    </span>
  );
}

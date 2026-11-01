"use client";

/**
 * Gece operasyonu — ANA SAYFA kampanya alanı (premium hero'nun hemen altı). Owner önizlemesi ve /ucretsiz-analiz ile AYNI
 * sunum bileşeni + AYNI dönüştürücü (visitorView) → üç yüzeyde aynı içerik.
 *   Kapalı / ortam kapısı kapalı (404) / hata → HİÇBİR ŞEY çizilmez (normal ana sayfa; düzen kaymaz).
 *   Yakında → duyuru kartı.   Aktif → açık analiz kartları; teknik seçimi /ucretsiz-analiz?teknik=… sayfasına götürür
 *   (form, bot doğrulaması ve sonuç yalnız o sayfada; ana sayfa ek betik / CSP gerektirmez).
 * Durum her yüklemede /api/kampanya/durum'dan okunur → Owner içerik değişikliği için YENİDEN YAYIN GEREKMEZ.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VisitorCampaignState } from "@/lib/campaign/visitor/types";
import styles from "@/app/admin/kampanya-merkezi/kampanya.module.css";
import { VisitorCampaignSection, VisitorSoon } from "./VisitorCampaignView";
import { toVisitorView } from "./visitorView";

export default function HomeCampaignSection({ initial = null }: { initial?: VisitorCampaignState | null }) {
  const [state, setState] = useState<VisitorCampaignState | null>(initial);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetch("/api/kampanya/durum", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => (r.ok ? ((await r.json().catch(() => null)) as { ok?: boolean; state?: VisitorCampaignState } | null) : null))
      .then((b) => {
        if (alive) setState(b?.ok && b.state ? b.state : null);
      })
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(() => (state ? toVisitorView(state) : null), [state]);
  if (!view || view.state === "kapali" || (view.state === "aktif" && view.modules.length === 0)) return null;
  const go = (key?: string) => router.push(key ? `/ucretsiz-analiz?teknik=${encodeURIComponent(key)}` : "/ucretsiz-analiz");
  return (
    <div className={`${styles.km} ${styles.kmEmbed}`} data-home-campaign={view.state}>
      <div className="vz" data-vz-state={view.state}>
        <div className="vzWrap">
          {view.state === "yakinda" ? <VisitorSoon v={view} /> : <VisitorCampaignSection v={view} onPick={(k) => go(k)} onCta={() => go()} />}
        </div>
      </div>
    </div>
  );
}

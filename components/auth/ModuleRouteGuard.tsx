"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ModuleAccessDenied from "@/components/auth/ModuleAccessDenied";
import ModuleAccessPending from "@/components/auth/ModuleAccessPending";
import {
  evaluateRouteModuleGuard,
  findRouteModuleRule,
  isAdminOnlyRoutePath,
  type RouteModuleGuardDecision,
} from "@/lib/auth/routeModuleAccess";

/**
 * Guard kapsamındaki path: modül kuralı olan VEYA admin-only (ör. /ders-notu, /video-ceviri,
 * /yebs) path. Admin-only path'in modül kuralı olmasa da uzmana "Yetkiniz Bulunmuyor" gösterilir
 * (önceden kuralsız admin-only path "skip" ediliyor → /ders-notu kabuğu uzmanda açılıyordu).
 */
function isGuardedPath(path: string): boolean {
  return findRouteModuleRule(path) !== null || isAdminOnlyRoutePath(path);
}
import {
  backgroundSyncYasamUserFromDb,
  clearYasamUser,
  readYasamUser,
  syncYasamUserFromDb,
} from "@/lib/auth/yasamUser";
import { useStoredSessionGuard } from "@/hooks/useSessionGuard";
import { leaveAfterSessionEnd } from "@/lib/auth/sessionExit";

type ModuleRouteGuardProps = {
  children: ReactNode;
};

export default function ModuleRouteGuard({ children }: ModuleRouteGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [decision, setDecision] = useState<RouteModuleGuardDecision>("skip");
  const [denyReason, setDenyReason] = useState<"permission" | "membership" | "session">(
    "permission",
  );
  // K-1: Yetki DB ile kesinleşene kadar "deny" ekranı GÖSTERİLMEZ. Cache belirsizken
  // (henüz modül bilgisi senkronlanmamış) reddetmek yerine bekletiriz; böylece mobil
  // soğuk açılışta "Yetkiniz Bulunmuyor" ekranı yanıp sönmez.
  const [resolved, setResolved] = useState(false);
  // FLASH-GUARD (KAJ-P1-04): kararın HANGİ path için verildiğini izler. Modül-gate'li bir
  // route'ta karar bu path için verilene kadar children RENDER EDİLMEZ (aşağıdaki render
  // kapısı). Böylece hem soğuk açılış/direct-URL hem SPA navigasyonunda ilk paint'te
  // korumalı içerik "flash" edip sonra deny'a dönmez (izinsiz uzmana içerik sızıntısı yok).
  const [decidedPath, setDecidedPath] = useState<string | null>(null);

  // WEB P1: modül ve /admin sayfalarında oturum sunucuda sona erdiyse (süre dolumu / iptal)
  // kullanıcı 401'lerle sayfada takılmaz — durum temizlenir, neden taşınır ve ana sayfadaki
  // giriş akışına dönülür. Ana sayfa ("/") kendi useSessionGuard'ını kullanır.
  useStoredSessionGuard((pathname ?? "/") !== "/", (reason) => {
    clearYasamUser();
    // WT4: kaydedilmemiş-değişiklik (beforeunload) guard'ları bu çıkışı DURDURAMAZ → kullanıcı
    // oturumsuz hâlde formda kalıp "Yetki gerekli" hataları almaz.
    leaveAfterSessionEnd("/", reason, (href) => router.replace(href));
  });

  // WT4: aynı tarayıcının başka sekmesinde/penceresinde çıkış yapıldıysa (yasam_user silindi) bu
  // sayfa bayat oturumla çalışmaya devam etmez. Başka sekmede YENİDEN GİRİŞ de önce temizleyip
  // sonra yazdığından kısa bir bekleme sonrası hâlâ oturum yoksa giriş akışına dönülür.
  useEffect(() => {
    if ((pathname ?? "/") === "/" || !readYasamUser()) return;
    let timer: number | null = null;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== "yasam_user") return;
      if (readYasamUser()) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (readYasamUser()) return;
        leaveAfterSessionEnd("/", "revoked", (href) => router.replace(href));
      }, 1500);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pathname, router]);

  useEffect(() => {
    let cancelled = false;

    const path = pathname ?? "/";

    if (!isGuardedPath(path)) {
      setDecision("skip");
      setResolved(true);
      setDecidedPath(path);
      return;
    }

    const cached = readYasamUser();
    const initial = evaluateRouteModuleGuard(path, cached);
    setDecision(initial);
    // WT4: oturum YOKSA red nedeni "yetki" değil "oturum"dur — giriş yapmış ama modül izni
    // olmayan kullanıcıyla karıştırılmaz ("Yetkiniz Bulunmuyor" → "Ana Panele Dön" → giriş
    // ekranı zinciri yerine doğrudan "Oturumunuz sona erdi" + "Giriş Yap").
    setDenyReason(
      !cached ? "session" : initial === "deny_membership" ? "membership" : "permission",
    );
    // Cache erişime izin veriyorsa (allow/skip) anında göster — ekstra gecikme yok.
    // Cache belirsiz/deny ise, DB doğrulaması bitene kadar "resolved" false kalır.
    setResolved(initial === "allow" || initial === "skip");
    setDecidedPath(path);

    if (!cached) {
      // Oturum yoksa üst katmanlar zaten girişe yönlendirir; kararı kesinleştir.
      setResolved(true);
      setDecidedPath(path);
      return;
    }

    backgroundSyncYasamUserFromDb(cached);

    void syncYasamUserFromDb(cached).then((fresh) => {
      if (cancelled) return;
      if (fresh) {
        const next = evaluateRouteModuleGuard(path, fresh);
        setDecision(next);
        setDenyReason(next === "deny_membership" ? "membership" : "permission");
      }
      // Sync başarılı da olsa (fresh null da olsa) yetki artık kesinleşti.
      setResolved(true);
      setDecidedPath(path);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const path = pathname ?? "/";
  const hasRule = isGuardedPath(path);
  const isDeny = decision === "deny" || decision === "deny_membership";

  // FLASH-GUARD (KAJ-P1-04): Modül-gate'li route'ta karar BU path için kesinleşene kadar
  // (decidedPath !== path VEYA henüz resolved değil) children RENDER EDİLMEZ; nötr bekleme
  // gösterilir. Bu, ilk paint'te korumalı içeriğin flash edip deny'a dönmesini (izinsiz
  // uzmana sızıntı) engeller. Nötr ekran (deny değil) → K-1 mobil "yetkiniz yok" flaşı da
  // olmaz. SSR + ilk client render ikisi de bu daldan Pending döndüğü için hydration uyumlu.
  // Gate'siz (rule'suz) route'lar ETKİLENMEZ → children anında.
  if (hasRule && (decidedPath !== path || !resolved)) {
    return <ModuleAccessPending />;
  }
  if (isDeny) {
    return <ModuleAccessDenied reason={denyReason} />;
  }

  return <>{children}</>;
}

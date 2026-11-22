/**
 * Şifa Rehberi — SUNUCU TARAFI SÜRÜM SEÇİMİ (Owner kararı: yöntem B). Kullanıcıya V1/V2 düğmesi YOK;
 * aynı anda tek sürüm. Anahtar: ortam değişkeni SIFA_REHBERI_V2_ENABLED ("1" = V2).
 *
 * Uygulama yeri: app/sifa-rehberi/layout.tsx (YENİ dosya; mevcut V1 dosyalarına dokunulmaz).
 *   bayrak AÇIK  : /sifa-rehberi ve /sifa-rehberi/<herhangi> → V2 ekranı. Adres /sifa-rehberi kalır →
 *                  menüler, ModuleRouteGuard, yetki kayıtları aynen. Layout istemci içi gezinmenin (RSC) de
 *                  parçası olduğundan menüden geçişte V1'e "kaçak" olmaz.
 *   bayrak KAPALI: layout çocukları (V1 sayfaları) DEĞİŞTİRMEDEN gösterir → V1 aynen.
 *   /sifa-rehberi-v2 (doğrudan): açıkken kanonik /sifa-rehberi'ye yönlendirir, kapalıyken 404.
 * Neden proxy.ts değil: proxy.ts ve next.config.ts'in farkı astroloji ekibinin donmuş-fark korumalarıyla
 * (scripts/astrology/static.harness.ts B4 / 8) sınırlı; onları bozmadan çözülür.
 * Geri dönüş = değişkeni kapatıp yeniden dağıtmak (Vercel ortam değişkeni değişikliği yeniden dağıtım ister;
 * statik üretilen sayfalarda karar da derleme anında verilir → ikisi tutarlı).
 */
export const SIFA_V1_PAGE = "/sifa-rehberi";

export function sifaV2EnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.SIFA_REHBERI_V2_ENABLED === "1";
}

/** Layout kararı: hangi ekran gösterilir. */
export function sifaScreen(enabled: boolean): "v1" | "v2" {
  return enabled ? "v2" : "v1";
}

/** Doğrudan /sifa-rehberi-v2 isteği: açıkken kanonik adrese, kapalıyken 404. */
export function directV2Decision(enabled: boolean): { kind: "redirect"; to: string } | { kind: "notFound" } {
  return enabled ? { kind: "redirect", to: SIFA_V1_PAGE } : { kind: "notFound" };
}

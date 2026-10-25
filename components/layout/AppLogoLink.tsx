"use client";

/**
 * Eski küresel üst çubuk ("YAŞAM SİSTEMİ — Bütüncül Yaşam Analizi Platformu", 44px sabit çubuk + 44px boşluk).
 * 2026-10-25 owner kararı: çubuk TAMAMEN kaldırıldı — hiçbir şey çizilmez, --logo-h ayarlanmaz (globals.css varsayılanı
 * 0px kalır → sayfalar yukarı kayar, boşluk kalmaz). Navigasyon tek sol menüde (components/layout/side-menu):
 * logo ana sayfaya döner, bildirim zili menünün alt bölümünde, tablet/mobil açma düğmesi QuickNavShell'de.
 * Kök layout'taki çağrı bozulmasın diye bileşen korunur.
 */
export default function AppLogoLink() {
  return null;
}

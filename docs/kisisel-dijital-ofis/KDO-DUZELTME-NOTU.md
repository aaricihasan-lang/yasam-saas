# Kişisel Dijital Ofis — Owner canlı testi sonrası 6 düzeltme (KDO-01…06)

Tarih: 2026-11-02 · Kapsam: yalnız uzman ana sayfası (iç modül ekranları değişmez) · Migration: **YOK** (P1 tasarım JSON'u geriye uyumlu genişletildi).

## Özet

| Kod | Düzeltme | Ana dosyalar |
|---|---|---|
| KDO-01 | Gece modunda karşılama metni kontrastı: metin renkleri ETKİN moda göre gerçek zeminde hesaplanır (tek sabit renk değil). Tasarımı olmayan hesapta Gece / Odak modu varsayılan karşılamayı moda uygun sürümle çizer (Gündüz birebir eski). | `lib/workspace/heroColors.ts`, `PersonalHero.tsx`, `app/page.tsx` |
| KDO-02 | B · Dijital Ofis varsayılan zeminde de tam sayfa: manzara duvar kâğıdı + cam karşılama bandı + cam kartlar. A klasik bant, C kartvizit aynen. | `personalRoot.ts` (`office`), `PersonalPageLayer.tsx`, `personal.module.css` |
| KDO-03 | Serbest satırların her biri kendi hizası (`text.lines[].align`). Eski kayıtta alan yoksa ortak hiza → eski tasarım birebir. Ortak hiza değişince kendi hizası olmayan satırlar önce mevcut hizayı alır. | `schema.ts`, `PersonalHero.tsx`, `DesignStudio.tsx` |
| KDO-04 | Karşılama yazı alanı zemini (`text.surface`, #rrggbb \| null): C kâğıt plaket, A/B metin paneli. Marka "zemin tonu"ndan ayrı ve açık adlı. Bilinen zemin olduğundan sunucu kontrast kapısı fotoğrafta da denetler. | `schema.ts`, `contrast.ts`, `PersonalHero.tsx`, `DesignStudio.tsx` |
| KDO-05 | Logo: hazır bölge seçimi kaldırıldı → tek **Serbest Yerleştir** (sayfa + sol menü alt boş alanı). Korunan öğeler: Yaşam Sistemi logosu/adı, karşılama metni, düğmeler, bağlantılar, başlıklar, kartlar, sağ sütun panelleri, menü alıntısı. Geçersiz bırakma → uyarı + son geçerli konum. Klavye, panel düğmeleri, dokunmatik. | `lib/workspace/logoPlacement.ts` (`solveFreeLogo`…), `FreeLogo.tsx`, `HomeShell.tsx`, `SideMenu.tsx` (`footSlot`, yalnız ana sayfa) |
| KDO-06 | Okuma modu ve ayarları kaldırıldı. Eski `viewMode: "reading"` → Otomatik (kayıt bozulmaz; sonraki tercih kaydında "auto" yazılır). | `viewMode.ts`, `PersonalToolbar.tsx`, `usePersonalWorkspace.ts`, `DesignStudio.tsx`, `personal.module.css` |

## Veri sözleşmesi (geriye uyumlu)

- `design.text.lines[].align?: "left" | "center" | "right"` — yoksa `text.align`.
- `design.text.surface: string | null` — yoksa / null: tasarımın kendi zemini.
- `design.logo.layout.{desktop,mobile}.zone`: eski `hero | cerceve | toolbar | sec | rightTop | footer` (y 0–1) **kabul edilir ve eski yerinde çizilir**; yeni `page | side` (x 0–1 serbest aralık oranı, **y px 0–8000**, w çerçeve genişliği oranı).
- Eski bölge kaydı, düzenlemede logoya ilk dokunuşta (sürükleme / ok tuşu / panel düğmesi) **aynı noktada** `page` yerleşimine çevrilir; sürükleme kesintisiz sürer.
- `prefs.viewMode` şemada hâlâ `reading` kabul eder (eski kayıt reddedilmez); arayüz `normalizeViewMode` ile Otomatik uygular. `prefs.reading` değerleri korunur, kullanılmaz.

## Testler

- CI: `schema` 75, `logoPlacement` 64 (400 rastgele senaryo özellik testi dahil), `mobileAdapt` 25, **yeni** `heroColors` 15 (136 074 renk × zemin × mod kombinasyonu), `routes` 110, `assets` 119 (yerel).
- Yerel uçtan uca: `scripts/workspace/ui-kdo.harness.ts` (K kontrast gerçek piksel, B, H, Z, L, R), `scripts/workspace/ui-personal.harness.ts` (P4 regresyonu), `scripts/workspace/ui-kdo-shots.ts` (önce / sonra).

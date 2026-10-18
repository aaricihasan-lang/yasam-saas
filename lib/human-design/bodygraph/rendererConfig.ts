// Human Design BodyGraph — AKTİF ÇİZİCİ SEÇİMİ (tek yer). Owner PASS 2026-10-18: yeni premium görünüm varsayılan.
//
// Eski çiziciler SİLİNMEDİ; yalnız pasif. Geri dönüş = aşağıdaki sabiti değiştirmek (kod / veri değişikliği yok):
//
//   Bireysel harita (HD_INDIVIDUAL_BODYGRAPH):
//     "premium"        → Yaşam Sistemi premium BodyGraph (mühürlü V9 geometri + silüet) — AKTİF
//                        app/human-design/kayitli-haritalar/components/HdPremiumBodygraph.tsx
//                        Word: lib/human-design/reporting/premiumBodygraphCapture.ts
//     "roxy-official"  → PASİF: Roxy resmî <roxy-bodygraph> (HdRoxyBodygraph.tsx + bodygraphCapture.ts),
//                        eski motor kayıtları için eski Yaşam Sistemi çizimi (harita/components/BodyGraph.tsx)
//
//   İlişki / Connection (HD_CONNECTION_BODYGRAPH):
//     "premium"        → Yaşam Sistemi premium birleşik BodyGraph (ConnectionBodygraph.tsx) — AKTİF
//     "legacy-roxy"    → PASİF: Roxy <roxy-hd-connection> (LegacyConnectionPanels.tsx → RoxyConnectionChart.tsx)
//     "legacy-schematic" → PASİF: ilk Yaşam Sistemi şematik birleşik çizimi (compositeScene/compositeLayout + SceneSvg)
//
// Hesaplama motoru, kayıtlar ve veri mantığı çiziciden bağımsızdır; seçim yalnız görünümü değiştirir.

export type HdIndividualBodygraphRenderer = "premium" | "roxy-official";
export type HdConnectionBodygraphRenderer = "premium" | "legacy-roxy" | "legacy-schematic";

export const HD_INDIVIDUAL_BODYGRAPH: HdIndividualBodygraphRenderer = "premium";
export const HD_CONNECTION_BODYGRAPH: HdConnectionBodygraphRenderer = "premium";

/**
 * Bireysel haritada premium ton eşlemesi (owner kesin kararı 2026-10-18, geleneksel HD): Kişilik (bilinçli) = A = SİYAH,
 * Tasarım (bilinçsiz) = B = KIRMIZI; ikisi de aktifse siyah boru üzerinde kırmızı şerit / iki renkli kapı.
 * Renkler connectionBodygraphScene CBG_PALETTE_COLOR.individual'da; Connection mavi / turuncu kalır.
 */
export const HD_PREMIUM_INDIVIDUAL_TONE = { personality: "A", design: "B" } as const;

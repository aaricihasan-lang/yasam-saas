// Gökyüzü Atlası — Batı Horary önizleme bayrağı (istemci + sunucu). VARSAYILAN KAPALI: owner görsel PASS ve yayın onayı olmadan
// açılmaz. Açıkken: Atlas ana ekranında giriş bağlantısı + /api/(admin/)astroloji/horary/western ucu; kapalıyken ikisi de yok (404).
export function isWesternHoraryPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW === "1";
}

import { HdDemoFetchBridge } from "./components/HdDemoFetchBridge";

/**
 * Human Design bölümü kabuğu. Yalnız D3 demo köprüsünü yükler (hiçbir şey çizmez); sayfa düzeni ve yetkiler DEĞİŞMEZ.
 * Normal oturumda köprü etkisizdir; Eğitim Merkezi yolları köprünün kapsamı dışındadır.
 */
export default function HumanDesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HdDemoFetchBridge />
      {children}
    </>
  );
}

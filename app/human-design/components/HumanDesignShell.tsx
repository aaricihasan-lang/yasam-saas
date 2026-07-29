import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  maxWidthClass?: string;
  /**
   * Sticky-dostu mod. Dış kapsayıcıda `overflow-x-hidden` yerine `overflow-x-clip`
   * kullanır.
   *
   * Neden: `overflow-x: hidden` (overflow-y `visible` iken) tarayıcıda overflow-y'yi
   * `auto`'ya zorlar ve bu div'i bir SCROLL CONTAINER'a çevirir. Kapsayıcı `min-h-screen`
   * olup içeriğe göre büyüdüğünden kendisi kaydırılmaz (asıl kaydırma kök/viewport'ta olur);
   * içindeki `position: sticky` öğeler bu kaydırılmayan kutuya sabitlenip yukarı kayınca
   * kaybolur. `overflow-x: clip` scroll container OLUŞTURMAZ → sticky öğe kök scroller'a
   * (viewport) göre çalışır. `clip` yatay taşmayı `hidden` gibi kırpar.
   *
   * Varsayılan `false`: diğer HD sayfalarının davranışı aynen korunur.
   */
  stickyChildren?: boolean;
};

export function HumanDesignShell({
  children,
  maxWidthClass = "max-w-none",
  stickyChildren = false,
}: Props) {
  const overflowX = stickyChildren ? "overflow-x-clip" : "overflow-x-hidden";
  return (
    <div className={`relative min-h-screen ${overflowX} bg-[linear-gradient(155deg,#eef2ff_0%,#faf5ff_20%,#fdf4ff_40%,#f0f9ff_60%,#fefce8_80%,#eef2ff_100%)] text-slate-900 antialiased`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-28 -top-20 h-[22rem] w-[22rem] rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute -right-20 top-[12%] h-[26rem] w-[26rem] rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[15%] h-[20rem] w-[20rem] rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute right-[10%] top-[45%] h-[14rem] w-[14rem] rounded-full bg-fuchsia-300/15 blur-2xl" />
      </div>
      <div className={`relative z-10 mx-auto w-full px-4 py-4 lg:px-8 xl:px-10 ${maxWidthClass}`}>
        {children}
      </div>
    </div>
  );
}

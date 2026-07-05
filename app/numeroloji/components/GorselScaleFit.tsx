"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { GorselRaporInfografik } from "./NumerolojiGorselRaporInfografik";

const GORSEL_BASE_W = 1400;

type InfografikProps = React.ComponentPropsWithoutRef<typeof GorselRaporInfografik>;

/**
 * 1400px sabit genişlikli görsel raporu, kapsayıcı genişliğine ölçekleyerek sığdırır
 * (mobil/tam-ekran yatay taşma/kesme olmadan). PNG dışa aktarımı için `ref` içteki
 * GorselRaporInfografik'e iletilir — yakalama doğal 1400px çözünürlükte kalır
 * (CSS transform, düğümün offsetWidth'ini değiştirmez).
 */
export const GorselScaleFit = forwardRef<HTMLDivElement, InfografikProps>(
  function GorselScaleFit(props, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [scaledH, setScaledH] = useState<number | undefined>(undefined);

    useEffect(() => {
      const wrap = wrapRef.current;
      const inner = innerRef.current;
      if (!wrap || !inner) return;

      let sc = 1;
      let ih = 0;

      const wObs = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) {
          sc = Math.min(1, w / GORSEL_BASE_W);
          setScale(sc);
          if (ih > 0) setScaledH(Math.ceil(ih * sc));
        }
      });

      const iObs = new ResizeObserver((entries) => {
        const h = entries[0]?.contentRect.height ?? 0;
        if (h > 0) {
          ih = h;
          setScaledH(Math.ceil(h * sc));
        }
      });

      wObs.observe(wrap);
      iObs.observe(inner);
      return () => {
        wObs.disconnect();
        iObs.disconnect();
      };
    }, []);

    return (
      <div ref={wrapRef} className="min-w-0 w-full overflow-hidden" style={{ height: scaledH }}>
        <div
          ref={innerRef}
          style={{ width: GORSEL_BASE_W, transformOrigin: "top left", transform: `scale(${scale})` }}
        >
          <GorselRaporInfografik ref={ref} {...props} />
        </div>
      </div>
    );
  },
);

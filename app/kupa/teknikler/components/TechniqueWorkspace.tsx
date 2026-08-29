"use client";

import { useCallback, useState, type ReactNode } from "react";
import { TechniqueList } from "./TechniqueList";
import { TechniqueListRefreshContext } from "../lib/listRefresh";

/**
 * Reader-first çalışma alanı iskeleti (FAZ 4 / 2B + 2C).
 *
 * >=1024px (lg): SOL liste + SAĞ detay yan yana (split workspace).
 * <1024px: liste-önce — teknik seçili DEĞİLKEN (index route) yalnız liste;
 *   seçiliyken ([id] route) yalnız detay (tam-genişlik, browser back ile geri).
 * İki route (index / [id]) aynı iskeleti paylaşır → çift render mantığı YOK.
 *
 * 2C: workspace bir liste-versiyon nonce'u tutar ve TechniqueListRefreshContext ile
 * children (reader) slotuna verir. Reader standalone düzenleme kaydedince refresh çağırır
 * → sol liste anında tazelenir (stale ad/tür kalmaz; hard reload YOK).
 */
export function TechniqueWorkspace({
  selectedId,
  children,
}: {
  selectedId: string | null;
  children: ReactNode;
}) {
  const hasSelection = !!selectedId;
  const [listVersion, setListVersion] = useState(0);
  const refreshList = useCallback(() => setListVersion((v) => v + 1), []);
  return (
    <TechniqueListRefreshContext.Provider value={refreshList}>
      <div className="lg:flex lg:gap-4">
        <aside
          className={`lg:w-[340px] lg:shrink-0 ${hasSelection ? "hidden lg:block" : "block"}`}
        >
          <TechniqueList selectedId={selectedId} version={listVersion} />
        </aside>
        <section className={`min-w-0 flex-1 ${hasSelection ? "block" : "hidden lg:block"}`}>
          {children}
        </section>
      </div>
    </TechniqueListRefreshContext.Provider>
  );
}

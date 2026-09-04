"use client";

import { createContext, useContext } from "react";

/**
 * TechniqueWorkspace, sol TechniqueList'i yeniden yükletmek için küçük bir bağlam sağlar.
 * Reader (children slot) standalone bir düzenleme kaydettiğinde bunu çağırır → liste anında
 * güncel ad/tür/aktiflik ile tazelenir (hard reload YOK). Global store DEĞİL — tek callback.
 */
export const TechniqueListRefreshContext = createContext<() => void>(() => {});

export const useTechniqueListRefresh = (): (() => void) => useContext(TechniqueListRefreshContext);

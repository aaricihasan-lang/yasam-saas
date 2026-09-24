"use client";
/**
 * Plan editörü capability context — owner-only kontrolleri (ör. şablon) derin
 * prop-drilling olmadan gizlemek için. Güvenlik sınırı DEĞİL (server-authoritative);
 * yalnız dead-control gizleme. isExpert=true → uzman (clients bound-plan) görünümü.
 */
import { createContext, useContext, type ReactNode } from "react";

type EditorCaps = { isExpert: boolean };
const EditorCapsContext = createContext<EditorCaps>({ isExpert: false });

export function EditorCapsProvider({ value, children }: { value: EditorCaps; children: ReactNode }) {
  return <EditorCapsContext.Provider value={value}>{children}</EditorCapsContext.Provider>;
}

export function useEditorCaps(): EditorCaps {
  return useContext(EditorCapsContext);
}

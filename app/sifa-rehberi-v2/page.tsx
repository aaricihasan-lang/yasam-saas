import { notFound, redirect } from "next/navigation";
import { directV2Decision, sifaV2EnabledFromEnv } from "@/lib/sifa-rehberi-v2/versionRoute";

/**
 * Doğrudan /sifa-rehberi-v2: V2'nin kanonik adresi /sifa-rehberi'dir (app/sifa-rehberi/layout.tsx).
 * Bayrak açıkken oraya yönlendirir; kapalıyken 404 (V1 çalışırken V2 ekranı yok).
 */
export const dynamic = "force-dynamic";

export default function Page() {
  const d = directV2Decision(sifaV2EnabledFromEnv());
  if (d.kind === "redirect") redirect(d.to);
  notFound();
}

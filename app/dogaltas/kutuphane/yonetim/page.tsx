import { redirect } from "next/navigation";

/** Çalışma alanının ana ekranı Doğaltaş Kütüphanesi'nin kendisidir. */
export default function StoneLibraryWorkspaceIndex() {
  redirect("/dogaltas/kutuphane");
}

import { redirect } from "next/navigation";

/**
 * FAZ 4 — ürün sadeleştirme (owner FINAL): legacy "Amaç / Rahatsızlık Rehberi" oluşturma
 * ekranı KALDIRILDI. Yeni konu/rahatsızlık girişi artık Hacamat Protokolleri içinden
 * yapılır. Bu rota eski create UI'sını AÇMAZ; /kupa/protokoller'e yönlendirir.
 */
export default function AmacRehberiYeniPage() {
  redirect("/kupa/protokoller");
}

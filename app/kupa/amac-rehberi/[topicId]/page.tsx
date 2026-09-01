import { redirect } from "next/navigation";

/**
 * FAZ 4 — ürün sadeleştirme (owner FINAL): legacy "Amaç / Rahatsızlık Rehberi" konu
 * okuma sayfası KALDIRILDI. Bu dinamik rota (herhangi bir topicId için) eski okuma
 * UI'sını AÇMAZ; /kupa/protokoller'e yönlendirir. Legacy topic verisi DB'de DORMANT kalır.
 */
export default function AmacRehberiDetailPage() {
  redirect("/kupa/protokoller");
}

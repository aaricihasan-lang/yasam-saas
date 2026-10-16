// Eski "Tüm Human Design profilleri" adresi (yer imleri için korunur). Human Design'da artık TEK danışan
// listesi var: analizsiz profiller de "Human Design Analizlerim" listesinde; silme danışanın penceresinde.
import { redirect } from "next/navigation";

export default function HdProfillerRedirect() {
  redirect("/human-design/danisanlar");
}

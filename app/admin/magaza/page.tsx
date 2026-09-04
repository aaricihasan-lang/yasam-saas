import type { Metadata } from "next";
import MagazaAdmin from "./MagazaAdmin";

export const metadata: Metadata = {
  title: "Doğal Pazar Yönetimi — Yaşam Sistemi",
};

export default function AdminMagazaPage() {
  return <MagazaAdmin />;
}

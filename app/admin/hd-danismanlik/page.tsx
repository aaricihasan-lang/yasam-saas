import ConsultationWorkspace from "./ConsultationWorkspace";

export const metadata = { title: "Danışmanlık İçeriği — Admin" };

/** Admin-only Human Design danışmanlık içeriği yönetimi (app/admin guard'ı kapsar). */
export default function HdConsultationAdminPage() {
  return <ConsultationWorkspace />;
}

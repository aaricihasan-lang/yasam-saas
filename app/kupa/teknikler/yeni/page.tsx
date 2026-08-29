"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KupaShell, kupaEdgeCard } from "../../components/KupaShell";
import { TechniqueEditor } from "../components/TechniqueEditor";
import { listTechniques } from "../../lib/api";

/**
 * YENİ TEKNİK — /kupa/teknikler/yeni
 *
 * Standalone detaylı oluşturma formu. Advisory duplicate için mevcut teknik adları
 * yüklenir. Oluşunca doğrudan detay sayfasına (/kupa/teknikler/[id]) gider. Formal
 * kaynak ve structured güvenlik ilişkisi kayıt oluştuktan SONRA detaydan eklenir.
 */
export default function YeniTeknikPage() {
  const router = useRouter();
  const [existing, setExisting] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    let alive = true;
    listTechniques()
      .then((rows) => alive && setExisting(rows.map((t) => ({ id: t.id, label: t.name }))))
      .catch(() => {
        /* advisory duplicate opsiyoneldir; liste yüklenemezse sessiz geç */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <KupaShell
      title="Yeni Teknik"
      breadcrumb={[
        { label: "Kupa Teknikleri", href: "/kupa/teknikler" },
        { label: "Yeni Teknik" },
      ]}
    >
      <div className={kupaEdgeCard}>
        <TechniqueEditor
          existing={existing}
          onSaved={(t) => router.push(`/kupa/teknikler/${t.id}`)}
          onCancel={() => router.push("/kupa/teknikler")}
        />
      </div>
    </KupaShell>
  );
}

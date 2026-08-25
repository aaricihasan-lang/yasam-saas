"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HumanDesignShell } from "../../../components/HumanDesignShell";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { HdAdminContentEditor } from "@/app/admin/human-design/[entityKey]/HdAdminContentEditor";
import { CanonicalDetail } from "@/components/human-design/knowledge/CanonicalDetail";
import {
  KnowledgeEmpty,
  KnowledgeError,
  KnowledgeLoading,
} from "@/components/human-design/knowledge/KnowledgeStates";
import { fetchCanonicalEntity } from "../../helpers/hdCanonicalRead";
import type { HdKnowledgeEntityDetail } from "@/lib/human-design/knowledge/expertReadTypes";

const MODULE_HOME = "/human-design/bilgi-bankasi";

function BackLink() {
  return (
    <Link href={MODULE_HOME} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" /> Bilgi Bankası&apos;na dön
    </Link>
  );
}

/**
 * Rol-bilinçli canonical detay:
 *   - ADMIN → mevcut admin editörü (taslak dahil görür + /api/admin/hd/* ile düzenler),
 *     modül içine gömülü (backHref modül Bilgi Bankası'na döner). Yeni admin yazma yok.
 *   - NORMAL UZMAN → salt-okuma CanonicalDetail; yalnız yayınlanmış içerik +
 *     hak-filtreli kaynaklar. Düzenleme kontrolü RENDER EDİLMEZ.
 */
export function CanonicalEntityView({ entityKey }: { entityKey: string }) {
  const [role, setRole] = useState<"admin" | "expert" | null>(null);

  const [detail, setDetail] = useState<HdKnowledgeEntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(isAdminUser(readYasamUser()) ? "admin" : "expert");
  }, []);

  const loadExpert = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    setNotFound(false);
    const r = await fetchCanonicalEntity(entityKey);
    if (r.ok) setDetail(r.detail);
    else if (r.locked) setLocked(true);
    else if (r.notFound) setNotFound(true);
    else setError(r.error);
    setLoading(false);
  }, [entityKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (role === "expert") void loadExpert();
  }, [role, loadExpert]);

  // Admin: mevcut admin editörünü modül içine göm (premium geniş düzen; "Listeye dön"
  // CTA'sı kaldırıldı, tarayıcı geri tuşu doğal çalışır).
  if (role === "admin") {
    return (
      <HumanDesignShell maxWidthClass="max-w-[1400px]">
        <HdAdminContentEditor entityKey={entityKey} />
      </HumanDesignShell>
    );
  }

  // role belirlenene kadar / expert yüklenirken.
  return (
    <HumanDesignShell maxWidthClass="max-w-3xl">
      <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        <BackLink />
        {role === null || loading ? (
          <KnowledgeLoading />
        ) : locked ? (
          <KnowledgeEmpty
            title="Bu hesap için henüz Human Design bilgi içeriği oluşturulmamış."
            hint="Kendi Human Design bilgi içeriğinizi eklediğinizde burada listelenecektir."
          />
        ) : notFound ? (
          <KnowledgeEmpty title="Kayıt bulunamadı" hint="Bu kanonik anahtar mevcut değil." />
        ) : error ? (
          <KnowledgeError message={error} />
        ) : detail ? (
          <CanonicalDetail detail={detail} />
        ) : (
          <KnowledgeEmpty title="İçerik yok" />
        )}
      </div>
    </HumanDesignShell>
  );
}

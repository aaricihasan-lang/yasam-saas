import { ProtocolDocumentClient } from "./ProtocolDocumentClient";

/**
 * PROTOKOL DOSYASI — /kupa/protokoller/[id]
 * Tam-genişlik profesyonel çalışma dosyası (sol persistent rail YOK). Mobil/tablet de
 * TAM CRUD (read-only DEĞİL). Next.js: params bir Promise'tir; await edip client'a geçilir.
 */
type PageProps = { params: Promise<{ id: string }> };

export default async function ProtocolDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ProtocolDocumentClient id={decodeURIComponent(id)} />;
}

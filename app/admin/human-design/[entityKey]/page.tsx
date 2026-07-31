import { HdAdminContentEditor } from "./HdAdminContentEditor";

/**
 * Merkezî HD içerik editörü sayfası (server wrapper).
 * entityKey = canonical_key (ör. tip_manifestor). Admin guard app/admin/layout.tsx'te.
 */
export default async function HdAdminEntityPage({
  params,
}: {
  params: Promise<{ entityKey: string }>;
}) {
  const { entityKey } = await params;
  return <HdAdminContentEditor entityKey={decodeURIComponent(entityKey)} />;
}

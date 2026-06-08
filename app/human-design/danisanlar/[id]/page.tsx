import { HdDanisanDetayContent } from "./HdDanisanDetayContent";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HdDanisanDetayContent clientId={id} />;
}

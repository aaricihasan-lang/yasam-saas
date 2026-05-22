import BilincaltiSebepleriDetail from "../../components/BilincaltiSebepleriDetail";
import BiyoenerjiSectionShell from "../../components/BiyoenerjiSectionShell";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BilincaltiSebepleriDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <BiyoenerjiSectionShell
      headerVariant="premium"
      badge="BİYOENERJİ · BİLİNÇALTI KÜTÜPHANESİ"
      title="Bilinçaltı Sebepleri"
      subtitle="Kayıt detayı — içerik ve notlar"
    >
      <BilincaltiSebepleriDetail id={id} />
    </BiyoenerjiSectionShell>
  );
}

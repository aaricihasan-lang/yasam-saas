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
      <div className="mx-auto w-full max-w-[1500px] px-1 sm:px-0">
        <BilincaltiSebepleriDetail id={id} />
      </div>
    </BiyoenerjiSectionShell>
  );
}

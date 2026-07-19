import PracticeCBTClient from "@/components/practice-cbt/practice-cbt-client";

export default async function PracticeFolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <PracticeCBTClient initialFolderId={folderId} />;
}

import type { Metadata } from "next";
import PyqLibraryClient from "@/components/pyq/pyq-library-client";
import jeeCatalog from "@/data/pyq/jee-catalog.json";

const DEFAULT_PUBLIC_PYQ_ORIGIN =
  "https://laczp1cndiqu2b1x.public.blob.vercel-storage.com";

export const metadata: Metadata = {
  title: "PYQ Archive | NEET DOCTOR",
  description: "A quiet, organized library of previous year question papers.",
};

export default function PyqLibraryPage() {
  return (
    <PyqLibraryClient
      jeeCatalog={jeeCatalog}
      assetBaseUrl={process.env.NEXT_PUBLIC_PYQ_BLOB_BASE_URL ?? DEFAULT_PUBLIC_PYQ_ORIGIN}
    />
  );
}

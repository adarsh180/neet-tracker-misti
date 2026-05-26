import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PyqLibraryClient from "@/components/pyq/pyq-library-client";
import jeeCatalog from "@/data/pyq/jee-catalog.json";
import { getPrivateSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "PYQ Archive | NEET DOCTOR",
  description: "A quiet, organized library of previous year question papers.",
};

export default async function PyqLibraryPage() {
  const session = await getPrivateSession();
  if (!session) redirect("/signin");

  return <PyqLibraryClient jeeCatalog={jeeCatalog} />;
}

import { redirect } from "next/navigation";

// Keep old bookmarks useful without keeping a separate Visual Lab workspace.
export default function RetiredVisualLabPage() {
  redirect("/reader");
}

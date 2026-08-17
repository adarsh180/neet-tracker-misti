import { serveNcertDocument } from "../route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id } = await params;
  return serveNcertDocument(id, request);
}

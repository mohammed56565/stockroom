import { POST as handlePOST } from "@backend/routes/action";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePOST(request);
}

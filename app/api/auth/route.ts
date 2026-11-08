import { GET as handleGET, POST as handlePOST } from "@backend/routes/auth";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGET(request);
}
export async function POST(request: Request) {
  return handlePOST(request);
}

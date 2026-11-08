import { GET as handleGET } from "@backend/routes/data";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGET(request);
}

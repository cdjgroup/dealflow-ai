import { auth0, getUser } from "@/lib/auth0";
import { seedDemoData } from "@/lib/data/crm";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser();
  const userId = user?.sub ?? "anonymous";

  await seedDemoData(userId);

  return NextResponse.json({
    success: true,
    deals: 4,
    contacts: 4,
    activities: 5,
  });
}

import { NextResponse } from "next/server";
import { listContracts } from "@/lib/massive";
import { getProductSpec } from "@/lib/products";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product") ?? "";
  if (!getProductSpec(product)) {
    return NextResponse.json({ error: `Unknown product code: ${product}` }, { status: 400 });
  }
  try {
    const contracts = await listContracts(product);
    return NextResponse.json({ contracts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load contracts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

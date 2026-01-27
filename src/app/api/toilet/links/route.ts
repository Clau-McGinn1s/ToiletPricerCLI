import { NextResponse } from "next/server";
import { fetchProductLinks } from "@/scraper/linkFetcher";

export async function GET() {
  try {
    const result = await fetchProductLinks();
    return NextResponse.json({
      message: "Links fetched and saved to LinkList.json",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch links: ${error}` },
      { status: 500 }
    );
  }
}

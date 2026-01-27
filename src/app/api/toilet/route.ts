import { NextResponse } from "next/server";
import { scrapeProduct } from "@/scraper/scraper";

export async function GET() {
  try {
    const result = await scrapeProduct(true);
    return NextResponse.json({
      message: `Scraped ${result.totalProducts} products and saved to PageScrapTest.json`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Scraping failed: ${error}` },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ message: "POST request received" });
}

export async function PUT() {
  return NextResponse.json({ message: "PUT request received" });
}

export async function PATCH() {
  return NextResponse.json({ message: "PATCH request received" });
}

export async function DELETE() {
  return NextResponse.json({ message: "DELETE request received" });
}

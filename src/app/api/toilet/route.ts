import { NextResponse } from "next/server";
import { scrapeProduct, saveScrapedDataToDatabase } from "@/scraper/scraper";

export async function GET() {
  try {
    // Scrape products and save to both file and database
    const result = await scrapeProduct({
      test: true,
      saveToDatabase: true,
      saveToFile: true,
    });

    const dbSuccessCount = result.databaseResults?.filter((r) => r.success).length ?? 0;
    const totalProducts = result.scrapedProducts.products.length;

    return NextResponse.json({
      message: `Scraped ${totalProducts} products. Saved ${dbSuccessCount} to database.`,
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

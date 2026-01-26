import { NextResponse } from "next/server";
import { scrapeProduct } from "@/scraper/scraper";

export async function GET() {
  try {
    const result = await scrapeProduct();
    return NextResponse.json({
      "scrape-test-result": {
        productName: result.productName,
        currentPrice: result.priceInfo.currentPrice,
        originalPrice: result.priceInfo.originalPrice,
        promoMessage: result.priceInfo.promoMessage,
        attributes: result.attributes,
      },
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

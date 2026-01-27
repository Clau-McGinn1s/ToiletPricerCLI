import { NextResponse, NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

const BASE_URLS_FILE = "src/scraper/urls/baseUrls.json";
const TARGET_URLS_FILE = "src/scraper/urls/targetUrls.json";

interface BaseUrls {
  urls: Record<string, string>;
}

interface TargetUrls {
  urls: Record<string, string[]>;
}

export async function GET(request : NextRequest) {
  try {
    const baseUrlsPath = path.join(process.cwd(), BASE_URLS_FILE);
    const targetUrlsPath = path.join(process.cwd(), TARGET_URLS_FILE);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");


    // Read base URLs
    let baseUrls: BaseUrls = { urls: {} };
    if (fs.existsSync(baseUrlsPath)) {
      baseUrls = JSON.parse(fs.readFileSync(baseUrlsPath, "utf-8"));
    }

    // Read target URLs
    let targetUrls: TargetUrls = { urls: {} };
    let targetUrlsExist = false;
    let typeQueryExits = false;
    if (fs.existsSync(targetUrlsPath)) {
      targetUrls = JSON.parse(fs.readFileSync(targetUrlsPath, "utf-8"));

      if(type && Object.keys(targetUrls.urls).includes(type)){
        const typeUrls = targetUrls.urls[type];
        targetUrls = {urls: { [type] : typeUrls }}
        typeQueryExits = true;
      }else{
        typeQueryExits = false;
      }

      targetUrlsExist = true;
    }

    // Count total target links
    const totalTargetLinks = Object.values(targetUrls.urls).reduce(
      (sum, links) => sum + links.length,
      0
    );

    // Build response
    const response: {
      message: string;
      baseUrls: BaseUrls;
      targetUrls: TargetUrls;
      summary: {
        categories: number;
        totalTargetLinks: number;
        linksPerCategory: Record<string, number>;
      };
      instructions?: {
        setup: string;
        command: string;
      };
    } = {
      message: typeQueryExits ? `Found ${Object.keys(baseUrls.urls).length} categories with ${totalTargetLinks} ${type} links` : targetUrlsExist
        ? `Found ${Object.keys(baseUrls.urls).length} categories with ${totalTargetLinks} target links`
        : "Target URLs not yet fetched",
      baseUrls,
      targetUrls,
      summary: {
        categories: Object.keys(baseUrls.urls).length,
        totalTargetLinks,
        linksPerCategory: Object.fromEntries(
          Object.entries(targetUrls.urls).map(([key, links]) => [key, links.length])
        ),
      },
    };

    if (!targetUrlsExist || totalTargetLinks === 0) {
      response.instructions = {
        setup: "Run the CLI to fetch product links:",
        command: "npm run cli -- fetch-links",
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "Failed to read URL files",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

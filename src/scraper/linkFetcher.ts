import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URL =
  "https://www.homedepot.com.mx/b/banos/sanitarios-y-accesorios/sanitarios-de-dos-piezas";

const PRODUCT_LINK_SELECTOR = "a.styled--link-container";

const OUTPUT_FILE = "LinkList.json";

export interface LinkListResult {
  links: {
    retretes: string[];
  };
}

export async function fetchProductLinks(): Promise<LinkListResult> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Block images, fonts, and analytics to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      if (
        resourceType === "image" ||
        resourceType === "font" ||
        url.includes("analytics") ||
        url.includes("google-analytics") ||
        url.includes("gtm") ||
        url.includes("facebook") ||
        url.includes("doubleclick")
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const allLinks: string[] = [];
    let pageNumber = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      // For page 1, try original URL first
      const pageUrl = pageNumber === 1 ? BASE_URL : `${BASE_URL}?pag=${pageNumber}`;

      // Check if page exists with fetch
      const response = await fetch(pageUrl);
      if (!response.ok) {
        hasMorePages = false;
        break;
      }

      // Navigate and scrape
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for product links to appear
      try {
        await page.waitForSelector(PRODUCT_LINK_SELECTOR, { timeout: 10000 });
      } catch {
        // No products found, end pagination
        hasMorePages = false;
        break;
      }

      // Scroll down to load all products
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Extract all href links from current page
      const pageLinks = await page.$$eval(PRODUCT_LINK_SELECTOR, (elements) =>
        elements
          .map((el) => el.getAttribute("href"))
          .filter((href): href is string => href !== null)
      );

      // If no links found, stop pagination
      if (pageLinks.length === 0) {
        hasMorePages = false;
        break;
      }

      // Add new links (avoid duplicates)
      for (const link of pageLinks) {
        if (!allLinks.includes(link)) {
          allLinks.push(link);
        }
      }

      pageNumber++;
    }

    const result: LinkListResult = {
      links: {
        retretes: allLinks,
      },
    };

    // Write to JSON file
    const outputPath = path.join(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error("Link fetching error:", error);
    throw new Error(`Failed to fetch links: ${error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

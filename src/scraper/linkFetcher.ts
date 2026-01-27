import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URLS_FILE = "src/scraper/urls/baseUrls.json";
const TARGET_URLS_FILE = "src/scraper/urls/targetUrls.json";

const PRODUCT_LINK_SELECTOR = "a.styled--link-container";

export interface BaseUrls {
  urls: Record<string, string>;
}

export interface TargetUrls {
  urls: Record<string, string[]>;
}

async function fetchLinksFromCategory(
  page: Page,
  baseUrl: string,
  categoryKey: string,
  limit: number
): Promise<string[]> {
  const allLinks: string[] = [];
  let pageNumber = 1;
  let hasMorePages = true;

  console.log(`Fetching links for category: ${categoryKey} (limit: ${limit})`);

  while (hasMorePages && allLinks.length < limit) {
    const pageUrl = pageNumber === 1 ? baseUrl : `${baseUrl}?pag=${pageNumber}`;

    try {
      const response = await fetch(pageUrl);
      if (!response.ok) {
        hasMorePages = false;
        break;
      }

      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      try {
        await page.waitForSelector(PRODUCT_LINK_SELECTOR, { timeout: 10000 });
      } catch {
        hasMorePages = false;
        break;
      }

      // Scroll down to load all products
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const pageLinks = await page.$$eval(PRODUCT_LINK_SELECTOR, (elements) =>
        elements
          .map((el) => el.getAttribute("href"))
          .filter((href): href is string => href !== null)
      );

      if (pageLinks.length === 0) {
        hasMorePages = false;
        break;
      }

      for (const link of pageLinks) {
        if (!allLinks.includes(link)) {
          allLinks.push(link);
          // Stop if limit is reached
          if (allLinks.length >= limit) {
            break;
          }
        }
      }

      console.log(`  Page ${pageNumber}: Found ${pageLinks.length} links (Total: ${allLinks.length})`);
      pageNumber++;
    } catch (err) {
      console.error(`Error fetching page ${pageNumber} for ${categoryKey}:`, err);
      hasMorePages = false;
    }
  }

  console.log(`Completed ${categoryKey}: ${allLinks.length} total links\n`);
  return allLinks;
}

export async function fetchProductLinks(limit: number = 15): Promise<TargetUrls> {
  let browser: Browser | undefined;

  try {
    // Read base URLs
    const baseUrlsPath = path.join(process.cwd(), BASE_URLS_FILE);
    if (!fs.existsSync(baseUrlsPath)) {
      throw new Error(`${BASE_URLS_FILE} not found.`);
    }

    const baseUrlsData: BaseUrls = JSON.parse(fs.readFileSync(baseUrlsPath, "utf-8"));
    const categoryKeys = Object.keys(baseUrlsData.urls);

    if (categoryKeys.length === 0) {
      throw new Error("No URLs found in baseUrls.json");
    }

    console.log(`Found ${categoryKeys.length} categories to fetch: ${categoryKeys.join(", ")}`);
    console.log(`Limit per category: ${limit}\n`);

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

    const result: TargetUrls = {
      urls: {},
    };

    // Iterate through each category
    for (const key of categoryKeys) {
      const baseUrl = baseUrlsData.urls[key];
      const links = await fetchLinksFromCategory(page, baseUrl, key, limit);
      result.urls[key] = links;
    }

    // Write to target URLs file
    const targetUrlsPath = path.join(process.cwd(), TARGET_URLS_FILE);
    fs.writeFileSync(targetUrlsPath, JSON.stringify(result, null, 2));
    console.log(`Results saved to ${TARGET_URLS_FILE}`);

    // Log summary
    console.log("\n=== Summary ===");
    for (const key of categoryKeys) {
      console.log(`${key}: ${result.urls[key].length} links`);
    }

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

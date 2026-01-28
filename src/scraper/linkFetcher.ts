import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URLS_FILE = "src/scraper/urls/baseUrls.json";
const TARGET_URLS_FILE = "src/scraper/urls/targetUrls.json";
const FILTERS_FILE = "src/scraper/config/filters.json";

const PRODUCT_LINK_SELECTOR = "a.styled--link-container";

export interface BaseUrls {
  urls: Record<string, string>;
}

export interface TargetUrls {
  urls: Record<string, string[]>;
}

interface CategoryFilter {
  filter: string[];
  feature: string[];
}

interface FiltersConfig {
  [key: string]: CategoryFilter;
}

async function fetchLinksFromCategory(
  page: Page,
  baseUrl: string,
  categoryKey: string,
  limit: number,
  filterWords: string[]
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
          .map((el) => ({
            href: el.getAttribute("href"),
            text: el.textContent?.toLowerCase() || "",
          }))
          .filter((item): item is { href: string; text: string } => item.href !== null)
      );

      if (pageLinks.length === 0) {
        hasMorePages = false;
        break;
      }

      for (const { href: link, text } of pageLinks) {
        // Skip if link text contains any filter word
        const shouldFilter = filterWords.some((word) => text.includes(word.toLowerCase()));
        if (shouldFilter) {
          continue;
        }

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

export interface FetchLinksOptions {
  limit?: number;
  applyFilters?: boolean;
}

export async function fetchProductLinks(options: FetchLinksOptions = {}): Promise<TargetUrls> {
  const { limit = 15, applyFilters = true } = options;
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

    // Load filters if enabled
    const filtersPath = path.join(process.cwd(), FILTERS_FILE);
    let filtersData: FiltersConfig = {};
    if (applyFilters) {
      if (fs.existsSync(filtersPath)) {
        filtersData = JSON.parse(fs.readFileSync(filtersPath, "utf-8"));
        console.log("Loaded filters from filters.json");
      } else {
        console.log("No filters.json found, proceeding without filters");
      }
    } else {
      console.log("Filtering disabled");
    }

    console.log(`Found ${categoryKeys.length} categories to fetch: ${categoryKeys.join(", ")}`);
    console.log(`Limit per category: ${limit}\n`);

    browser = await puppeteer.launch({
      headless: true,
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
      const filterWords = filtersData[key]?.filter || [];
      if (filterWords.length > 0) {
        console.log(`Applying filters for ${key}: ${filterWords.join(", ")}`);
      }
      const links = await fetchLinksFromCategory(page, baseUrl, key, limit, filterWords);
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

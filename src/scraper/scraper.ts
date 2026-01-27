import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://www.homedepot.com.mx";
const LINK_LIST_FILE = "LinkList.json";
const OUTPUT_FILE = "PageScrapTest.json";

const PRODUCT_NAME_SELECTOR =
  'h1.MuiTypography-root.sc-eDvSVe.jEoTgR.product-name.MuiTypography-body1[weight="light"]';

const PRICE_SELECTOR = '[data-testid="price-format"]';

const ATTRIBUTE_VALUES_SELECTOR = '[id^="attValue"]';

const SPECIFIC_ATTRIBUTE_IDS = ["attValue-alto", "attValue-ancho", "attValue-color"];

const SPECS_DRAWER_TRIGGER = "p.text-espicificaciones";

export interface AttributeValue {
  id: string;
  value: string;
}

export interface PriceInfo {
  currentPrice: string;
  originalPrice: string;
  promoMessage: string;
}

export interface ScrapeResult {
  url: string;
  productName: string;
  priceInfo: PriceInfo;
  attributes: AttributeValue[];
}

export interface AllScrapedResults {
  totalProducts: number;
  scrapedAt: string;
  products: ScrapeResult[];
}

function parsePriceText(rawText: string): PriceInfo {
  const result: PriceInfo = {
    currentPrice: "Not found",
    originalPrice: "Not found",
    promoMessage: "",
  };

  const savingsMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*/i);
  if (savingsMatch) {
    result.promoMessage = savingsMatch[0];
  }

  const originalMatch = rawText.match(/Antes\s*\$([\d,]+\.?\d*)/i);
  if (originalMatch) {
    result.originalPrice = `$${originalMatch[1]}`;
  }

  const currentMatch = rawText.match(/\$([\d,]+)(\d{2})(?=\s*Antes|\s*Meses|$)/);
  if (currentMatch) {
    result.currentPrice = `$${currentMatch[1]}.${currentMatch[2]}`;
  } else {
    const altMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*\s*\$([\d,]+)(\d{2})/i);
    if (altMatch) {
      result.currentPrice = `$${altMatch[1]}.${altMatch[2]}`;
    }
  }

  const monthlyMatch = rawText.match(/\$([\d,]+\.?\d*)\s*por mes a (\d+)\s*MSI/i);
  if (monthlyMatch) {
    const monthlyInfo = `${monthlyMatch[2]} MSI de $${monthlyMatch[1]}`;
    result.promoMessage = result.promoMessage
      ? `${result.promoMessage} | ${monthlyInfo}`
      : monthlyInfo;
  }

  return result;
}

async function scrapeProductPage(page: Page, url: string): Promise<ScrapeResult> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for the product name element to appear
  await page.waitForSelector(PRODUCT_NAME_SELECTOR, { timeout: 10000 });

  const productName = await page.$eval(PRODUCT_NAME_SELECTOR, (el) =>
    el.textContent?.trim()
  );

  // Try to get the price
  let rawPriceText = "";
  try {
    await page.waitForSelector(PRICE_SELECTOR, { timeout: 5000 });
    rawPriceText =
      (await page.$eval(PRICE_SELECTOR, (el) => el.textContent?.trim())) || "";
  } catch {
    const altPriceSelectors = [".price", '[class*="price"]', '[class*="Price"]'];
    for (const selector of altPriceSelectors) {
      try {
        const found = await page.$eval(selector, (el) => el.textContent?.trim());
        if (found) {
          rawPriceText = found;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  const priceInfo = parsePriceText(rawPriceText);

  // Click on specifications element to open the drawer
  let attributes: AttributeValue[] = [];
  try {
    await page.waitForSelector(SPECS_DRAWER_TRIGGER, { timeout: 10000 });

    await page.$eval(SPECS_DRAWER_TRIGGER, (el) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await page.$eval(SPECS_DRAWER_TRIGGER, (el) => {
      (el as HTMLElement).click();
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      await page.waitForSelector(ATTRIBUTE_VALUES_SELECTOR, { timeout: 15000 });

      attributes = await page.$$eval(ATTRIBUTE_VALUES_SELECTOR, (elements) =>
        elements.map((el) => ({
          id: el.id,
          value: el.textContent?.trim() || "",
        }))
      );
    } catch {
      for (const attrId of SPECIFIC_ATTRIBUTE_IDS) {
        try {
          const selector = `#${attrId}`;
          await page.waitForSelector(selector, { timeout: 3000 });
          const value = await page.$eval(selector, (el) =>
            el.textContent?.trim() || ""
          );
          if (value) {
            attributes.push({ id: attrId, value });
          }
        } catch {
          continue;
        }
      }
    }
  } catch (err) {
    console.error(`Failed to get attributes for ${url}:`, err);
  }

  return {
    url: fullUrl,
    productName: productName || "Product name not found",
    priceInfo,
    attributes,
  };
}

export async function scrapeProduct(test: boolean = false): Promise<AllScrapedResults> {
  let browser: Browser | undefined;

  try {
    // Read links from LinkList.json
    const linkListPath = path.join(process.cwd(), LINK_LIST_FILE);
    if (!fs.existsSync(linkListPath)) {
      throw new Error(`${LINK_LIST_FILE} not found. Run the link fetcher first.`);
    }

    const linkListData = JSON.parse(fs.readFileSync(linkListPath, "utf-8"));
    let links: string[] = linkListData.links?.retretes || [];

    if (links.length === 0) {
      throw new Error("No links found in LinkList.json");
    }

    // Limit to 5 links in test mode
    if (test) {
      links = links.slice(0, 5);
    }

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

    const products: ScrapeResult[] = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      console.log(`Scraping ${i + 1}/${links.length}: ${link}`);

      try {
        const result = await scrapeProductPage(page, link);
        products.push(result);
      } catch (err) {
        console.error(`Failed to scrape ${link}:`, err);
        products.push({
          url: link,
          productName: "Failed to scrape",
          priceInfo: {
            currentPrice: "Error",
            originalPrice: "Error",
            promoMessage: "",
          },
          attributes: [],
        });
      }
    }

    const allResults: AllScrapedResults = {
      totalProducts: products.length,
      scrapedAt: new Date().toISOString(),
      products,
    };

    // Write to JSON file
    const outputPath = path.join(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));

    return allResults;
  } catch (error) {
    console.error("Scraping error:", error);
    throw new Error(`Failed to scrape: ${error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

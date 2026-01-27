import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_FILE = "PageScrapTest.json";

const TARGET_URL =
  "https://www.homedepot.com.mx/p/glacier-bay-sanitario-de-dos-piezas-cobrial-2ec08w-163770";

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
  productName: string;
  priceInfo: PriceInfo;
  attributes: AttributeValue[];
}

function parsePriceText(rawText: string): PriceInfo {
  const result: PriceInfo = {
    currentPrice: "Not found",
    originalPrice: "Not found",
    promoMessage: "",
  };

  // Extract savings message (e.g., "Ahorras $400.00")
  const savingsMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*/i);
  if (savingsMatch) {
    result.promoMessage = savingsMatch[0];
  }

  // Extract original price (e.g., "Antes $3,199.00")
  const originalMatch = rawText.match(/Antes\s*\$([\d,]+\.?\d*)/i);
  if (originalMatch) {
    result.originalPrice = `$${originalMatch[1]}`;
  }

  // Extract current price - the main price usually appears as a large number
  // Pattern: $X,XXX00 or $X,XXX.00 (current promotional price)
  const currentMatch = rawText.match(/\$([\d,]+)(\d{2})(?=\s*Antes|\s*Meses|$)/);
  if (currentMatch) {
    result.currentPrice = `$${currentMatch[1]}.${currentMatch[2]}`;
  } else {
    // Alternative: look for price pattern after savings
    const altMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*\s*\$([\d,]+)(\d{2})/i);
    if (altMatch) {
      result.currentPrice = `$${altMatch[1]}.${altMatch[2]}`;
    }
  }

  // Add monthly payment info to promo message if available
  const monthlyMatch = rawText.match(/\$([\d,]+\.?\d*)\s*por mes a (\d+)\s*MSI/i);
  if (monthlyMatch) {
    const monthlyInfo = `${monthlyMatch[2]} MSI de $${monthlyMatch[1]}`;
    result.promoMessage = result.promoMessage
      ? `${result.promoMessage} | ${monthlyInfo}`
      : monthlyInfo;
  }

  return result;
}

export async function scrapeProduct(): Promise<ScrapeResult> {
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

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

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
      // Price selector not found, try alternative selectors
      const altPriceSelectors = [
        ".price",
        '[class*="price"]',
        '[class*="Price"]',
      ];
      for (const selector of altPriceSelectors) {
        try {
          const found = await page.$eval(selector, (el) =>
            el.textContent?.trim()
          );
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
      // Wait for the specs trigger to be available
      await page.waitForSelector(SPECS_DRAWER_TRIGGER, { timeout: 10000 });

      // Scroll the element into view and click using JavaScript
      await page.$eval(SPECS_DRAWER_TRIGGER, (el) => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Use JavaScript click which is more reliable for React components
      await page.$eval(SPECS_DRAWER_TRIGGER, (el) => {
        (el as HTMLElement).click();
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Wait for drawer to open and attributes to load
      try {
        await page.waitForSelector(ATTRIBUTE_VALUES_SELECTOR, { timeout: 15000 });

        // Scrape all attValue elements
        attributes = await page.$$eval(ATTRIBUTE_VALUES_SELECTOR, (elements) =>
          elements.map((el) => ({
            id: el.id,
            value: el.textContent?.trim() || "",
          }))
        );
      } catch {
        // Fallback: search for specific attribute IDs
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
            // Attribute not found, continue to next
          }
        }
      }
    } catch (err) {
      console.error("Failed to get attributes:", err);
    }

    const result: ScrapeResult = {
      productName: productName || "Product name not found",
      priceInfo,
      attributes,
    };

    // Write to JSON file
    const outputPath = path.join(process.cwd(), OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error("Scraping error:", error);
    throw new Error(`Failed to scrape: ${error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

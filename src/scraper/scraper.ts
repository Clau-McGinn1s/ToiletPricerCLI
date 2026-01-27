import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://www.homedepot.com.mx";
const LINK_LIST_FILE = "LinkList.json";
const OUTPUT_FILE = "PageScrapTest.json";

const PRODUCT_NAME_SELECTOR =
  'h1.MuiTypography-root.sc-eDvSVe.jEoTgR.product-name.MuiTypography-body1[weight="light"]';

const PRICE_SELECTOR = '[data-testid="price-format"]';

const SPECIFIC_ATTRIBUTE_IDS = ["attValue-color", "attValue-alto", "attValue-ancho", "attValue-largo"];

const SPECS_DRAWER_TRIGGER = "p.text-espicificaciones";

export interface PriceInfo {
  price_alt: string;
  price: string;
  promoMessage: string;
}

export interface ScrapeResult {
  name: string;
  price: string;
  price_alt?: string | null;
  description?: string | null;
  color?: string | null;
  height?: string | null;
  width?: string | null;
  length?: string | null;
  url: string;
}

export interface AllScrapedResults {
  products: ScrapeResult[];
}

function parsePriceText(rawText: string): PriceInfo {
  const result: PriceInfo = {
    price_alt: "Not found",
    price: "Not found",
    promoMessage: "",
  };

  const savingsMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*/i);
  if (savingsMatch) {
    result.promoMessage = savingsMatch[0];
  }

  const currentMatch = rawText.match(/\$([\d,]+)(\d{2})(?=\s*Antes|\s*Meses|$)/);
  if (currentMatch) {
    result.price_alt = `${currentMatch[1].replace(",","")}.${currentMatch[2]}`;
  } else {
    const altMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*\s*\$([\d,]+)(\d{2})/i);
    if (altMatch) {
      result.price_alt = `${altMatch[1].replace(",","")}.${altMatch[2]}`;
    }
  }

    const originalMatch = rawText.match(/Antes\s*\$([\d,]+\.?\d*)/i);
  if (originalMatch) {
    result.price = `${originalMatch[1].replace(",","")}`;
  }else{
    result.price = result.price_alt;
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
  const attributes: string[] = [];
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


    for (const attrId of SPECIFIC_ATTRIBUTE_IDS) {
      try {
        const selector = `#${attrId}`;
        await page.waitForSelector(selector, { timeout: 3000 });
        const value = await page.$eval(selector, (el) =>
          el.textContent?.trim() || ""
        );
        if (value) {
          attributes.push(value);
        }
        else{
          attributes.push("Not Found");
        }
      } catch {
          attributes.push("Not Found");
        continue;
      }
    }
    
  } catch (err) {
    console.error(`Failed to get attributes for ${url}:`, err);
  }

  const [colorVal, heightVal, lengthVal, widthVal] = attributes;

  return {
    name: productName || "Product name not found",
    price: priceInfo.price,
    price_alt : priceInfo.price_alt,
    color : colorVal,
    description : priceInfo.promoMessage,
    height : heightVal,
    width : widthVal,
    length : lengthVal,
    url: fullUrl
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
        console.log(`Successfully scraped ${link}`)
      } catch (err) {
        console.error(`Failed to scrape ${link}:`, err);
        products.push({
          name: "Failed to scrape",
          price: "-",
          price_alt: "-",
          color: "-",
          description: "-",
          height: "-",
          width: "-",
          length: "-",
          url: link
        });
      }
    }

    const allResults: AllScrapedResults = {
      products: products
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

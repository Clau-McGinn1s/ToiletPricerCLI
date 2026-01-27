import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { getDatabaseConfig } from "../database/config";
import { insertProduct } from "../database/insertProduct";
import { RawProductInput, InsertResult } from "../database/product.types";

dotenv.config();

const BASE_URL = "https://www.homedepot.com.mx";
const TARGET_URLS_FILE = "src/scraper/urls/targetUrls.json";
const LOG_FILE = "scraper.log";
const MEDIA_DIR = "src/media";

const IMAGE_SELECTOR = 'div[style*="cursor: crosshair"] > img';

interface TargetUrls {
  urls: Record<string, string[]>;
}

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
  type: string;
  match?: string | null;
  image?: string | null;
  url: string;
}

export interface AllScrapedResults {
  products: ScrapeResult[];
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

async function downloadImage(
  imageUrl: string,
  productType: string,
  productName: string
): Promise<string | null> {
  try {
    // Create directory path
    const sanitizedName = sanitizeFileName(productName);
    const dirPath = path.join(process.cwd(), MEDIA_DIR, productType);

    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Get file extension from URL
    const urlPath = new URL(imageUrl).pathname;
    const ext = path.extname(urlPath) || '.jpg';
    const fileName = `${sanitizedName}${ext}`;
    const filePath = path.join(dirPath, fileName);

    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    // Return relative path for database storage
    const relativePath = path.join(MEDIA_DIR, productType, fileName);
    console.log(`Image saved: ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.error(`Error downloading image: ${err}`);
    return null;
  }
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

async function scrapeProductPage(page: Page, url: string, type: string): Promise<ScrapeResult> {
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

  // Try to get and download the product image
  let imagePath: string | null = null;
  try {
    await page.waitForSelector(IMAGE_SELECTOR, { timeout: 5000 });
    const imageUrl = await page.$eval(IMAGE_SELECTOR, (el) =>
      el.getAttribute("src")
    );

    if (imageUrl && productName) {
      imagePath = await downloadImage(imageUrl, type, productName);
    }
  } catch (err) {
    console.error(`Failed to get image for ${url}:`, err);
  }

  return {
    name: productName || "Product name not found",
    price: priceInfo.price,
    price_alt: priceInfo.price_alt,
    color: colorVal,
    description: priceInfo.promoMessage,
    height: heightVal,
    width: widthVal,
    length: lengthVal,
    type: type,
    match: null,
    image: imagePath,
    url: fullUrl
  };
}

export interface ScrapeOptions {
  test?: boolean;
  saveToDatabase?: boolean;
}

function logScrapedProduct(name: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `${name} scraped at ${timestamp}\n`;
  const logPath = path.join(process.cwd(), LOG_FILE);
  fs.appendFileSync(logPath, logEntry);
}

export interface ScrapeAndSaveResult {
  scrapedProducts: AllScrapedResults;
  databaseResults?: InsertResult[];
}

async function createDatabaseConnection(): Promise<mysql.Connection> {
  const config = getDatabaseConfig();
  return mysql.createConnection(config);
}

async function saveProductsToDatabase(
  products: ScrapeResult[]
): Promise<InsertResult[]> {
  const connection = await createDatabaseConnection();
  const results: InsertResult[] = [];

  try {
    for (const product of products) {
      // Skip failed scrapes
      if (product.name === "Failed to scrape") {
        results.push({
          success: false,
          error: `Skipped failed scrape for URL: ${product.url}`,
        });
        continue;
      }

      // Convert ScrapeResult to RawProductInput
      const rawProduct: RawProductInput = {
        name: product.name,
        price: product.price,
        price_alt: product.price_alt,
        color: product.color,
        description: product.description,
        height: product.height,
        width: product.width,
        length: product.length,
        type: product.type,
        match: product.match,
        image: product.image,
        url: product.url,
      };

      const result = await insertProduct(connection, rawProduct);
      results.push(result);

      if (result.success) {
        console.log(`Saved to DB: ${product.name} (ID: ${result.insertId})`);
      } else {
        console.error(`Failed to save ${product.name}: ${result.error}`);
      }
    }

    return results;
  } finally {
    await connection.end();
    console.log("Database connection closed");
  }
}

export async function scrapeProduct(
  options: ScrapeOptions = {}
): Promise<ScrapeAndSaveResult> {
  const { test = false, saveToDatabase = false } = options;
  let browser: Browser | undefined;

  try {
    // Read links from targetUrls.json
    const targetUrlsPath = path.join(process.cwd(), TARGET_URLS_FILE);
    if (!fs.existsSync(targetUrlsPath)) {
      throw new Error(`${TARGET_URLS_FILE} not found. Run the link fetcher first.`);
    }

    const targetUrlsData: TargetUrls = JSON.parse(fs.readFileSync(targetUrlsPath, "utf-8"));

    // Check if urls object exists and is not empty
    if (!targetUrlsData.urls || Object.keys(targetUrlsData.urls).length === 0) {
      throw new Error("targetUrls.json is empty. Please run 'npm run cli -- fetch-links' first to fetch product links.");
    }

    const categoryKeys = Object.keys(targetUrlsData.urls);

    // Count total links
    let totalLinks = 0;
    for (const key of categoryKeys) {
      totalLinks += targetUrlsData.urls[key].length;
    }

    if (totalLinks === 0) {
      throw new Error("targetUrls.json contains no links. Please run 'npm run cli -- fetch-links' first to fetch product links.");
    }

    console.log(`Found ${categoryKeys.length} categories with ${totalLinks} total links`);

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
    let globalIndex = 0;

    // Iterate through each category
    for (const categoryKey of categoryKeys) {
      let links = targetUrlsData.urls[categoryKey];

      if (links.length === 0) {
        console.log(`Skipping empty category: ${categoryKey}`);
        continue;
      }

      // Limit to 5 links per category in test mode
      if (test) {
        links = links.slice(0, 5);
      }

      console.log(`\n=== Scraping category: ${categoryKey} (${links.length} links) ===`);

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        globalIndex++;
        console.log(`Scraping [${categoryKey}] ${i + 1}/${links.length} (Global: ${globalIndex}): ${link}`);

        try {
          const result = await scrapeProductPage(page, link, categoryKey);
          products.push(result);
          logScrapedProduct(result.name);
          console.log(`Successfully scraped ${link}`);
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
            type: categoryKey,
            match: null,
            image: null,
            url: link
          });
        }
      }
    }

    const allResults: AllScrapedResults = {
      products: products
    };

    console.log(`\nLog file saved to ${LOG_FILE}`);

    // Save to database if enabled
    let databaseResults: InsertResult[] | undefined;
    if (saveToDatabase) {
      console.log("Saving products to database...");
      databaseResults = await saveProductsToDatabase(products);
      const successCount = databaseResults.filter((r) => r.success).length;
      console.log(`Database save complete: ${successCount}/${products.length} products saved successfully`);
    }

    return {
      scrapedProducts: allResults,
      databaseResults,
    };
  } catch (error) {
    console.error("Scraping error:", error);
    throw new Error(`Failed to scrape: ${error}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Standalone function to save existing scraped data to database
export async function saveScrapedDataToDatabase(
  data: AllScrapedResults
): Promise<InsertResult[]> {
  return saveProductsToDatabase(data.products);
}

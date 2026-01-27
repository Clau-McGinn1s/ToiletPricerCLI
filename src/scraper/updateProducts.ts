import puppeteer, { Browser, Page } from "puppeteer";
import mysql, { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import dotenv from "dotenv";
import { getDatabaseConfig } from "../database/config";
import { ProductRow } from "../database/config";

dotenv.config();

const PRODUCT_NAME_SELECTOR =
  'h1.MuiTypography-root.sc-eDvSVe.jEoTgR.product-name.MuiTypography-body1[weight="light"]';

const PRICE_SELECTOR = '[data-testid="price-format"]';

const SPECIFIC_ATTRIBUTE_IDS = ["attValue-color", "attValue-alto", "attValue-ancho", "attValue-largo"];

const SPECS_DRAWER_TRIGGER = "p.text-espicificaciones";

interface PriceInfo {
  price_alt: string;
  price: string;
  promoMessage: string;
}

interface ProductToUpdate extends RowDataPacket {
  id: number;
  name: string;
  url: string;
  updated_at: Date;
}

interface UpdateResult {
  id: number;
  url: string;
  success: boolean;
  message: string;
}

export interface UpdateProductsResult {
  totalChecked: number;
  totalUpdated: number;
  results: UpdateResult[];
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
    result.price_alt = `${currentMatch[1].replace(",", "")}.${currentMatch[2]}`;
  } else {
    const altMatch = rawText.match(/Ahorras\s*\$[\d,]+\.?\d*\s*\$([\d,]+)(\d{2})/i);
    if (altMatch) {
      result.price_alt = `${altMatch[1].replace(",", "")}.${altMatch[2]}`;
    }
  }

  const originalMatch = rawText.match(/Antes\s*\$([\d,]+\.?\d*)/i);
  if (originalMatch) {
    result.price = `${originalMatch[1].replace(",", "")}`;
  } else {
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

async function scrapeProductData(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.waitForSelector(PRODUCT_NAME_SELECTOR, { timeout: 10000 });

  const productName = await page.$eval(PRODUCT_NAME_SELECTOR, (el) =>
    el.textContent?.trim()
  );

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
        } else {
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

  const parsedHeight = parseFloat(heightVal?.split(" ")[0] ?? "0") || null;
  const parsedWidth = parseFloat(widthVal?.split(" ")[0] ?? "0") || null;
  const parsedLength = parseFloat(lengthVal?.split(" ")[0] ?? "0") || null;

  return {
    name: productName || "Product name not found",
    price: parseFloat(priceInfo.price) || 0,
    price_alt: parseFloat(priceInfo.price_alt) || null,
    color: colorVal || null,
    description: priceInfo.promoMessage || null,
    height: parsedHeight,
    width: parsedWidth,
    length: parsedLength,
  };
}

async function getProductsToUpdate(
  connection: mysql.Connection,
  days: number = 0
): Promise<ProductToUpdate[]> {
  let sql: string;

  if (days === 0) {
    // Update all products
    sql = `
      SELECT id, name, url, updated_at
      FROM products
      ORDER BY updated_at ASC
    `;
    const [rows] = await connection.execute<ProductToUpdate[]>(sql);
    return rows;
  } else {
    sql = `
      SELECT id, name, url, updated_at
      FROM products
      WHERE updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY updated_at ASC
    `;
    const [rows] = await connection.execute<ProductToUpdate[]>(sql, [days]);
    return rows;
  }
}

async function updateProductInDb(
  connection: mysql.Connection,
  productId: number,
  data: {
    name: string;
    price: number;
    price_alt: number | null;
    color: string | null;
    description: string | null;
    height: number | null;
    width: number | null;
    length: number | null;
  }
): Promise<void> {
  const sql = `
    UPDATE products
    SET name = ?, price = ?, price_alt = ?, color = ?, description = ?,
        height = ?, width = ?, length = ?, updated_at = NOW()
    WHERE id = ?
  `;

  await connection.execute<ResultSetHeader>(sql, [
    data.name,
    data.price,
    data.price_alt,
    data.color,
    data.description,
    data.height,
    data.width,
    data.length,
    productId,
  ]);
}

export async function updateStaleProducts(days: number = 0): Promise<UpdateProductsResult> {
  const config = getDatabaseConfig();
  const connection = await mysql.createConnection(config);
  let browser: Browser | undefined;

  const results: UpdateResult[] = [];

  try {
    if (days === 0) {
      console.log("Updating all products...");
    } else {
      console.log(`Checking for products not updated in the last ${days} days...`);
    }

    const productsToUpdate = await getProductsToUpdate(connection, days);

    if (productsToUpdate.length === 0) {
      console.log("No products need updating.");
      return {
        totalChecked: 0,
        totalUpdated: 0,
        results: [],
      };
    }

    console.log(`Found ${productsToUpdate.length} products to update.`);

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

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

    for (let i = 0; i < productsToUpdate.length; i++) {
      const product = productsToUpdate[i];
      console.log(`Updating ${i + 1}/${productsToUpdate.length}: ${product.name}`);

      try {
        const scrapedData = await scrapeProductData(page, product.url);
        await updateProductInDb(connection, product.id, scrapedData);

        results.push({
          id: product.id,
          url: product.url,
          success: true,
          message: `Updated successfully`,
        });

        console.log(`Successfully updated product ID ${product.id}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.push({
          id: product.id,
          url: product.url,
          success: false,
          message: errorMessage,
        });

        console.error(`Failed to update product ID ${product.id}: ${errorMessage}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      totalChecked: productsToUpdate.length,
      totalUpdated: successCount,
      results,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    await connection.end();
    console.log("Database connection closed");
  }
}

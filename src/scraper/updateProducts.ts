import puppeteer, { Browser, Page } from "puppeteer";
import mysql, { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { getDatabaseConfig } from "../database/config";
import { ProductRow } from "../database/config";

dotenv.config();

const MEDIA_DIR = "src/media";

const PRODUCT_NAME_SELECTOR =
  'h1.MuiTypography-root.sc-eDvSVe.jEoTgR.product-name.MuiTypography-body1[weight="light"]';

const PRICE_SELECTOR = '[data-testid="price-format"]';

const SPECIFIC_ATTRIBUTE_IDS = ["attValue-color", "attValue-alto", "attValue-ancho", "attValue-largo"];

const SPECS_DRAWER_TRIGGER = "p.text-espicificaciones";

interface PriceInfo {
  price_alt: string;
  price: string;
}

interface ProductToUpdate extends RowDataPacket {
  id: number;
  name: string;
  url: string;
  type: string;
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
  };

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

  return result;
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
    const sanitizedName = sanitizeFileName(productName);
    const dirPath = path.join(process.cwd(), MEDIA_DIR, productType);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const urlPath = new URL(imageUrl).pathname;
    const ext = path.extname(urlPath) || '.jpg';
    const fileName = `${sanitizedName}${ext}`;
    const filePath = path.join(dirPath, fileName);

    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    const relativePath = path.join(MEDIA_DIR, productType, fileName);
    console.log(`Image saved: ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.error(`Error downloading image: ${err}`);
    return null;
  }
}

async function scrapeProductData(page: Page, url: string, type: string, downloadImages: boolean = false) {
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

  // Try to get the product description
  let productDescription: string | null = null;
  try {
    productDescription = await page.evaluate(() => {
      const descElement = document.querySelector('p.MuiTypography-root.sc-eDvSVe.kBIVDt.sc-gFmLcz.fRHTBS.MuiTypography-body1');
      if (descElement) {
        const text = descElement.textContent?.trim() || '';
        return text.substring(0, 300);
      }
      return null;
    });
  } catch (err) {
    console.error(`Failed to get description for ${url}:`, err);
  }

  const parsedHeight = parseFloat(heightVal?.split(" ")[0] ?? "0") || null;
  const parsedWidth = parseFloat(widthVal?.split(" ")[0] ?? "0") || null;
  const parsedLength = parseFloat(lengthVal?.split(" ")[0] ?? "0") || null;

  // Try to get and download the product image (if enabled)
  let imagePath: string | null = null;

  if (downloadImages) {
    const maxImageAttempts = 5;

    for (let attempt = 1; attempt <= maxImageAttempts; attempt++) {
      try {
        let imageUrl: string | null = null;

        if (attempt === 1) {
          const skuNumber = await page.evaluate(() => {
            const skuElement = document.querySelector('p.MuiTypography-root.sc-eDvSVe.gGsKAy.product-caption-info.product-sku.MuiTypography-body1');
            if (skuElement) {
              const text = skuElement.textContent?.trim() || '';
              const match = text.match(/SKU\s+(\d+)/i);
              if (match) {
                return match[1];
              }
            }
            return null;
          });

          if (skuNumber) {
            imageUrl = `https://cdn.homedepot.com.mx/productos/${skuNumber}/${skuNumber}-d.jpg`;
          }
        } else {
          console.log(`Attempt ${attempt}/${maxImageAttempts}: Searching for -d.jpg image...`);
          imageUrl = await page.evaluate(() => {
            const prefix = 'https://cdn.homedepot.com.mx/productos/';
            const images = document.querySelectorAll('img');
            for (const img of images) {
              const src = img.getAttribute('src');
              if (src && src.startsWith(prefix) && src.endsWith('-d.jpg')) {
                return src;
              }
            }
            return null;
          });
        }

        if (imageUrl && productName) {
          imagePath = await downloadImage(imageUrl, type, productName);
          if (imagePath) {
            break;
          }
        }

        if (attempt < maxImageAttempts) {
          console.log(`Attempt ${attempt}/${maxImageAttempts}: Image URL not found, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error(`Attempt ${attempt}/${maxImageAttempts}: Failed to get image for ${url}:`, err);
        if (attempt >= maxImageAttempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  return {
    name: productName || "Product name not found",
    price: parseFloat(priceInfo.price) || 0,
    price_alt: parseFloat(priceInfo.price_alt) || null,
    color: colorVal || null,
    description: productDescription,
    height: parsedHeight,
    width: parsedWidth,
    length: parsedLength,
    image: imagePath,
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
      SELECT id, name, url, type, updated_at
      FROM products
      ORDER BY updated_at ASC
    `;
    const [rows] = await connection.execute<ProductToUpdate[]>(sql);
    return rows;
  } else {
    sql = `
      SELECT id, name, url, type, updated_at
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
    image: string | null;
  }
): Promise<void> {
  // Only update image if a new one was downloaded
  const sql = data.image
    ? `
      UPDATE products
      SET name = ?, price = ?, price_alt = ?, color = ?, description = ?,
          height = ?, width = ?, length = ?, image = ?, updated_at = NOW()
      WHERE id = ?
    `
    : `
      UPDATE products
      SET name = ?, price = ?, price_alt = ?, color = ?, description = ?,
          height = ?, width = ?, length = ?, updated_at = NOW()
      WHERE id = ?
    `;

  const params = data.image
    ? [
        data.name,
        data.price,
        data.price_alt,
        data.color,
        data.description,
        data.height,
        data.width,
        data.length,
        data.image,
        productId,
      ]
    : [
        data.name,
        data.price,
        data.price_alt,
        data.color,
        data.description,
        data.height,
        data.width,
        data.length,
        productId,
      ];

  await connection.execute<ResultSetHeader>(sql, params);
}

export interface UpdateOptions {
  days?: number;
  downloadImages?: boolean;
}

export async function updateStaleProducts(options: UpdateOptions = {}): Promise<UpdateProductsResult> {
  const { days = 0, downloadImages = true } = options;
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
        const scrapedData = await scrapeProductData(page, product.url, product.type, downloadImages);
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

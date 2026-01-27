#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import DatabaseSetup from '../database/setup-database';
import dropDatabase from '../database/drop-database';
import { fetchProductLinks } from '../scraper/linkFetcher';
import { scrapeProduct } from '../scraper/productScraper';
import { updateStaleProducts } from '../scraper/updateProducts';
import { cleanMedia } from '../utils/cleanMedia';

dotenv.config();

const program = new Command();

program
  .name('toilet-cli')
  .description('CLI for toilet scraper and database management')
  .version('1.0.0');

program
  .command('db:setup')
  .description('Setup the database and create tables')
  .action(async () => {
    console.log('Setting up database...');
    const dbSetup = new DatabaseSetup();
    await dbSetup.setup();
  });

program
  .command('db:drop')
  .description('Drop the database')
  .action(async () => {
    console.log('Dropping database...');
    await dropDatabase();
  });

program
  .command('clean-media')
  .description('Delete all contents of the media directory')
  .action(() => {
    console.log('Cleaning media directory...');
    cleanMedia();
  });

program
  .command('fetch-links')
  .description('Fetch product links from Home Depot')
  .option('-l, --limit <number>', 'Maximum links per category', parseInt, 15)
  .action(async (options) => {
    console.log('Fetching product links...');
    const result = await fetchProductLinks(options.limit);
    const totalLinks = Object.values(result.urls).reduce((sum, links) => sum + links.length, 0);
    console.log(`Fetched ${totalLinks} links across ${Object.keys(result.urls).length} categories`);
  });

program
  .command('scrape')
  .description('Scrape product data from fetched links')
  .option('-t, --test', 'Run in test mode (only 5 products)', false)
  .option('-d, --database', 'Save results to database', false)
  .option('-i, --images', 'Download product images', false)
  .action(async (options) => {
    console.log('Starting scraper...');
    console.log(`Options: test=${options.test}, database=${options.database}, images=${options.images}`);

    const result = await scrapeProduct({
      test: options.test,
      saveToDatabase: options.database,
      downloadImages: options.images,
    });

    console.log(`Scraped ${result.scrapedProducts.products.length} products`);

    if (result.databaseResults) {
      const successCount = result.databaseResults.filter(r => r.success).length;
      console.log(`Saved ${successCount}/${result.databaseResults.length} products to database`);
    }
  });

program
  .command('set-up')
  .description('Run full pipeline: setup db, clean media, fetch links, scrape, and save to database')
  .option('-t, --test', 'Run scraper in test mode (only 5 products per category)', false)
  .option('-l, --limit <number>', 'Maximum links per category for fetch-links', parseInt, 15)
  .option('-i, --images', 'Download product images', false)
  .action(async (options) => {
    console.log('=== Starting full pipeline ===\n');

    // Step 1: Setup database
    console.log('Step 1: Setting up database...');
    const dbSetup = new DatabaseSetup();
    await dbSetup.setup();
    console.log('');

    // Step 2: Clean media directory
    console.log('Step 2: Cleaning media directory...');
    cleanMedia();
    console.log('');

    // Step 3: Fetch links
    console.log('Step 3: Fetching product links...');
    const linkResult = await fetchProductLinks(options.limit);
    const totalLinks = Object.values(linkResult.urls).reduce((sum, links) => sum + links.length, 0);
    console.log(`Fetched ${totalLinks} links across ${Object.keys(linkResult.urls).length} categories\n`);

    // Step 4: Scrape and save to database
    console.log('Step 4: Scraping products and saving to database...');
    const scrapeResult = await scrapeProduct({
      test: options.test,
      saveToDatabase: true,
      downloadImages: options.images,
    });

    const productCount = scrapeResult.scrapedProducts.products.length;
    const dbSuccessCount = scrapeResult.databaseResults?.filter(r => r.success).length ?? 0;

    console.log('');
    console.log('=== Pipeline complete ===');
    console.log(`Total products scraped: ${productCount}`);
    console.log(`Products saved to database: ${dbSuccessCount}`);
  });

program
  .command('set-up:fresh')
  .description('Drop database, clean media, and run full pipeline: setup db, fetch links, scrape, and save to database')
  .option('-t, --test', 'Run scraper in test mode (only 5 products per category)', false)
  .option('-l, --limit <number>', 'Maximum links per category for fetch-links', parseInt, 15)
  .option('-i, --images', 'Download product images', false)
  .action(async (options) => {
    console.log('=== Starting fresh pipeline ===\n');

    // Step 1: Drop database
    console.log('Step 1: Dropping database...');
    await dropDatabase();
    console.log('');

    // Step 2: Clean media directory
    console.log('Step 2: Cleaning media directory...');
    cleanMedia();
    console.log('');

    // Step 3: Setup database
    console.log('Step 3: Setting up database...');
    const dbSetup = new DatabaseSetup();
    await dbSetup.setup();
    console.log('');

    // Step 4: Fetch links
    console.log('Step 4: Fetching product links...');
    const linkResult = await fetchProductLinks(options.limit);
    const totalLinks = Object.values(linkResult.urls).reduce((sum, links) => sum + links.length, 0);
    console.log(`Fetched ${totalLinks} links across ${Object.keys(linkResult.urls).length} categories\n`);

    // Step 5: Scrape and save to database
    console.log('Step 5: Scraping products and saving to database...');
    const scrapeResult = await scrapeProduct({
      test: options.test,
      saveToDatabase: true,
      downloadImages: options.images,
    });

    const productCount = scrapeResult.scrapedProducts.products.length;
    const dbSuccessCount = scrapeResult.databaseResults?.filter(r => r.success).length ?? 0;

    console.log('');
    console.log('=== Fresh pipeline complete ===');
    console.log(`Total products scraped: ${productCount}`);
    console.log(`Products saved to database: ${dbSuccessCount}`);
  });

program
  .command('update')
  .description('Update stale products that have not been updated in X days (0 = update all)')
  .option('-d, --days <number>', 'Number of days since last update (0 = all)', parseInt, 0)
  .option('-i, --images', 'Download product images', false)
  .action(async (options) => {
    if (options.days === 0) {
      console.log('Updating all products...');
    } else {
      console.log(`Updating products not updated in the last ${options.days} days...`);
    }

    const result = await updateStaleProducts({
      days: options.days,
      downloadImages: options.images,
    });

    console.log('');
    console.log('=== Update complete ===');
    console.log(`Products checked: ${result.totalChecked}`);
    console.log(`Products updated: ${result.totalUpdated}`);
  });

program.parse();

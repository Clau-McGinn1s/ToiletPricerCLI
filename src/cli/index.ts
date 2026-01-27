#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import DatabaseSetup from '../database/setup-database';
import dropDatabase from '../database/drop-database';
import { fetchProductLinks } from '../scraper/linkFetcher';
import { scrapeProduct } from '../scraper/scraper';
import { updateStaleProducts } from '../scraper/updateProducts';

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
  .action(async (options) => {
    console.log('Starting scraper...');
    console.log(`Options: test=${options.test}, database=${options.database}`);

    const result = await scrapeProduct({
      test: options.test,
      saveToDatabase: options.database,
    });

    console.log(`Scraped ${result.scrapedProducts.products.length} products`);

    if (result.databaseResults) {
      const successCount = result.databaseResults.filter(r => r.success).length;
      console.log(`Saved ${successCount}/${result.databaseResults.length} products to database`);
    }
  });

program
  .command('set-up')
  .description('Run full pipeline: setup db, fetch links, scrape, and save to database')
  .option('-t, --test', 'Run scraper in test mode (only 5 products per category)', false)
  .option('-l, --limit <number>', 'Maximum links per category for fetch-links', parseInt, 15)
  .action(async (options) => {
    console.log('=== Starting full pipeline ===\n');

    // Step 1: Setup database
    console.log('Step 1: Setting up database...');
    const dbSetup = new DatabaseSetup();
    await dbSetup.setup();
    console.log('');

    // Step 2: Fetch links
    console.log('Step 2: Fetching product links...');
    const linkResult = await fetchProductLinks(options.limit);
    const totalLinks = Object.values(linkResult.urls).reduce((sum, links) => sum + links.length, 0);
    console.log(`Fetched ${totalLinks} links across ${Object.keys(linkResult.urls).length} categories\n`);

    // Step 3: Scrape and save to database
    console.log('Step 3: Scraping products and saving to database...');
    const scrapeResult = await scrapeProduct({
      test: options.test,
      saveToDatabase: true,
    });

    const productCount = scrapeResult.scrapedProducts.products.length;
    const dbSuccessCount = scrapeResult.databaseResults?.filter(r => r.success).length ?? 0;

    console.log('');
    console.log('=== Pipeline complete ===');
    console.log(`Total products scraped: ${productCount}`);
    console.log(`Products saved to database: ${dbSuccessCount}`);
  });

program
  .command('update')
  .description('Update stale products that have not been updated in X days (0 = update all)')
  .option('-d, --days <number>', 'Number of days since last update (0 = all)', parseInt, 0)
  .action(async (options) => {
    if (options.days === 0) {
      console.log('Updating all products...');
    } else {
      console.log(`Updating products not updated in the last ${options.days} days...`);
    }

    const result = await updateStaleProducts(options.days);

    console.log('');
    console.log('=== Update complete ===');
    console.log(`Products checked: ${result.totalChecked}`);
    console.log(`Products updated: ${result.totalUpdated}`);
  });

program.parse();

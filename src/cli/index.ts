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
  .action(async () => {
    console.log('Fetching product links...');
    const result = await fetchProductLinks();
    console.log(`Fetched ${result.links.retretes.length} links`);
  });

program
  .command('scrape')
  .description('Scrape product data from fetched links')
  .option('-t, --test', 'Run in test mode (only 5 products)', false)
  .option('-d, --database', 'Save results to database', false)
  .option('-f, --file', 'Save results to JSON file', true)
  .action(async (options) => {
    console.log('Starting scraper...');
    console.log(`Options: test=${options.test}, database=${options.database}, file=${options.file}`);

    const result = await scrapeProduct({
      test: options.test,
      saveToDatabase: options.database,
      saveToFile: options.file,
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
  .option('-t, --test', 'Run scraper in test mode (only 5 products)', false)
  .action(async (options) => {
    console.log('=== Starting full pipeline ===\n');

    // Step 1: Setup database
    console.log('Step 1: Setting up database...');
    const dbSetup = new DatabaseSetup();
    await dbSetup.setup();
    console.log('');

    // Step 2: Fetch links
    console.log('Step 2: Fetching product links...');
    const linkResult = await fetchProductLinks();
    console.log(`Fetched ${linkResult.links.retretes.length} links\n`);

    // Step 3: Scrape and save to database
    console.log('Step 3: Scraping products and saving to database...');
    const scrapeResult = await scrapeProduct({
      test: options.test,
      saveToDatabase: true,
      saveToFile: true,
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
  .description('Update stale products that have not been updated in X days')
  .requiredOption('-d, --days <number>', 'Number of days since last update', parseInt)
  .action(async (options) => {
    console.log(`Updating products not updated in the last ${options.days} days...`);

    const result = await updateStaleProducts(options.days);

    console.log('');
    console.log('=== Update complete ===');
    console.log(`Products checked: ${result.totalChecked}`);
    console.log(`Products updated: ${result.totalUpdated}`);
  });

program.parse();

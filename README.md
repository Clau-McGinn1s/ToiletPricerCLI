# ToiletAPI

A web scraping tool for extracting bathroom essentials prices from the Home Depot website. Track and compare prices for toilets, sinks, shower heads, faucets, handwashers, and other bathroom fixtures.

## Features

- Scrape prices for bathroom essentials from Home Depot
- Support for multiple product categories:
  - Toilets / WCs
  - Sinks
  - Handwashers
  - Shower heads
  - Faucets
  - Bathroom accessories

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/toiletapi.git
   cd toiletapi
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How the Scraper Works

The scraper uses Puppeteer to launch a headless Chrome browser and extract product data from Home Depot Mexico.

### Process

1. **Browser Setup**: Launches headless Chrome with request interception to block images, fonts, and analytics for faster loading.

2. **Page Navigation**: Navigates to the product URL and waits for `domcontentloaded`.

3. **Product Name**: Extracts the product title from the `<h1>` element.

4. **Price Extraction**: Scrapes the price container and parses it using regex to extract:
   - Current price (promotional/sale price)
   - Original price (before discount)
   - Promo message (savings amount + monthly payment options)

5. **Product Attributes**: Clicks the "Especificaciones" button to open the specs drawer, then scrapes all elements with IDs starting with `attValue` (e.g., color, dimensions, material).

### API Endpoint

```
GET /api/toilet
```

Returns JSON with product name, pricing info, and attributes array.

## License

MIT

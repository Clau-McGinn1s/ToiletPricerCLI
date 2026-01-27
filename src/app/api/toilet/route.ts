import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getDatabaseConfig } from "@/database/config";

export async function GET() {
  let connection: mysql.Connection | null = null;

  try {
    const config = getDatabaseConfig();
    connection = await mysql.createConnection(config);

    const [rows] = await connection.execute("SELECT * FROM products ORDER BY created_at DESC");
    const products = rows as mysql.RowDataPacket[];

    if (products.length === 0) {
      return NextResponse.json(
        {
          message: "No products found in database",
          instructions: {
            setup: "Run the CLI to set up the database and scrape products:",
            commands: [
              "npm run cli -- set-up:fresh",
              "npm run cli -- set-up:fresh -t  (test mode with fewer products)",
              "npm run cli -- set-up:fresh -l 20  (limit 20 links per category)",
            ],
          },
          products: [],
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      message: `Found ${products.length} products`,
      count: products.length,
      products,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "Database connection failed",
        details: errorMessage,
        instructions: {
          setup: "Make sure the database is set up. Run the CLI:",
          commands: [
            "npm run cli -- db:setup  (setup database only)",
            "npm run cli -- set-up:fresh  (full setup with scraping)",
          ],
          environment: "Ensure your .env file has the correct database credentials:",
          envVariables: ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_PORT"],
        },
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

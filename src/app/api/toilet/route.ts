import { NextResponse, NextRequest } from "next/server";
import mysql from "mysql2/promise";
import { getDatabaseConfig } from "@/database/config";

export async function GET(request: NextRequest) {
  let connection: mysql.Connection | null = null;

  try {
    const config = getDatabaseConfig();
    connection = await mysql.createConnection(config);

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const type = searchParams.get("type");
    const match = searchParams.get("match");
    const color = searchParams.get("color");

    // Build dynamic query
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (id) {
      conditions.push("id = ?");
      params.push(parseInt(id, 10));
    }
    if (type) {
      conditions.push("type = ?");
      params.push(type);
    }
    if (match) {
      conditions.push("match_field = ?");
      params.push(match);
    }
    if (color) {
      conditions.push("color LIKE ?");
      params.push(`%${color}%`);
    }

    let sql = "SELECT * FROM products";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY created_at DESC";

    const [rows] = await connection.execute(sql, params);
    const products = rows as mysql.RowDataPacket[];

    if (products.length === 0) {
      const hasFilters = id || type || match || color;

      if (hasFilters) {
        return NextResponse.json(
          {
            message: "No products found matching the query",
            query: { id, type, match, color },
            products: [],
          },
          { status: 200 }
        );
      }

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
      message: `Found ${products.length} product${products.length !== 1 ? "s" : ""}`,
      count: products.length,
      query: { id, type, match, color },
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

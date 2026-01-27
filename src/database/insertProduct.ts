import mysql, { ResultSetHeader } from 'mysql2/promise';
import { Product, ProductInput, InsertResult, RawProductInput } from './product.types';
import { error } from 'console';

export async function insertProduct(
  connection: mysql.Connection,
  rawProductData: RawProductInput
): Promise<InsertResult> {
  try {
    // Validate required fields
    const {success, data, message} = validateProduct(rawProductData);

    if(!success){
        return {
            success : success,
            message : message
        };
    }
    if(data === undefined){
        throw error("product data is undefined");
    }

    // Prepare SQL query
    const sql = `
      INSERT INTO products (
        name, 
        price, 
        price_alt, 
        color, 
        description, 
        height, 
        width, 
        length,
        url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Prepare values, converting undefined to null for optional fields
    const values = [
      data.name.trim(),
      data.price,
      data.price_alt ?? null,
      data.color ?? null,
      data.description ?? null,
      data.height ?? null,
      data.width ?? null,
      data.length ?? null,
      data.url ?? null,
    ];

    // Execute the query
    const [result] = await connection.execute<ResultSetHeader>(sql, values);
    
    return {
      success: true,
      insertId: result.insertId,
      message: `Product "${data.name}" inserted with ID: ${result.insertId}`
    };
    
  } catch (error) {
    console.error('Database insert error:', error);
    
    // Handle specific MySQL errors
    if (error instanceof Error && 'code' in error) {
      const mysqlError = error as any;
      
      if (mysqlError.code === 'ER_DUP_ENTRY') {
        return {
          success: false,
          error: 'A product with this name already exists'
        };
      }
      
      if (mysqlError.code === 'ER_NO_REFERENCED_ROW_2') {
        return {
          success: false,
          error: 'Referenced data does not exist'
        };
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

export function validateProduct(raw: RawProductInput): {success: boolean, data? : ProductInput, message? : string} {

  Object.entries(raw).forEach(([key, val])=>{
    if(val === undefined || val === null){
        return {
            success : false,
            message : `${key} cannot be null`
        }
    }
  });

  const parsedHeight = parseFloat(raw.height?.split(" ")[0] ?? "0");
  const parsedWidth = parseFloat(raw.width?.split(" ")[0] ?? "0");
  const parsedLength = parseFloat(raw.length?.split(" ")[0] ?? "0");

  return {
    success : true,
    data: {
        name: raw.name.trim(),
        price: parseFloat(raw.price) || 0,
        price_alt: raw.price_alt ? parseFloat(raw.price_alt) : null,
        color: raw.color || null,
        description: raw.description || null,
        height: raw.height ? parsedHeight : null,
        width: raw.width ? parsedWidth : null,
        length: raw.length ? parsedLength : null,
        url: raw.url
    }
  };
}
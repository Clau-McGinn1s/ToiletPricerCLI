export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

export const getDatabaseConfig = (): DatabaseConfig => ({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_app_db',
  port: parseInt(process.env.DB_PORT || '3306'),
});

export interface TableInfo {
  tableExists: number;
}

export interface ProductRow {
  id: number;
  name: string;
  price: number;
  price_alt?: number | null;
  color?: string | null;
  description?: string | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  type: string;
  created_at?: Date;
  updated_at?: Date;
}
export interface Product {
  id?: number;  // Optional for inserts (auto-generated)
  name: string;
  price: number;
  price_alt?: number | null;
  color?: string | null;
  description?: string | null;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  type: string;
  url?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface RawProductInput {
  name: string;
  price: string;
  price_alt?: string | null;
  color?: string | null;
  description?: string | null;
  height?: string | null;
  width?: string | null;
  length?: string | null;
  type: string;
  url?: string | null;
}

export interface ProductInput extends Omit<Product, 'id' | 'created_at' | 'updated_at'> {
  // All fields except auto-generated ones
}

export interface InsertResult {
  success: boolean;
  insertId?: number;
  message?: string;
  error?: string;
}
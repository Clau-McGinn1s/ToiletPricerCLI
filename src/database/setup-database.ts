import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { getDatabaseConfig, DatabaseConfig, TableInfo } from './config';

dotenv.config();

class DatabaseSetup {
  private config: DatabaseConfig;
  private connection: mysql.Connection | null = null;

  constructor(config?: Partial<DatabaseConfig>) {
    const defaultConfig = getDatabaseConfig();
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Connect to MySQL server without a specific database
   */
  private async connectToServer(): Promise<mysql.Connection> {
    return mysql.createConnection({
      host: this.config.host,
      user: this.config.user,
      password: this.config.password,
      port: this.config.port,
    });
  }

  /**
   * Connect to the specific database
   */
  async connect(): Promise<mysql.Connection> {
    try {
      this.connection = await mysql.createConnection(this.config);
      console.log(`✅ Connected to database: ${this.config.database}`);
      return this.connection;
    } catch (error) {
      throw new Error(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Ensure the database exists, create it if not
   */
  async ensureDatabaseExists(): Promise<void> {
    let serverConnection: mysql.Connection | null = null;
    
    try {
      serverConnection = await this.connectToServer();
      console.log(`🔌 Connected to MySQL server at ${this.config.host}:${this.config.port}`);

      // Create database if it doesn't exist
      await serverConnection.execute(
        `CREATE DATABASE IF NOT EXISTS \`${this.config.database}\` 
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`📁 Database "${this.config.database}" is ready`);
      
    } catch (error) {
      throw new Error(`Database creation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (serverConnection) {
        await serverConnection.end();
      }
    }
  }

  /**
   * Check if a table exists in the database
   */
  async tableExists(tableName: string): Promise<boolean> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    try {
      const [rows] = await this.connection.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as tableExists
         FROM information_schema.tables 
         WHERE table_schema = ? AND table_name = ?`,
        [this.config.database, tableName]
      );

      const result = rows[0] as TableInfo;
      return result.tableExists > 0;
    } catch (error) {
      throw new Error(`Table check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create the productos table
   */
  async createProductosTable(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            price_alt DECIMAL(10, 2) NULL,
            color VARCHAR(50) NULL,
            description TEXT NULL,
            height DECIMAL(8, 2) NULL,
            width DECIMAL(8, 2) NULL,
            length DECIMAL(8, 2) NULL,
            type VARCHAR(50) NOT NULL,
            url VARCHAR(355) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    try {
      await this.connection.execute(createTableSQL);
      console.log('✅ Table "productos" created successfully');
    } catch (error) {
      throw new Error(`Table creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      console.log('🔌 Database connection closed');
    }
  }

  /**
   * Main setup method
   */
  async setup(): Promise<void> {
    console.log('🚀 Starting database setup...');
    
    try {
      // Step 1: Ensure database exists
      await this.ensureDatabaseExists();
      
      // Step 2: Connect to the database
      await this.connect();
      
      // Step 3: Check and create table
      const exists = await this.tableExists('productos');
      
      if (!exists) {
        await this.createProductosTable();
      } else {
        console.log('ℹ️  Table "productos" already exists');
      }
      
      console.log('🎉 Database setup completed successfully');
      
    } catch (error) {
      console.error('❌ Setup failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await this.close();
    }
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  const dbSetup = new DatabaseSetup();
  dbSetup.setup();
}

export default DatabaseSetup;
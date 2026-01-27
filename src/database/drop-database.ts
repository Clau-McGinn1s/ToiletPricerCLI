import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { getDatabaseConfig, DatabaseConfig } from './config';

dotenv.config();

async function dropDatabase(config?: Partial<DatabaseConfig>): Promise<void> {
  const defaultConfig = getDatabaseConfig();
  const finalConfig = { ...defaultConfig, ...config };

  let connection: mysql.Connection | null = null;

  try {
    // Connect to MySQL server without specifying a database
    connection = await mysql.createConnection({
      host: finalConfig.host,
      user: finalConfig.user,
      password: finalConfig.password,
      port: finalConfig.port,
    });

    console.log(`Connected to MySQL server at ${finalConfig.host}:${finalConfig.port}`);

    // Drop the database
    await connection.execute(`DROP DATABASE IF EXISTS \`${finalConfig.database}\``);
    console.log(`Database "${finalConfig.database}" dropped successfully`);

  } catch (error) {
    console.error('Failed to drop database:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed');
    }
  }
}

// Run if executed directly
if (require.main === module) {
  dropDatabase();
}

export default dropDatabase;

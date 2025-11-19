import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'master',
  user: process.env.DB_USERNAME || 'sa',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    cryptoCredentialsDetails: {
      minVersion: 'TLSv1'
    },
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

// Cache for database-specific connections
const databasePools: Map<string, sql.ConnectionPool> = new Map();

export const connectDB = async (databaseName?: string): Promise<sql.ConnectionPool> => {
  try {
    // If no specific database requested, use the default pool (master)
    if (!databaseName) {
      if (pool && pool.connected) {
        return pool;
      }
      console.log('Connecting to default database (master)...');
      pool = await sql.connect(config);
      console.log('Connected to SQL Server successfully');
      return pool;
    }

    // Check if we already have a pool for this database
    if (databasePools.has(databaseName)) {
      const existingPool = databasePools.get(databaseName)!;
      if (existingPool.connected) {
        // Verify this pool is actually connected to the correct database
        try {
          const result = await existingPool.request().query('SELECT DB_NAME() as CurrentDatabase');
          const currentDb = result.recordset[0].CurrentDatabase;
          if (currentDb === databaseName) {
            console.log(`Using existing connection for database: ${databaseName}`);
            return existingPool;
          } else {
            console.log(`Existing pool connected to wrong database: ${currentDb}, expected: ${databaseName}`);
            // Remove the incorrect pool and create a new one
            databasePools.delete(databaseName);
            await existingPool.close();
          }
        } catch (error) {
          console.log(`Error verifying existing pool for ${databaseName}:`, error);
          databasePools.delete(databaseName);
        }
      }
    }

    // Create new connection for specific database
    const tempConfig = { ...config, database: databaseName };
    console.log(`Creating new connection for database: ${databaseName}`);
    const newPool = new sql.ConnectionPool(tempConfig);
    await newPool.connect();
    console.log(`Successfully connected to database: ${databaseName}`);
    
    databasePools.set(databaseName, newPool);
    return newPool;

  } catch (error) {
    console.error(`Database connection failed for ${databaseName}:`, error);
    throw error;
  }
};

export const getPool = (): sql.ConnectionPool => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectDB() first.');
  }
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Database connection closed');
  }
  
  // Close all database-specific pools
  for (const [databaseName, dbPool] of databasePools.entries()) {
    if (dbPool.connected) {
      await dbPool.close();
      console.log(`Closed connection to database: ${databaseName}`);
    }
  }
  databasePools.clear();
};

export default sql;
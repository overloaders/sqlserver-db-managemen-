import { connectDB } from '../src/db/connection';
import sql from 'mssql';

const createUsersTable = async () => {
  try {
    console.log('Creating Users table...');
    const pool = await connectDB();
    
    const query = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
      BEGIN
          CREATE TABLE Users (
              id INT IDENTITY(1,1) PRIMARY KEY,
              username NVARCHAR(50) UNIQUE NOT NULL,
              password NVARCHAR(255) NOT NULL,
              created_at DATETIME DEFAULT GETDATE(),
              updated_at DATETIME DEFAULT GETDATE()
          );
          
          -- Create index on username for faster lookups
          CREATE INDEX IX_Users_username ON Users(username);
          
          PRINT 'Users table created successfully';
      END
      ELSE
      BEGIN
          PRINT 'Users table already exists';
      END
    `;
    
    await pool.request().query(query);
    console.log('Users table setup completed successfully');
    
  } catch (error) {
    console.error('Error creating Users table:', error);
    process.exit(1);
  }
};

// Run the script
createUsersTable().then(() => {
  console.log('Script completed');
  process.exit(0);
});
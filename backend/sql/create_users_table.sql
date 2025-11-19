-- Create Users table for authentication
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

-- Optional: Insert a default admin user (password: admin123)
-- IF NOT EXISTS (SELECT 1 FROM Users WHERE username = 'admin')
-- BEGIN
--     INSERT INTO Users (username, password) VALUES 
--     ('admin', '$2b$10$rQZ9qF8xL6KoF3yH9Jl.XuK5vQ2N8mP4RtY6Wq3S9z1H7vB2e5cK'); -- admin123 hashed with bcrypt
--     PRINT 'Default admin user created (username: admin, password: admin123)';
-- END
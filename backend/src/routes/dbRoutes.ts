import { Router } from 'express';
import { connectDB } from '../db/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import sql from 'mssql';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all tables
router.get('/tables', async (req: AuthRequest, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          TABLE_NAME as name,
          TABLE_SCHEMA as [schema],
          TABLE_TYPE as type
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);

    res.json({
      tables: result.recordset
    });

  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Get data from specific table
router.get('/data/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 100, offset = 0, database } = req.query;

    // Validate table name to prevent SQL injection
    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string);

    // Get table data with pagination - use database prefix if specified
    const tableReference = database ? `[${database}].[dbo].[${tableName}]` : `[${tableName}]`;
    const result = await pool.request()
      .input('limit', sql.Int, parseInt(limit as string))
      .input('offset', sql.Int, parseInt(offset as string))
      .query(`
        SELECT *
        FROM ${tableReference}
        ORDER BY 1
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

    // Get column information - specify database in INFORMATION_SCHEMA query
    let columnsQuery = database ? `
      SELECT 
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        c.IS_NULLABLE as nullable,
        c.COLUMN_DEFAULT as default_value
      FROM [${database}].INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = @tableName
      ORDER BY c.ORDINAL_POSITION
    ` : `
      SELECT 
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        c.IS_NULLABLE as nullable,
        c.COLUMN_DEFAULT as default_value
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = @tableName
      ORDER BY c.ORDINAL_POSITION
    `;

    const columnsResult = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query(columnsQuery);

    // Get primary key information
    let pkQuery = database ? `
      SELECT ku.COLUMN_NAME
      FROM [${database}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
      INNER JOIN [${database}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        AND ku.TABLE_NAME = @tableName
    ` : `
      SELECT ku.COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
      INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        AND ku.TABLE_NAME = @tableName
    `;

    const pkResult = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query(pkQuery);

    // Get identity column information
    let identityQuery = database ? `
      SELECT c.name as column_name
      FROM [${database}].sys.identity_columns ic
      INNER JOIN [${database}].sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN [${database}].sys.tables t ON c.object_id = t.object_id
      WHERE t.name = @tableName
    ` : `
      SELECT c.name as column_name
      FROM sys.identity_columns ic
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      WHERE t.name = @tableName
    `;

    let identityResult;
    try {
      identityResult = await pool.request()
        .input('tableName', sql.VarChar, tableName)
        .query(identityQuery);
    } catch (error) {
      console.log('Could not get identity columns, assuming none exist:', error instanceof Error ? error.message : String(error));
      identityResult = { recordset: [] };
    }

    // Combine all information
    const columns = columnsResult.recordset.map(col => {
      const isPrimaryKey = pkResult.recordset.some(pk => pk.COLUMN_NAME === col.name) ? 1 : 0;
      const isIdentity = identityResult.recordset.some(ic => ic.column_name === col.name) ? 1 : 0;
      
      return {
        ...col,
        is_primary_key: isPrimaryKey,
        is_identity: isIdentity
      };
    });

    // Get total row count - use database prefix if specified
    const countResult = await pool.request()
      .query(`SELECT COUNT(*) as total FROM ${tableReference}`);

    res.json({
      data: result.recordset,
      columns: columns, // Return enhanced columns array with identity information
      total: countResult.recordset[0].total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      database: database || 'master' // Include database information
    });

  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({ error: 'Failed to fetch table data' });
  }
});

// Execute custom query
router.post('/query', async (req: AuthRequest, res) => {
  try {
    const { query, database } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Trim and normalize query
    const trimmedQuery = query.trim();
    const upperQuery = trimmedQuery.toUpperCase();

    // Allow SELECT queries and some safe operations
    const allowedKeywords = ['SELECT', 'WITH', 'INSERT', 'UPDATE', 'USE'];
    const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER TABLE', 'DROP TABLE', 'DROP DATABASE', 'EXEC', 'EXECUTE', 'XP_', 'SP_'];
    
    // Check if query starts with allowed keywords
    const startsWithAllowed = allowedKeywords.some(keyword => 
      upperQuery.startsWith(keyword)
    );

    if (!startsWithAllowed) {
      return res.status(400).json({ 
        error: 'Only SELECT, INSERT, UPDATE, WITH, and USE queries are allowed for safety.' 
      });
    }

    // Check for dangerous keywords (more specific matching)
    for (const keyword of dangerousKeywords) {
      if (upperQuery.includes(keyword)) {
        return res.status(400).json({ 
          error: `Query contains dangerous operation: ${keyword}. This is not allowed for security reasons.` 
        });
      }
    }

    const pool = await connectDB(database as string);
    
    const result = await pool.request().query(trimmedQuery);

    res.json({
      data: result.recordset || [],
      rowCount: result.rowsAffected ? result.rowsAffected[0] : 0,
      columns: result.recordset && result.recordset.length > 0 ? Object.keys(result.recordset[0]) : []
    });

  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({ 
      error: 'Failed to execute query',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all databases
router.get('/databases', async (req: AuthRequest, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          name as database_name,
          database_id,
          create_date,
          state_desc as status,
          recovery_model_desc as recovery_model
        FROM sys.databases
        WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
        ORDER BY name
      `);

    res.json({
      databases: result.recordset
    });

  } catch (error) {
    console.error('Error fetching databases:', error);
    res.status(500).json({ error: 'Failed to fetch databases' });
  }
});

// Create new database
router.post('/databases', async (req: AuthRequest, res) => {
  try {
    const { databaseName } = req.body;

    if (!databaseName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB();
    
    await pool.request()
      .query(`CREATE DATABASE [${databaseName}]`);

    res.json({
      message: `Database '${databaseName}' created successfully`,
      databaseName
    });

  } catch (error) {
    console.error('Error creating database:', error);
    res.status(500).json({ 
      error: 'Failed to create database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete database
router.delete('/databases/:databaseName', async (req: AuthRequest, res) => {
  try {
    const { databaseName } = req.params;

    if (!databaseName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB();
    
    // Set database to single user mode and drop it
    await pool.request()
      .query(`
        IF EXISTS (SELECT name FROM sys.databases WHERE name = '${databaseName}')
        BEGIN
          ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
          DROP DATABASE [${databaseName}];
        END
      `);

    res.json({
      message: `Database '${databaseName}' deleted successfully`,
      databaseName
    });

  } catch (error) {
    console.error('Error deleting database:', error);
    res.status(500).json({ 
      error: 'Failed to delete database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get tables from specific database
router.get('/databases/:databaseName/tables', async (req: AuthRequest, res) => {
  try {
    const { databaseName } = req.params;
    const { includeSystem = 'false' } = req.query;

    if (!databaseName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    console.log(`Fetching tables for database: ${databaseName}, includeSystem: ${includeSystem}`);
    
    // Connect to the specific database, not master
    const pool = await connectDB(databaseName);
    
    // Verify we're connected to the correct database
    const dbTest = await pool.request().query('SELECT DB_NAME() as CurrentDatabase');
    console.log(`Actually connected to database: ${dbTest.recordset[0].CurrentDatabase}`);
    
    // Query from the correct database
    let query = `
      SELECT 
        TABLE_NAME as name,
        TABLE_SCHEMA as [schema],
        TABLE_TYPE as type
      FROM ${databaseName}.INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
    `;

    // Only filter out obvious system objects, keep everything else
    if (includeSystem !== 'true') {
      query += `
        AND TABLE_NAME NOT IN ('spt_fallback_db', 'spt_fallback_dev', 'spt_fallback_usg', 'spt_monitor', 'MSreplication_options')
        AND TABLE_NAME NOT LIKE 'sys_%'
        AND TABLE_NAME NOT LIKE 'dm_%'
        AND TABLE_NAME NOT LIKE 'fn_%'
        AND TABLE_NAME NOT LIKE 'sp_%'
        AND TABLE_NAME NOT LIKE 'xp_%'
        AND TABLE_NAME NOT LIKE 'ms_%'
        AND TABLE_SCHEMA NOT IN ('sys', 'information_schema')
        AND TABLE_NAME NOT IN ('trace_xe_action_map', 'trace_xe_event_map')
      `;
    }

    query += ' ORDER BY TABLE_SCHEMA, TABLE_NAME';
    
    console.log(`Executing query: ${query}`);
    const result = await pool.request().query(query);
    
    console.log(`Found ${result.recordset.length} tables`);
    result.recordset.forEach(table => {
      console.log(`Table: ${table.name}, Schema: ${table.schema}, Type: ${table.type}`);
    });

    res.json({
      tables: result.recordset,
      databaseName,
      total: result.recordset.length
    });

  } catch (error) {
    console.error('Error fetching database tables:', error);
    res.status(500).json({ error: 'Failed to fetch database tables' });
  }
});

// List triggers for a table
router.get('/tables/:tableName/triggers', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { database } = req.query;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string | undefined);

    // Detect schema for the table
    const schemaQuery = database ? `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM [${database}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    ` : `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    `;
    const schemaRes = await pool.request().input('tableName', sql.VarChar, tableName).query(schemaQuery);
    const schemaName = schemaRes.recordset[0]?.table_schema || 'dbo';

    const query = `
      DECLARE @parentId INT = OBJECT_ID(QUOTENAME(@schemaName) + '.' + QUOTENAME(@tableName));
      SELECT 
        t.name AS trigger_name,
        t.is_disabled,
        t.is_instead_of_trigger,
        STUFF((
          SELECT ',' + CASE te.type WHEN 1 THEN 'DELETE' WHEN 2 THEN 'INSERT' WHEN 3 THEN 'UPDATE' END
          FROM sys.trigger_events te WHERE te.object_id = t.object_id
          FOR XML PATH(''), TYPE
        ).value('.', 'nvarchar(max)'), 1, 1, '') AS events,
        sm.definition
      FROM sys.triggers t
      LEFT JOIN sys.sql_modules sm ON t.object_id = sm.object_id
      WHERE t.parent_id = @parentId
    `;

    const result = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .input('schemaName', sql.VarChar, schemaName)
      .query(query);

    res.json({ schema: schemaName, triggers: result.recordset });
  } catch (error) {
    console.error('Error fetching triggers:', error);
    res.status(500).json({ error: 'Failed to fetch triggers' });
  }
});

// Create trigger on a table
router.post('/tables/:tableName/triggers', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { triggerName, events, isInsteadOf = false, definition = '', database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    if (!triggerName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(triggerName)) {
      return res.status(400).json({ error: 'Invalid trigger name' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Trigger events are required' });
    }
    const validEvents = ['INSERT', 'UPDATE', 'DELETE'];
    for (const ev of events) {
      if (!validEvents.includes(String(ev).toUpperCase())) {
        return res.status(400).json({ error: `Invalid event: ${ev}` });
      }
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string | undefined);
    // Detect schema
    const schemaQuery = database ? `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM [${database}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    ` : `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    `;
    const schemaRes = await pool.request().input('tableName', sql.VarChar, tableName).query(schemaQuery);
    const schemaName = schemaRes.recordset[0]?.table_schema || 'dbo';

    const eventsClause = events.map((e: string) => e.toUpperCase()).join(', ');
    const triggerType = isInsteadOf ? 'INSTEAD OF' : 'AFTER';
    const tableRef = `[${schemaName}].[${tableName}]`;
    const triggerRef = `[${schemaName}].[${triggerName}]`;

    // Replace hardcoded schema tokens if present in body
    const finalDef = (definition || '').replace(/\[dbo\]/g, `[${schemaName}]`);
    const sqlText = `
CREATE TRIGGER ${triggerRef} ON ${tableRef}
${triggerType} ${eventsClause}
AS
BEGIN
  ${finalDef || '-- TODO: implement trigger logic'}
END
`;

    const request = pool.request();
    request.input('sqlText', sql.NVarChar(sql.MAX), sqlText);
    await request.query('EXEC sp_executesql @sqlText');

    res.json({ message: `Trigger '${triggerName}' created successfully` });
  } catch (error) {
    console.error('Error creating trigger:', error);
    res.status(500).json({ error: 'Failed to create trigger' });
  }
});

// Update or enable/disable trigger
router.put('/tables/:tableName/triggers/:triggerName', async (req: AuthRequest, res) => {
  try {
    const { tableName, triggerName } = req.params;
    const { events, isInsteadOf, definition, disabled, database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    if (!triggerName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(triggerName)) {
      return res.status(400).json({ error: 'Invalid trigger name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string | undefined);
    // Detect schema
    const schemaQuery = database ? `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM [${database}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    ` : `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    `;
    const schemaRes = await pool.request().input('tableName', sql.VarChar, tableName).query(schemaQuery);
    const schemaName = schemaRes.recordset[0]?.table_schema || 'dbo';
    const tableRef = `[${schemaName}].[${tableName}]`;
    const triggerRef = `[${schemaName}].[${triggerName}]`;

    if (typeof disabled === 'boolean') {
      const stmt = disabled 
        ? `DISABLE TRIGGER ${triggerRef} ON ${tableRef}`
        : `ENABLE TRIGGER ${triggerRef} ON ${tableRef}`;
      await pool.request().query(stmt);
      return res.json({ message: `Trigger '${triggerName}' ${disabled ? 'disabled' : 'enabled'} successfully` });
    }

    if (!Array.isArray(events) || events.length === 0 || typeof isInsteadOf !== 'boolean' || !definition) {
      return res.status(400).json({ error: 'Events, isInsteadOf, and definition are required for update' });
    }

    const validEvents = ['INSERT', 'UPDATE', 'DELETE'];
    for (const ev of events) {
      if (!validEvents.includes(String(ev).toUpperCase())) {
        return res.status(400).json({ error: `Invalid event: ${ev}` });
      }
    }

    const eventsClause = events.map((e: string) => e.toUpperCase()).join(', ');
    const triggerType = isInsteadOf ? 'INSTEAD OF' : 'AFTER';
    const finalDef = (definition || '').replace(/\[dbo\]/g, `[${schemaName}]`);
    const sqlText = `
ALTER TRIGGER ${triggerRef} ON ${tableRef}
${triggerType} ${eventsClause}
AS
BEGIN
  ${finalDef}
END
`;
    const request = pool.request();
    request.input('sqlText', sql.NVarChar(sql.MAX), sqlText);
    await request.query('EXEC sp_executesql @sqlText');

    res.json({ message: `Trigger '${triggerName}' updated successfully` });
  } catch (error) {
    console.error('Error updating trigger:', error);
    res.status(500).json({ error: 'Failed to update trigger' });
  }
});

// Delete trigger
router.delete('/tables/:tableName/triggers/:triggerName', async (req: AuthRequest, res) => {
  try {
    const { tableName, triggerName } = req.params;
    const { database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    if (!triggerName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(triggerName)) {
      return res.status(400).json({ error: 'Invalid trigger name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string | undefined);
    // Detect schema
    const schemaQuery = database ? `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM [${database}].INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    ` : `
      SELECT TOP 1 TABLE_SCHEMA as table_schema
      FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
    `;
    const schemaRes = await pool.request().input('tableName', sql.VarChar, tableName).query(schemaQuery);
    const schemaName = schemaRes.recordset[0]?.table_schema || 'dbo';
    const tableRef = `[${schemaName}].[${tableName}]`;
    const triggerRef = `[${schemaName}].[${triggerName}]`;

    await pool.request().query(`DROP TRIGGER ${triggerRef} ON ${tableRef}`);

    res.json({ message: `Trigger '${triggerName}' deleted successfully` });
  } catch (error) {
    console.error('Error deleting trigger:', error);
    res.status(500).json({ error: 'Failed to delete trigger' });
  }
});

// List stored procedures
router.get('/procedures', async (req: AuthRequest, res) => {
  try {
    const { database, schema, search } = req.query as { database?: string; schema?: string; search?: string };

    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }

    const pool = await connectDB(database);

    const sysProcedures = database 
      ? `[${database}].sys.procedures`
      : `sys.procedures`;
    const sysSchemas = database 
      ? `[${database}].sys.schemas`
      : `sys.schemas`;

    let query = `
      SELECT 
        p.name AS name,
        s.name AS [schema],
        p.create_date,
        p.modify_date,
        p.object_id
      FROM ${sysProcedures} p
      INNER JOIN ${sysSchemas} s ON p.schema_id = s.schema_id
      WHERE 1=1
    `;
    if (schema) {
      query += ` AND s.name = @schemaName`;
    }
    if (search) {
      query += ` AND p.name LIKE @searchLike`;
    }
    query += ` ORDER BY s.name, p.name`;

    const request = pool.request();
    if (schema) request.input('schemaName', sql.VarChar, schema);
    if (search) request.input('searchLike', sql.VarChar, `%${search}%`);

    let result;
    try {
      result = await request.query(query);
    } catch (err) {
      const infoRoutines = database 
        ? `[${database}].INFORMATION_SCHEMA.ROUTINES`
        : `INFORMATION_SCHEMA.ROUTINES`;
      let fallback = `
        SELECT 
          ROUTINE_NAME AS name,
          ROUTINE_SCHEMA AS [schema],
          CREATED AS create_date,
          LAST_ALTERED AS modify_date,
          NULL AS object_id
        FROM ${infoRoutines}
        WHERE ROUTINE_TYPE = 'PROCEDURE'
      `;
      if (schema) fallback += ` AND ROUTINE_SCHEMA = @schemaName`;
      if (search) fallback += ` AND ROUTINE_NAME LIKE @searchLike`;
      fallback += ` ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`;
      result = await request.query(fallback);
    }

    res.json({ procedures: result.recordset });
  } catch (error: any) {
    console.error('Error fetching procedures:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch procedures' });
  }
});

// Get stored procedure definition
router.get('/procedures/:procedureName', async (req: AuthRequest, res) => {
  try {
    const { procedureName } = req.params;
    const { database, schema } = req.query as { database?: string; schema?: string };

    if (!procedureName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(procedureName)) {
      return res.status(400).json({ error: 'Invalid procedure name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }

    const pool = await connectDB(database);
    const request = pool.request();
    request.input('procName', sql.VarChar, procedureName);
    if (schema) request.input('schemaName', sql.VarChar, schema);

    const query = `
      DECLARE @oid INT = OBJECT_ID(COALESCE(QUOTENAME(@schemaName) + '.', '') + QUOTENAME(@procName));
      SELECT sm.definition
      FROM sys.sql_modules sm WHERE sm.object_id = @oid
    `;
    const result = await request.query(query);
    res.json({ definition: result.recordset[0]?.definition || '' });
  } catch (error) {
    console.error('Error fetching procedure definition:', error);
    res.status(500).json({ error: 'Failed to fetch procedure definition' });
  }
});

// Create stored procedure
router.post('/procedures', async (req: AuthRequest, res) => {
  try {
    const { database, schema = 'dbo', procedureName, definition } = req.body as { database?: string; schema?: string; procedureName: string; definition: string };

    if (!procedureName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(procedureName)) {
      return res.status(400).json({ error: 'Invalid procedure name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }
    if (!definition || typeof definition !== 'string') {
      return res.status(400).json({ error: 'Procedure definition is required' });
    }

    const pool = await connectDB(database);
    const procRef = `[${schema}].[${procedureName}]`;
    let finalDef = (definition || '').trim().replace(/\r?\n/g, '\n');
    finalDef = finalDef.replace(/\b\[dbo\]\b/gi, `[${schema}]`).replace(/\bdbo\b/gi, schema);
    finalDef = finalDef.replace(/\bGO\b/gi, '');
    const hasHeader = /^\s*(CREATE|ALTER|UPDATE)\s+(PROCEDURE|PROC)\b/mi.test(finalDef);
    let sqlText: string;
    if (hasHeader) {
      const upper = finalDef.toUpperCase();
      const asIdx = upper.indexOf('AS');
      if (asIdx > -1) {
        const body = finalDef.slice(asIdx + 2).trim();
        sqlText = `CREATE PROCEDURE ${procRef}\nAS\n${body}`;
      } else {
        sqlText = `CREATE PROCEDURE ${procRef}\nAS\nBEGIN\n  ${finalDef}\nEND`;
      }
    } else {
      sqlText = `CREATE PROCEDURE ${procRef}\nAS\nBEGIN\n  ${finalDef}\nEND`;
    }
    const request = pool.request();
    request.input('sqlText', sql.NVarChar(sql.MAX), sqlText);
    await request.query('EXEC sp_executesql @sqlText');

    res.json({ message: `Procedure '${procedureName}' created successfully` });
  } catch (error) {
    console.error('Error creating procedure:', error);
    res.status(500).json({ error: 'Failed to create procedure' });
  }
});

// Update stored procedure
router.put('/procedures/:procedureName', async (req: AuthRequest, res) => {
  try {
    const { procedureName } = req.params;
    const { database, schema = 'dbo', definition } = req.body as { database?: string; schema?: string; definition: string };

    if (!procedureName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(procedureName)) {
      return res.status(400).json({ error: 'Invalid procedure name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }
    if (!definition || typeof definition !== 'string') {
      return res.status(400).json({ error: 'Procedure definition is required' });
    }

    const pool = await connectDB(database);
    const procRef = `[${schema}].[${procedureName}]`;
    let finalDef = (definition || '').trim().replace(/\r?\n/g, '\n');
    finalDef = finalDef.replace(/\b\[dbo\]\b/gi, `[${schema}]`).replace(/\bdbo\b/gi, schema);
    finalDef = finalDef.replace(/\bGO\b/gi, '');
    const hasHeader = /^\s*(CREATE|ALTER|UPDATE)\s+(PROCEDURE|PROC)\b/mi.test(finalDef);
    let sqlText: string;
    if (hasHeader) {
      const upper = finalDef.toUpperCase();
      const asIdx = upper.indexOf('AS');
      if (asIdx > -1) {
        const body = finalDef.slice(asIdx + 2).trim();
        sqlText = `ALTER PROCEDURE ${procRef}\nAS\n${body}`;
      } else {
        sqlText = `ALTER PROCEDURE ${procRef}\nAS\nBEGIN\n  ${finalDef}\nEND`;
      }
    } else {
      sqlText = `ALTER PROCEDURE ${procRef}\nAS\nBEGIN\n  ${finalDef}\nEND`;
    }
    const request = pool.request();
    request.input('sqlText', sql.NVarChar(sql.MAX), sqlText);
    await request.query('EXEC sp_executesql @sqlText');

    res.json({ message: `Procedure '${procedureName}' updated successfully` });
  } catch (error) {
    console.error('Error updating procedure:', error);
    res.status(500).json({ error: 'Failed to update procedure' });
  }
});

// Delete stored procedure
router.delete('/procedures/:procedureName', async (req: AuthRequest, res) => {
  try {
    const { procedureName } = req.params;
    const { database, schema = 'dbo' } = req.body as { database?: string; schema?: string };

    if (!procedureName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(procedureName)) {
      return res.status(400).json({ error: 'Invalid procedure name' });
    }
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }

    const pool = await connectDB(database);
    await pool.request().query(`DROP PROCEDURE [${schema}].[${procedureName}]`);
    res.json({ message: `Procedure '${procedureName}' deleted successfully` });
  } catch (error) {
    console.error('Error deleting procedure:', error);
    res.status(500).json({ error: 'Failed to delete procedure' });
  }
});

// Get table structure
router.get('/structure/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { database } = req.query;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string);

    const result = await pool.request()
      .input('tableName', sql.VarChar, tableName)
      .query(database ? `
        SELECT 
          c.COLUMN_NAME as name,
          c.DATA_TYPE as type,
          c.CHARACTER_MAXIMUM_LENGTH as max_length,
          c.NUMERIC_PRECISION as precision,
          c.NUMERIC_SCALE as scale,
          c.IS_NULLABLE as nullable,
          c.COLUMN_DEFAULT as default_value,
          CASE 
            WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 
            ELSE 0 
          END as is_primary_key
        FROM [${database}].INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM [${database}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          INNER JOIN [${database}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND ku.TABLE_NAME = @tableName
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = @tableName
        ORDER BY c.ORDINAL_POSITION
      ` : `
        SELECT 
          c.COLUMN_NAME as name,
          c.DATA_TYPE as type,
          c.CHARACTER_MAXIMUM_LENGTH as max_length,
          c.NUMERIC_PRECISION as precision,
          c.NUMERIC_SCALE as scale,
          c.IS_NULLABLE as nullable,
          c.COLUMN_DEFAULT as default_value,
          CASE 
            WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 
            ELSE 0 
          END as is_primary_key
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND ku.TABLE_NAME = @tableName
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = @tableName
        ORDER BY c.ORDINAL_POSITION
      `);

    res.json({
      structure: result.recordset
    });

  } catch (error) {
    console.error('Error fetching table structure:', error);
    res.status(500).json({ error: 'Failed to fetch table structure' });
  }
});

// Create new table
router.post('/tables', async (req: AuthRequest, res) => {
  try {
    const { tableName, columns, database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: 'Table must have at least one column' });
    }

    // Validate column definitions
    for (const column of columns) {
      if (!column.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column.name)) {
        return res.status(400).json({ error: `Invalid column name: ${column.name}` });
      }
      if (!column.type) {
        return res.status(400).json({ error: `Column ${column.name} must have a data type` });
      }
    }

    const pool = await connectDB(database as string);

    // Build CREATE TABLE statement with database prefix if specified
    const tableReference = database ? `[${database}].[dbo].[${tableName}]` : `[${tableName}]`;
    const columnDefinitions = columns.map(col => {
      let def = `[${col.name}] ${col.type}`;
      if (col.maxLength && col.type.toUpperCase().includes('VARCHAR')) {
        def += `(${col.maxLength})`;
      }
      if (col.isPrimaryKey) {
        def += ' PRIMARY KEY';
      }
      if (col.isIdentity) {
        def += ' IDENTITY(1,1)';
      }
      if (!col.nullable) {
        def += ' NOT NULL';
      }
      if (col.defaultValue) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(',\n');

    const createQuery = `CREATE TABLE ${tableReference} (\n${columnDefinitions}\n)`;

    await pool.request().query(createQuery);

    res.json({
      message: `Table '${tableName}' created successfully`,
      tableName,
      query: createQuery
    });

  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ 
      error: 'Failed to create table',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete table
router.delete('/tables/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { database } = req.query;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string);

    // Build DROP TABLE statement with database prefix if specified
    const tableReference = database ? `[${database}].[dbo].[${tableName}]` : `[${tableName}]`;

    await pool.request()
      .query(`DROP TABLE ${tableReference}`);

    res.json({
      message: `Table '${tableName}' deleted successfully`,
      tableName
    });

  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ 
      error: 'Failed to delete table',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add column to table
router.post('/tables/:tableName/columns', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { columnName, dataType, maxLength, nullable, defaultValue, database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!columnName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
      return res.status(400).json({ error: 'Invalid column name' });
    }

    if (!dataType) {
      return res.status(400).json({ error: 'Data type is required' });
    }

    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string);

    let alterQuery = `ALTER TABLE [${tableName}] ADD [${columnName}] ${dataType}`;
    
    if (maxLength && dataType.toUpperCase().includes('VARCHAR')) {
      alterQuery += `(${maxLength})`;
    }
    
    if (!nullable) {
      alterQuery += ' NOT NULL';
    }
    
    if (defaultValue) {
      alterQuery += ` DEFAULT ${defaultValue}`;
    }

    await pool.request().query(alterQuery);

    res.json({
      message: `Column '${columnName}' added to table '${tableName}' successfully`,
      tableName,
      columnName,
      query: alterQuery
    });

  } catch (error) {
    console.error('Error adding column:', error);
    res.status(500).json({ 
      error: 'Failed to add column',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Remove column from table
router.delete('/tables/:tableName/columns/:columnName', async (req: AuthRequest, res) => {
  try {
    const { tableName, columnName } = req.params;
    const { database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!columnName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
      return res.status(400).json({ error: 'Invalid column name' });
    }

    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database as string);

    await pool.request()
      .query(`ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`);

    res.json({
      message: `Column '${columnName}' removed from table '${tableName}' successfully`,
      tableName,
      columnName
    });

  } catch (error) {
    console.error('Error removing column:', error);
    res.status(500).json({ 
      error: 'Failed to remove column',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Insert data into table
router.post('/data/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { data, database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data is required' });
    }

    // Check if data object has any properties
    const originalColumns = Object.keys(data);
    if (originalColumns.length === 0) {
      return res.status(400).json({ error: 'No data fields provided for insertion' });
    }

    // Filter out empty string values to avoid inserting empty data
    const filteredData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== '' && value !== null && value !== undefined) {
        filteredData[key] = value;
      }
    }

    // Check if any data remains after filtering
    const filteredColumns = Object.keys(filteredData);
    if (filteredColumns.length === 0) {
      return res.status(400).json({ error: 'No valid data fields provided for insertion (all fields were empty)' });
    }

    const pool = await connectDB(database);

    // Build INSERT statement with proper parameter names using filtered data
    const columns = Object.keys(filteredData);
    const placeholders = columns.map(col => `@${col}`).join(', ');
    
    const insertQuery = `INSERT INTO [${tableName}] (${columns.map(col => `[${col}]`).join(', ')}) VALUES (${placeholders})`;

    const request = pool.request();
    Object.entries(filteredData).forEach(([key, value]) => {
      request.input(key, value as any);
    });

    const result = await request.query(insertQuery);

    res.json({
      message: `Row inserted successfully into ${tableName}`,
      rowCount: result.rowsAffected ? result.rowsAffected[0] : 0
    });

  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).json({ 
      error: 'Failed to insert data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update data in table
router.put('/data/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { data, where, database } = req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data is required' });
    }

    if (!where || typeof where !== 'object') {
      return res.status(400).json({ error: 'Where clause is required for safety' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database);

    // Build UPDATE statement with proper parameter names and database prefix
    const tableReference = database ? `[${database}].[dbo].[${tableName}]` : `[${tableName}]`;
    const setClause = Object.keys(data).map(col => `[${col}] = @set_${col}`).join(', ');
    const whereClause = Object.keys(where).map(col => `[${col}] = @where_${col}`).join(' AND ');
    
    const updateQuery = `UPDATE ${tableReference} SET ${setClause} WHERE ${whereClause}`;

    const request = pool.request();
    
    // Add SET parameters
    Object.entries(data).forEach(([key, value]) => {
      request.input(`set_${key}`, value as any);
    });
    
    // Add WHERE parameters
    Object.entries(where).forEach(([key, value]) => {
      request.input(`where_${key}`, value as any);
    });

    const result = await request.query(updateQuery);

    res.json({
      message: `Row updated successfully in ${tableName}`,
      rowCount: result.rowsAffected ? result.rowsAffected[0] : 0
    });

  } catch (error) {
    console.error('Error updating data:', error);
    res.status(500).json({ 
      error: 'Failed to update data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete data from table
router.delete('/data/:tableName', async (req: AuthRequest, res) => {
  try {
    const { tableName } = req.params;
    const { where, database } = req.body.data || req.body;

    if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!where || typeof where !== 'object') {
      return res.status(400).json({ error: 'Where clause is required for safety' });
    }

    // Validate database name if provided
    if (database && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database as string)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const pool = await connectDB(database);

    // Build DELETE statement with database prefix
    const tableReference = database ? `[${database}].[dbo].[${tableName}]` : `[${tableName}]`;
    const whereClause = Object.keys(where).map(col => `[${col}] = @${col}`).join(' AND ');
    
    const deleteQuery = `DELETE FROM ${tableReference} WHERE ${whereClause}`;

    const request = pool.request();
    Object.entries(where).forEach(([key, value]) => {
      request.input(key, value as any);
    });

    const result = await request.query(deleteQuery);

    res.json({
      message: `Row deleted successfully from ${tableName}`,
      rowCount: result.rowsAffected[0]
    });

  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ 
      error: 'Failed to delete data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
// Backup database
router.post('/backup', async (req: AuthRequest, res) => {
  try {
    const { database, backupPath } = req.body as { database?: string; backupPath?: string };
    if (!database || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (!backupPath || typeof backupPath !== 'string' || backupPath.length < 4) {
      return res.status(400).json({ error: 'Invalid backup path' });
    }
    const pool = await connectDB();
    const request = pool.request();
    request.input('dbName', sql.VarChar, database);
    request.input('path', sql.NVarChar(sql.MAX), backupPath);
    await request.query(`BACKUP DATABASE [${database}] TO DISK = @path WITH INIT, COPY_ONLY`);
    res.json({ message: `Backup created for database '${database}'`, path: backupPath });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Restore database
router.post('/restore', async (req: AuthRequest, res) => {
  try {
    const { database, backupPath, withReplace = true } = req.body as { database?: string; backupPath?: string; withReplace?: boolean };
    if (!database || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }
    if (!backupPath || typeof backupPath !== 'string' || backupPath.length < 4) {
      return res.status(400).json({ error: 'Invalid backup path' });
    }
    const pool = await connectDB();
    const request = pool.request();
    request.input('path', sql.NVarChar(sql.MAX), backupPath);
    await request.query(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
    await request.query(`RESTORE DATABASE [${database}] FROM DISK = @path WITH ${withReplace ? 'REPLACE,' : ''} RECOVERY`);
    await request.query(`ALTER DATABASE [${database}] SET MULTI_USER`);
    res.json({ message: `Database '${database}' restored from backup`, path: backupPath });
  } catch (error) {
    console.error('Error restoring database:', error);
    res.status(500).json({ error: 'Failed to restore database' });
  }
});

import sql from 'mssql';
export declare const connectDB: (databaseName?: string) => Promise<sql.ConnectionPool>;
export declare const getPool: () => sql.ConnectionPool;
export declare const closePool: () => Promise<void>;
export default sql;
//# sourceMappingURL=connection.d.ts.map
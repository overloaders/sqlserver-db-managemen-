import api from './api';

export interface Database {
  database_name: string;
  database_id: number;
  create_date: string;
  status: string;
  recovery_model: string;
}

export interface CreateDatabaseRequest {
  databaseName: string;
}

export interface DatabaseResponse {
  success: boolean;
  message: string;
  databaseName?: string;
}

export interface TableColumn {
  name: string;
  type: string;
  max_length?: number;
  precision?: number;
  scale?: number;
  nullable: string;
  default_value?: string;
  is_primary_key: number;
}

export interface TableStructure {
  structure: TableColumn[];
}

export interface CreateTableColumn {
  name: string;
  type: string;
  maxLength?: number;
  isPrimaryKey?: boolean;
  isIdentity?: boolean;
  nullable?: boolean;
  defaultValue?: string;
}

export interface CreateTableRequest {
  tableName: string;
  columns: CreateTableColumn[];
}

export interface TableResponse {
  message: string;
  tableName?: string;
  columnName?: string;
  query?: string;
}

export const databaseService = {
  // Get all databases
  getDatabases: async (): Promise<Database[]> => {
    const response = await api.get('/db/databases');
    return response.data.databases;
  },

  // Create new database
  createDatabase: async (databaseName: string): Promise<DatabaseResponse> => {
    const response = await api.post('/db/databases', { databaseName });
    return response.data;
  },

  // Delete database
  deleteDatabase: async (databaseName: string): Promise<DatabaseResponse> => {
    const response = await api.delete(`/db/databases/${databaseName}`);
    return response.data;
  },

  backupDatabase: async (databaseName: string, backupPath: string) => {
    const response = await api.post('/db/backup', { database: databaseName, backupPath });
    return response.data;
  },

  restoreDatabase: async (databaseName: string, backupPath: string, withReplace = true) => {
    const response = await api.post('/db/restore', { database: databaseName, backupPath, withReplace });
    return response.data;
  },

  // Get tables from specific database
  getDatabaseTables: async (databaseName: string, includeSystem = false) => {
    const response = await api.get(`/db/databases/${databaseName}/tables`, {
      params: { includeSystem: includeSystem.toString() }
    });
    return response.data;
  },

  // Get table structure
  getTableStructure: async (tableName: string, database?: string): Promise<TableStructure> => {
    const response = await api.get(`/db/structure/${tableName}${database ? `?database=${database}` : ''}`);
    return response.data;
  },

  // Create new table
  createTable: async (tableData: CreateTableRequest, database?: string): Promise<TableResponse> => {
    const response = await api.post('/db/tables', { ...tableData, database });
    return response.data;
  },

  // Delete table
  deleteTable: async (tableName: string, database?: string): Promise<TableResponse> => {
    const response = await api.delete(`/db/tables/${tableName}${database ? `?database=${database}` : ''}`);
    return response.data;
  },

  // Add column to table
  addColumn: async (
    tableName: string,
    columnData: {
      columnName: string;
      dataType: string;
      maxLength?: number;
      nullable?: boolean;
      defaultValue?: string;
    },
    database?: string
  ): Promise<TableResponse> => {
    const response = await api.post(`/db/tables/${tableName}/columns`, { ...columnData, database });
    return response.data;
  },

  // Remove column from table
  removeColumn: async (tableName: string, columnName: string, database?: string): Promise<TableResponse> => {
    const response = await api.delete(`/db/tables/${tableName}/columns/${columnName}`, { data: { database } });
    return response.data;
  }
};

import api from './api';

export interface Table {
  name: string;
  schema: string;
  type: string;
}

export interface TableData {
  data: any[];
  columns: any[];
  total: number;
  limit: number;
  offset: number;
}

export interface QueryResult {
  data: any[];
  rowCount: number;
  columns: string[];
}

export const dbService = {
  getTables: async (): Promise<Table[]> => {
    const response = await api.get('/db/tables');
    return response.data.tables;
  },

  getTableData: async (tableName: string, limit = 100, offset = 0, database?: string): Promise<TableData> => {
    const response = await api.get(`/db/data/${tableName}`, {
      params: { limit, offset, database }
    });
    return response.data;
  },

  executeQuery: async (query: string, database?: string): Promise<QueryResult> => {
    const response = await api.post('/db/query', { query, database });
    return response.data;
  },

  getTableStructure: async (tableName: string, database?: string): Promise<any[]> => {
    const response = await api.get(`/db/structure/${tableName}${database ? `?database=${database}` : ''}`);
    return response.data.structure;
  },

  // Data manipulation methods
  insertData: async (tableName: string, data: Record<string, any>, database?: string) => {
    const response = await api.post(`/db/data/${tableName}`, { data, database });
    return response.data;
  },

  updateData: async (tableName: string, data: Record<string, any>, where: Record<string, any>, database?: string) => {
    const response = await api.put(`/db/data/${tableName}`, { data, where, database });
    return response.data;
  },

  deleteData: async (tableName: string, where: Record<string, any>, database?: string) => {
    const response = await api.delete(`/db/data/${tableName}`, { data: { where, database } });
    return response.data;
  },

  // Triggers API
  getTriggers: async (tableName: string, database?: string) => {
    const response = await api.get(`/db/tables/${tableName}/triggers${database ? `?database=${database}` : ''}`);
    return response.data;
  },

  createTrigger: async (
    tableName: string,
    payload: { triggerName: string; events: string[]; isInsteadOf?: boolean; definition?: string },
    database?: string
  ) => {
    const response = await api.post(`/db/tables/${tableName}/triggers`, { ...payload, database });
    return response.data;
  },

  updateTrigger: async (
    tableName: string,
    triggerName: string,
    payload: { events?: string[]; isInsteadOf?: boolean; definition?: string; disabled?: boolean },
    database?: string
  ) => {
    const response = await api.put(`/db/tables/${tableName}/triggers/${triggerName}`, { ...payload, database });
    return response.data;
  },

  deleteTrigger: async (tableName: string, triggerName: string, database?: string) => {
    const response = await api.delete(`/db/tables/${tableName}/triggers/${triggerName}`, { data: { database } });
    return response.data;
  }
};

export const spService = {
  getProcedures: async (database?: string, schema?: string, search?: string) => {
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    if (search) params.append('search', search);
    const response = await api.get(`/db/procedures${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  },
  getDefinition: async (procedureName: string, database?: string, schema?: string) => {
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    const response = await api.get(`/db/procedures/${procedureName}${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  },
  create: async (procedureName: string, definition: string, database?: string, schema?: string) => {
    const response = await api.post(`/db/procedures`, { procedureName, definition, database, schema });
    return response.data;
  },
  update: async (procedureName: string, definition: string, database?: string, schema?: string) => {
    const response = await api.put(`/db/procedures/${procedureName}`, { definition, database, schema });
    return response.data;
  },
  remove: async (procedureName: string, database?: string, schema?: string) => {
    const response = await api.delete(`/db/procedures/${procedureName}`, { data: { database, schema } });
    return response.data;
  }
};

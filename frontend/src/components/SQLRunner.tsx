import React, { useState, useEffect } from 'react';
import { dbService, QueryResult } from '../services/dbService';
import { databaseService } from '../services/databaseService';
import { useDatabaseStore } from '../stores/databaseStore';

const SQLRunner: React.FC = () => {
  const { currentDatabase } = useDatabaseStore();
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [query, setQuery] = useState(`SELECT TOP (1000) * FROM Users`);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDatabases();
  }, []);

  useEffect(() => {
    if (currentDatabase) {
      setSelectedDatabase(currentDatabase);
    }
  }, [currentDatabase]);

  const loadDatabases = async () => {
    try {
      const data = await databaseService.getDatabases();
      const dbNames = data.databases.map((db: any) => db.database_name);
      setDatabases(dbNames);
      if (currentDatabase && dbNames.includes(currentDatabase)) {
        setSelectedDatabase(currentDatabase);
      } else if (dbNames.length > 0) {
        setSelectedDatabase(dbNames[0]);
      }
    } catch (err) {
      console.error('Failed to load databases:', err);
    }
  };

  const handleExecuteQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await dbService.executeQuery(query, selectedDatabase);
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Query execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row">
      <div className="col-md-12">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">SQL Query Runner</h3>
          </div>
          
          <div className="card-body">
            <form onSubmit={handleExecuteQuery}>
              <div className="form-group">
                <label htmlFor="database-select">Database:</label>
                <select
                  id="database-select"
                  className="form-control mb-3"
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                >
                  {databases.map((db) => (
                    <option key={db} value={db}>
                      {db}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="sql-query">SQL Query:</label>
                <textarea
                  id="sql-query"
                  className="form-control"
                  rows={6}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your SQL query here..."
                  required
                />
              </div>
              
              <div className="form-group">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin me-2"></i>
                      Executing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-play me-2"></i>
                      Execute Query
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  className="btn btn-secondary ms-2"
                  onClick={() => setQuery('')}
                >
                  <i className="fas fa-eraser me-2"></i>
                  Clear
                </button>
              </div>
            </form>

            {error && (
              <div className="alert alert-danger mt-3">
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && (
              <div className="mt-4">
                <h4>Query Results</h4>
                <div className="alert alert-info">
                  <strong>Rows affected:</strong> {result.rowCount}
                </div>
                
                {result.data.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-bordered table-striped">
                      <thead>
                        <tr>
                          {result.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.data.map((row, index) => (
                          <tr key={index}>
                            {result.columns.map((column) => (
                              <td key={column}>
                                {row[column] === null ? (
                                  <em className="text-muted">NULL</em>
                                ) : (
                                  String(row[column])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {result.data.length === 0 && (
                  <div className="alert alert-warning">
                    Query executed successfully but returned no data.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SQLRunner;

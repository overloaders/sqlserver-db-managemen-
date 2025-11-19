import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { dbService, TableData } from '../services/dbService';

const TableViewer: React.FC = () => {
  const { tableName } = useParams<{ tableName: string }>();
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (tableName) {
      fetchTableData();
    }
  }, [tableName, limit, offset]);

  const fetchTableData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await dbService.getTableData(tableName!, limit, offset);
      setTableData(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch table data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevPage = () => {
    if (offset >= limit) {
      setOffset(offset - limit);
    }
  };

  const handleNextPage = () => {
    if (tableData && offset + limit < tableData.total) {
      setOffset(offset + limit);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  if (!tableData || tableData.data.length === 0) {
    return <div className="alert alert-info">No data found in this table.</div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Table: {tableName}</h3>
        <div className="card-tools">
          <span className="badge bg-info">
            Total: {tableData.total} rows
          </span>
        </div>
      </div>
      
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-bordered table-striped">
            <thead>
              <tr>
                {tableData.columns.map((column: any) => (
                  <th key={column.name}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.data.map((row, index) => (
                <tr key={index}>
                  {tableData.columns.map((column: any) => (
                    <td key={column.name}>
                      {row[column.name] === null ? (
                        <em className="text-muted">NULL</em>
                      ) : (
                        String(row[column.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tableData.total > limit && (
          <div className="d-flex justify-content-between align-items-center mt-3">
            <div>
              Showing {offset + 1} to {Math.min(offset + limit, tableData.total)} of {tableData.total} entries
            </div>
            <div>
              <button
                className="btn btn-sm btn-primary me-2"
                onClick={handlePrevPage}
                disabled={offset === 0}
              >
                Previous
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleNextPage}
                disabled={offset + limit >= tableData.total}
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="mt-3">
          <label htmlFor="limit-select">Rows per page:</label>
          <select
            id="limit-select"
            className="form-control form-control-sm d-inline-block ms-2"
            style={{ width: 'auto' }}
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default TableViewer;

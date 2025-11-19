import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { dbService, Table } from '../services/dbService';
import { databaseService } from '../services/databaseService';
import { useDatabaseStore } from '../stores/databaseStore';

const Sidebar: React.FC = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const { currentDatabase } = useDatabaseStore();

  useEffect(() => {
    fetchTables();
  }, [currentDatabase]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      if (currentDatabase) {
        const data = await databaseService.getDatabaseTables(currentDatabase);
        setTables(data.tables || []);
      } else {
        // Fallback to old method if no database selected
        const data = await dbService.getTables();
        setTables(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch tables');
    } finally {
      setLoading(false);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <aside className="app-sidebar sidebar-dark-primary">
      <div className="sidebar-brand">
        <a href="/dashboard" className="brand-link">
          <span className="brand-text fw-bold text-uppercase text-white">SQL SERVER Manager</span>
        </a>
      </div>

      <div className="sidebar-wrapper">
        <div className="user-panel mt-3 pb-3 mb-3 d-flex">
          <div className="info">
            <a href="#" className="d-block">Database Browser</a>
          </div>
        </div>

        <nav className="mt-2">
          <ul className="sidebar-menu nav nav-pills nav-sidebar flex-column" data-lte-toggle="treeview" role="menu" data-accordion="true">
            <li className="nav-item">
              <Link to="/dashboard" className={`nav-link ${isActive('/dashboard')}`}>
                <i className="nav-icon fas fa-tachometer-alt"></i>
                <p>Dashboard</p>
              </Link>
            </li>

            <li className="nav-item">
              <Link to="/databases" className={`nav-link ${isActive('/databases')}`}>
                <i className="nav-icon fas fa-database"></i>
                <p>Databases</p>
              </Link>
            </li>
            
            <li className="nav-item">
              <Link to="/sql-runner" className={`nav-link ${isActive('/sql-runner')}`}>
                <i className="nav-icon fas fa-terminal"></i>
                <p>SQL Runner</p>
              </Link>
            </li>

            <li className="nav-header">TABLES</li>
            
            {!currentDatabase && (
              <li className="nav-item">
                <a href="#" className="nav-link text-muted">
                  <i className="nav-icon fas fa-info-circle"></i>
                  <p>Select a database first</p>
                </a>
              </li>
            )}
            
            {currentDatabase && loading && (
              <li className="nav-item">
                <a href="#" className="nav-link">
                  <i className="nav-icon fas fa-spinner fa-spin"></i>
                  <p>Loading tables...</p>
                </a>
              </li>
            )}

            {currentDatabase && error && (
              <li className="nav-item">
                <a href="#" className="nav-link text-danger">
                  <i className="nav-icon fas fa-exclamation-triangle"></i>
                  <p>{error}</p>
                </a>
              </li>
            )}

            {currentDatabase && !loading && !error && tables.length === 0 && (
              <li className="nav-item">
                <a href="#" className="nav-link text-muted">
                  <i className="nav-icon fas fa-table"></i>
                  <p>No tables found</p>
                </a>
              </li>
            )}

            {currentDatabase && !loading && !error && tables.map((table) => (
              <li className="nav-item" key={table.name}>
                <Link 
                  to={`/table/${table.name}`} 
                  className={`nav-link ${isActive(`/table/${table.name}`)}`}
                >
                  <i className="nav-icon fas fa-table"></i>
                  <p>{table.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;

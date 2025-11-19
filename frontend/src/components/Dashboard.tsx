import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { databaseService, Database } from '../services/databaseService';
import { useDatabaseStore } from '../stores/databaseStore';

const Dashboard: React.FC = () => {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { currentDatabase } = useDatabaseStore();

  useEffect(() => {
    fetchDashboardData();
  }, [currentDatabase]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch databases
      const dbData = await databaseService.getDatabases();
      setDatabases(dbData);
      
      // Only fetch tables if a database is selected
      if (currentDatabase) {
        try {
          const tableData = await databaseService.getDatabaseTables(currentDatabase);
          setTableCount(tableData.tables?.length || 0);
        } catch (error) {
          console.error('Failed to fetch tables for current database:', error);
          setTableCount(0);
        }
      } else {
        setTableCount(0);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="container-fluid">
      {/* Database Overview Cards */}
      <div className="row mx-0">
        <div className="col-lg-3 col-md-6 col-sm-6 col-12 px-2">
          <Link to="/databases" className="text-decoration-none">
            <div className="small-box bg-primary">
              <div className="inner">
                <h3>{loading ? '...' : databases.length}</h3>
                <p>Databases</p>
              </div>
              <div className="icon">
                <i className="fas fa-database"></i>
              </div>
              <div className="small-box-footer">
                Manage Databases <i className="fas fa-arrow-circle-right"></i>
              </div>
            </div>
          </Link>
        </div>
        
        <div className="col-lg-3 col-md-6 col-sm-6 col-12 px-2">
          <div className="small-box bg-success">
            <div className="inner">
              <h3>{loading ? '...' : tableCount}</h3>
              <p>Tables</p>
            </div>
            <div className="icon">
              <i className="fas fa-table"></i>
            </div>
            <Link to="/" className="small-box-footer">
              Browse Tables <i className="fas fa-arrow-circle-right"></i>
            </Link>
          </div>
        </div>
        
        <div className="col-lg-3 col-md-6 col-sm-6 col-12 px-2">
          <Link to="/sql-runner" className="text-decoration-none">
            <div className="small-box bg-warning">
              <div className="inner">
                <h3>SQL</h3>
                <p>Query Editor</p>
              </div>
              <div className="icon">
                <i className="fas fa-terminal"></i>
              </div>
              <div className="small-box-footer">
                Open SQL Runner <i className="fas fa-arrow-circle-right"></i>
              </div>
            </div>
          </Link>
        </div>
        
        <div className="col-lg-3 col-md-6 col-sm-6 col-12 px-2">
          <div className="small-box bg-info">
            <div className="inner">
              <h3>Connected</h3>
              <p>SQL Server</p>
            </div>
            <div className="icon">
              <i className="fas fa-server"></i>
            </div>
            <div className="small-box-footer">
              Server Status <i className="fas fa-check-circle"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Database List */}
      <div className="row g-3">
        <div className="col-12 col-xl-9">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="fas fa-database me-2"></i>
                Server Databases
              </h3>
              <div className="card-tools">
                <Link to="/databases" className="btn btn-primary btn-sm">
                  <i className="fas fa-plus me-1"></i>
                  Manage Databases
                </Link>
              </div>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : databases.length === 0 ? (
                <div className="text-center py-4">
                  <i className="fas fa-database fa-3x text-muted mb-3"></i>
                  <h5 className="text-muted">No databases found</h5>
                  <p className="text-muted">Create your first database to get started</p>
                </div>
              ) : (
                <div className="table-responsive table-wrapper">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Database Name</th>
                        <th>Status</th>
                        <th>Created Date</th>
                        <th>Recovery Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {databases.slice(0, 10).map((database) => (
                        <tr key={database.database_name}>
                          <td>
                            <strong className="text-primary">
                              <i className="fas fa-database me-2"></i>
                              {database.database_name}
                            </strong>
                          </td>
                          <td>
                            <span className={`badge bg-${
                              database.status === 'ONLINE' ? 'success' : 
                              database.status === 'OFFLINE' ? 'secondary' : 
                              database.status === 'RESTORING' ? 'warning' : 'danger'
                            }`}>
                              {database.status}
                            </span>
                          </td>
                          <td>
                            <small className="text-muted">
                              {formatDate(database.create_date)}
                            </small>
                          </td>
                          <td>
                            <small className="text-muted">
                              {database.recovery_model}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {databases.length > 10 && (
                    <div className="text-center py-2">
                      <Link to="/databases" className="btn btn-sm btn-outline-primary">
                        View All Databases ({databases.length})
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-3">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="fas fa-info-circle me-2"></i>
                Quick Actions
              </h3>
            </div>
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                <Link to="/databases" className="list-group-item list-group-item-action">
                  <i className="fas fa-database me-2 text-primary"></i>
                  Manage Databases
                </Link>
                <Link to="/sql-runner" className="list-group-item list-group-item-action">
                  <i className="fas fa-terminal me-2 text-warning"></i>
                  SQL Query Editor
                </Link>
                <a href="#" className="list-group-item list-group-item-action">
                  <i className="fas fa-download me-2 text-success"></i>
                  Export Data
                </a>
                <a href="#" className="list-group-item list-group-item-action">
                  <i className="fas fa-upload me-2 text-info"></i>
                  Import Data
                </a>
                <a href="#" className="list-group-item list-group-item-action">
                  <i className="fas fa-cog me-2 text-secondary"></i>
                  Server Configuration
                </a>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="fas fa-chart-line me-2"></i>
                Server Info
              </h3>
            </div>
            <div className="card-body">
              <div className="info-box mb-3">
                <span className="info-box-icon bg-success elevation-1">
                  <i className="fas fa-server"></i>
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Server Status</span>
                  <span className="info-box-number">Online</span>
                </div>
              </div>
              
              <div className="info-box mb-3">
                <span className="info-box-icon bg-info elevation-1">
                  <i className="fas fa-database"></i>
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Total Databases</span>
                  <span className="info-box-number">{databases.length}</span>
                </div>
              </div>
              
              <div className="info-box mb-0">
                <span className="info-box-icon bg-warning elevation-1">
                  <i className="fas fa-table"></i>
                </span>
                <div className="info-box-content">
                  <span className="info-box-text">Total Tables</span>
                  <span className="info-box-number">{tableCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

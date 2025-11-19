import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databaseService, Database } from '../services/databaseService';
import { toast } from 'sonner';

const DatabaseManager: React.FC = () => {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDatabaseName, setNewDatabaseName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [backupPath, setBackupPath] = useState('');
  const [restorePath, setRestorePath] = useState('');
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDatabases();
  }, []);

  const fetchDatabases = async () => {
    try {
      setLoading(true);
      const data = await databaseService.getDatabases();
      setDatabases(data);
    } catch (error: any) {
      toast.error('Failed to fetch databases: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDatabase = async () => {
    if (!newDatabaseName.trim()) {
      toast.error('Please enter a database name');
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newDatabaseName)) {
      toast.error('Invalid database name. Use only letters, numbers, and underscores');
      return;
    }

    try {
      setCreating(true);
      await databaseService.createDatabase(newDatabaseName.trim());
      toast.success(`Database '${newDatabaseName}' created successfully`);
      setNewDatabaseName('');
      setShowCreateModal(false);
      fetchDatabases();
    } catch (error: any) {
      toast.error('Failed to create database: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteDatabase = async (databaseName: string) => {
    if (!confirm(`Are you sure you want to delete database '${databaseName}'? This action cannot be undone.`)) {
      return;
    }

    try {
      await databaseService.deleteDatabase(databaseName);
      toast.success(`Database '${databaseName}' deleted successfully`);
      fetchDatabases();
    } catch (error: any) {
      toast.error('Failed to delete database: ' + error.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
          <p className="mt-2">Loading databases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h3 className="card-title mb-0">
                <i className="fas fa-database me-2"></i>
                  Database Management
                </h3>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreateModal(true)}
                >
                <i className="fas fa-plus me-1"></i>
                  Create Database
                </button>
              </div>
            </div>
            
            <div className="card-body">
              {databases.length === 0 ? (
                <div className="text-center py-5">
                  <i className="fas fa-database fa-3x text-muted mb-3"></i>
                  <h5 className="text-muted">No databases found</h5>
                  <p className="text-muted">Create a new database to get started</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead className="table-light">
                      <tr>
                        <th>Database Name</th>
                        <th>Status</th>
                        <th>Recovery Model</th>
                        <th>Created Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {databases.map((database) => (
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
                            <span className="text-muted">
                              {database.recovery_model}
                            </span>
                          </td>
                          <td>
                            <small className="text-muted">
                              {formatDate(database.create_date)}
                            </small>
                          </td>
                          <td>
                            <div className="btn-group btn-group-sm">
                              <button 
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => navigate(`/database/${database.database_name}/tables`)}
                                title="Manage Tables"
                              >
                                <i className="fas fa-table"></i>
                              </button>
                              <button 
                                className="btn btn-outline-success btn-sm"
                                onClick={() => { setSelectedDb(database.database_name); const ts = new Date().toISOString().replace(/[-:T]/g,'').slice(0,15); setBackupPath(`C:\\temp\\${database.database_name}-${ts}.bak`); setShowBackupModal(true); }}
                                title="Backup Database"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                              <button 
                                className="btn btn-outline-warning btn-sm"
                                onClick={() => { setSelectedDb(database.database_name); setRestorePath('C\\:\\temp\\your-backup-file.bak'.replace('C\\:','C:')); setShowRestoreModal(true); }}
                                title="Restore Database"
                              >
                                <i className="fas fa-upload"></i>
                              </button>
                              <button 
                                className="btn btn-outline-danger btn-sm"
                                onClick={() => handleDeleteDatabase(database.database_name)}
                                title="Delete Database"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Database Modal */}
      {showCreateModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-plus me-2"></i>
                  Create New Database
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  aria-label="Close"
                  onClick={() => setShowCreateModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="databaseName">Database Name</label>
                  <input
                    type="text"
                    className="form-control"
                    id="databaseName"
                    value={newDatabaseName}
                    onChange={(e) => setNewDatabaseName(e.target.value)}
                    placeholder="Enter database name"
                    autoFocus
                  />
                  <small className="form-text text-muted">
                    Use only letters, numbers, and underscores. Must start with letter or underscore.
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleCreateDatabase}
                  disabled={creating || !newDatabaseName.trim()}
                >
                  {creating ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-plus me-2"></i>
                      Create Database
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="fas fa-download me-2"></i>Backup Database</h5>
                <button type="button" className="btn-close" onClick={() => setShowBackupModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-2">
                  <label className="form-label">Database</label>
                  <input type="text" className="form-control" value={selectedDb} readOnly />
                </div>
                <div className="mb-2">
                  <label className="form-label">Backup Path (.bak)</label>
                  <input type="text" className="form-control" value={backupPath} onChange={(e) => setBackupPath(e.target.value)} placeholder="C:\\temp\\db-YYYYMMDDHHmmss.bak" />
                  <small className="text-muted">Pastikan path bisa diakses oleh service SQL Server.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowBackupModal(false)}>Batal</button>
                <button className="btn btn-success" disabled={processing || !backupPath.trim()} onClick={async () => { try { setProcessing(true); await databaseService.backupDatabase(selectedDb, backupPath.trim()); toast.success('Backup berhasil dibuat'); setShowBackupModal(false); } catch (e:any) { toast.error('Gagal backup: ' + (e.response?.data?.error || e.message)); } finally { setProcessing(false); } }}>Backup</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRestoreModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><i className="fas fa-upload me-2"></i>Restore Database</h5>
                <button type="button" className="btn-close" onClick={() => setShowRestoreModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-2">
                  <label className="form-label">Database</label>
                  <input type="text" className="form-control" value={selectedDb} readOnly />
                </div>
                <div className="mb-2">
                  <label className="form-label">Backup Path (.bak)</label>
                  <input type="text" className="form-control" value={restorePath} onChange={(e) => setRestorePath(e.target.value)} placeholder="C:\\temp\\your-backup-file.bak" />
                  <small className="text-muted">Restore akan memakai WITH REPLACE dan RECOVERY.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRestoreModal(false)}>Batal</button>
                <button className="btn btn-warning" disabled={processing || !restorePath.trim()} onClick={async () => { try { setProcessing(true); await databaseService.restoreDatabase(selectedDb, restorePath.trim(), true); toast.success('Restore berhasil'); setShowRestoreModal(false); fetchDatabases(); } catch (e:any) { toast.error('Gagal restore: ' + (e.response?.data?.error || e.message)); } finally { setProcessing(false); } }}>Restore</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseManager;

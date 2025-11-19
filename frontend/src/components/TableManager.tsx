import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databaseService, TableColumn, CreateTableColumn } from '../services/databaseService';
import { spService } from '../services/dbService';
import { useDatabaseStore } from '../stores/databaseStore';
import { toast } from 'sonner';

interface Table {
  name: string;
  schema: string;
  type: string;
}

const TableManager: React.FC = () => {
  const { databaseName } = useParams<{ databaseName: string }>();
  const navigate = useNavigate();
  const { setCurrentDatabase } = useDatabaseStore();
  
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableStructure, setTableStructure] = useState<TableColumn[]>([]);
  const [showStructureModal, setShowStructureModal] = useState(false);

  // Form states
  const [newTableName, setNewTableName] = useState('');
  const [columns, setColumns] = useState<CreateTableColumn[]>([
    { name: 'id', type: 'INT', isPrimaryKey: true, isIdentity: true, nullable: false }
  ]);
  
  // Add column form states
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const [newColumnLength, setNewColumnLength] = useState(255);
  const [newColumnNullable, setNewColumnNullable] = useState(true);
  const [newColumnDefault, setNewColumnDefault] = useState('');

  const dataTypes = [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR',
    'TEXT', 'NTEXT',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL',
    'BIT', 'DATE', 'DATETIME', 'DATETIME2',
    'UNIQUEIDENTIFIER', 'XML'
  ];

  useEffect(() => {
    if (databaseName) {
      setCurrentDatabase(databaseName);
      loadTables();
    } else {
      setCurrentDatabase(null);
    }
  }, [databaseName]);

  const loadTables = async () => {
    try {
      setLoading(true);
      const data = await databaseService.getDatabaseTables(databaseName!);
      setTables(data.tables || []);
    } catch (error) {
      toast.error('Failed to load tables');
      console.error('Error loading tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async () => {
    if (!newTableName.trim()) {
      toast.error('Table name is required');
      return;
    }

    if (columns.length === 0) {
      toast.error('Table must have at least one column');
      return;
    }

    // Validate column names
    for (const column of columns) {
      if (!column.name.trim()) {
        toast.error('All columns must have names');
        return;
      }
    }

    try {
      await databaseService.createTable({
        tableName: newTableName,
        columns: columns
      }, databaseName);
      
      toast.success(`Table '${newTableName}' created successfully`);
      setShowCreateModal(false);
      setNewTableName('');
      setColumns([
        { name: 'id', type: 'INT', isPrimaryKey: true, isIdentity: true, nullable: false }
      ]);
      
      // Add delay before refresh to ensure database is updated
      setTimeout(() => {
        loadTables();
      }, 1000);
      
    } catch (error) {
      toast.error('Failed to create table');
      console.error('Error creating table:', error);
    }
  };

  const handleDeleteTable = async (tableName: string) => {
    if (!confirm(`Are you sure you want to delete table '${tableName}'? This action cannot be undone.`)) {
      return;
    }

    try {
      await databaseService.deleteTable(tableName, databaseName);
      toast.success(`Table '${tableName}' deleted successfully`);
      loadTables();
    } catch (error) {
      toast.error('Failed to delete table');
      console.error('Error deleting table:', error);
    }
  };

  const handleViewStructure = async (tableName: string) => {
    try {
      const data = await databaseService.getTableStructure(tableName, databaseName);
      setTableStructure(data.structure);
      setSelectedTable(tableName);
      setShowStructureModal(true);
    } catch (error) {
      toast.error('Failed to load table structure');
      console.error('Error loading table structure:', error);
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {
      toast.error('Column name is required');
      return;
    }

    try {
      await databaseService.addColumn(selectedTable, {
        columnName: newColumnName,
        dataType: newColumnType,
        maxLength: newColumnType.includes('VARCHAR') ? newColumnLength : undefined,
        nullable: newColumnNullable,
        defaultValue: newColumnDefault || undefined
      }, databaseName);

      toast.success(`Column '${newColumnName}' added successfully`);
      setShowAddColumnModal(false);
      setNewColumnName('');
      setNewColumnType('VARCHAR');
      setNewColumnLength(255);
      setNewColumnNullable(true);
      setNewColumnDefault('');
      handleViewStructure(selectedTable);
    } catch (error) {
      toast.error('Failed to add column');
      console.error('Error adding column:', error);
    }
  };

  const handleRemoveColumn = async (columnName: string) => {
    if (!confirm(`Are you sure you want to remove column '${columnName}'? This action cannot be undone.`)) {
      return;
    }

    try {
      await databaseService.removeColumn(selectedTable, columnName, databaseName);
      toast.success(`Column '${columnName}' removed successfully`);
      handleViewStructure(selectedTable);
    } catch (error) {
      toast.error('Failed to remove column');
      console.error('Error removing column:', error);
    }
  };

  const addColumnToTable = () => {
    setColumns([...columns, {
      name: '',
      type: 'VARCHAR',
      maxLength: 255,
      nullable: true
    }]);
  };

  const removeColumnFromTable = (index: number) => {
    if (columns.length > 1) {
      setColumns(columns.filter((_, i) => i !== index));
    }
  };

  const updateColumn = (index: number, field: keyof CreateTableColumn, value: any) => {
    const updatedColumns = [...columns];
    updatedColumns[index] = { ...updatedColumns[index], [field]: value };
    setColumns(updatedColumns);
  };

  const browseTable = (tableName: string) => {
    navigate(`/table/${tableName}`);
  };

  const refreshProcedures = async (): Promise<any[]> => {
    try {
      const data = await spService.getProcedures(databaseName);
      const list = data.procedures || [];
      setProcedures(list);
      return list;
    } catch (e) {
      console.warn('Failed to fetch procedures', e);
      return procedures;
    }
  };

  const createProceduresModal = () => {
    const old = document.getElementById('procedures-modal');
    if (old) old.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'procedures-modal';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '999999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    modal.style.maxWidth = '900px';
    modal.style.width = '95%';
    modal.style.maxHeight = '85vh';
    modal.style.overflow = 'auto';
    modal.style.padding = '20px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '16px';
    header.style.paddingBottom = '12px';
    header.style.borderBottom = '1px solid #dee2e6';

    const title = document.createElement('h4');
    title.textContent = `Manage Procedures - ${databaseName || ''}`;
    title.style.margin = '0';
    title.style.fontSize = '1.1rem';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => backdrop.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gridTemplateColumns = '1fr';
    body.style.gap = '12px';

    const list = document.createElement('div');
    list.style.border = '1px solid #e9ecef';
    list.style.borderRadius = '6px';
    list.style.padding = '12px';

    const renderList = (data?: any[]) => {
      const source = data ?? procedures;
      list.innerHTML = '';
      if (!source || source.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No procedures found.';
        empty.style.color = '#6c757d';
        list.appendChild(empty);
        return;
      }
      source.forEach((p) => {
        const item = document.createElement('div');
        item.style.borderBottom = '1px solid #f1f3f5';
        item.style.padding = '8px 0';
        const name = document.createElement('div');
        name.textContent = `${p.schema}.${p.name}`;
        name.style.fontWeight = 'bold';
        const meta = document.createElement('div');
        meta.textContent = `Modified: ${new Date(p.modify_date).toLocaleString()}`;
        meta.style.color = '#6c757d';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.marginTop = '6px';

        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'View';
        viewBtn.className = 'btn btn-sm btn-outline-secondary';
        viewBtn.onclick = async () => {
          const def = await spService.getDefinition(p.name, databaseName || undefined, p.schema);
          const pre = document.createElement('pre');
          pre.textContent = def.definition || '';
          pre.style.background = '#f8f9fa';
          pre.style.padding = '8px';
          pre.style.border = '1px solid #e9ecef';
          pre.style.borderRadius = '4px';
          pre.style.whiteSpace = 'pre-wrap';
          pre.style.fontSize = '12px';
          item.appendChild(pre);
        };

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.className = 'btn btn-sm btn-primary';
        editBtn.onclick = async () => {
          const def = await spService.getDefinition(p.name, databaseName || undefined, p.schema);
          const raw = (def.definition || '').replace(/\r?\n/g, '\n').replace(/\bGO\b/gi, '');
          const m = raw.match(/(?:^|\n)\s*AS\s*([\s\S]*)$/i);
          let body = m ? m[1].trim() : raw.trim();
          const strip = (t: string) => {
            let s = t.trim();
            while (/^\s*BEGIN\b[\s\S]*\bEND\s*$/i.test(s)) {
              s = s.replace(/^\s*BEGIN\s*/i, '').replace(/\s*END\s*$/i, '').trim();
            }
            return s;
          };
          body = strip(body);
          createProcedureForm({ name: p.name, schema: p.schema, definition: body });
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.onclick = async () => {
          if (!confirm(`Delete procedure '${p.schema}.${p.name}'?`)) return;
          await spService.remove(p.name, databaseName || undefined, p.schema);
          const newList = await refreshProcedures();
          renderList(newList);
          toast.success('Procedure deleted');
        };

        actions.appendChild(viewBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(name);
        item.appendChild(meta);
        item.appendChild(actions);
        list.appendChild(item);
      });
    };

    const createProcedureForm = (initial?: any) => {
      const form = document.createElement('div');
      form.style.border = '1px solid #e9ecef';
      form.style.borderRadius = '6px';
      form.style.padding = '12px';
      form.style.marginTop = '12px';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'form-control';
      nameInput.placeholder = 'Procedure name';
      nameInput.value = initial?.name || '';

      const defArea = document.createElement('textarea');
      defArea.className = 'form-control';
      defArea.rows = 12;
      defArea.placeholder = 'Procedure body (SQL) inside BEGIN...END';
      defArea.value = initial?.definition || '';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = initial ? 'Update Procedure' : 'Create Procedure';
      saveBtn.className = 'btn btn-success mt-2';
      saveBtn.onclick = async () => {
        const name = nameInput.value.trim();
        if (!name) { toast.error('Procedure name is required'); return; }
        const body = defArea.value || '';
        if (initial) {
          await spService.update(initial.name, body, databaseName || undefined);
          const newList = await refreshProcedures();
          renderList(newList);
          toast.success('Procedure updated');
        } else {
          await spService.create(name, body, databaseName || undefined);
          const newList = await refreshProcedures();
          renderList(newList);
          toast.success('Procedure created');
        }
      };

      form.appendChild(nameInput);
      form.appendChild(defArea);
      form.appendChild(saveBtn);
      body.appendChild(form);
    };

    const actionsTop = document.createElement('div');
    actionsTop.style.display = 'flex';
    actionsTop.style.justifyContent = 'space-between';
    actionsTop.style.marginBottom = '8px';
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh';
    refreshBtn.className = 'btn btn-sm btn-secondary';
    refreshBtn.onclick = async () => { const newList = await refreshProcedures(); renderList(newList); };
    const newBtn = document.createElement('button');
    newBtn.textContent = 'New Procedure';
    newBtn.className = 'btn btn-sm btn-success';
    newBtn.onclick = () => createProcedureForm();
    actionsTop.appendChild(refreshBtn);
    actionsTop.appendChild(newBtn);

    body.appendChild(actionsTop);
    body.appendChild(list);
    renderList();

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.paddingTop = '12px';
    footer.style.borderTop = '1px solid #dee2e6';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.className = 'btn btn-secondary';
    closeFooterBtn.onclick = () => backdrop.remove();

    footer.appendChild(closeFooterBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    refreshProcedures().then(renderList);
  };

  return (
    <>
      <div className="row g-3">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <div className="card-tools">
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={() => setShowCreateModal(true)}
                >
                  <i className="fas fa-plus"></i> Create Table
                </button>
                <button 
                  className="btn btn-secondary btn-sm ms-2" 
                  onClick={loadTables}
                >
                  <i className="fas fa-sync"></i> Refresh
                </button>
                <button 
                  className="btn btn-warning btn-sm ms-2" 
                  onClick={() => createProceduresModal()}
                >
                  <i className="fas fa-cogs"></i> Manage Procedures
                </button>
              </div>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="text-center">
                  <i className="fas fa-spinner fa-spin"></i> Loading tables...
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center text-muted">
                  <p>No tables found in this database</p>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create your first table
                  </button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered table-hover">
                    <thead>
                      <tr>
                        <th>Table Name</th>
                        <th>Schema</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.map((table, index) => (
                        <tr key={index}>
                          <td>{table.name}</td>
                          <td>{table.schema}</td>
                          <td>{table.type}</td>
                          <td>
                            <div className="btn-group">
                              <button 
                                className="btn btn-primary btn-xs" 
                                onClick={() => browseTable(table.name)}
                                title="Browse/Edit Data"
                              >
                                <i className="fas fa-table"></i>
                              </button>
                              <button 
                                className="btn btn-info btn-xs" 
                                onClick={() => handleViewStructure(table.name)}
                                title="View/Edit Structure"
                              >
                                <i className="fas fa-cog"></i>
                              </button>
                              <button 
                                className="btn btn-danger btn-xs" 
                                onClick={() => handleDeleteTable(table.name)}
                                title="Delete Table"
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

      {/* Create Table Modal */}
      {showCreateModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">Create New Table</h4>
                <button type="button" className="close" onClick={() => setShowCreateModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Table Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="Enter table name"
                  />
                </div>
                
                <h5>Columns</h5>
                {columns.map((column, index) => (
                  <div key={index} className="card mb-2">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-3">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Column name"
                            value={column.name}
                            onChange={(e) => updateColumn(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-md-3">
                          <select
                            className="form-control form-control-sm"
                            value={column.type}
                            onChange={(e) => updateColumn(index, 'type', e.target.value)}
                          >
                            {dataTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-2">
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            placeholder="Length"
                            value={column.maxLength || ''}
                            onChange={(e) => updateColumn(index, 'maxLength', parseInt(e.target.value) || undefined)}
                            disabled={!column.type.includes('VARCHAR')}
                          />
                        </div>
                        <div className="col-md-2">
                          <div className="form-check">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={column.nullable}
                              onChange={(e) => updateColumn(index, 'nullable', e.target.checked)}
                            />
                            <label className="form-check-label">Nullable</label>
                          </div>
                          <div className="form-check">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={column.isPrimaryKey}
                              onChange={(e) => updateColumn(index, 'isPrimaryKey', e.target.checked)}
                            />
                            <label className="form-check-label">Primary Key</label>
                          </div>
                        </div>
                        <div className="col-md-2">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => removeColumnFromTable(index)}
                            disabled={columns.length <= 1}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={addColumnToTable}
                >
                  <i className="fas fa-plus"></i> Add Column
                </button>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleCreateTable}>
                  Create Table
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Structure Modal */}
      {showStructureModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">Table Structure - {selectedTable}</h4>
                <button type="button" className="close" onClick={() => setShowStructureModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddColumnModal(true)}
                  >
                    <i className="fas fa-plus"></i> Add Column
                  </button>
                </div>
                
                <div className="table-responsive">
                  <table className="table table-bordered">
                    <thead>
                      <tr>
                        <th>Column Name</th>
                        <th>Data Type</th>
                        <th>Max Length</th>
                        <th>Nullable</th>
                        <th>Default</th>
                        <th>Primary Key</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableStructure.map((column, index) => (
                        <tr key={index}>
                          <td>{column.name}</td>
                          <td>{column.type}</td>
                          <td>{column.max_length || '-'}</td>
                          <td>{column.nullable}</td>
                          <td>{column.default_value || '-'}</td>
                          <td>{column.is_primary_key ? 'Yes' : 'No'}</td>
                          <td>
                            <button
                              className="btn btn-danger btn-xs"
                              onClick={() => handleRemoveColumn(column.name)}
                              disabled={column.is_primary_key === 1}
                              title={column.is_primary_key === 1 ? 'Cannot delete primary key' : 'Delete column'}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowStructureModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddColumnModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">Add Column to {selectedTable}</h4>
                <button type="button" className="close" onClick={() => setShowAddColumnModal(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Column Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="Enter column name"
                  />
                </div>
                
                <div className="form-group">
                  <label>Data Type</label>
                  <select
                    className="form-control"
                    value={newColumnType}
                    onChange={(e) => setNewColumnType(e.target.value)}
                  >
                    {dataTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                
                {newColumnType.includes('VARCHAR') && (
                  <div className="form-group">
                    <label>Max Length</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newColumnLength}
                      onChange={(e) => setNewColumnLength(parseInt(e.target.value) || 255)}
                    />
                  </div>
                )}
                
                <div className="form-group">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={newColumnNullable}
                      onChange={(e) => setNewColumnNullable(e.target.checked)}
                    />
                    <label className="form-check-label">Allow NULL values</label>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Default Value (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newColumnDefault}
                    onChange={(e) => setNewColumnDefault(e.target.value)}
                    placeholder="Enter default value"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddColumnModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleAddColumn}>
                  Add Column
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TableManager;

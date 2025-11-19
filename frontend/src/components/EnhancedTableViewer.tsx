import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { dbService, TableData } from '../services/dbService';
import { useDatabaseStore } from '../stores/databaseStore';
import { toast } from 'sonner';

const EnhancedTableViewer: React.FC = () => {
  const { tableName } = useParams<{ tableName: string }>();
  const { currentDatabase, setCurrentDatabase } = useDatabaseStore();
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  
  // Editing states
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [insertData, setInsertData] = useState<Record<string, any>>({});
  const [triggers, setTriggers] = useState<any[]>([]);
  const [triggersSchema, setTriggersSchema] = useState<string>('dbo');
  const [showTriggersModal, setShowTriggersModal] = useState(false);

  useEffect(() => {
    console.log('EnhancedTableViewer mounted/updated');
    console.log('tableName:', tableName);
    console.log('currentDatabase:', currentDatabase);
    
    if (tableName) {
      // If currentDatabase is not set, try to determine it from the table structure
      if (!currentDatabase) {
        console.log('No currentDatabase set, will attempt to fetch table data anyway');
      }
      console.log('Calling fetchTableData...');
      fetchTableData();
    } else {
      console.log('No tableName provided');
    }
  }, [tableName, limit, offset, currentDatabase]);

  const fetchTableData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Try to fetch table data even if currentDatabase is not set
      // The backend should be able to handle this case
      const databaseToUse = currentDatabase || undefined;
      console.log('Fetching table data for:', tableName, 'database:', databaseToUse);
      
      const data = await dbService.getTableData(tableName!, limit, offset, databaseToUse);
      console.log('Table data received:', data);
      // Always refresh structure to avoid stale column list after schema changes
      let structure: any[] = [];
      try {
        structure = await dbService.getTableStructure(tableName!, databaseToUse);
        console.log('Table structure received:', structure);
      } catch (e) {
        console.warn('Failed to fetch table structure, using columns from data');
      }
      const merged = { ...data, columns: structure?.length ? structure : data.columns } as any;
      console.log('Merged table data:', merged);
      setTableData(merged);
      try {
        const trig = await dbService.getTriggers(tableName!, databaseToUse);
        setTriggers(trig.triggers || []);
        if (trig.schema) setTriggersSchema(trig.schema);
      } catch (e) {
        console.warn('Failed to fetch triggers');
      }
      
      // If we successfully fetched data and currentDatabase is not set, 
      // try to determine it from the data
      if (!currentDatabase && (data as any).database) {
        console.log('Setting currentDatabase from table data:', (data as any).database);
        setCurrentDatabase((data as any).database);
      }
    } catch (err: any) {
      console.error('Error fetching table data:', err);
      setError(err.response?.data?.error || 'Failed to fetch table data');
      toast.error('Failed to fetch table data');
    } finally {
      setLoading(false);
    }
  };

  const refreshTriggers = async (): Promise<any[]> => {
    try {
      const databaseToUse = currentDatabase || undefined;
      const trig = await dbService.getTriggers(tableName!, databaseToUse);
      const list = trig.triggers || [];
      setTriggers(list);
      if (trig.schema) setTriggersSchema(trig.schema);
      return list;
    } catch (e) {
      toast.error('Failed to refresh triggers');
      return triggers;
    }
  };

  const refreshProcedures = async (): Promise<any[]> => {
    try {
      const databaseToUse = currentDatabase || undefined;
      const procs = await (spService as any).getProcedures(databaseToUse, proceduresSchema);
      const list = procs.procedures || [];
      setProcedures(list);
      return list;
    } catch (e) {
      toast.error('Failed to refresh procedures');
      return procedures;
    }
  };

  const handleSaveEditFromModal = async (modalElement: HTMLElement) => {
    if (!tableData || !tableName) {
      toast.error('Table data not available');
      modalElement.remove();
      return;
    }

    try {
      // Collect current form data directly from the modal inputs
      const inputs = modalElement.querySelectorAll('input');
      const currentFormData: Record<string, any> = {};
      
      inputs.forEach(input => {
        const fieldName = input.getAttribute('data-field-name');
        if (fieldName) {
          currentFormData[fieldName] = input.value;
        }
      });
      
      // Filter out identity/PK columns (double-check)
      const filteredFormData: Record<string, any> = {};
      if (tableData && tableData.columns) {
        console.log('Available columns:', tableData.columns);
        console.log('Current form data before filtering:', currentFormData);
        
        // Only process columns that are NOT identity/PK columns
        tableData.columns.forEach((column: any) => {
          console.log(`Column ${column.name}: is_identity=${column.is_identity}, type=${column.type}, nullable=${column.nullable}`);
          const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
          const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
          if (!isIdentity && !isPrimaryKey) {
            // Only include non-identity columns that exist in form data
            if (currentFormData.hasOwnProperty(column.name)) {
              filteredFormData[column.name] = currentFormData[column.name];
              console.log(`✅ Included column: ${column.name}`);
            }
          } else {
            console.log(`❌ Excluded protected column: ${column.name}`);
            // Make sure identity columns are never included, even if they somehow appear in form data
            if (currentFormData.hasOwnProperty(column.name)) {
              console.log(`⚠️  WARNING: Protected column ${column.name} was in form data but excluded`);
            }
          }
        });
      } else {
        // Fallback: use all collected data if table structure not available
        Object.assign(filteredFormData, currentFormData);
      }
      
      console.log('Collected form data:', currentFormData);
      console.log('Filtered form data (excluding identity columns):', filteredFormData);
      
      // Update the state with current form data
      setEditingData(filteredFormData);

      // Find primary key or unique identifier
      const primaryKey = tableData.columns.find((col: any) => col.is_primary_key === 1);
      const whereClause: Record<string, any> = {};

      // Get original row data from modal's data attribute
      const originalRowDataJson = modalElement.getAttribute('data-original-row');
      if (!originalRowDataJson) {
        console.error('Cannot find original row data');
        throw new Error('Cannot find original row data');
      }
      
      const originalRowData = JSON.parse(originalRowDataJson);

      if (primaryKey) {
        // Use primary key for WHERE clause - get from original row data
        if (originalRowData[primaryKey.name] !== undefined) {
          whereClause[primaryKey.name] = originalRowData[primaryKey.name];
        } else {
          console.error('Cannot find primary key value in original row data');
          throw new Error('Cannot find primary key value in original row data');
        }
      } else {
        // Fallback: use all original values for WHERE clause
        for (const key in originalRowData) {
          whereClause[key] = originalRowData[key];
        }
      }

      console.log('Filtered editing data (excluding identity columns):', filteredFormData);
      console.log('Where clause for update:', whereClause);
      
      await dbService.updateData(tableName, filteredFormData, whereClause, currentDatabase);
      
      toast.success('Row updated successfully');
      setEditingRow(null);
      setEditingData({});
      modalElement.remove();
      
      fetchTableData();
    } catch (err: any) {
      console.error('Update error:', err);
      toast.error('Failed to update row: ' + (err.response?.data?.error || err.message));
    }
  };

  const createEditModal = (originalRowData: any) => {
    // Hapus modal lama jika ada
    const oldModal = document.getElementById('edit-modal');
    if (oldModal) {
      oldModal.remove();
    }
    
    // Debug info
    const databaseToUse = currentDatabase || (tableData as any)?.database;
    console.log('Creating edit modal for:');
    console.log('Table:', tableName);
    console.log('Database:', databaseToUse);
    console.log('Original row data:', originalRowData);
    
    // Simpan original row data sebagai atribut data untuk digunakan nanti
    const originalRowDataJson = JSON.stringify(originalRowData);
    
    // Buat backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'edit-modal';
    backdrop.setAttribute('data-original-row', originalRowDataJson);
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    backdrop.style.zIndex = '999999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    
    // Buat container modal
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    modal.style.maxWidth = '800px';
    modal.style.width = '90%';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.padding = '20px';
    
    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';
    header.style.paddingBottom = '15px';
    header.style.borderBottom = '1px solid #dee2e6';
    
    const title = document.createElement('h4');
    title.textContent = `Edit Row - ${tableName}`;
    title.style.margin = '0';
    title.style.fontSize = '1.25rem';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.onclick = () => backdrop.remove();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Body - Form fields
    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gridTemplateColumns = '1fr 1fr';
    body.style.gap = '15px';
    
    if (tableData && tableData.columns) {
      console.log('=== CREATING EDIT FORM FIELDS ===');
      console.log('Total columns:', tableData.columns.length);
      
      tableData.columns.forEach((column: any) => {
        console.log(`Processing column: ${column.name}`, {
          is_identity: column.is_identity,
          is_primary_key: column.is_primary_key,
          type: column.type,
          nullable: column.nullable,
          current_value: originalRowData[column.name]
        });
        
        const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
        const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
        if (!isIdentity && !isPrimaryKey) { // Skip identity & PK columns completely
          console.log(`✅ Creating field for: ${column.name}`);
          
          const fieldDiv = document.createElement('div');
          fieldDiv.style.marginBottom = '15px';
          
          const label = document.createElement('label');
          label.textContent = column.name;
          label.style.display = 'block';
          label.style.marginBottom = '5px';
          label.style.fontWeight = 'bold';
          
          if (column.nullable === 'NO') {
            const required = document.createElement('span');
            required.textContent = ' *';
            required.style.color = 'red';
            label.appendChild(required);
          }
          
          if (column.is_primary_key === 1) {
            const pk = document.createElement('span');
            pk.textContent = ' (PK)';
            pk.style.color = 'orange';
            label.appendChild(pk);
          }
          
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-control';
          input.style.width = '100%';
          input.style.padding = '8px';
          input.style.border = '1px solid #ced4da';
          input.style.borderRadius = '4px';
          input.style.fontSize = '14px';
          input.value = originalRowData[column.name] === null ? '' : String(originalRowData[column.name]);
          input.placeholder = column.nullable === 'YES' ? 'Optional' : 'Required';
          input.setAttribute('data-field-name', column.name);
          input.oninput = (e) => {
            setEditingData(prev => ({ ...prev, [column.name]: e.target.value }));
          };
          
          fieldDiv.appendChild(label);
          fieldDiv.appendChild(input);
          body.appendChild(fieldDiv);
        } else {
          console.log(`❌ Skipping protected column: ${column.name}`);
        }
      });
    }
    
    // Footer - Buttons
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.paddingTop = '15px';
    footer.style.borderTop = '1px solid #dee2e6';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #6c757d';
    cancelBtn.style.backgroundColor = '#6c757d';
    cancelBtn.style.color = 'white';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => backdrop.remove();
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Update Row';
    saveBtn.style.padding = '8px 16px';
    saveBtn.style.border = '1px solid #007bff';
    saveBtn.style.backgroundColor = '#007bff';
    saveBtn.style.color = 'white';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => {
      handleSaveEditFromModal(backdrop);
    };
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    // Susun modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    
    // Tambahkan ke body
    document.body.appendChild(backdrop);
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

  const handleEdit = (rowIndex: number, rowData: any) => {
    setEditingRow(rowIndex);
    
    // Store the original row data for later use in WHERE clause
    const originalRowData = { ...rowData };
    
    // Filter out identity/PK columns from editing data
    const editableData: Record<string, any> = {};
    if (tableData && tableData.columns) {
      tableData.columns.forEach((column: any) => {
        const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
        const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
        if (!isIdentity && !isPrimaryKey && rowData.hasOwnProperty(column.name)) {
          editableData[column.name] = rowData[column.name];
          console.log(`✅ Including column in edit data: ${column.name}`);
        } else if (isIdentity || isPrimaryKey) {
          console.log(`❌ Excluding protected column from edit: ${column.name}`);
        }
      });
    } else {
      // Fallback: use all data if table structure not available
      Object.assign(editableData, rowData);
    }
    
    setEditingData(editableData);
    console.log('Editing data (excluding identity columns):', editableData);
    
    // Tampilkan modal edit dengan data asli
    createEditModal(originalRowData);
  };

  const handleSaveEdit = async () => {
    if (!tableData || !tableName) return;

    try {
      // Filter out identity/PK columns from editing data
      const filteredEditingData: Record<string, any> = {};
      if (tableData && tableData.columns) {
        tableData.columns.forEach((column: any) => {
          const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
          const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
          if (!isIdentity && !isPrimaryKey && editingData.hasOwnProperty(column.name)) {
            filteredEditingData[column.name] = editingData[column.name];
            console.log(`✅ Including column in update data: ${column.name}`);
          } else if (isIdentity || isPrimaryKey) {
            console.log(`❌ Excluding protected column from update: ${column.name}`);
          }
        });
      } else {
        // Fallback: use all editing data if table structure not available
        Object.assign(filteredEditingData, editingData);
      }

      // Find primary key or unique identifier
      const primaryKey = tableData.columns.find((col: any) => col.is_primary_key === 1);
      const whereClause: Record<string, any> = {};

      if (primaryKey) {
        // Use primary key for WHERE clause
        whereClause[primaryKey.name] = tableData.data[editingRow!][primaryKey.name];
      } else {
        // Fallback: use all original values for WHERE clause
        const originalRow = tableData.data[editingRow!];
        for (const key in originalRow) {
          whereClause[key] = originalRow[key];
        }
      }

      console.log('Filtered editing data (excluding identity columns):', filteredEditingData);
      await dbService.updateData(tableName, filteredEditingData, whereClause, currentDatabase);
      
      toast.success('Row updated successfully');
      setEditingRow(null);
      setEditingData({});
      fetchTableData();
    } catch (err: any) {
      toast.error('Failed to update row: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditingData({});
    // Tutup modal edit jika ada
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
      editModal.remove();
    }
  };

  const handleDelete = async (rowIndex: number) => {
    if (!tableData || !tableName) return;

    if (!confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
      return;
    }

    try {
      const rowData = tableData.data[rowIndex];
      
      // Find primary key or unique identifier
      const primaryKey = tableData.columns.find((col: any) => col.is_primary_key === 1);
      const whereClause: Record<string, any> = {};

      if (primaryKey) {
        // Use primary key for WHERE clause
        whereClause[primaryKey.name] = rowData[primaryKey.name];
      } else {
        // Fallback: use all values for WHERE clause
        for (const key in rowData) {
          whereClause[key] = rowData[key];
        }
      }

      await dbService.deleteData(tableName, whereClause, currentDatabase);
      
      toast.success('Row deleted successfully');
      fetchTableData();
    } catch (err: any) {
      toast.error('Failed to delete row: ' + (err.response?.data?.error || err.message));
    }
  };

  const createTriggersModal = () => {
    const old = document.getElementById('triggers-modal');
    if (old) old.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'triggers-modal';
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
    title.textContent = `Manage Triggers - ${triggersSchema}.${tableName}`;
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
      const source = data ?? triggers;
      list.innerHTML = '';
      if (!source || source.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No triggers found.';
        empty.style.color = '#6c757d';
        list.appendChild(empty);
        return;
      }
      source.forEach((t) => {
        const item = document.createElement('div');
        item.style.borderBottom = '1px solid #f1f3f5';
        item.style.padding = '8px 0';
        const name = document.createElement('div');
        name.textContent = `${t.trigger_name} (${t.is_instead_of_trigger ? 'INSTEAD OF' : 'AFTER'} ${t.events || ''})`;
        name.style.fontWeight = 'bold';
        const def = document.createElement('pre');
        def.textContent = t.definition || '';
        def.style.background = '#f8f9fa';
        def.style.padding = '8px';
        def.style.border = '1px solid #e9ecef';
        def.style.borderRadius = '4px';
        def.style.whiteSpace = 'pre-wrap';
        def.style.fontSize = '12px';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.marginTop = '6px';

        const disableBtn = document.createElement('button');
        disableBtn.textContent = t.is_disabled ? 'Enable' : 'Disable';
        disableBtn.className = 'btn btn-sm btn-outline-secondary';
        disableBtn.onclick = async () => {
          try {
            await dbService.updateTrigger(tableName!, t.trigger_name, { disabled: !t.is_disabled }, currentDatabase || undefined);
            const newList = await refreshTriggers();
            renderList(newList);
            toast.success(`Trigger ${!t.is_disabled ? 'disabled' : 'enabled'}`);
          } catch (e) {
            toast.error('Failed to toggle trigger');
          }
        };

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.className = 'btn btn-sm btn-primary';
        editBtn.onclick = () => {
          createTriggerForm(t);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.onclick = async () => {
          if (!confirm(`Delete trigger '${t.trigger_name}'?`)) return;
          try {
            await dbService.deleteTrigger(tableName!, t.trigger_name, currentDatabase || undefined);
            const newList = await refreshTriggers();
            renderList(newList);
            toast.success('Trigger deleted');
          } catch (e) {
            toast.error('Failed to delete trigger');
          }
        };

        actions.appendChild(disableBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(name);
        item.appendChild(actions);
        item.appendChild(def);
        list.appendChild(item);
      });
    };

    const createTriggerForm = (initial?: any) => {
      const getPk = () => {
        try {
          const pkCol = tableData?.columns?.find((c: any) => c.is_primary_key === 1)?.name;
          return pkCol || 'id';
        } catch {
          return 'id';
        }
      };

      const buildTemplateSQL = (template: string) => {
        const pk = getPk();
        const tname = String(tableName);
        if (template === 'updated_at') {
          return `SET NOCOUNT ON;\nIF UPDATE(updated_at) RETURN;\nUPDATE [{{SCHEMA}}].[${tname}] SET [updated_at] = GETDATE()\nFROM inserted i\nWHERE [{{SCHEMA}}].[${tname}].[{{PK}}] = i.[{{PK}}];`;
        }
        if (template === 'audit_basic') {
          return `SET NOCOUNT ON;\nIF EXISTS (SELECT 1 FROM inserted) INSERT INTO [{{SCHEMA}}].[Audit_${tname}] (event_type, event_time, user_name) SELECT 'INSERT', GETDATE(), SYSTEM_USER FROM inserted;\nIF EXISTS (SELECT 1 FROM deleted) INSERT INTO [{{SCHEMA}}].[Audit_${tname}] (event_type, event_time, user_name) SELECT 'DELETE', GETDATE(), SYSTEM_USER FROM deleted;\nIF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted) INSERT INTO [{{SCHEMA}}].[Audit_${tname}] (event_type, event_time, user_name) SELECT 'UPDATE', GETDATE(), SYSTEM_USER;`;
        }
        if (template === 'soft_delete') {
          return `SET NOCOUNT ON;\nUPDATE [{{SCHEMA}}].[${tname}]\nSET [is_deleted] = 1\nFROM deleted d\nWHERE [{{SCHEMA}}].[${tname}].[{{PK}}] = d.[{{PK}}];`;
        }
        if (template === 'prevent_delete') {
          return `RAISERROR('DELETE not allowed', 16, 1);`;
        }
        return '';
      };
      const form = document.createElement('div');
      form.style.border = '1px solid #e9ecef';
      form.style.borderRadius = '6px';
      form.style.padding = '12px';
      form.style.marginTop = '12px';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'form-control';
      nameInput.placeholder = 'Trigger name';
      nameInput.value = initial?.trigger_name || '';

      const templateSelect = document.createElement('select');
      templateSelect.className = 'form-control';
      const templateOptions = [
        { value: '', text: 'Template: None' },
        { value: 'updated_at', text: 'Timestamp updated_at on UPDATE' },
        { value: 'audit_basic', text: 'Audit basic (INSERT/UPDATE/DELETE)' },
        { value: 'soft_delete', text: 'Soft delete (INSTEAD OF DELETE)' },
        { value: 'prevent_delete', text: 'Prevent DELETE (INSTEAD OF DELETE)' },
      ];
      templateOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.text = opt.text; templateSelect.appendChild(o);
      });

      const eventsSelect = document.createElement('select');
      eventsSelect.multiple = true;
      eventsSelect.className = 'form-control';
      ['INSERT','UPDATE','DELETE'].forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev; opt.text = ev;
        if (initial?.events && String(initial.events).split(',').map((s:string)=>s.trim().toUpperCase()).includes(ev)) {
          opt.selected = true;
        }
        eventsSelect.appendChild(opt);
      });

      const insteadCheckbox = document.createElement('input');
      insteadCheckbox.type = 'checkbox';
      insteadCheckbox.className = 'form-check-input';
      insteadCheckbox.checked = !!initial?.is_instead_of_trigger;

      const insteadLabel = document.createElement('label');
      insteadLabel.textContent = 'INSTEAD OF (unchecked = AFTER)';
      insteadLabel.style.marginLeft = '8px';

      const defArea = document.createElement('textarea');
      defArea.className = 'form-control';
      defArea.rows = 8;
      defArea.placeholder = 'Trigger body (SQL) inside BEGIN...END';
      defArea.value = initial?.definition || '';

      templateSelect.onchange = () => {
        const val = templateSelect.value;
        if (val === 'updated_at') {
          Array.from(eventsSelect.options).forEach(o => o.selected = (o.value === 'UPDATE'));
          insteadCheckbox.checked = false;
          if (!nameInput.value) nameInput.value = `trg_${String(tableName)}_updated_at`;
          defArea.value = buildTemplateSQL('updated_at');
        } else if (val === 'audit_basic') {
          Array.from(eventsSelect.options).forEach(o => o.selected = (o.value === 'INSERT' || o.value === 'UPDATE' || o.value === 'DELETE'));
          insteadCheckbox.checked = false;
          if (!nameInput.value) nameInput.value = `trg_${String(tableName)}_audit`;
          defArea.value = buildTemplateSQL('audit_basic');
        } else if (val === 'soft_delete') {
          Array.from(eventsSelect.options).forEach(o => o.selected = (o.value === 'DELETE'));
          insteadCheckbox.checked = true;
          if (!nameInput.value) nameInput.value = `trg_${String(tableName)}_soft_delete`;
          defArea.value = buildTemplateSQL('soft_delete');
        } else if (val === 'prevent_delete') {
          Array.from(eventsSelect.options).forEach(o => o.selected = (o.value === 'DELETE'));
          insteadCheckbox.checked = true;
          if (!nameInput.value) nameInput.value = `trg_${String(tableName)}_prevent_delete`;
          defArea.value = buildTemplateSQL('prevent_delete');
        } else {
          defArea.value = '';
        }
      };

      const saveBtn = document.createElement('button');
      saveBtn.textContent = initial ? 'Update Trigger' : 'Create Trigger';
      saveBtn.className = 'btn btn-success mt-2';
      saveBtn.onclick = async () => {
        const selectedEvents = Array.from(eventsSelect.selectedOptions).map(o => o.value);
        const pk = getPk();
        const finalDef = (defArea.value || '')
          .replace(/\{\{SCHEMA\}\}/g, triggersSchema)
          .replace(/\{\{TABLE\}\}/g, String(tableName))
          .replace(/\{\{PK\}\}/g, pk);
        if (initial) {
          try {
            await dbService.updateTrigger(tableName!, initial.trigger_name, {
              events: selectedEvents,
              isInsteadOf: insteadCheckbox.checked,
              definition: finalDef
            }, currentDatabase || undefined);
            await refreshTriggers();
            renderList();
            toast.success('Trigger updated');
          } catch (e) {
            toast.error('Failed to update trigger');
          }
        } else {
          try {
            await dbService.createTrigger(tableName!, {
              triggerName: nameInput.value,
              events: selectedEvents,
              isInsteadOf: insteadCheckbox.checked,
              definition: finalDef
            }, currentDatabase || undefined);
            await refreshTriggers();
            renderList();
            toast.success('Trigger created');
          } catch (e) {
            toast.error('Failed to create trigger');
          }
        }
      };

      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = '1fr 1fr';
      grid.style.gap = '10px';
      const eventsWrap = document.createElement('div');
      const insteadWrap = document.createElement('div');
      insteadWrap.appendChild(insteadCheckbox);
      insteadWrap.appendChild(insteadLabel);
      grid.appendChild(eventsSelect);
      grid.appendChild(insteadWrap);

      form.appendChild(nameInput);
      form.appendChild(templateSelect);
      form.appendChild(grid);
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
    refreshBtn.onclick = async () => { const newList = await refreshTriggers(); renderList(newList); };
    const newBtn = document.createElement('button');
    newBtn.textContent = 'New Trigger';
    newBtn.className = 'btn btn-sm btn-success';
    newBtn.onclick = () => createTriggerForm();
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
  };


  const createViewModal = (rowData: any) => {
    const oldModal = document.getElementById('view-modal');
    if (oldModal) {
      oldModal.remove();
    }
    const backdrop = document.createElement('div');
    backdrop.id = 'view-modal';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    backdrop.style.zIndex = '999999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    modal.style.maxWidth = '800px';
    modal.style.width = '90%';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.padding = '20px';
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';
    header.style.paddingBottom = '15px';
    header.style.borderBottom = '1px solid #dee2e6';
    const title = document.createElement('h4');
    title.textContent = `View Row - ${tableName}`;
    title.style.margin = '0';
    title.style.fontSize = '1.25rem';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.onclick = () => backdrop.remove();
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gridTemplateColumns = '1fr 1fr';
    body.style.gap = '15px';
    if (tableData && tableData.columns) {
      tableData.columns.forEach((column: any) => {
        const fieldDiv = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = column.name;
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        label.style.fontWeight = 'bold';
        const valueEl = document.createElement('div');
        valueEl.textContent = rowData[column.name] === null ? '' : String(rowData[column.name]);
        valueEl.style.padding = '8px 12px';
        valueEl.style.border = '1px solid #ced4da';
        valueEl.style.borderRadius = '4px';
        valueEl.style.backgroundColor = '#f8fafc';
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(valueEl);
        body.appendChild(fieldDiv);
      });
    }
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.paddingTop = '15px';
    footer.style.borderTop = '1px solid #dee2e6';
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.padding = '8px 16px';
    editBtn.style.border = '1px solid #7c3aed';
    editBtn.style.backgroundColor = '#7c3aed';
    editBtn.style.color = 'white';
    editBtn.style.borderRadius = '4px';
    editBtn.style.cursor = 'pointer';
    editBtn.onclick = () => {
      backdrop.remove();
      createEditModal(rowData);
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Close';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #6c757d';
    cancelBtn.style.backgroundColor = '#6c757d';
    cancelBtn.style.color = 'white';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => backdrop.remove();
    footer.appendChild(cancelBtn);
    footer.appendChild(editBtn);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  };

  const handleViewRow = (rowData: any) => {
    createViewModal(rowData);
  };

  const handleInsert = () => {
    console.log('🎯 Insert button clicked');
    console.log('📊 tableData:', tableData);
    
    if (!tableData || !tableData.columns || tableData.columns.length === 0) {
      toast.error('Cannot insert: No table structure available');
      console.log('❌ No table structure available');
      return;
    }
    
    // Initialize insert data with empty values for each NON-IDENTITY and NON-PK column only
    const initialData: Record<string, any> = {};
    let columnCount = 0;
    tableData.columns.forEach((column: any) => {
      const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
      const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
      if (!isIdentity && !isPrimaryKey) { // Only include editable columns
        initialData[column.name] = '';
        columnCount++;
        console.log(`✅ Including column in initial data: ${column.name}`);
      } else {
        console.log(`❌ Excluding protected column: ${column.name}`);
      }
    });
    
    if (columnCount === 0) {
      toast.error('No editable columns available for insert');
      console.log('❌ All columns are identity/auto-generated');
      return;
    }
    
    setInsertData(initialData);
    console.log('📝 Initial data created:', initialData);
    
    // Gunakan JavaScript murni untuk membuat modal (karena React rendering bermasalah)
    createInsertModal();
  };

  const createInsertModal = () => {
    // Hapus modal lama jika ada
    const oldModal = document.getElementById('insert-modal');
    if (oldModal) {
      oldModal.remove();
    }
    
    // Debug info
    const databaseToUse = currentDatabase || (tableData as any)?.database;
    console.log('Creating insert modal for:');
    console.log('Table:', tableName);
    console.log('Database:', databaseToUse);
    console.log('Columns:', tableData?.columns);
    
    // Buat backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'insert-modal';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    backdrop.style.zIndex = '999999';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    
    // Buat container modal
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    modal.style.maxWidth = '800px';
    modal.style.width = '90%';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.padding = '20px';
    
    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '20px';
    header.style.paddingBottom = '15px';
    header.style.borderBottom = '1px solid #dee2e6';
    
    const title = document.createElement('h4');
    title.textContent = `Insert New Row - ${tableName}`;
    title.style.margin = '0';
    title.style.fontSize = '1.25rem';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.onclick = () => backdrop.remove();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Body - Form fields
    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gridTemplateColumns = '1fr 1fr';
    body.style.gap = '15px';
    
    if (tableData && tableData.columns) {
      console.log('=== CREATING FORM FIELDS ===');
      console.log('Total columns:', tableData.columns.length);
      
      tableData.columns.forEach((column: any) => {
        console.log(`Processing column: ${column.name}`, {
          is_identity: column.is_identity,
          is_primary_key: column.is_primary_key,
          type: column.type,
          nullable: column.nullable
        });
        const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
        const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
        if (!isIdentity && !isPrimaryKey) { // Skip identity & PK columns completely
          console.log(`✅ Creating field for: ${column.name}`);
          
          const fieldDiv = document.createElement('div');
          fieldDiv.style.marginBottom = '15px';
          
          const label = document.createElement('label');
          label.textContent = column.name;
          label.style.display = 'block';
          label.style.marginBottom = '5px';
          label.style.fontWeight = 'bold';
          
          if (column.nullable === 'NO') {
            const required = document.createElement('span');
            required.textContent = ' *';
            required.style.color = 'red';
            label.appendChild(required);
          }
          
          if (column.is_primary_key === 1) {
            const pk = document.createElement('span');
            pk.textContent = ' (PK)';
            pk.style.color = 'orange';
            label.appendChild(pk);
          }
          
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-control';
          input.style.width = '100%';
          input.style.padding = '8px';
          input.style.border = '1px solid #ced4da';
          input.style.borderRadius = '4px';
          input.style.fontSize = '14px';
          input.value = insertData[column.name] || '';
          input.placeholder = column.nullable === 'YES' ? 'Optional' : 'Required';
          input.setAttribute('data-field-name', column.name);
          input.oninput = (e) => {
            setInsertData(prev => ({ ...prev, [column.name]: e.target.value }));
          };
          
          fieldDiv.appendChild(label);
          fieldDiv.appendChild(input);
          body.appendChild(fieldDiv);
        } else {
          console.log(`❌ Skipping protected column: ${column.name}`);
        }
      });
    }
    
    // Footer - Buttons
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.paddingTop = '15px';
    footer.style.borderTop = '1px solid #dee2e6';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #6c757d';
    cancelBtn.style.backgroundColor = '#6c757d';
    cancelBtn.style.color = 'white';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => backdrop.remove();
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Insert Row';
    saveBtn.style.padding = '8px 16px';
    saveBtn.style.border = '1px solid #007bff';
    saveBtn.style.backgroundColor = '#007bff';
    saveBtn.style.color = 'white';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => {
      handleSaveInsertFromModal(backdrop);
    };
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    // Susun modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    
    // Tambahkan ke body
    document.body.appendChild(backdrop);
  };
  
  const handleSaveInsertFromModal = async (modalElement: HTMLElement) => {
    if (!tableName) {
      toast.error('Table name not specified');
      modalElement.remove();
      return;
    }

    // Collect current form data directly from the modal inputs
    const inputs = modalElement.querySelectorAll('input');
    const currentFormData: Record<string, any> = {};
    
    inputs.forEach(input => {
      const fieldName = input.getAttribute('data-field-name');
      if (fieldName) {
        currentFormData[fieldName] = input.value;
      }
    });
    
    // Filter out identity columns (double-check)
    const filteredFormData: Record<string, any> = {};
    if (tableData && tableData.columns) {
      console.log('Available columns:', tableData.columns);
      console.log('Current form data before filtering:', currentFormData);
      
      // Only process columns that are NOT identity/PK columns
      tableData.columns.forEach((column: any) => {
        const isIdentity = column.is_identity === 1 || column.is_identity === true || String(column.is_identity).toUpperCase() === 'YES';
        const isPrimaryKey = column.is_primary_key === 1 || column.is_primary_key === true || String(column.is_primary_key).toUpperCase() === 'YES';
        if (!isIdentity && !isPrimaryKey) {
          // Only include non-identity columns that exist in form data
          if (currentFormData.hasOwnProperty(column.name)) {
            filteredFormData[column.name] = currentFormData[column.name];
            console.log(`✅ Included column: ${column.name}`);
          }
        } else {
          console.log(`❌ Excluded protected column: ${column.name}`);
          // Make sure identity columns are never included, even if they somehow appear in form data
          if (currentFormData.hasOwnProperty(column.name)) {
            console.log(`⚠️  WARNING: Identity column ${column.name} was in form data but excluded`);
          }
        }
      });
    } else {
      // Fallback: use all collected data if table structure not available
      Object.assign(filteredFormData, currentFormData);
    }
    
    console.log('Collected form data:', currentFormData);
    console.log('Filtered form data (excluding identity columns):', filteredFormData);
    
    // Update the state with current form data
    setInsertData(filteredFormData);

    // Determine database to use - prioritize currentDatabase, fallback to table data
    const databaseToUse = currentDatabase || (tableData as any)?.database;
    
    if (!databaseToUse) {
      toast.error('Database not specified');
      modalElement.remove();
      return;
    }

    // Validate that at least one field has data
    const hasData = Object.values(filteredFormData).some(value => value !== '' && value !== null && value !== undefined);
    if (!hasData) {
      toast.error('Please fill in at least one field');
      modalElement.remove();
      return;
    }

    try {
      console.log('Inserting data:', filteredFormData);
      console.log('Into table:', tableName);
      console.log('Database:', databaseToUse);
      
      await dbService.insertData(tableName, filteredFormData, databaseToUse);
      
      toast.success('Row inserted successfully');
      setInsertData({});
      modalElement.remove();
      fetchTableData();
    } catch (err: any) {
      console.error('Insert error:', err);
      toast.error('Failed to insert row: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setInsertData(prev => ({ ...prev, [field]: value }));
  };

  const renderCell = (rowData: any, column: any, rowIndex: number) => {
    const value = rowData[column.name];
    const stringValue = value === null ? 'NULL' : String(value);
    const isLongContent = stringValue.length > 50;
    const isMultiline = stringValue.includes('\n') || stringValue.includes('\r');

    return (
      <div 
        className={`table-cell-content ${isLongContent || isMultiline ? 'long-content' : ''}`}
        title={isLongContent || isMultiline ? stringValue : undefined}
        style={{
          maxWidth: '300px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
          wordBreak: 'break-word',
          lineHeight: isMultiline ? '1.2' : '1',
          maxHeight: isMultiline ? '3.6em' : '1.2em',
        }}
      >
        {value === null ? (
          <em className="text-muted">NULL</em>
        ) : (
          stringValue
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <style>{`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
          @keyframes pulse {
            0% { transform: translate(-50%, -50%) scale(1); }
            50% { transform: translate(-50%, -50%) scale(1.05); }
            100% { transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  if (!tableData || tableData.data.length === 0) {
    return (
      <div className="alert alert-info">
        <p>No data found in this table.</p>
        <button className="btn btn-primary" onClick={handleInsert}>
          <i className="fas fa-plus"></i> Insert New Row
        </button>
        <button className="btn btn-secondary ms-2" onClick={() => console.log('Test button clicked, showInsertModal:', showInsertModal)}>
          Test Button
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Insert Modal - Now handled by JavaScript muri, not React */}
      
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.05); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
      <div className="card">
      <div className="card-header">
        <h3 className="card-title">Table: {tableName}</h3>
        <div className="card-tools">
          <span className="badge bg-info">
            Total: {tableData.total} rows
          </span>
          <button className="btn btn-success btn-sm ms-2" onClick={handleInsert}>
            <i className="fas fa-plus"></i> Insert Row
          </button>
          <button className="btn btn-secondary btn-sm ms-2" onClick={fetchTableData}>
            <i className="fas fa-sync"></i> Refresh
          </button>
          <button className="btn btn-warning btn-sm ms-2" onClick={() => createTriggersModal()}>
            <i className="fas fa-bolt"></i> Manage Triggers
          </button>
        </div>
      </div>
      
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-bordered table-striped mb-0">
            <thead>
              <tr>
                {tableData.columns.map((column: any) => (
                  <th key={column.name}>{column.name}</th>
                ))}
                <th width="120">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableData.data.map((row, index) => (
                <tr key={index} onClick={() => handleViewRow(row)} style={{ cursor: 'pointer' }}>
                  {tableData.columns.map((column: any) => (
                    <td key={column.name}>
                      {renderCell(row, column, index)}
                    </td>
                  ))}
                  <td>
                    <div className="btn-group btn-group-sm">
                      <button 
                        className="btn btn-primary btn-xs" 
                        onClick={(e) => { e.stopPropagation(); handleEdit(index, row); }}
                        title="Edit"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button 
                        className="btn btn-danger btn-xs" 
                        onClick={(e) => { e.stopPropagation(); handleDelete(index); }}
                        title="Delete"
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

      {/* Status indicator */}
      {showInsertModal && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          backgroundColor: 'lime',
          color: 'black',
          padding: '10px',
          border: '2px solid black',
          zIndex: 1000000,
          fontWeight: 'bold'
        }}>
          MODAL AKTIF! ✅
        </div>
      )}
      
      {/* Real Modal - Hidden for now */}
      {false && showInsertModal && (
        <>
          {/* Backdrop */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 10000
          }} onClick={() => setShowInsertModal(false)} />
          
          {/* Modal Container */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto'
          }}>
            {/* Modal Content */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }} onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h4 style={{ margin: 0, fontSize: '1.25rem' }}>Insert New Row - {tableName}</h4>
                <button 
                  type="button" 
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: 0,
                    color: '#000'
                  }}
                  onClick={() => setShowInsertModal(false)}
                >
                  ×
                </button>
              </div>
              
              {/* Modal Body */}
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  {tableData.columns.map((column: any) => (
                    <div key={column.name} style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        {column.name}
                        {column.nullable === 'NO' && <span style={{ color: 'red' }}> *</span>}
                        {column.is_primary_key === 1 && <span style={{ color: 'orange' }}> (PK)</span>}
                      </label>
                      <input
                        type="text"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #ced4da',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                        value={insertData[column.name] === null ? '' : String(insertData[column.name] || '')}
                        onChange={(e) => handleInputChange(column.name, e.target.value || null, false)}
                        placeholder={column.nullable === 'YES' ? 'Optional' : 'Required'}
                        disabled={column.is_identity === 1}
                      />
                      {column.is_identity === 1 && (
                        <small style={{ color: '#6c757d', fontSize: '12px' }}>Auto-generated</small>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Modal Footer */}
              <div style={{
                padding: '16px 20px',
                borderTop: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button 
                  type="button" 
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #6c757d',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowInsertModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #007bff',
                    backgroundColor: '#007bff',
                    color: 'white',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={handleSaveInsert}
                >
                  Insert Row
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
};

export default EnhancedTableViewer;

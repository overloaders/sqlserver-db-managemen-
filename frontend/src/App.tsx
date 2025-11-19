import React, { useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'admin-lte/dist/css/adminlte.css';
import './styles/theme-modern.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './stores/authStore';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TableViewer from './components/TableViewer';
import EnhancedTableViewer from './components/EnhancedTableViewer';
import SQLRunner from './components/SQLRunner';
import DatabaseManager from './components/DatabaseManager';
import TableManager from './components/TableManager';

function App() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    import('bootstrap/dist/js/bootstrap.bundle.min.js');
    import('admin-lte/dist/js/adminlte.js');
    document.body.classList.add('sidebar-mini', 'layout-fixed');
    const applyResponsiveSidebar = () => {
      if (window.innerWidth <= 992) {
        document.body.classList.add('sidebar-collapse');
        document.body.classList.remove('sidebar-open');
      } else {
        document.body.classList.remove('sidebar-collapse');
      }
    };
    applyResponsiveSidebar();
    const handleSidebarClick = (event: Event) => {
      event.preventDefault();
      const AdminLTE = (window as any).adminlte;
      if (AdminLTE?.PushMenu) {
        const sidebar = document.querySelector('.app-sidebar') as HTMLElement | null;
        if (sidebar) {
          const pm = new AdminLTE.PushMenu(sidebar, {});
          pm.toggle();
          return;
        }
      }
      if (document.body.classList.contains('sidebar-collapse')) {
        document.body.classList.remove('sidebar-collapse');
        document.body.classList.add('sidebar-open');
      } else {
        document.body.classList.add('sidebar-collapse');
        document.body.classList.remove('sidebar-open');
      }
    };
    const toggles = Array.from(document.querySelectorAll('[data-lte-toggle="sidebar"]'));
    toggles.forEach(el => el.addEventListener('click', handleSidebarClick));
    window.addEventListener('resize', applyResponsiveSidebar);
    return () => {
      window.removeEventListener('resize', applyResponsiveSidebar);
      toggles.forEach(el => el.removeEventListener('click', handleSidebarClick));
    };
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route 
          path="/login" 
          element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/" 
          element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="databases" element={<DatabaseManager />} />
          <Route path="database/:databaseName/tables" element={<TableManager />} />
          <Route path="database/:databaseName" element={<TableViewer />} />
          <Route path="table/:tableName" element={<EnhancedTableViewer />} />
          <Route path="sql-runner" element={<SQLRunner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout: React.FC = () => {

  return (
    <div className="app-wrapper sidebar-expand-lg layout-fixed">
      <Header />
      <Sidebar />

      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row mb-2">
              <div className="col-sm-6">
                <h1 className="m-0">Database Manager</h1>
              </div>
              <div className="col-sm-6">
                <ol className="breadcrumb float-end">
                  <li className="breadcrumb-item"><a href="#">Home</a></li>
                  <li className="breadcrumb-item active">Dashboard</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="app-content">
          <div className="container-fluid">
            <Outlet />
          </div>
        </div>
      </main>

      <footer className="app-footer text-center">
        <p>&copy; 2025 SQL SERVER Database Manager. Dibuat oleh <a href="https://s1.asrar.my.id"><strong>overload</strong></a>. Semua hak dilindungi.</p>
      </footer>
    </div>
  );
};

export default Layout;

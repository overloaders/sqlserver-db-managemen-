import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="app-header navbar navbar-expand navbar-white navbar-light">
      <ul className="navbar-nav">
        <li className="nav-item">
          <a className="nav-link" data-lte-toggle="sidebar" href="#" role="button" onClick={handleToggleSidebar}>
            <i className="fas fa-bars"></i>
          </a>
        </li>
        <li className="nav-item d-none d-sm-inline-block">
          <a href="/dashboard" className="nav-link">Home</a>
        </li>
      </ul>

      <ul className="navbar-nav ms-auto">
        {/* Desktop logout button */}
        <li className="nav-item d-none d-md-block">
          <a href="#" className="nav-link" onClick={handleLogout} title="Logout">
            <i className="fas fa-sign-out-alt"></i>
            <span className="ms-1 d-none d-lg-inline">Logout</span>
          </a>
        </li>
        
        {/* Mobile user dropdown */}
        <li className="nav-item dropdown d-md-none">
          <a className="nav-link" data-bs-toggle="dropdown" href="#">
            <i className="far fa-user"></i>
            <span className="ms-1">{user?.username}</span>
          </a>
          <div className="dropdown-menu dropdown-menu-end">
            <div className="dropdown-divider"></div>
            <a href="#" className="dropdown-item text-danger" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-2"></i> Logout
            </a>
          </div>
        </li>
        
        {/* Desktop user dropdown */}
        <li className="nav-item dropdown d-none d-md-block">
          <a className="nav-link" data-bs-toggle="dropdown" href="#">
            <i className="far fa-user"></i>
            <span className="ms-1">{user?.username}</span>
          </a>
          <div className="dropdown-menu dropdown-menu-lg dropdown-menu-end">
            <div className="dropdown-divider"></div>
            <a href="#" className="dropdown-item" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt me-2"></i> Logout
            </a>
          </div>
        </li>
      </ul>
    </nav>
  );
};

export default Header;
  const handleToggleSidebar = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const sidebar = document.querySelector('.app-sidebar') as HTMLElement | null;
    const AdminLTE = (window as any).adminlte;
    if (sidebar && AdminLTE?.PushMenu) {
      const pm = new AdminLTE.PushMenu(sidebar, {});
      pm.toggle();
      return;
    }
    const body = document.body;
    if (body.classList.contains('sidebar-collapse')) {
      body.classList.remove('sidebar-collapse');
      body.classList.add('sidebar-open');
    } else {
      body.classList.add('sidebar-collapse');
      body.classList.remove('sidebar-open');
    }
  };

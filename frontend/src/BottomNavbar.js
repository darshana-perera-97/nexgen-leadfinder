import { Link as RouterLink, useLocation } from 'react-router-dom';
import { FaHome, FaUsers, FaEnvelope, FaLink, FaCog } from 'react-icons/fa';

function BottomNavbar() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="bottom-navbar">
      <div className="d-flex justify-content-center align-items-center gap-4">
        <RouterLink 
          to="/" 
          className={`btn btn-nav ${isActive('/') ? 'active' : ''}`}
          aria-label="Home"
        >
          <FaHome size={24} />
          <span className="nav-label">Home</span>
        </RouterLink>
        <RouterLink 
          to="/leads" 
          className={`btn btn-nav ${isActive('/leads') ? 'active' : ''}`}
          aria-label="Leads"
        >
          <FaUsers size={24} />
          <span className="nav-label">Leads</span>
        </RouterLink>
        <RouterLink 
          to="/messages" 
          className={`btn btn-nav ${isActive('/messages') ? 'active' : ''}`}
          aria-label="Messages"
        >
          <FaEnvelope size={24} />
          <span className="nav-label">Messages</span>
        </RouterLink>
        <RouterLink 
          to="/link" 
          className={`btn btn-nav ${isActive('/link') ? 'active' : ''}`}
          aria-label="Link"
        >
          <FaLink size={24} />
          <span className="nav-label">Link</span>
        </RouterLink>
        <RouterLink 
          to="/settings" 
          className={`btn btn-nav ${isActive('/settings') ? 'active' : ''}`}
          aria-label="Settings"
        >
          <FaCog size={24} />
          <span className="nav-label">Settings</span>
        </RouterLink>
      </div>
    </nav>
  );
}

export default BottomNavbar;


import { Routes, Route } from 'react-router-dom';
import './App.css';
import BottomNavbar from './BottomNavbar';
import Home from './pages/Home';
import Leads from './pages/Leads';
import Messages from './pages/Messages';
import Link from './pages/Link';
import Settings from './pages/Settings';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/link" element={<Link />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      
      <BottomNavbar />
    </div>
  );
}

export default App;

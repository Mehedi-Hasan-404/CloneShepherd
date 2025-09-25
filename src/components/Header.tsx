import { Tv, Menu } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  return (
    <header className="app-header">
      <div className="logo-section">
        <Tv size={24} className="text-accent" />
        <span>Live TV Pro</span>
      </div>
      <button 
        className="menu-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
    </header>
  );
};

export default Header;
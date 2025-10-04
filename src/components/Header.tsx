import { Tv, Menu, Sun, Moon, Home, Star } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { theme, setTheme } = useTheme();
  const [location] = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/favorites', icon: Star, label: 'Favorites' },
  ];

  return (
    <header className="app-header header-animate">
      <Link to="/" className="logo-section animate-fade-in">
        <Tv size={24} className="text-accent hover-glow animate-pulse" />
        <span className="animate-slide-in-left">Live TV Pro</span>
      </Link>

      {/* Desktop Navigation - hidden on mobile */}
      <nav className="hidden md:flex items-center gap-1">
        {navItems.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              location === path
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <Icon size={18} />
            <span className="font-medium">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="theme-toggle p-2 rounded-lg"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun size={20} className="animate-scale-in" />
          ) : (
            <Moon size={20} className="animate-scale-in" />
          )}
        </button>
        {/* Mobile Menu Button - hidden on desktop */}
        <button 
          className="menu-btn hover-scale animate-fade-in md:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;

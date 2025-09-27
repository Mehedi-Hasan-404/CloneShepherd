import { useState } from 'react';
import Header from './Header';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header onMenuClick={() => setIsSidebarOpen(true)} />
      
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 w-full h-full">
            {children}
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Layout;

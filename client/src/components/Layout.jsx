import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Compass, Lightbulb, CloudSync, CheckSquare, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '../context/UserContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useUser();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Explorer', path: '/explorer', icon: <Compass size={20} /> },
    { name: 'Recommendations', path: '/recommendations', icon: <Lightbulb size={20} /> },
    { name: 'Solved Problems', path: '/solved', icon: <CheckSquare size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-background text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        className="w-64 border-r border-zinc-800/50 bg-surface/50 backdrop-blur-xl flex flex-col"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            CP
          </div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">
            Insight
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab" 
                    className="absolute inset-0 bg-zinc-800/80 border border-zinc-700/50 rounded-xl -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className={isActive ? 'text-blue-400' : ''}>{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 flex flex-col gap-3">
          <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800/50 text-sm text-zinc-400 flex flex-col items-center gap-2">
             <CloudSync size={20} className="text-zinc-500" />
             <p className="text-center">Logged in as {user?.username}</p>
          </div>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors font-medium"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
         <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
         <div className="p-8 max-w-7xl mx-auto z-10 relative">
            <Outlet />
         </div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import { LayoutDashboard, Layers, Ticket, Settings, LogIn } from 'lucide-react';

export function Sidebar() {
  return (
    <div className="flex flex-col w-64 bg-[#0B0F19] border-r border-slate-800 min-h-screen text-slate-300">
      <div className="p-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Layers className="h-6 w-6" />
          Adminarr Media
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>
        <Link href="/apps" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <Layers className="h-4 w-4" /> Apps
        </Link>
      </nav>
      <div className="p-4 border-t border-slate-800">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-slate-800 hover:text-white transition-colors">
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </div>
    </div>
  );
}
"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { logout } from "@/app/auth-actions"; // <-- 1. Import the logout function
import { 
    LayoutDashboard, 
    Users, 
    Settings, 
    Activity, 
    Layers,
    Trash2,
    LogOut // <-- 2. Import the LogOut icon
} from "lucide-react";

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();

  return (
    <nav
      className={cn("flex items-center space-x-4 lg:space-x-6 w-full", className)}
      {...props}
    >
      <Link
        href="/"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname === "/" ? "text-primary" : "text-muted-foreground"
        )}
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboard
      </Link>
      
      <Link
        href="/monitoring"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname.startsWith("/monitoring") ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Activity className="h-4 w-4" />
        Infrastructure
      </Link>

      <Link
        href="/apps"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname.startsWith("/apps") ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Layers className="h-4 w-4" />
        Apps
      </Link>

      <Link
        href="/cleanup"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname.startsWith("/cleanup") ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Trash2 className="h-4 w-4" />
        Cleanup
      </Link>

      <Link
        href="/users"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname.startsWith("/users") ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Users className="h-4 w-4" />
        Users
      </Link>
      
      <Link
        href="/settings"
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
          pathname === "/settings" ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>

      {/* --- 3. THE SIGN OUT BUTTON --- */}
      {/* Adding ml-auto pushes it to the far right side of the navigation bar */}
      <button
        onClick={() => logout()}
        className="ml-auto text-sm font-medium transition-colors text-red-500 hover:text-red-600 flex items-center gap-2 cursor-pointer"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    </nav>
  );
}
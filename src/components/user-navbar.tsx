import Link from 'next/link';

export function UserNavbar() {
  return (
    <nav className="border-b bg-background">
      <div className="flex h-16 items-center px-4 max-w-7xl mx-auto">
        <h1 className="text-xl font-bold mr-8 text-primary">Dom's Homelab</h1>
        <div className="flex items-center space-x-4 lg:space-x-6">
          <Link href="/" className="text-sm font-medium transition-colors hover:text-primary">Dashboard</Link>
          <Link href="/monitoring" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Live Monitoring</Link>
          <Link href="/apps" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Apps & Requests</Link>
        </div>
      </div>
    </nav>
  );
}
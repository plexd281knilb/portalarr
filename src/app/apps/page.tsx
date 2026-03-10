import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AppsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Applications</h2>
        <p className="text-muted-foreground mt-2">Access server services and request new media.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <a href="https://mainseer.domshomelab.com" target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
          <Card className="h-full hover:border-primary">
            <CardHeader>
              <CardTitle>Media Requests</CardTitle>
              <CardDescription>Request movies and TV shows to be automatically added to Plex.</CardDescription>
            </CardHeader>
          </Card>
        </a>
        <a href="https://cloud.domshomelab.com" target="_blank" rel="noreferrer" className="block transition-transform hover:scale-105">
          <Card className="h-full hover:border-primary">
            <CardHeader>
              <CardTitle>Nextcloud</CardTitle>
              <CardDescription>Access your shared files and cloud storage.</CardDescription>
            </CardHeader>
          </Card>
        </a>
      </div>
    </div>
  );
}
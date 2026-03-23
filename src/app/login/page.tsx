"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, setupFirstAdmin, checkSystemInitialized } from "@/app/auth-actions"; 
import { getPlexPin, checkPlexPin, getPlexUser } from "@/app/plex-auth";
import { handlePlexCallback } from "@/app/auth-actions"; // Ensure this is imported!
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ShieldCheck, Loader2, Play } from "lucide-react";

export default function LoginPage() {
  const [isSetupMode, setIsSetupMode] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [isPlexLoading, setIsPlexLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkSystemInitialized().then((initialized) => {
        setIsSetupMode(!initialized);
    });
  }, []);

  async function handleAdminSubmit(formData: FormData) {
    setError("");
    const action = isSetupMode ? setupFirstAdmin : login;
    const res = await action(formData);

    if ((res as any)?.error) {
      setError((res as any).error);
    } else {
      router.push("/settings"); 
    }
  }

  async function handlePlexLogin() {
    setIsPlexLoading(true);
    setError("");

    try {
      const pin = await getPlexPin();
      const authUrl = `https://app.plex.tv/auth/#!?clientID=portalarr-custom-dashboard-app&code=${pin.code}&context[device][product]=Portalarr`;
      const popup = window.open(authUrl, "PlexLogin", "width=600,height=700");

      const pollInterval = setInterval(async () => {
        const token = await checkPlexPin(pin.id);
        
        if (token) {
          clearInterval(pollInterval);
          popup?.close();
          const plexUser = await getPlexUser(token);
          
          const res = await handlePlexCallback(plexUser);
          
          if (res.error) {
            setError(res.error);
            setIsPlexLoading(false);
          } else {
            router.push("/");
          }
        }

        if (popup?.closed) {
          clearInterval(pollInterval);
          setIsPlexLoading(false);
        }
      }, 2000);

    } catch (err) {
      setError("Failed to connect to Plex.");
      setIsPlexLoading(false);
    }
  }

  if (isSetupMode === null) {
      return (
          <div className="flex min-h-screen items-center justify-center bg-muted/40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
             {isSetupMode ? <ShieldCheck className="h-6 w-6 text-primary" /> : null}
             {isSetupMode ? "Setup Owner Account" : "Welcome to Portalarr"}
          </CardTitle>
          <CardDescription>
            {isSetupMode 
                ? "Create the first administrator account to get started." 
                : "Sign in to access your media requests."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          
          {isSetupMode ? (
             <AdminForm handleSubmit={handleAdminSubmit} isSetupMode={true} error={error} />
          ) : (
            <Tabs defaultValue="user" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="user">User</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
              </TabsList>
              
              <TabsContent value="user" className="space-y-4">
                <div className="flex flex-col items-center justify-center py-4 space-y-4">
                    <div className="bg-[#e5a00d]/10 p-4 rounded-full">
                        <Play className="h-8 w-8 text-[#e5a00d] ml-1" />
                    </div>
                    <p className="text-sm text-center text-muted-foreground pb-2">
                        Sign in with your Plex account to request movies and TV shows.
                    </p>
                    <Button 
                        type="button" 
                        className="w-full bg-[#e5a00d] text-black hover:bg-[#c98c0b]"
                        onClick={handlePlexLogin}
                        disabled={isPlexLoading}
                    >
                        {isPlexLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sign in with Plex
                    </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="admin">
                <AdminForm handleSubmit={handleAdminSubmit} isSetupMode={false} error={error} />
              </TabsContent>
            </Tabs>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

function AdminForm({ handleSubmit, isSetupMode, error }: { handleSubmit: any, isSetupMode: boolean, error: string }) {
    return (
        <form action={handleSubmit} className="grid gap-4 animate-in fade-in">
            <div className="grid gap-2">
              <Label htmlFor="username">Admin Username</Label>
              <Input 
                  key={isSetupMode ? "setup-user" : "login-user"}
                  id="username" name="username" type="text" required 
                  placeholder={isSetupMode ? "e.g. admin" : ""}
                  autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false"
              />
            </div>
            
            {isSetupMode && (
                <div className="grid gap-2">
                    <Label htmlFor="email">Admin Email</Label>
                    <Input 
                        key="setup-email" id="email" name="email" type="email" required 
                        placeholder="admin@example.com" autoComplete="email"
                    />
                </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                  key={isSetupMode ? "setup-pass" : "login-pass"}
                  id="password" name="password" type="password" required 
                  autoComplete={isSetupMode ? "new-password" : "current-password"}
              />
            </div>
            
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}
            
            <Button type="submit" className="w-full">
                {isSetupMode ? "Create & Login" : "Sign in to Dashboard"}
            </Button>
        </form>
    )
}
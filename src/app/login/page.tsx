"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, setupFirstAdmin, checkSystemInitialized } from "@/app/auth-actions"; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [isSetupMode, setIsSetupMode] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    checkSystemInitialized().then((initialized) => {
        setIsSetupMode(!initialized);
    });
  }, []);

  async function handleSubmit(formData: FormData) {
    setError("");
    const action = isSetupMode ? setupFirstAdmin : login;
    const res = await action(formData);

    // Cast to 'any' to bypass the strict type check
    if ((res as any)?.error) {
    setError((res as any).error);
    } else {
      // Browsers save passwords on navigation. 
      // We wait a tick to ensure the form submission registers before redirecting.
      router.push("/admin"); 
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
             {isSetupMode ? "Setup Owner Account" : "Admin Login"}
          </CardTitle>
          <CardDescription>
            {isSetupMode 
                ? "Welcome! Create the first administrator account to get started." 
                : "Enter your credentials to access the dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                  // Adding a key forces React to re-render this input when mode changes
                  key={isSetupMode ? "setup-user" : "login-user"}
                  id="username" 
                  name="username" 
                  type="text" 
                  required 
                  placeholder={isSetupMode ? "e.g. admin" : ""}
                  autoComplete="username"
                  // These attributes tell the browser "This is raw text, not a sentence/email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
              />
            </div>
            
            {isSetupMode && (
                <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                        key="setup-email"
                        id="email" 
                        name="email" 
                        type="email" 
                        required 
                        placeholder="admin@example.com" 
                        autoComplete="email"
                    />
                </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                  key={isSetupMode ? "setup-pass" : "login-pass"}
                  id="password" 
                  name="password" 
                  type="password" 
                  required 
                  autoComplete={isSetupMode ? "new-password" : "current-password"}
              />
            </div>
            
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}
            
            <Button type="submit" className="w-full">
                {isSetupMode ? "Create & Login" : "Sign in now"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t p-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Back to Home
            </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
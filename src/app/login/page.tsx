"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, setupFirstAdmin, checkSystemInitialized, handlePlexCallback, requestAccount } from "@/app/auth-actions"; 
import { getPlexPin, checkPlexPin, getPlexUser } from "@/app/plex-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ShieldCheck, Loader2, Play, Lock, User, KeyRound, UserPlus, Mail } from "lucide-react";

export default function LoginPage() {
  const [isSetupMode, setIsSetupMode] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [isPlexLoading, setIsPlexLoading] = useState(false);
  const [plexStatus, setPlexStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    checkSystemInitialized().then((initialized) => {
        setIsSetupMode(!initialized);
    });
  }, []);

  async function handlePasswordSubmit(formData: FormData) {
    setError("");
    const action = isSetupMode ? setupFirstAdmin : login;
    const res = await action(formData);

    if ((res as any)?.error) {
      setError((res as any).error);
    } else {
      window.location.href = isSetupMode ? "/settings" : "/"; 
    }
  }

  async function handlePlexLogin() {
    setIsPlexLoading(true);
    setError("");
    setPlexStatus("Opening Plex authentication window...");

    // Open a blank popup synchronously inside the click handler to bypass popup blockers
    const popup = window.open("about:blank", "PlexLogin", "width=600,height=700");
    if (!popup) {
      setError("Popup blocked. Please allow popups for this site in your browser settings.");
      setIsPlexLoading(false);
      setPlexStatus("");
      return;
    }

    try {
      setPlexStatus("Contacting Plex.tv for authorization PIN...");
      const pin = await getPlexPin();
      const authUrl = `https://app.plex.tv/auth/#!?clientID=portalarr-custom-dashboard-app&code=${pin.code}&context[device][product]=Portalarr`;
      
      // Update the popup location to the actual Plex Auth URL
      popup.location.href = authUrl;
      setPlexStatus("Waiting for authentication in popup window...");

      let isProcessing = false;
      let elapsedTime = 0;

      const pollInterval = setInterval(async () => {
        if (isProcessing) return;
        elapsedTime += 2;

        if (elapsedTime > 180) { // 3 minute timeout
          clearInterval(pollInterval);
          if (!popup.closed) popup.close();
          setError("Plex sign-in timed out. Please try again.");
          setIsPlexLoading(false);
          setPlexStatus("");
          return;
        }

        try {
          const token = await checkPlexPin(pin.id);
          
          if (token && !isProcessing) {
            isProcessing = true;
            clearInterval(pollInterval);
            setPlexStatus("Validating account details with Plex...");
            
            try {
              if (!popup.closed) popup.close();
            } catch (e) {
              // Ignore popup closing errors
            }

            const plexUser = await getPlexUser(token);
            setPlexStatus("Authenticating with Portalarr...");
            const res = await handlePlexCallback(plexUser);
            
            if (res.error) {
              setError(res.error);
              setIsPlexLoading(false);
              setPlexStatus("");
            } else {
              window.location.href = "/";
            }
          }

          if (popup.closed && !token && !isProcessing) {
            clearInterval(pollInterval);
            setIsPlexLoading(false);
            setPlexStatus("");
          }
        } catch (pollErr) {
          console.error("Error polling Plex pin:", pollErr);
        }
      }, 2000);

    } catch (err) {
      if (!popup.closed) popup.close();
      setError("Failed to connect to Plex authentication servers.");
      setIsPlexLoading(false);
      setPlexStatus("");
    }
  }

  if (isSetupMode === null) {
      return (
          <div className="flex min-h-screen items-center justify-center bg-background">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background px-4 py-8">
      <Card className="w-full max-w-md border-border/40 shadow-2xl bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-1">
            {isSetupMode ? (
              <ShieldCheck className="h-8 w-8 text-primary" />
            ) : (
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[#e5a00d]/20 text-[#e5a00d]">
                <Play className="h-5 w-5 fill-current ml-0.5" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
             {isSetupMode ? "Setup Owner Account" : "Portalarr Dashboard"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            {isSetupMode 
                ? "Create the master administrator account to initialize Portalarr." 
                : "Sign in with your media account to access services and requests."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          
          {error && (
            <div className="mb-4 flex items-start gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isSetupMode ? (
             <PasswordForm handleSubmit={handlePasswordSubmit} isSetupMode={true} />
          ) : (
            <Tabs defaultValue="plex" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6 text-xs">
                <TabsTrigger value="plex" className="gap-1.5 px-2">
                  <Play className="h-3.5 w-3.5 text-[#e5a00d]" /> Plex
                </TabsTrigger>
                <TabsTrigger value="password" className="gap-1.5 px-2">
                  <KeyRound className="h-3.5 w-3.5" /> Login
                </TabsTrigger>
                <TabsTrigger value="register" className="gap-1.5 px-2">
                  <UserPlus className="h-3.5 w-3.5 text-primary" /> Request
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="plex" className="space-y-4">
                <div className="flex flex-col items-center justify-center py-4 space-y-4 text-center">
                    <div className="bg-[#e5a00d]/10 border border-[#e5a00d]/20 p-4 rounded-2xl">
                        <Play className="h-10 w-10 text-[#e5a00d] fill-current ml-1" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                            Plex Single Sign-On
                        </p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                            Use your Plex account. Server owners and invited friends are granted immediate access.
                        </p>
                    </div>

                    {plexStatus && (
                      <div className="flex items-center gap-2 text-xs text-[#e5a00d] bg-[#e5a00d]/10 px-3 py-2 rounded-md border border-[#e5a00d]/20 animate-pulse">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        <span>{plexStatus}</span>
                      </div>
                    )}

                    <Button 
                        type="button" 
                        className="w-full bg-[#e5a00d] text-black font-semibold hover:bg-[#c98c0b] transition-colors h-11"
                        onClick={handlePlexLogin}
                        disabled={isPlexLoading}
                    >
                        {isPlexLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
                        Sign in with Plex
                    </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="password">
                <PasswordForm handleSubmit={handlePasswordSubmit} isSetupMode={false} />
              </TabsContent>

              <TabsContent value="register">
                <RequestAccountForm setError={setError} />
              </TabsContent>
            </Tabs>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

function PasswordForm({ handleSubmit, isSetupMode }: { handleSubmit: (formData: FormData) => void, isSetupMode: boolean }) {
    return (
        <form action={handleSubmit} className="grid gap-4 animate-in fade-in">
            <div className="grid gap-2">
              <Label htmlFor="username">{isSetupMode ? "Admin Username" : "Username or Email"}</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                    key={isSetupMode ? "setup-user" : "login-user"}
                    id="username" name="username" type="text" required 
                    className="pl-9"
                    placeholder={isSetupMode ? "e.g. admin" : "Username or email"}
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false"
                />
              </div>
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
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                    key={isSetupMode ? "setup-pass" : "login-pass"}
                    id="password" name="password" type="password" required 
                    className="pl-9"
                    autoComplete={isSetupMode ? "new-password" : "current-password"}
                />
              </div>
            </div>
            
            <Button type="submit" className="w-full h-11 mt-2">
                {isSetupMode ? "Create Admin Account" : "Sign in with Password"}
            </Button>
        </form>
    );
}

function RequestAccountForm({ setError }: { setError: (err: string) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError("");
    const res = await requestAccount(formData);
    setIsSubmitting(false);

    if (res?.error) {
      setError(res.error);
    } else {
      window.location.href = "/pending";
    }
  }

  return (
    <form action={handleSubmit} className="grid gap-3.5 animate-in fade-in">
      <div className="grid gap-1.5">
        <Label htmlFor="req-username" className="text-xs font-medium">Requested Username</Label>
        <div className="relative">
          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            id="req-username" name="username" type="text" required 
            className="pl-9" placeholder="Choose a username"
            autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="req-email" className="text-xs font-medium">Your Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            id="req-email" name="email" type="email" required 
            className="pl-9" placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="req-password" className="text-xs font-medium">Create Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            id="req-password" name="password" type="password" required 
            className="pl-9" placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-tight pt-1">
        Submitting this form will register a temporary account and email the server administrator for approval. You cannot access pages until approved.
      </p>

      <Button type="submit" className="w-full h-11 mt-1 font-medium" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
        Request Account
      </Button>
    </form>
  );
}
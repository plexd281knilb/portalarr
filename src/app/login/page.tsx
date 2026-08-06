"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, setupFirstAdmin, checkSystemInitialized, handlePlexCallback, requestAccount, requestForgotPassword } from "@/app/auth-actions"; 
import { getPlexPin, checkPlexPin, getPlexUser } from "@/app/plex-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ShieldCheck, Loader2, Play, Lock, User, KeyRound, UserPlus, Mail, CheckCircle2 } from "lucide-react";

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
            const plexUsername = plexUser.username || plexUser.title || (plexUser.email ? plexUser.email.split("@")[0] : "");
            const plexEmail = plexUser.email || (plexUsername ? `${plexUsername}@plex.local` : "");
            const res = await handlePlexCallback(token, plexUsername, plexEmail, isSetupMode || false);
            
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
    <div className="flex h-screen items-center justify-center bg-background p-4 animate-in fade-in duration-500">
      <Card className="w-full max-w-md shadow-2xl border-muted/60">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
            {isSetupMode ? <ShieldCheck className="h-8 w-8 text-primary" /> : <Lock className="h-8 w-8 text-primary" />}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isSetupMode ? "Initial System Setup" : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {isSetupMode 
              ? "Create your owner account to secure the dashboard." 
              : "Sign in to access your media server portal"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          
          {error && (
            <div className="text-sm font-medium text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isPlexLoading && (
            <div className="text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 p-3 rounded-md flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{plexStatus || "Authenticating..."}</span>
            </div>
          )}

          {isSetupMode ? (
            <PasswordForm handleSubmit={handlePasswordSubmit} isSetupMode={true} />
          ) : (
            <Tabs defaultValue="plex" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="plex" className="text-xs font-semibold gap-1">
                  <Play className="h-3.5 w-3.5 text-[#e5a00d] fill-current" /> Plex
                </TabsTrigger>
                <TabsTrigger value="password" className="text-xs font-semibold gap-1">
                  <KeyRound className="h-3.5 w-3.5" /> Login
                </TabsTrigger>
                <TabsTrigger value="register" className="text-xs font-semibold gap-1">
                  <UserPlus className="h-3.5 w-3.5" /> Request
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="plex">
                <div className="space-y-4">
                    <p className="text-xs text-muted-foreground text-center px-2">
                        Sign in instantly using your official Plex.tv account.
                    </p>
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
    const [showForgot, setShowForgot] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState("");
    const [forgotError, setForgotError] = useState("");
    const [isForgotLoading, setIsForgotLoading] = useState(false);

    async function handleForgotSubmit(formData: FormData) {
        setIsForgotLoading(true);
        setForgotSuccess("");
        setForgotError("");
        const res = await requestForgotPassword(formData);
        setIsForgotLoading(false);

        if (res && "error" in res && res.error) {
            setForgotError(res.error);
        } else if (res && "message" in res && res.message) {
            setForgotSuccess(res.message);
        }
    }

    if (showForgot) {
        return (
            <div className="space-y-4 animate-in fade-in">
                <div className="space-y-1 text-center sm:text-left">
                    <h4 className="text-sm font-semibold">Reset Password</h4>
                    <p className="text-xs text-muted-foreground">
                        Enter your username or email address. We will send a temporary password to your email.
                    </p>
                </div>

                {forgotSuccess && (
                    <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{forgotSuccess}</span>
                    </div>
                )}

                {forgotError && (
                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{forgotError}</span>
                    </div>
                )}

                <form action={handleForgotSubmit} className="space-y-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="forgot-email" className="text-xs">Username or Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="forgot-email" name="emailOrUsername" type="text" required
                                className="pl-9" placeholder="Enter username or email"
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full h-10 font-medium" disabled={isForgotLoading}>
                        {isForgotLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        Send Temp Password
                    </Button>
                </form>

                <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setShowForgot(false); setForgotSuccess(""); setForgotError(""); }}
                >
                    Back to Sign In
                </Button>
            </div>
        );
    }

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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSetupMode && (
                  <button 
                    type="button" 
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
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
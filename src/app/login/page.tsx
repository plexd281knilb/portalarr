"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, setupFirstAdmin, checkSystemInitialized, handlePlexCallback, requestAccount, requestForgotPassword } from "@/app/auth-actions"; 
import { getPlexPin, checkPlexPin, getPlexUser } from "@/app/plex-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ShieldCheck, Loader2, Play, Lock, User, KeyRound, UserPlus, Mail, CheckCircle2, Eye, EyeOff, ExternalLink, Info } from "lucide-react";

function sanitizeReturnTo(url: string | null): string {
  if (!url) return "/";
  // Protect against open redirect attacks
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    // Avoid redirect loops
    if (url === "/login" || url.startsWith("/login?") || url === "/join" || url.startsWith("/join?")) {
      return "/";
    }
    return url;
  }
  return "/";
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo");
  const isRegisteredParam = searchParams.get("registered") === "1" || searchParams.get("pending") === "1";
  const isExpiredParam = searchParams.get("expired") === "1" || searchParams.get("reason") === "session_expired";
  const defaultTab = searchParams.get("tab") || "plex";

  const safeReturnTo = sanitizeReturnTo(rawReturnTo);

  const [isSetupMode, setIsSetupMode] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(
    isRegisteredParam 
      ? "Your account request was submitted and is pending administrator approval."
      : isExpiredParam
      ? "Your session has expired. Please sign in again."
      : ""
  );
  const [isPlexLoading, setIsPlexLoading] = useState(false);
  const [plexStatus, setPlexStatus] = useState("");
  const [fallbackPlexUrl, setFallbackPlexUrl] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkSystemInitialized().then((initialized) => {
      setIsSetupMode(!initialized);
    });

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  function cancelPlexLogin() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPlexLoading(false);
    setPlexStatus("");
    setFallbackPlexUrl(null);
  }

  async function handlePasswordSubmit(formData: FormData) {
    setError("");
    const action = isSetupMode ? setupFirstAdmin : login;
    const res = await action(formData);

    if ((res as any)?.error) {
      setError((res as any).error);
    } else {
      window.location.href = isSetupMode ? "/settings" : safeReturnTo; 
    }
  }

  async function handlePlexLogin() {
    setIsPlexLoading(true);
    setError("");
    setFallbackPlexUrl(null);
    setPlexStatus("Opening Plex authentication window...");

    // Open a blank popup synchronously inside the click handler to bypass popup blockers
    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", "PlexLogin", "width=600,height=700");
    } catch {
      popup = null;
    }

    try {
      setPlexStatus("Contacting Plex.tv for authorization PIN...");
      const pin = await getPlexPin();
      const authUrl = `https://app.plex.tv/auth/#!?clientID=domshomelab-dashboard-app&code=${pin.code}&context[device][product]=DomsHomeLab`;
      
      if (popup && !popup.closed) {
        // Update popup location to the actual Plex Auth URL
        popup.location.href = authUrl;
        setPlexStatus("Waiting for authentication in popup window...");
      } else {
        // Browser blocked automatic popup. Provide seamless direct button
        setFallbackPlexUrl(authUrl);
        setPlexStatus("Popup blocked by browser. Click below to authorize directly with Plex:");
      }

      let isProcessing = false;
      let elapsedTime = 0;

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = setInterval(async () => {
        if (isProcessing) return;
        elapsedTime += 2;

        if (elapsedTime > 180) { // 3 minute timeout
          cancelPlexLogin();
          try {
            if (popup && !popup.closed) popup.close();
          } catch {}
          setError("Plex sign-in timed out. Please try again.");
          return;
        }

        try {
          const token = await checkPlexPin(pin.id);
          
          if (token && !isProcessing) {
            isProcessing = true;
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setPlexStatus("Validating account details with Plex...");
            
            try {
              if (popup && !popup.closed) popup.close();
            } catch (e) {
              // Ignore popup closing errors
            }

            const plexUser = await getPlexUser(token);
            setPlexStatus("Authenticating with DomsHomeLab...");
            const plexUsername = plexUser.username || plexUser.title || (plexUser.email ? plexUser.email.split("@")[0] : "");
            const plexEmail = plexUser.email || (plexUsername ? `${plexUsername}@plex.local` : "");
            const res = await handlePlexCallback(token, plexUsername, plexEmail, isSetupMode || false);
            
            if (res.error) {
              setError(res.error);
              setIsPlexLoading(false);
              setPlexStatus("");
              setFallbackPlexUrl(null);
            } else {
              window.location.href = isSetupMode ? "/settings" : safeReturnTo;
            }
          }

          // Grace period: Do not cancel prematurely if closed before 8s (allows tab switching or mobile app switching)
          if (popup && popup.closed && !token && !isProcessing && elapsedTime > 8 && !fallbackPlexUrl) {
            setFallbackPlexUrl(authUrl);
            setPlexStatus("Popup closed. If you still need to complete sign-in, tap below:");
          }
        } catch (pollErr) {
          console.error("Error polling Plex pin:", pollErr);
        }
      }, 2000);

    } catch (err) {
      if (popup && !popup.closed) popup.close();
      cancelPlexLogin();
      setError("Failed to connect to Plex authentication servers. Please verify your internet connection.");
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4 py-8 animate-in fade-in duration-500">
      <Card className="w-full max-w-md shadow-2xl bg-[#121218]/90 backdrop-blur-md border-border/50">
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
          
          {infoMessage && (
            <div className="text-xs font-medium text-sky-400 bg-sky-950/40 border border-sky-800/40 p-3 rounded-md flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-sky-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {error && (
            <div className="text-sm font-medium text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isPlexLoading && (
            <div className="space-y-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 animate-in fade-in">
              <div className="text-xs font-medium text-amber-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{plexStatus || "Authenticating..."}</span>
              </div>

              {fallbackPlexUrl && (
                <div className="pt-1">
                  <a 
                    href={fallbackPlexUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-lg text-xs font-semibold bg-[#e5a00d] text-black hover:bg-[#c98c0b] hover:ring-2 hover:ring-amber-400/50 shadow transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Tap Here to Authorize on Plex.tv
                  </a>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="text-[11px] h-7 text-muted-foreground hover:text-foreground hover:bg-amber-500/10"
                  onClick={cancelPlexLogin}
                >
                  Cancel Sign-in
                </Button>
              </div>
            </div>
          )}

          {isSetupMode ? (
            <PasswordForm handleSubmit={handlePasswordSubmit} isSetupMode={true} />
          ) : (
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4 bg-muted/40 border border-muted/60 p-1 rounded-xl gap-1">
                <TabsTrigger value="plex" className="text-xs font-semibold gap-1 hover:ring-2 hover:ring-amber-500/40 active:scale-95 transition-all">
                  <Play className="h-3.5 w-3.5 text-[#e5a00d] fill-current" /> Plex
                </TabsTrigger>
                <TabsTrigger value="password" className="text-xs font-semibold gap-1 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all">
                  <KeyRound className="h-3.5 w-3.5" /> Login
                </TabsTrigger>
                <TabsTrigger value="register" className="text-xs font-semibold gap-1 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 transition-all">
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
                    className="w-full bg-[#e5a00d] text-black font-semibold hover:bg-[#c98c0b] hover:ring-2 hover:ring-amber-400/50 hover:shadow-[0_0_20px_rgba(229,160,13,0.3)] active:scale-95 transition-all h-11"
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
  const [forgotInput, setForgotInput] = useState("");
  const [prefilledUser, setPrefilledUser] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLock, setIsCapsLock] = useState(false);

  const handleKeyEvents = (e: React.KeyboardEvent) => {
    setIsCapsLock(e.getModifierState("CapsLock"));
  };

  async function handleForgotSubmit(formData: FormData) {
    setIsForgotLoading(true);
    setForgotSuccess("");
    setForgotError("");
    const inputVal = (formData.get("emailOrUsername") as string) || "";
    setPrefilledUser(inputVal);

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
            Enter your username or email address (including your Plex account handle). We will send a temporary password to your email.
          </p>
        </div>

        {forgotSuccess ? (
          <div className="space-y-3">
            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3.5 rounded-xl flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong>Temporary Password Dispatched!</strong>
                <p className="mt-1 text-emerald-300/80">{forgotSuccess}</p>
              </div>
            </div>

            <Button 
              type="button" 
              className="w-full h-11 font-semibold text-black gap-2 hover:ring-2 hover:ring-primary/40 hover:shadow-lg active:scale-95 transition-all"
              onClick={() => {
                setShowForgot(false);
              }}
            >
              <KeyRound className="h-4 w-4" /> Sign In with Temporary Password
            </Button>
          </div>
        ) : (
          <>
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
                    value={forgotInput}
                    onChange={(e) => setForgotInput(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-10 font-medium hover:ring-2 hover:ring-primary/40 hover:shadow-lg active:scale-95 transition-all" disabled={isForgotLoading}>
                {isForgotLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Send Temp Password
              </Button>
            </form>
          </>
        )}

        <Button 
          type="button" 
          variant="ghost" 
          className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
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
            defaultValue={prefilledUser || ""}
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
          <Label htmlFor="password">Password (or Temp Password)</Label>
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
            id="password" name="password" 
            type={showPassword ? "text" : "password"} 
            required 
            className="pl-9 pr-10"
            autoFocus={!!prefilledUser}
            placeholder="Enter password or temp password"
            autoComplete={isSetupMode ? "new-password" : "current-password"}
            onKeyDown={handleKeyEvents}
            onKeyUp={handleKeyEvents}
            onBlur={() => setIsCapsLock(false)}
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {isCapsLock && (
          <div className="text-[11px] text-amber-400 flex items-center gap-1 font-medium animate-in fade-in">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>Caps Lock is ON</span>
          </div>
        )}
      </div>
      
      <Button type="submit" className="w-full h-11 mt-2 font-semibold hover:ring-2 hover:ring-primary/40 hover:shadow-lg active:scale-95 transition-all">
        {isSetupMode ? "Create Admin Account" : "Sign in with Password"}
      </Button>
    </form>
  );
}

function RequestAccountForm({ setError }: { setError: (err: string) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
            id="req-password" name="password" 
            type={showPassword ? "text" : "password"} 
            required 
            className="pl-9 pr-10" placeholder="••••••••"
            autoComplete="new-password"
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-tight pt-1">
        Submitting this form will register a temporary account and notify the server administrator for approval. You will receive an email once approved.
      </p>

      <Button type="submit" className="w-full h-11 mt-1 font-semibold hover:ring-2 hover:ring-emerald-400/50 hover:shadow-lg active:scale-95 transition-all" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
        Request Account
      </Button>
    </form>
  );
}

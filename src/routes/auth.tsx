import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminExists, bootstrapAdmin } from "@/lib/auth.functions";
import { ensureHiddenAdmin } from "@/lib/seed-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SAMA_LOGO_BASE64 } from "@/lib/logo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESIGNATIONS, departmentForDesignation } from "@/lib/workflow";

import { toast } from "sonner";
import { Loader2, ShieldPlus } from "lucide-react";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  loader: async () => {
    try {
      // Idempotently ensure the hidden administrator exists.
      try {
        await ensureHiddenAdmin();
      } catch {
        /* ignore seeding errors; fall through */
      }
      const res = await adminExists();
      return { hasAdmin: res.exists };
    } catch {
      return { hasAdmin: true };
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const { hasAdmin } = Route.useLoaderData();
  const navigate = useNavigate();
  const runBootstrap = useServerFn(bootstrapAdmin);

  const [mode, setMode] = useState<"login" | "setup" | "signup">(hasAdmin ? "login" : "setup");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Block accounts that management has not approved yet.
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user!.id)
      .maybeSingle();
    setLoading(false);
    if (profile && profile.status === "pending") {
      await supabase.auth.signOut();
      toast.error("Your account is awaiting manager approval.");
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await runBootstrap({ data: { email, password, full_name: fullName, designation } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      toast.success("Manager account created");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create the account using the public client only — no service key required.
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.session) {
        throw new Error("Account created. Please check your email to confirm, then ask a manager to approve you.");
      }

      // Record the pending profile + employee role (RLS-scoped, no key needed).
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: signUpData.user!.id,
        full_name: fullName,
        designation: designation || undefined,
        email,
        status: "pending",
      });
      if (profileErr) throw new Error(profileErr.message);

      const { error: roleErr } = await supabase
        .from("user_roles")
        .insert({ user_id: signUpData.user!.id, role: departmentForDesignation(designation) });
      if (roleErr) throw new Error(roleErr.message);


      // Don't leave them signed into a pending session.
      await supabase.auth.signOut();

      toast.success("Account created! A manager will approve it shortly.");
      setMode("login");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-stage flex items-center justify-center px-4 py-10 text-foreground">
      <div className="portal-band" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/40">
            <img src={SAMA_LOGO_BASE64} alt="Sama Safety & Security" className="h-28 w-auto" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-primary-foreground drop-shadow-sm">
            Sama Portal
          </h1>
          <p className="mt-1 text-sm text-primary-foreground/85">
            Sama Safety &amp; Security · Fire Safety &amp; Security Systems
          </p>
        </div>
        <Card className="border-border/60 shadow-[var(--shadow-elegant)]">

          {mode === "login" ? (
            <>
              <CardHeader>
                <CardTitle>Employee Sign In</CardTitle>
                <CardDescription>
                  Sign in to create and manage Maintenance Service Reports.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
                {hasAdmin ? (
                  <Button variant="link" className="mt-2 w-full" onClick={() => setMode("signup")}>
                    New employee? Create an account
                  </Button>
                ) : (
                  <Button variant="link" className="mt-2 w-full" onClick={() => setMode("setup")}>
                    First time? Create the manager account
                  </Button>
                )}
              </CardContent>
            </>
          ) : mode === "signup" ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldPlus className="h-5 w-5 text-primary" /> Create Your Account
                </CardTitle>
                <CardDescription>
                  Sign up as an employee. A manager will approve your account before you can sign in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sfn">Full Name</Label>
                    <Input id="sfn" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sdg">Designation</Label>
                    <Select value={designation} onValueChange={setDesignation} required>
                      <SelectTrigger id="sdg">
                        <SelectValue placeholder="Select your designation" />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGNATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="semail">Email</Label>
                    <Input id="semail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spw">Password</Label>
                    <Input id="spw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign Up
                  </Button>
                </form>
                <Button variant="link" className="mt-2 w-full" onClick={() => setMode("login")}>
                  Back to sign in
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldPlus className="h-5 w-5 text-primary" /> Create Manager
                </CardTitle>
                <CardDescription>
                  This is the first account. The manager can add employees afterwards.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fn">Full Name</Label>
                    <Input id="fn" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dg">Designation</Label>
                    <Select value={designation} onValueChange={setDesignation}>
                      <SelectTrigger id="dg">
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGNATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Email</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw2">Password</Label>
                    <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Manager
                  </Button>
                </form>
                {hasAdmin && (
                  <Button variant="link" className="mt-2 w-full" onClick={() => setMode("login")}>
                    Back to sign in
                  </Button>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

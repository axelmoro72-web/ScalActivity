"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "lien-invalide"
      ? "Lien d'invitation invalide ou expiré. Demandez une nouvelle invitation."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Porte de secours : mot de passe oublié, ou lien d'invitation consommé
  // par le scanner anti-phishing de la messagerie (impossible de ré-inviter
  // un compte existant). Le lien de réinitialisation aboutit sur la même
  // page de définition du mot de passe que l'invitation.
  async function handleForgotPassword() {
    setError(null);
    const emailInput =
      document.querySelector<HTMLInputElement>("#email")?.value ?? "";
    const parsed = loginSchema.shape.email.safeParse(emailInput);
    if (!parsed.success) {
      setError("Renseignez votre email ci-dessous, puis recliquez.");
      return;
    }
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      parsed.data,
      { redirectTo: `${window.location.origin}/auth/set-password` },
    );
    if (resetError) {
      setError("Envoi impossible pour le moment. Réessayez dans une minute.");
      return;
    }
    setResetSent(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword(
      parsed.data,
    );
    setLoading(false);

    if (authError) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/events");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--vert)] p-6">
      <div className="flex w-full max-w-sm flex-col gap-4.5">
        <div className="text-center">
          <div className="marque text-2xl text-[var(--header-texte)]">
            SCAL<span className="text-[var(--lime)]">ACTIVITY</span>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--header-nav)]">
            Le sport entre collègues. L&apos;inscription se fait sur
            invitation.
          </p>
        </div>
        <div className="rounded-[20px] bg-card p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {resetSent && (
              <Alert>
                <AlertDescription>
                  Email de réinitialisation envoyé. Suivez son lien pour
                  définir un nouveau mot de passe.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--lime)] text-[15px] font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full cursor-pointer text-center text-[13px] text-[var(--texte-2)] underline-offset-4 hover:underline"
            >
              Mot de passe oublié ou lien d&apos;invitation expiré ?
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

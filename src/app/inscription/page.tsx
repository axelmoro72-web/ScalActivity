"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signupSchema } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Création de compte, ouverte à tous : le site ne fonctionne plus sur
 * invitation. La confirmation par email est désactivée côté Supabase
 * (tier gratuit : quelques envois par heure, et les scanners anti-phishing
 * consomment les liens), donc signUp ouvre directement la session.
 *
 * Le profil est créé par le trigger `handle_new_user`, qui lit
 * `display_name` dans les métadonnées.
 */
export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      displayName: form.get("displayName"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { display_name: parsed.data.displayName } },
    });
    setLoading(false);

    if (authError) {
      setError(
        authError.message.toLowerCase().includes("already")
          ? "Un compte existe déjà avec cette adresse. Connectez-vous."
          : "Inscription impossible pour le moment. Réessayez.",
      );
      return;
    }
    // Sans confirmation par email, la session est ouverte immédiatement.
    if (!data.session) {
      setError(
        "Compte créé. Confirmez votre adresse par email, puis connectez-vous.",
      );
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
            Créez votre compte pour organiser et rejoindre des activités.
          </p>
        </div>
        <div className="rounded-[20px] bg-card p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">Nom affiché</Label>
              <Input
                id="displayName"
                name="displayName"
                autoComplete="name"
                placeholder="Axel M."
                required
              />
            </div>
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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--lime)] text-[15px] font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
            >
              {loading ? "Création…" : "Créer mon compte"}
            </button>
            <Link
              href="/login"
              className="w-full text-center text-[13px] text-[var(--texte-2)] underline-offset-4 hover:underline"
            >
              J&apos;ai déjà un compte
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}

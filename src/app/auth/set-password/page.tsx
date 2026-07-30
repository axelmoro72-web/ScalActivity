"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setPasswordSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type SessionState = "loading" | "ready" | "invalid";

// Première connexion après invitation : choix du mot de passe
// (et du nom affiché, facultatif).
//
// Le lien d'invitation par défaut de Supabase (tier gratuit : template non
// personnalisable) redirige ici avec la session dans le fragment d'URL
// (#access_token=…). Le fragment n'atteint jamais le serveur : c'est donc
// cette page qui établit la session côté client.
export default function SetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        // Le lien ne doit pas rester dans l'historique du navigateur.
        window.history.replaceState(null, "", window.location.pathname);
        setSessionState(sessionError ? "invalid" : "ready");
        return;
      }

      // Pas de fragment : session existante (retour sur la page) ?
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSessionState(user ? "ready" : "invalid");
    }

    establishSession();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const parsed = setPasswordSchema.safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const displayName = String(form.get("displayName") ?? "").trim();

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) {
      setLoading(false);
      setError(
        "Impossible de définir le mot de passe. Le lien a peut-être expiré.",
      );
      return;
    }

    if (displayName) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ display_name: displayName })
          .eq("id", user.id);
      }
    }

    setLoading(false);
    router.push("/events");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Bienvenue !</CardTitle>
          <CardDescription>
            Choisissez un mot de passe pour finaliser votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionState === "loading" && (
            <p className="text-sm text-muted-foreground">Vérification…</p>
          )}
          {sessionState === "invalid" && (
            <Alert variant="destructive">
              <AlertDescription>
                Lien d&apos;invitation invalide ou expiré. Demandez une
                nouvelle invitation.
              </AlertDescription>
            </Alert>
          )}
          {sessionState === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="displayName">Nom affiché (facultatif)</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  placeholder="Axel M."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmation</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

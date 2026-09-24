"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setPasswordSchema, signupSchema } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type SessionState = "loading" | "ready" | "invalid" | "expired";

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

      // Lien déjà consommé (souvent : scanner anti-phishing de la
      // messagerie qui « clique » avant l'utilisateur).
      if (hash.get("error_code") === "otp_expired") {
        window.history.replaceState(null, "", window.location.pathname);
        setSessionState("expired");
        return;
      }

      if (access_token && refresh_token) {
        let failure: string | null = null;
        try {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          failure = sessionError
            ? `${sessionError.name}: ${sessionError.message}`
            : null;
        } catch (e) {
          failure = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }
        // Le lien ne doit pas rester dans l'historique du navigateur.
        window.history.replaceState(null, "", window.location.pathname);
        if (failure) console.error("Ouverture de session :", failure);
        setSessionState(failure ? "invalid" : "ready");
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
    const rawName = String(form.get("displayName") ?? "").trim();
    const parsedName = signupSchema.shape.displayName.safeParse(rawName);
    if (rawName && !parsedName.success) {
      setError(parsedName.error.issues[0].message);
      return;
    }
    const displayName = parsedName.success ? parsedName.data : "";

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
    <main className="flex flex-1 items-center justify-center bg-[var(--vert)] p-6">
      <div className="flex w-full max-w-sm flex-col gap-4.5">
        <div className="text-center">
          <div className="marque text-2xl text-[var(--header-texte)]">
            Bienvenue !
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--header-nav)]">
            Choisissez un mot de passe pour finaliser votre compte.
          </p>
        </div>
        <div className="rounded-[20px] bg-card p-6">
          {sessionState === "loading" && (
            <p className="text-sm text-[var(--texte-2)]">Vérification…</p>
          )}
          {sessionState === "invalid" && (
            <Alert variant="destructive">
              <AlertDescription>
                Lien d&apos;invitation invalide ou expiré. Demandez une
                nouvelle invitation.
              </AlertDescription>
            </Alert>
          )}
          {sessionState === "expired" && (
            <Alert variant="destructive">
              <AlertDescription>
                Ce lien a déjà été utilisé — probablement ouvert
                automatiquement par le filtre anti-phishing de votre
                messagerie. Depuis la page de connexion, utilisez « Mot de
                passe oublié ou lien d&apos;invitation expiré ? » pour
                recevoir un nouveau lien.
              </AlertDescription>
            </Alert>
          )}
          {sessionState === "ready" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">Nom affiché (facultatif)</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  maxLength={60}
                  placeholder="Axel M."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Confirmation</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--lime)] text-[15px] font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
              >
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

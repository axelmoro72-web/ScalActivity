"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOMAINE_AUTORISE, signupSchema } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Création de compte, ouverte à tous les collègues : le site ne fonctionne
 * plus sur invitation, mais reste réservé aux adresses professionnelles,
 * pour savoir à qui appartient chaque compte. La règle est aussi appliquée
 * par un trigger sur auth.users : le formulaire n'est pas le seul chemin
 * vers l'API d'inscription.
 *
 * Le domaine ne prouve pas la possession de l'adresse : n'importe qui peut
 * saisir celle d'un collègue. D'où la confirmation par email, activée côté
 * Supabase (`enable_confirmations`) — signUp ne renvoie alors plus de
 * session, et le compte reste inutilisable tant que le lien n'est pas
 * ouvert. Le lien atterrit sur /auth/confirmation.
 *
 * Le profil est créé par le trigger `handle_new_user`, qui lit
 * `display_name` dans les métadonnées.
 */
export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Adresse à confirmer : renseignée, elle remplace le formulaire par
  // l'écran d'attente.
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

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
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: `${window.location.origin}/auth/confirmation`,
      },
    });
    setLoading(false);

    if (authError) {
      const m = authError.message.toLowerCase();
      setError(
        m.includes("already")
          ? "Un compte existe déjà avec cette adresse. Connectez-vous."
          : m.includes("domaine") || m.includes("scalian")
            ? `Inscription réservée aux adresses ${DOMAINE_AUTORISE}.`
            : authError.status === 429
              ? "Trop d'inscriptions dans l'heure : le quota d'envoi d'emails est atteint. Réessayez plus tard."
              : "Inscription impossible pour le moment. Réessayez.",
      );
      return;
    }
    // Avec la confirmation par email, signUp ne renvoie pas de session :
    // le compte attend l'ouverture du lien. Une session non nulle signifie
    // que la confirmation a été désactivée côté Supabase.
    if (!data.session) {
      setAConfirmer(parsed.data.email);
      return;
    }
    router.push("/events");
    router.refresh();
  }

  if (aConfirmer) {
    return <EnAttenteDeConfirmation email={aConfirmer} />;
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--vert)] p-6">
      <div className="flex w-full max-w-sm flex-col gap-4.5">
        <div className="text-center">
          <div className="marque text-2xl text-[var(--header-texte)]">
            SCAL<span className="text-[var(--lime)]">ACTIVITY</span>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--header-nav)]">
            Créez votre compte avec votre adresse professionnelle
            {" "}{DOMAINE_AUTORISE}.
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
                placeholder={`prenom.nom${DOMAINE_AUTORISE}`}
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

/**
 * Écran d'attente affiché juste après la création du compte. Le compte
 * existe mais reste inutilisable tant que l'adresse n'est pas confirmée.
 *
 * Le bouton de renvoi est là parce que le lien se perd facilement : filtre
 * anti-phishing qui le consomme avant son destinataire, ou quota d'envoi
 * du tier gratuit atteint au moment de l'inscription.
 */
function EnAttenteDeConfirmation({ email }: { email: string }) {
  const [renvoye, setRenvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  async function renvoyer() {
    setErreur(null);
    setEnvoiEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirmation`,
      },
    });
    setEnvoiEnCours(false);

    if (error) {
      setErreur(
        error.status === 429
          ? "Trop d'emails demandés dans l'heure. Patientez avant de réessayer."
          : "Envoi impossible pour le moment. Réessayez dans quelques minutes.",
      );
      return;
    }
    setRenvoye(true);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--vert)] p-6">
      <div className="flex w-full max-w-sm flex-col gap-4.5">
        <div className="text-center">
          <div className="marque text-2xl text-[var(--header-texte)]">
            Vérifiez vos emails
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--header-nav)]">
            Votre compte est créé, il ne reste qu&apos;à confirmer
            l&apos;adresse.
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-[20px] bg-card p-6">
          {erreur && (
            <Alert variant="destructive">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-[var(--texte-2)]">
            Un lien de confirmation vient d&apos;être envoyé à{" "}
            <span className="grotesk font-semibold text-foreground">
              {email}
            </span>
            . Ouvrez-le pour accéder à ScalActivity. Pensez à regarder dans
            les indésirables.
          </p>
          {renvoye ? (
            <p className="text-sm text-[var(--texte-2)]">
              Un nouveau lien vient d&apos;être envoyé.
            </p>
          ) : (
            <button
              type="button"
              onClick={renvoyer}
              disabled={envoiEnCours}
              className="grotesk h-11 w-full cursor-pointer rounded-full border-[1.5px] border-[var(--vert)] text-[15px] font-semibold text-[var(--vert)] transition-colors hover:bg-[var(--accent)] disabled:opacity-60"
            >
              {envoiEnCours ? "Envoi…" : "Renvoyer le lien"}
            </button>
          )}
          <Link
            href="/login"
            className="w-full text-center text-[13px] text-[var(--texte-2)] underline-offset-4 hover:underline"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </main>
  );
}

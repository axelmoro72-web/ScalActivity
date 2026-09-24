"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOMAINE_AUTORISE, signupSchema } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Etat = "verification" | "expire" | "invalide";

/**
 * Cible du lien de confirmation d'inscription.
 *
 * Le template par défaut de Supabase (non personnalisable tant qu'aucun
 * SMTP custom n'est configuré) redirige ici avec la session dans le
 * fragment d'URL (#access_token=…). Le fragment n'atteint jamais le
 * serveur : c'est donc cette page qui ouvre la session, exactement comme
 * /auth/set-password le fait pour les invitations.
 *
 * Le cas à ne surtout pas présenter comme une panne : le filtre
 * anti-phishing de la messagerie ouvre le lien avant son destinataire et
 * consomme le jeton à usage unique. Supabase renvoie alors
 * error_code=otp_expired ; il suffit d'en redemander un.
 */
export default function ConfirmationPage() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>("verification");

  useEffect(() => {
    const supabase = createClient();

    async function ouvrirSession() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");

      if (hash.get("error_code") === "otp_expired") {
        window.history.replaceState(null, "", window.location.pathname);
        setEtat("expire");
        return;
      }

      if (access_token && refresh_token) {
        let echec: string | null = null;
        try {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          echec = error ? `${error.name}: ${error.message}` : null;
        } catch (e) {
          echec = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }
        // Le lien ne doit pas rester dans l'historique du navigateur.
        window.history.replaceState(null, "", window.location.pathname);

        if (echec) {
          // Le détail reste dans la console : l'afficher n'aide pas la
          // personne et expose le fonctionnement interne.
          console.error("Confirmation :", echec);
          setEtat("invalide");
          return;
        }
        router.push("/events");
        router.refresh();
        return;
      }

      // Pas de fragment : l'adresse est peut-être déjà confirmée et la
      // session ouverte (retour sur la page, second clic sur le lien).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        router.push("/events");
        router.refresh();
        return;
      }
      setEtat("invalide");
    }

    ouvrirSession();
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--vert)] p-6">
      <div className="flex w-full max-w-sm flex-col gap-4.5">
        <div className="text-center">
          <div className="marque text-2xl text-[var(--header-texte)]">
            SCAL<span className="text-[var(--lime)]">ACTIVITY</span>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--header-nav)]">
            Confirmation de votre adresse professionnelle.
          </p>
        </div>
        <div className="rounded-[20px] bg-card p-6">
          {etat === "verification" && (
            <p className="text-sm text-[var(--texte-2)]">Vérification…</p>
          )}
          {etat === "expire" && (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertDescription>
                  Ce lien a déjà été utilisé — le plus souvent parce que le
                  filtre anti-phishing de la messagerie l&apos;a ouvert
                  automatiquement avant vous. Demandez-en un nouveau
                  ci-dessous.
                </AlertDescription>
              </Alert>
              <RenvoyerLeLien />
            </div>
          )}
          {etat === "invalide" && (
            <div className="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertDescription>
                  Lien de confirmation invalide ou expiré.
                </AlertDescription>
              </Alert>
              <RenvoyerLeLien />
              <Link
                href="/login"
                className="w-full text-center text-[13px] text-[var(--texte-2)] underline-offset-4 hover:underline"
              >
                Retour à la connexion
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Renvoi d'un email de confirmation. Supabase ne dit jamais si l'adresse
 * correspond à un compte en attente : ne pas le déduire du retour, sous
 * peine de transformer ce formulaire en test d'existence de comptes.
 */
function RenvoyerLeLien() {
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);

    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    const parsed = signupSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setErreur(parsed.error.issues[0].message);
      return;
    }

    setEnvoiEnCours(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirmation`,
      },
    });
    setEnvoiEnCours(false);

    if (error) {
      // Le quota d'envoi du tier gratuit est vite atteint : le dire, plutôt
      // que d'afficher une erreur générique incompréhensible.
      setErreur(
        error.status === 429
          ? "Trop d'emails demandés dans l'heure. Patientez avant de réessayer."
          : "Envoi impossible pour le moment. Réessayez dans quelques minutes.",
      );
      return;
    }
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <p className="text-sm text-[var(--texte-2)]">
        Si un compte est en attente de confirmation pour cette adresse, un
        nouveau lien vient d&apos;être envoyé. Pensez aux indésirables.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Votre adresse professionnelle</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={`prenom.nom${DOMAINE_AUTORISE}`}
          required
        />
      </div>
      <button
        type="submit"
        disabled={envoiEnCours}
        className="grotesk h-11 w-full cursor-pointer rounded-full bg-[var(--lime)] text-[15px] font-bold text-[var(--vert)] transition-colors hover:bg-[var(--lime-hover)] disabled:opacity-60"
      >
        {envoiEnCours ? "Envoi…" : "Renvoyer le lien"}
      </button>
    </form>
  );
}

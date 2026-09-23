"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useCurrentProfile } from "@/lib/queries";
import { deleteAccount, type CompteState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ComptePage() {
  const { data: profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CompteState>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccount();
      // En cas de succès, l'action redirige : on n'arrive ici qu'en échec.
      setState(result);
      setOpen(false);
    });
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-7">
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-card">
        <div className="bg-[var(--vert)] px-6 py-5">
          <h1 className="grotesk text-[22px] font-bold text-[var(--header-texte)]">
            Mon compte
          </h1>
          <p className="mt-1 text-[13px] text-[var(--header-nav)]">
            {profile?.display_name ?? "…"}
          </p>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <h2 className="grotesk text-[15px] font-semibold">
              Inviter un collègue
            </h2>
            <p className="text-[13px] text-[var(--texte-2)]">
              L&apos;inscription est ouverte à toute adresse @scalian.com. Vous
              pouvez aussi envoyer une invitation par email.
            </p>
            <Link
              href="/invite"
              className="text-[13px] text-[var(--vert)] underline underline-offset-4"
            >
              Envoyer une invitation
            </Link>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-5">
            <h2 className="grotesk text-[15px] font-semibold">
              Supprimer mon compte
            </h2>
            <p className="text-[13px] text-[var(--texte-2)]">
              Votre profil, vos inscriptions et vos messages seront effacés
              définitivement, ainsi que les activités passées que vous avez
              créées. Annulez d&apos;abord vos activités à venir.
            </p>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <button
                    disabled={pending}
                    className="grotesk mt-1 h-10 w-fit cursor-pointer rounded-full bg-[var(--rouge-pale)] px-5 text-[13px] font-semibold text-[var(--rouge)] transition-colors hover:bg-[var(--rouge-pale-hover)] disabled:opacity-60"
                  >
                    Supprimer mon compte
                  </button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="grotesk">
                    Supprimer votre compte ?
                  </DialogTitle>
                  <DialogDescription>
                    Vous serez déconnecté·e et vos données seront effacées.
                    Cette action est irréversible.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Retour
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={handleDelete}
                  >
                    Supprimer définitivement
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </main>
  );
}

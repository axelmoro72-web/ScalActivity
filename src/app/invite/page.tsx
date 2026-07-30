"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function InvitePage() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    inviteMember,
    null,
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-7">
      <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-card">
        <div className="bg-[var(--vert)] px-6 py-5">
          <h1 className="grotesk text-[22px] font-bold text-[var(--header-texte)]">
            Inviter un collègue
          </h1>
          <p className="mt-1 text-[13px] text-[var(--header-nav)]">
            Il ou elle recevra un email avec un lien pour créer son compte.
          </p>
        </div>
        <form action={formAction} className="flex flex-col gap-4 px-6 py-5">
          {state && (
            <Alert variant={state.ok ? "default" : "destructive"}>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email professionnel</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="prenom.nom@scalian.com"
              required
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="grotesk h-11 cursor-pointer self-start rounded-full bg-[var(--vert)] px-6 text-sm font-bold text-[var(--header-texte)] transition-colors hover:bg-[var(--vert-hover)] disabled:opacity-60"
          >
            {pending ? "Envoi…" : "Envoyer l'invitation"}
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "./actions";
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

export default function InvitePage() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    inviteMember,
    null,
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="titre-page">Inviter un collègue</CardTitle>
          <CardDescription>
            Il ou elle recevra un email avec un lien pour créer son compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state && (
              <Alert variant={state.ok ? "default" : "destructive"}>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email professionnel</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="prenom.nom@scalian.com"
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

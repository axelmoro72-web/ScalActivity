"use client";

import { useActionState } from "react";
import { createEvent, type ActionState } from "../actions";
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

export default function NewEventPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createEvent,
    null,
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="titre-page">Créer un événement</CardTitle>
          <CardDescription>
            Le coût total est réparti entre les {""}
            participants : prix par personne = coût total ÷ nombre de places.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state && !state.ok && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                name="title"
                placeholder="Padel du jeudi"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sport">Sport</Label>
                <Input id="sport" name="sport" placeholder="Padel" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Lieu</Label>
                <Input id="location" name="location" placeholder="4Padel Toulouse" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startsAt">Début</Label>
                <Input
                  id="startsAt"
                  name="startsAt"
                  type="datetime-local"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">Fin (facultatif)</Label>
                <Input id="endsAt" name="endsAt" type="datetime-local" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capacity">Nombre de places</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  max={100}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalCost">Coût total (€)</Label>
                <Input
                  id="totalCost"
                  name="totalCost"
                  inputMode="decimal"
                  placeholder="48"
                  defaultValue="0"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Création…" : "Créer l'événement"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

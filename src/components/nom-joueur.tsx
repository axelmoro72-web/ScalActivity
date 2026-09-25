import Link from "next/link";
import { lienJoueur } from "@/lib/classement";
import { cn } from "@/lib/utils";

/**
 * Nom d'une personne, cliquable vers son profil (matchs, victoires,
 * défaites, historique). Un invité sans compte a aussi un profil,
 * retrouvé par son nom.
 */
export function NomJoueur({
  nom,
  userId,
  className,
}: {
  nom: string;
  userId: string | null;
  className?: string;
}) {
  return (
    <Link
      href={lienJoueur({ user_id: userId, nom })}
      title={`Voir le profil de ${nom}`}
      className={cn("hover:underline", className)}
    >
      {nom}
    </Link>
  );
}

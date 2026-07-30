"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/events", label: "Événements" },
  { href: "/events/new", label: "Créer" },
  { href: "/invite", label: "Inviter" },
];

export function Header({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-[var(--scalian-violet)] text-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <Link href="/events" className="titraille text-sm tracking-[0.22em]">
          Scal<span className="text-[var(--scalian-lavande)]">activity</span>
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white",
                pathname === l.href && "bg-white/15 font-medium text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-white/70">{displayName}</span>
          <form action={signOut}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              Déconnexion
            </Button>
          </form>
        </div>
      </div>
      {/* Filet fin de l'univers formel Scalian */}
      <div className="filet-scalian h-px" aria-hidden />
    </header>
  );
}

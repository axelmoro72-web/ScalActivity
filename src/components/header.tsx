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
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
        <Link
          href="/events"
          className="titraille text-sm text-[var(--violet-fonce)] transition-colors hover:text-[var(--violet)] dark:text-[var(--violet-clair)]"
        >
          Scalactivity<span className="text-[var(--violet)]">.</span>
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === l.href && "font-medium text-[var(--violet)]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {displayName}
          </span>
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              Déconnexion
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

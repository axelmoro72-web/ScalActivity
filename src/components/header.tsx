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
    <header className="border-b">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
        <Link href="/events" className="font-semibold">
          ScalActivity
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm hover:bg-accent",
                pathname === l.href && "bg-accent font-medium",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{displayName}</span>
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

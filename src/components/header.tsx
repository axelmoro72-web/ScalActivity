"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const links = [
  { href: "/events", label: "Événements" },
  { href: "/events/new", label: "Créer" },
  { href: "/invite", label: "Inviter" },
];

export function Header({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-[var(--vert)]">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-1 px-6 py-3.5">
        <Link
          href="/events"
          className="marque text-[17px] text-[var(--header-texte)]"
        >
          SCAL<span className="text-[var(--lime)]">ACTIVITY</span>
        </Link>
        <nav className="flex gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "grotesk rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[var(--header-nav)] transition-colors hover:text-[var(--header-texte)]",
                pathname === l.href &&
                  "bg-[var(--lime)] font-semibold text-[var(--vert)] hover:text-[var(--vert)]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span
            title={displayName}
            className="grotesk flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--lime)] text-xs font-bold text-[var(--vert)]"
          >
            {initials(displayName)}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="grotesk cursor-pointer text-[13px] font-medium text-[var(--header-nav)] transition-colors hover:text-[var(--header-texte)]"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

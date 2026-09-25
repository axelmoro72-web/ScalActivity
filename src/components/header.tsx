"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";


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
        <nav className="flex items-center gap-4">
          {[
            { href: "/events", label: "Activités", actif: pathname.startsWith("/events") },
            {
              href: "/classement",
              label: "Classement",
              actif: pathname.startsWith("/classement") || pathname.startsWith("/joueurs"),
            },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.actif ? "page" : undefined}
              className={cn(
                "grotesk text-[13px] font-medium transition-colors hover:text-[var(--header-texte)]",
                l.actif
                  ? "text-[var(--header-texte)] underline decoration-[var(--lime)] decoration-2 underline-offset-[6px]"
                  : "text-[var(--header-nav)]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/compte"
            title={`${displayName} — mon compte`}
            className={cn(
              "grotesk flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--lime)] text-xs font-bold text-[var(--vert)] transition-opacity hover:opacity-85",
              pathname === "/compte" && "ring-2 ring-[var(--header-texte)]",
            )}
          >
            {initials(displayName)}
          </Link>
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

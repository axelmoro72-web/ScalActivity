import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Pastille d'initiales du design « Terrain ». */
export function AvatarInitials({
  name,
  highlight = false,
  size = 30,
  className,
}: {
  name: string;
  highlight?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.37 }}
      className={cn(
        "grotesk flex flex-none items-center justify-center rounded-full font-semibold",
        highlight
          ? "bg-[var(--lime)] text-[var(--vert)]"
          : "bg-[var(--avatar)] text-[var(--vert)]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

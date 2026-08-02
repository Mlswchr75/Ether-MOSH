import { Link, useNavigate } from "react-router-dom";
import { LogOut, Sparkles, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  align?: "start" | "end";
  className?: string;
}

/** Discreet account chip for the top bar. Shows initials + supporter badge. */
export function AccountChip({ align = "end", className = "" }: Props) {
  const { user, loading, signOut } = useAuth();
  const { isSupporter } = useEntitlements();
  const navigate = useNavigate();

  if (loading) return null;

  if (!user) {
    return (
      <Link
        to="/auth"
        className={`inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-background/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/70 backdrop-blur hover:border-foreground/40 hover:text-foreground transition ${className}`}
        aria-label="Sign in"
      >
        <UserIcon className="h-3 w-3" aria-hidden />
        sign in
      </Link>
    );
  }

  const email = user.email ?? "";
  const initials = (email[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/80 backdrop-blur hover:border-foreground/40 hover:text-foreground transition ${className}`}
          aria-label="Account menu"
        >
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
              isSupporter ? "bg-primary text-primary-foreground" : "bg-foreground/15 text-foreground"
            }`}
            style={isSupporter ? { boxShadow: "0 0 10px hsl(var(--primary) / 0.6)" } : undefined}
          >
            {initials}
          </span>
          {isSupporter ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              supporter
            </span>
          ) : (
            <span>account</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56 font-mono text-xs">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        {isSupporter && (
          <DropdownMenuLabel className="text-primary flex items-center gap-1 text-[10px] uppercase tracking-[0.2em]">
            <Sparkles className="h-3 w-3" aria-hidden /> supporter unlocked
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        {!isSupporter && (
          <DropdownMenuItem onClick={() => navigate("/pricing")}>
            <Sparkles className="mr-2 h-3 w-3" aria-hidden /> Unlock supporter
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate("/account")}>
          <UserIcon className="mr-2 h-3 w-3" aria-hidden /> Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            toast.success("signed out");
          }}
        >
          <LogOut className="mr-2 h-3 w-3" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

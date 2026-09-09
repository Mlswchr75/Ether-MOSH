import { useEffect, useRef, useState } from "react";
import { Copy, Share2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * One share surface for the whole app.
 *
 * There were two. The editor's (`lib/share.ts`) asked the browser to share and,
 * when the browser could not, copied the link and said so in a toast — which is
 * every desktop Firefox, every desktop Chrome on Linux and Windows, and any
 * browser that declines the sheet. On those, "share" meant "a link is now on
 * your clipboard, work out the rest yourself". The radio's was a real panel
 * with the places people actually post, and it was reachable from exactly one
 * screen.
 *
 * This is the radio's, made general and put underneath both. Native sharing is
 * still preferred where it exists — it is one tap and it knows the device's own
 * apps — and this is what happens instead of giving up.
 */

export type ShareDetails = {
  url: string;
  title: string;
  /** The line that rides along with the link. */
  text?: string;
  /** Labels the read-only link field for screen readers. */
  linkLabel?: string;
};

const SHARE_TOAST_ID = "mosh-share";

export function ShareChoices({
  url,
  title,
  text = "Made with MOSH — real-time audio-reactive visual instrument",
  linkLabel = "Shareable link",
}: ShareDetails) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
  let native = typeof navigator.share === "function";
  try { if (native && navigator.canShare) native = navigator.canShare({ url, title, text }); } catch { native = false; }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} — ${text}`);
  const body = encodeURIComponent(`${title}\n${url}`);
  const choices = [
    { name: "WhatsApp", href: `https://wa.me/?text=${body}` },
    { name: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
    { name: "Reddit", href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(title)}` },
    { name: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${body}` },
    ...(mobile ? [{ name: "Text message", href: `sms:${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?"}body=${body}` }] : []),
  ];

  useEffect(() => {
    // Captured, because the editor listens for Escape too and would take it
    // first — closing performance mode out from under an open share panel.
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); toast.dismiss(SHARE_TOAST_ID); } };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage("Link copied"); }
    catch { input.current?.focus(); input.current?.select(); setMessage("Select and copy the link below"); }
  };

  return (
    <section
      aria-label={`Share ${title}`}
      data-cursor-zone="controls"
      className="max-h-[calc(100dvh-2rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-cyan-300/30 bg-[#100b1a] p-4 text-sm text-white shadow-2xl"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="mb-3 flex items-start gap-3">
        <p className="min-w-0 flex-1 break-words font-semibold">Share · {title}</p>
        <button type="button" aria-label="Close sharing" onClick={() => toast.dismiss(SHARE_TOAST_ID)} className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {native && (
          <button
            type="button"
            className="col-span-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2.5 text-cyan-200"
            onClick={() => {
              void navigator.share({ url, title, text })
                .then(() => setMessage("Shared"))
                .catch((error: Error) => { if (error.name !== "AbortError") setMessage("Choose an option below or copy the link"); });
            }}
          >
            Share to apps…
          </button>
        )}
        <button type="button" onClick={() => void copy()} className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2.5"><Copy size={15} /> Copy link</button>
        {choices.map(choice => (
          <a key={choice.name} href={choice.href} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/10 px-3 py-2.5 text-center hover:bg-white/20">{choice.name}</a>
        ))}
      </div>
      <input ref={input} aria-label={linkLabel} readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-3 w-full rounded-md border border-white/20 bg-black/30 p-2 text-xs text-white/70" />
      {message && <p role="status" className="mt-2 text-cyan-200">{message}</p>}
    </section>
  );
}

/**
 * Raise the share panel from anywhere, including non-React code.
 *
 * `lib/share.ts` calls this as its fallback, which is what puts the panel
 * behind every share entry point in the app rather than only the ones that
 * render a button from this file.
 */
export function openShareSheet(details: ShareDetails): void {
  toast.custom(() => <ShareChoices key={details.url} {...details} />, {
    id: SHARE_TOAST_ID,
    position: "top-right",
    duration: 30_000,
    unstyled: true,
  });
}

/** The standard share affordance: a labelled button that opens the panel. */
export function ShareButton({ className = "", label = "Share", ...details }: ShareDetails & { className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-label={`Share ${details.title}`}
      title={`Share ${details.title}`}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-cyan-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-200 ${className}`}
      onClick={e => { e.stopPropagation(); openShareSheet(details); }}
    >
      <Share2 size={15} />
      {label && <span>{label}</span>}
    </button>
  );
}

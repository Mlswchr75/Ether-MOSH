const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
        checkout is not configured — complete go-live to accept real payments
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-accent/40 bg-accent/10 px-4 py-2 text-center font-mono text-[11px] tracking-[0.15em] text-accent">
        test mode — no real charges. use card <b>4242 4242 4242 4242</b>
      </div>
    );
  }
  return null;
}

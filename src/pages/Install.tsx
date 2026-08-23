import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";

const EASE = [0.22, 1, 0.36, 1] as const;

const canonical = "https://ether-mosh.online/install";
const title = "Install — MOSH";
const description = "Install MOSH as a native-feeling app on iOS, Android, or desktop. No app store required.";
const ogImage = "https://ether-mosh.online/og-image.png";

const steps = {
  ios: [
    { n: "01", text: "Open MOSH in Safari on your iPhone or iPad." },
    { n: "02", text: 'Tap the Share button (square with arrow) at the bottom of the screen.' },
    { n: "03", text: 'Scroll down and tap "Add to Home Screen".' },
    { n: "04", text: 'Tap "Add" in the top-right corner. MOSH is now on your home screen.' },
  ],
  android: [
    { n: "01", text: "Open MOSH in Chrome on your Android device." },
    { n: "02", text: "Tap the three-dot menu in the top-right corner." },
    { n: "03", text: 'Tap "Add to Home screen" or "Install app".' },
    { n: "04", text: 'Tap "Add". MOSH launches instantly — no app store needed.' },
  ],
  desktop: [
    { n: "01", text: "Open MOSH in Chrome, Edge, or Brave on your computer." },
    { n: "02", text: "Look for the install icon (⊕) in the address bar, or open the browser menu." },
    { n: "03", text: 'Click "Install MOSH" or "Add to Desktop".' },
    { n: "04", text: "MOSH opens in its own window — no browser chrome, full canvas." },
  ],
};

export default function Install() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="MOSH" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* Nav */}
      <div className="flex items-center justify-between px-6 pt-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/60 transition hover:text-accent"
        >
          ← back
        </button>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/40">
          mosh / install
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">
            install mosh
          </h1>
          <p className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight">
            One tap. No app store.
          </p>
          <p className="mt-4 font-mono text-xs leading-relaxed text-foreground/60">
            MOSH is a Progressive Web App (PWA). Install it on any device for a fullscreen,
            native-feeling experience — faster launches, offline access, and no browser bar
            eating into your canvas.
          </p>
        </motion.div>

        {(["ios", "android", "desktop"] as const).map((platform, pi) => (
          <motion.section
            key={platform}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 + pi * 0.1, ease: EASE }}
            className="mt-12"
          >
            <h2 className="mb-6 border-b border-border/40 pb-3 font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/50">
              {platform === "ios" ? "iPhone / iPad" : platform === "android" ? "Android" : "Desktop — Mac / Windows / Linux"}
            </h2>
            <ol className="space-y-5">
              {steps[platform].map(s => (
                <li key={s.n} className="flex gap-5">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-accent/60">{s.n}</span>
                  <p className="font-mono text-xs leading-relaxed text-foreground/75">{s.text}</p>
                </li>
              ))}
            </ol>
          </motion.section>
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mt-16 border border-border/40 p-6"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">
            note
          </p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-foreground/60">
            MOSH runs entirely in your browser. Nothing is uploaded to any server — your
            images stay on your device. The app works offline once installed; only payment
            verification and demo images require a network connection.
          </p>
        </motion.div>
      </div>
    </main>
  );
}

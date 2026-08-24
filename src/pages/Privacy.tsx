import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const LAST_UPDATED = "August 24, 2026";

export default function Privacy() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy Policy — Ether-MOSH</title>
        <meta name="description" content="How Ether-MOSH handles account, payment, camera, audio, upload, and deletion data." />
        <link rel="canonical" href="https://ether-mosh.online/privacy" />
      </Helmet>

      <div className="flex items-center justify-between px-6 pt-6">
        <button type="button" onClick={() => navigate("/")} className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/60 transition hover:text-accent">← back</button>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/40">ether-mosh / privacy</span>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">privacy policy</h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/40">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-10 font-mono text-xs leading-relaxed text-foreground/70">
          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">The short version</h2>
            <p>Your uploads, camera feed, and audio are processed locally on your device. Ether-MOSH uses remote services only where needed for account authentication, entitlement restoration, payments, public app assets, and account-deletion requests.</p>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Data we process</h2>
            <ul className="space-y-2">
              <li>· <span className="text-foreground/90">Account information</span> — email address and authentication records needed to create, secure, and restore your account.</li>
              <li>· <span className="text-foreground/90">Entitlement data</span> — product/unlock status and transaction references associated with your account.</li>
              <li>· <span className="text-foreground/90">Payment information</span> — checkout is processed by Stripe. Ether-MOSH receives payment status and identifiers needed to grant or restore purchases; it does not receive your full card number.</li>
              <li>· <span className="text-foreground/90">Deletion requests</span> — when you request account deletion, the request includes your account identifier, account email, request time, and any optional reason you provide.</li>
              <li>· <span className="text-foreground/90">Local app data</span> — presets, Sticker Vault assets, UI preferences, and similar creative state may be stored in browser/app storage on your device.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Media and sensor data</h2>
            <ul className="space-y-2">
              <li>· Uploaded images/video are processed on-device unless you explicitly use a feature that says otherwise.</li>
              <li>· Camera frames are processed locally for live visuals, segmentation, tracking, and capture.</li>
              <li>· Microphone or browser-shared audio is analyzed locally for reactive visual controls.</li>
              <li>· Ether-MOSH does not use advertising IDs or behavioral advertising trackers.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Service providers</h2>
            <ul className="space-y-2">
              <li>· <span className="text-foreground/90">Supabase</span> — authentication and account-linked entitlement data.</li>
              <li>· <span className="text-foreground/90">Stripe</span> — payment processing and related transaction records.</li>
              <li>· <span className="text-foreground/90">Netlify</span> — application hosting and receipt of the account-deletion request form.</li>
              <li>· <span className="text-foreground/90">Google MediaPipe/model hosting</span> — optional model/runtime files used for on-device segmentation or landmark detection; your camera/image frames are not uploaded to those model hosts by Ether-MOSH.</li>
              <li>· <span className="text-foreground/90">Shopify CDN</span> — public imagery used by optional demo content; your personal uploads are not sent there.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Cookies, storage, and offline use</h2>
            <p>Ether-MOSH uses localStorage, IndexedDB, session storage, caches, and a service worker for account-session persistence, creative settings, Sticker Vault data, and offline app-shell behavior. Clearing Ether-MOSH site/app storage removes device-local data. Account-linked data remains until you sign out or request account deletion.</p>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Retention and account deletion</h2>
            <p>You can initiate deletion from <Link to="/account" className="text-accent hover:underline">Account</Link> inside Ether-MOSH or directly from the public <Link to="/delete-account" className="text-accent hover:underline">account deletion page</Link>. After you authenticate and submit the request, it is reviewed and completed within 7 days.</p>
            <p className="mt-3">When processed, the Ether-MOSH authentication account and account-linked entitlement data are deleted. Local-only creative data can be removed immediately by clearing app/site storage. Payment processors may retain transaction records where required for tax, fraud prevention, accounting, disputes, or other legal obligations. Such retained records do not keep the Ether-MOSH account active.</p>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Your choices and rights</h2>
            <p>You may request access, correction, or deletion of account-linked personal data. Depending on your jurisdiction, additional privacy rights may apply. Use the <Link to="/contact" className="text-accent hover:underline">support page</Link> for privacy questions or the deletion page for account deletion.</p>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Security</h2>
            <p>Ether-MOSH uses HTTPS, Supabase authentication, scoped client credentials, content-security restrictions, and server-side payment functions. No service-role or payment-secret credential is intentionally shipped in the public client.</p>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] uppercase tracking-[0.35em] text-foreground/50">Contact</h2>
            <p>For privacy, support, or billing questions, use the <Link to="/contact" className="text-accent hover:underline">Ether-MOSH contact page</Link>.</p>
          </section>
        </div>
      </div>
    </main>
  );
}

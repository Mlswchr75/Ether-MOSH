import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { installMobileRuntime } from "./engine/mobileRuntime";
import "./index.css";

installMobileRuntime();

// index.html loads the Google Fonts stylesheet as media="print" so it
// doesn't block first paint. Flip it to "all" once it's actually loaded —
// done here (an external module script) rather than an inline onload
// attribute, which the page's CSP (no 'unsafe-inline' in script-src) would
// silently drop.
{
  const gfontsLink = document.getElementById("gfonts-stylesheet");
  if (gfontsLink instanceof HTMLLinkElement) {
    const swap = () => { gfontsLink.media = "all"; };
    if (gfontsLink.sheet) swap();
    else gfontsLink.addEventListener("load", swap, { once: true });
  }
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
  }, { once: true });
}

import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Index = lazy(() => import("./pages/Index.tsx"));
const Editor = lazy(() => import("./pages/Editor.tsx"));
const ForgeRedirect = lazy(() => import("./pages/ForgeRedirect.tsx"));
const Install = lazy(() => import("./pages/Install.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const Refund = lazy(() => import("./pages/Refund.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AuthCallback = lazy(() => import("./pages/AuthCallback.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Favorites = lazy(() => import("./pages/Favorites.tsx"));
const EffectsRegistry = lazy(() => import("./pages/EffectsRegistry.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const About = lazy(() => import("./pages/About.tsx"));
const LiveVisuals = lazy(() => import("./pages/LiveVisuals.tsx"));
const JourneyPortals = lazy(() => import("./pages/JourneyPortals.tsx"));
const JourneyEmbed = lazy(() => import("./pages/JourneyEmbed.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));
const GuidesIndex = lazy(() => import("./pages/GuidesIndex.tsx"));
const GuideAudioReactive = lazy(() => import("./pages/GuideAudioReactive.tsx"));
const GuideMakeMusicVideo = lazy(() => import("./pages/GuideMakeMusicVideo.tsx"));
const GuideDatamoshVideo = lazy(() => import("./pages/GuideDatamoshVideo.tsx"));
const GuideFreeVJSoftware = lazy(() => import("./pages/GuideFreeVJSoftware.tsx"));
const GuideGlitchTikTok = lazy(() => import("./pages/GuideGlitchTikTok.tsx"));
const NewsIndex = lazy(() => import("./pages/NewsIndex.tsx"));
const NewsArticle = lazy(() => import("./pages/NewsArticle.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Suspense fallback={<div className="fixed inset-0 bg-background" />}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/edit" element={<Editor />} />
            <Route path="/forge" element={<ForgeRedirect />} />
            <Route path="/install" element={<Install />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/refund" element={<Refund />} />
            <Route path="/refunds" element={<Refund />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/account" element={<Account />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/effects" element={<EffectsRegistry />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/about" element={<About />} />
            <Route path="/live-visuals" element={<LiveVisuals />} />
            <Route path="/journey-portals" element={<JourneyPortals />} />
            <Route path="/embed/journey" element={<JourneyEmbed />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/guides" element={<GuidesIndex />} />
            <Route path="/guides/audio-reactive-music-videos" element={<GuideAudioReactive />} />
            <Route path="/guides/make-music-video" element={<GuideMakeMusicVideo />} />
            <Route path="/guides/how-to-datamosh-a-video" element={<GuideDatamoshVideo />} />
            <Route path="/guides/free-vj-software-browser" element={<GuideFreeVJSoftware />} />
            <Route path="/guides/glitch-effect-video-tiktok" element={<GuideGlitchTikTok />} />
            <Route path="/news" element={<NewsIndex />} />
            <Route path="/news/:slug" element={<NewsArticle />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </Suspense>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

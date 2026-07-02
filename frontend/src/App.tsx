import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { Footer } from "./components/Footer";
import { Nav } from "./components/Nav";
import { Landing } from "./pages/Landing";

// The landing paints immediately; every other page loads on demand so the
// first impression isn't waiting on the whole app bundle.
const CampaignsPage = lazy(() => import("./pages/CampaignsPage").then((m) => ({ default: m.CampaignsPage })));
const ClaimPage = lazy(() => import("./pages/ClaimPage").then((m) => ({ default: m.ClaimPage })));
const CreatePage = lazy(() => import("./pages/CreatePage").then((m) => ({ default: m.CreatePage })));
const DistributePage = lazy(() => import("./pages/DistributePage").then((m) => ({ default: m.DistributePage })));
const FaucetPage = lazy(() => import("./pages/FaucetPage").then((m) => ({ default: m.FaucetPage })));
const HowItWorks = lazy(() => import("./pages/HowItWorks").then((m) => ({ default: m.HowItWorks })));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage })));

function PageFallback() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton h-44 w-full" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <span className="stamp text-muted">No such file</span>
      <h1 className="mt-4 font-display text-4xl font-black tracking-tight">404</h1>
      <p className="mt-3 text-sm text-muted">
        If you followed a claim link, check that you copied the whole URL - the part after # matters.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link to="/" className="btn-primary text-sm">
          Go home
        </Link>
        <Link to="/claim" className="btn-ghost text-sm">
          Find my drops
        </Link>
      </div>
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return (
    <div className="min-h-screen flex flex-col">
      {pathname !== "/" && <Nav />}
      <div className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/distribute" element={<DistributePage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/claim" element={<ClaimPage />} />
          <Route path="/claim/:slug" element={<ClaimPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/faucet" element={<FaucetPage />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import { useEffect } from "react";
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { Footer } from "./components/Footer";
import { Nav } from "./components/Nav";
import { CampaignsPage } from "./pages/CampaignsPage";
import { ClaimPage } from "./pages/ClaimPage";
import { CreatePage } from "./pages/CreatePage";
import { DistributePage } from "./pages/DistributePage";
import { FaucetPage } from "./pages/FaucetPage";
import { HowItWorks } from "./pages/HowItWorks";
import { Landing } from "./pages/Landing";
import { PortfolioPage } from "./pages/PortfolioPage";

function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="text-5xl font-black tracking-tight text-muted">404</div>
      <h1 className="mt-3 text-xl font-black tracking-tight">This page doesn't exist</h1>
      <p className="mt-2 text-sm text-muted">
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
        <Outlet />
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

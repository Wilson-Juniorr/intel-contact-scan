import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LeadsProvider } from "@/contexts/LeadsContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { lazy, Suspense } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import AuthPage from "@/pages/AuthPage";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const FunnelPage = lazy(() => import("./pages/FunnelPage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const TodayPage = lazy(() => import("./pages/TodayPage"));
const FollowUpPage = lazy(() => import("./pages/FollowUpPage"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <LeadsProvider>
      <AppLayout>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/funnel" element={<FunnelPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/whatsapp" element={<WhatsAppPage />} />
            <Route path="/follow-up" element={<FollowUpPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </LeadsProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

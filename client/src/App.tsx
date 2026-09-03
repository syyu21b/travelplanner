import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import NotificationBell from "./components/NotificationBell";
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import TravelDiary from "./pages/TravelDiary";
import Community from "./pages/Community";
import AdminPage from "./pages/AdminPage";
import MyPage from "./pages/MyPage";
import Footer from "./components/Footer";
import PwaInstallBanner from "./components/PwaInstallBanner";
import OfflineIndicator from "./components/OfflineIndicator";
import { Plane, BookOpen, Globe, User, LogOut, Shield, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SharedNav() {
  const { user, logout, getProfilePhoto } = useAuth();
  const { t } = useLanguage();
  const [location, setLocation] = useLocation();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setProfilePhoto(null); return; }
    let cancelled = false;
    getProfilePhoto(user.id).then(photo => { if (!cancelled) setProfilePhoto(photo); });
    return () => { cancelled = true; };
  }, [user, getProfilePhoto]);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
            <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <span className="text-base sm:text-xl font-extrabold text-foreground tracking-tight whitespace-nowrap">Travel Planner</span>
        </button>

        <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto touch-pan-x overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <Link href="/">
            <button className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
              location === "/" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Plane className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.plan")}</span>
            </button>
          </Link>
          <Link href="/diary">
            <button className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
              location === "/diary" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.diary")}</span>
            </button>
          </Link>
          <Link href="/community">
            <button className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
              location === "/community" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">{t("nav.community")}</span>
            </button>
          </Link>
          {user?.isAdmin && (
            <Link href="/admin">
              <button className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
                location === "/admin" ? "bg-amber-500 text-white shadow-sm" : "text-amber-600 hover:bg-amber-50"
              )}>
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">{t("nav.admin")}</span>
              </button>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          {user ? (
            <>
              <NotificationBell />
              {/* 마이페이지 (프로필 아바타/이름 클릭) */}
              <Link href="/mypage">
                <button className={cn(
                  "hidden sm:flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-all",
                  location === "/mypage"
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "text-muted-foreground bg-secondary border-border hover:border-primary hover:text-primary"
                )}>
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    user?.isAdmin ? <Crown className="w-4 h-4 text-amber-500" /> : <User className="w-4 h-4" />
                  )}
                  <span className="font-semibold">{user?.name}</span>
                </button>
              </Link>
              {/* 모바일용 마이페이지 버튼 */}
              <Link href="/mypage">
                <button className={cn(
                  "sm:hidden flex items-center justify-center w-9 h-9 rounded-full border transition-all",
                  location === "/mypage" ? "bg-primary border-primary" : "bg-secondary border-border hover:border-primary"
                )}>
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className={cn("w-4 h-4", location === "/mypage" ? "text-white" : "text-muted-foreground")} />
                  )}
                </button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-slate-500 hover:text-red-500 gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </Button>
            </>
          ) : (
            <Link href="/login">
              <button className="flex items-center gap-1.5 text-sm px-3 sm:px-4 py-1.5 rounded-full bg-primary text-white font-bold shadow-sm hover:opacity-90 transition-all">
                <User className="w-4 h-4" />
                {t("nav.login")}
              </button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function RedirectToHome() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return null;
}

function ProtectedRouter() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9F7F2] flex items-center justify-center">
        <div className="text-[#A68B77] text-lg font-semibold">{t("nav.loading")}</div>
      </div>
    );
  }

  return (
    <>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/diary"}>
          <div className="min-h-screen bg-background">
            <SharedNav />
            <TravelDiary />
          </div>
        </Route>
        <Route path={"/community"}>
          <div className="min-h-screen bg-background">
            <SharedNav />
            <Community />
          </div>
        </Route>
        <Route path={"/mypage"}>
          {user ? (
            <div className="min-h-screen bg-background">
              <SharedNav />
              <MyPage />
            </div>
          ) : <AuthPage />}
        </Route>
        <Route path={"/admin"}>
          {!user ? <AuthPage /> : user.isAdmin ? <AdminPage /> : <NotFound />}
        </Route>
        <Route path={"/login"}>
          {user ? <RedirectToHome /> : <AuthPage />}
        </Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      {location !== "/admin" && location !== "/login" && <Footer />}
      <PwaInstallBanner />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light" switchable>
          <TooltipProvider>
            <Toaster />
            <AuthProvider>
              <NotificationProvider>
                <OfflineIndicator />
                <ProtectedRouter />
              </NotificationProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;

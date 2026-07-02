import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import TravelDiary from "./pages/TravelDiary";
import Community from "./pages/Community";
import AdminPage from "./pages/AdminPage";
import MyPage from "./pages/MyPage";
import Footer from "./components/Footer";
import { Plane, BookOpen, Globe, User, LogOut, Shield, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SharedNav() {
  const { user, logout, getProfilePhoto } = useAuth();
  const [location, setLocation] = useLocation();
  const profilePhoto = user ? getProfilePhoto(user.id) : null;

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-extrabold text-foreground tracking-tight hidden sm:block">Travel Planner</span>
        </button>

        <nav className="flex items-center gap-1">
          <Link href="/">
            <button className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all",
              location === "/" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Plane className="w-4 h-4" />
              <span className="hidden sm:inline">여행 계획</span>
            </button>
          </Link>
          <Link href="/diary">
            <button className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all",
              location === "/diary" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">여행 기록</span>
            </button>
          </Link>
          <Link href="/community">
            <button className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all",
              location === "/community" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">커뮤니티</span>
            </button>
          </Link>
          {user?.isAdmin && (
            <Link href="/admin">
              <button className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all",
                location === "/admin" ? "bg-amber-500 text-white shadow-sm" : "text-amber-600 hover:bg-amber-50"
              )}>
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">관리자</span>
              </button>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
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
            <span className="hidden sm:inline">로그아웃</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ProtectedRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9F7F2] flex items-center justify-center">
        <div className="text-[#A68B77] text-lg font-semibold">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
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
          <div className="min-h-screen bg-background">
            <SharedNav />
            <MyPage />
          </div>
        </Route>
        <Route path={"/admin"}>
          {user.isAdmin ? <AdminPage /> : <NotFound />}
        </Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      {location !== "/admin" && <Footer />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AuthProvider>
            <ProtectedRouter />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

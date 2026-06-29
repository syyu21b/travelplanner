import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plane, BookOpen, Globe, User, LogOut, Shield, UserX, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function WithdrawDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { withdrawAccount } = useAuth();
  const [confirm, setConfirm] = useState('');

  function handleWithdraw() {
    if (confirm !== '탈퇴') { toast.error('"탈퇴"를 입력해주세요.'); return; }
    const result = withdrawAccount();
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirm(''); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <UserX className="w-5 h-5" /> 회원 탈퇴
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
            <p className="font-semibold">정말로 탈퇴하시겠습니까?</p>
            <p className="text-xs text-red-500">탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              확인을 위해 <span className="text-red-500 font-bold">"탈퇴"</span>를 입력하세요
            </label>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="탈퇴"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setConfirm(''); onClose(); }} className="flex-1">
              취소
            </Button>
            <Button onClick={handleWithdraw} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
              <UserX className="w-4 h-4 mr-1" /> 탈퇴하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SharedNav() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [showWithdraw, setShowWithdraw] = useState(false);

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
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground bg-secondary px-3 py-1.5 rounded-full border border-border">
            {user?.isAdmin ? <Crown className="w-4 h-4 text-amber-500" /> : <User className="w-4 h-4" />}
            <span className="font-semibold">{user?.name}</span>
          </div>
          {!user?.isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowWithdraw(true)}
              className="text-slate-400 hover:text-red-400 gap-1.5 text-xs"
            >
              <UserX className="w-3.5 h-3.5" />
              <span className="hidden md:inline">회원 탈퇴</span>
            </Button>
          )}
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
      <WithdrawDialog open={showWithdraw} onClose={() => setShowWithdraw(false)} />
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
      <Route path={"/admin"}>
        {user.isAdmin ? <AdminPage /> : <NotFound />}
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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

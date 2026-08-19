import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, Phone, Zap, Crown, Star } from 'lucide-react';
import { toast } from 'sonner';
import { paymentsApi, type CreditPackage, type PackageId } from '@/lib/api/payments';
import { useAuth } from '@/contexts/AuthContext';

interface AiCreditsPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased: () => void;
}

const PACKAGE_THEME: Record<PackageId, {
  border: string; iconBg: string; iconText: string; accentText: string; badgeClass: string; icon: typeof Sparkles; badge?: string;
}> = {
  "1": {
    border: 'border-border hover:border-slate-300',
    iconBg: 'bg-slate-100', iconText: 'text-slate-600', accentText: 'text-slate-600', badgeClass: '', icon: Sparkles,
  },
  "5": {
    border: 'border-violet-200 hover:border-violet-300',
    iconBg: 'bg-violet-100', iconText: 'text-violet-600', accentText: 'text-violet-600',
    badgeClass: 'bg-violet-100 text-violet-700', icon: Zap, badge: '인기',
  },
  "10": {
    border: 'border-amber-200 hover:border-amber-300',
    iconBg: 'bg-amber-100', iconText: 'text-amber-600', accentText: 'text-amber-700',
    badgeClass: 'bg-amber-100 text-amber-700', icon: Crown, badge: '최고 혜택',
  },
};

export function AiCreditsPaywallModal({ open, onOpenChange, onPurchased }: AiCreditsPaywallModalProps) {
  const { user } = useAuth();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payingId, setPayingId] = useState<PackageId | null>(null);

  useEffect(() => {
    if (open) paymentsApi.getPackages().then((r) => setPackages(r.packages)).catch(() => setPackages([]));
  }, [open]);

  const basePkg = packages.find((p) => p.credits === 1);
  const basePerCredit = basePkg ? basePkg.amountKrw / basePkg.credits : 0;

  async function handleBuy(packageId: PackageId) {
    if (payingId) return;
    // KG이니시스 결제창은 구매자 휴대전화번호가 없으면 "결제 창 호출에 실패했습니다" 오류로
    // 열리지 않는 경우가 있어 필수로 받는다.
    if (!/^01[0-9]{8,9}$/.test(phoneNumber.replace(/-/g, ''))) {
      toast.error('휴대전화번호를 올바르게 입력해주세요. (- 없이 숫자만)');
      return;
    }
    setPayingId(packageId);
    // 결제창(IFRAME/팝업)이 이 모달(Dialog)의 오버레이 뒤/아래에 겹쳐서 클릭이 안 먹히는 문제가
    // 있어, PortOne을 호출하기 전에 우리 모달부터 먼저 닫는다 — 결제 UI가 화면을 온전히 차지함.
    onOpenChange(false);
    try {
      const req = await paymentsApi.requestPayment(packageId);
      const PortOne = await import('@portone/browser-sdk/v2');
      const response = await PortOne.requestPayment({
        storeId: req.storeId,
        channelKey: req.channelKey,
        paymentId: req.paymentId,
        orderName: req.orderName,
        totalAmount: req.totalAmount,
        currency: req.currency,
        payMethod: 'CARD',
        customer: {
          phoneNumber: phoneNumber.replace(/-/g, ''),
          email: user?.email,
          fullName: user?.nickname,
        },
      });

      if (!response) {
        toast.error('결제가 취소되었습니다.');
        return;
      }

      // 성공/실패(취소 포함) 관계없이 서버에 항상 확정 요청 — 실패 사유까지 저장돼야
      // 관리자 결제 내역에서 "결제 시도" 기록으로 정확히 남는다(그렇지 않으면 pending에 머무름).
      const result = await paymentsApi.completePayment(req.paymentId);
      if (response.code !== undefined) {
        toast.error(result.message || response.message || '결제가 취소되었습니다.');
        return;
      }
      if (result.success) {
        toast.success(result.message);
        onPurchased();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '결제 중 오류가 발생했습니다.');
    } finally {
      setPayingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!payingId) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI 일정 생성 크레딧 구매
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            첫 1회는 무료로 제공되며, 이후에는 크레딧을 구매해 AI로 여행 일정을 생성할 수 있습니다.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">휴대전화번호</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="01012345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={payingId !== null}
                className="pl-9 h-10"
              />
            </div>
          </div>
          {packages.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
            </div>
          ) : (
            packages.map((pkg) => {
              const theme = PACKAGE_THEME[pkg.id];
              const Icon = theme.icon;
              const perCredit = pkg.amountKrw / pkg.credits;
              const discountPct = basePerCredit > 0 ? Math.round((1 - perCredit / basePerCredit) * 100) : 0;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => handleBuy(pkg.id)}
                  disabled={payingId !== null}
                  className={`relative w-full flex items-center justify-between gap-3 p-4 rounded-2xl text-left bg-white border ${theme.border} shadow-sm hover:shadow-md transition-all disabled:opacity-50`}
                >
                  {theme.badge && (
                    <span className={`absolute -top-2 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${theme.badgeClass}`}>
                      <Star className="w-2.5 h-2.5 fill-current" /> {theme.badge}
                    </span>
                  )}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-full ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5.5 h-5.5 ${theme.iconText}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{pkg.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {pkg.credits}회 · 회당 {Math.round(perCredit).toLocaleString()}원
                        {discountPct > 0 && <span className={`ml-1 font-semibold ${theme.accentText}`}>({discountPct}% 할인)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-extrabold text-xl text-foreground">{pkg.amountKrw.toLocaleString()}원</span>
                    {payingId === pkg.id && <Loader2 className={`w-4 h-4 animate-spin ${theme.iconText}`} />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

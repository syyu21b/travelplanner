import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { paymentsApi, type CreditPackage, type PackageId } from '@/lib/api/payments';

interface AiCreditsPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchased: () => void;
}

export function AiCreditsPaywallModal({ open, onOpenChange, onPurchased }: AiCreditsPaywallModalProps) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [payingId, setPayingId] = useState<PackageId | null>(null);

  useEffect(() => {
    if (open) paymentsApi.getPackages().then((r) => setPackages(r.packages)).catch(() => setPackages([]));
  }, [open]);

  async function handleBuy(packageId: PackageId) {
    if (payingId) return;
    setPayingId(packageId);
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
      });

      if (!response || response.code !== undefined) {
        toast.error(response?.message || '결제가 취소되었습니다.');
        return;
      }

      const result = await paymentsApi.completePayment(req.paymentId);
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
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
          {packages.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
            </div>
          ) : (
            packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => handleBuy(pkg.id)}
                disabled={payingId !== null}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-secondary/50 transition-colors disabled:opacity-50 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{pkg.label}</p>
                    <p className="text-xs text-muted-foreground">{pkg.credits}회 사용 가능</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-bold text-lg text-foreground">{pkg.amountKrw.toLocaleString()}원</span>
                  {payingId === pkg.id && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

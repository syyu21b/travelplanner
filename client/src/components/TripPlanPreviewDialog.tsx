import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plane, Clock, Hotel, Backpack, MapPin, CheckCircle2, Circle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export interface TripPlanPreviewScheduleItem {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  title: string;
  category: 'accommodation' | 'transport' | 'meal' | 'activity' | 'other';
  location?: string;
  preparations?: string[];
}

export interface TripPlanPreviewAccommodation {
  id: string;
  name: string;
  address?: string;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
}

export interface TripPlanPreviewData {
  title: string;
  startDate: string;
  endDate: string;
  schedules: TripPlanPreviewScheduleItem[];
  budgets: { amount: number }[];
  accommodations: TripPlanPreviewAccommodation[];
  preparationChecks: Record<string, boolean>;
  /** 원본 계획이 삭제/변경되어 기록 작성 시점의 일정 스냅샷만 남아있는 경우 true — 이때는 예산/준비물 체크 상태를 알 수 없음 */
  isSnapshotOnly?: boolean;
}

interface TripPlanPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: TripPlanPreviewData | null;
  /** 닫기 버튼 옆에 함께 보여줄 추가 액션(예: 커뮤니티의 "내 계획에 추가" 버튼) — 기본적으로는 미리보기 전용이므로 생략 가능 */
  extraAction?: ReactNode;
}

function splitPreparationItems(preparations?: string[]): string[] {
  return (preparations || []).flatMap(p => p.split(',').map(x => x.trim()).filter(Boolean));
}

// 여행 기록/커뮤니티 어디서 열든 동일한 순서로 준비물이 나열되도록 일정을 날짜/시간순으로 정렬한 뒤 모음
function getUniquePreparationLabels(schedules: TripPlanPreviewScheduleItem[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  [...schedules]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach(s => {
      splitPreparationItems(s.preparations).forEach(label => {
        if (seen.has(label)) return;
        seen.add(label);
        labels.push(label);
      });
    });
  return labels;
}

// 여행 기록과 커뮤니티에서 연결된 여행 계획을 볼 때 항상 같은 화면(여행 기간/전체 일정/숙소/예산/준비물)이
// 보이도록 두 페이지가 공유하는 단일 컴포넌트 — 각 페이지는 자신의 TravelPlan 데이터를 이 형태로 변환해 넘기기만 하면 됨
export function TripPlanPreviewDialog({ open, onOpenChange, plan, extraAction }: TripPlanPreviewDialogProps) {
  const { t } = useLanguage();

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      accommodation: 'bg-secondary text-foreground',
      transport: 'bg-secondary text-foreground',
      meal: 'bg-emerald-100 text-emerald-800',
      activity: 'bg-indigo-100 text-indigo-800',
      shopping: 'bg-orange-100 text-orange-800',
      other: 'bg-muted text-foreground',
    };
    return colors[category] || colors.other;
  };
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      accommodation: t('diary.category.accommodation'), transport: t('diary.category.transport'), meal: t('diary.category.meal'),
      activity: t('diary.category.activity'), shopping: t('diary.category.shopping'), other: t('diary.category.other'),
    };
    return labels[category] || t('diary.category.other');
  };

  const prepLabels = plan ? getUniquePreparationLabels(plan.schedules) : [];
  const totalBudget = plan ? plan.budgets.reduce((s, b) => s + b.amount, 0) : 0;
  const checkedPrepCount = plan ? prepLabels.filter(l => plan.preparationChecks[l]).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Plane className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="break-words">{plan?.title} {t('diary.planPreview.previewSuffix')}</span>
          </DialogTitle>
        </DialogHeader>

        {plan && (
          <div className="space-y-4 pt-2">
            {plan.isSnapshotOnly && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-xs">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{t('diary.planPreview.snapshotNotice')}</p>
              </div>
            )}

            {/* 기본 정보 */}
            <div className="p-4 bg-secondary rounded-xl border border-border">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('diary.planPreview.duration')}</p>
                  <p className="font-bold text-foreground break-words">{plan.startDate} ~ {plan.endDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('diary.planPreview.scheduleCount')}</p>
                  <p className="font-bold text-foreground">{t('diary.planPreview.countSuffix', { count: plan.schedules.length })}</p>
                </div>
                {!plan.isSnapshotOnly && (
                  <>
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('diary.planPreview.totalBudget')}</p>
                      <p className="font-bold text-primary text-lg break-words">₩{totalBudget.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('diary.planPreview.packingList')}</p>
                      <p className="font-bold text-foreground">{t('diary.planPreview.completedFraction', { checked: checkedPrepCount, total: prepLabels.length })}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 숙소 */}
            {plan.accommodations.length > 0 && (
              <div>
                <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                  <Hotel className="w-4 h-4 text-primary flex-shrink-0" />
                  {t('diary.planPreview.accommodations', { count: plan.accommodations.length })}
                </h4>
                <div className="space-y-2">
                  {plan.accommodations.map(a => (
                    <div key={a.id} className="p-3 bg-secondary rounded-lg text-sm">
                      <p className="font-semibold text-foreground break-words">{a.name}</p>
                      {a.address && (
                        <p className="text-muted-foreground text-xs flex items-start gap-1 mt-1">
                          <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span className="break-words">{a.address}</span>
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs mt-1">
                        {a.checkInDate}{a.checkInTime ? ` ${a.checkInTime}` : ''} ~ {a.checkOutDate}{a.checkOutTime ? ` ${a.checkOutTime}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 준비물 */}
            {prepLabels.length > 0 && (
              <div>
                <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                  <Backpack className="w-4 h-4 text-primary flex-shrink-0" />
                  {t('diary.planPreview.packingListSection', { count: prepLabels.length })}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {prepLabels.map(label => {
                    const checked = !!plan.preparationChecks[label];
                    return (
                      <span
                        key={label}
                        className={cn(
                          "max-w-full px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1",
                          checked ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border"
                        )}
                      >
                        {checked ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <Circle className="w-3 h-3 flex-shrink-0" />}
                        <span className="break-words">{label}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 전체 일정 */}
            <div>
              <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                {t('diary.planPreview.allSchedules', { count: plan.schedules.length })}
              </h4>
              {plan.schedules.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {plan.schedules
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                    .map(s => (
                      <div key={s.id} className="flex flex-col gap-1 p-2.5 bg-secondary rounded-lg text-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-muted-foreground font-mono text-xs">{s.date}</span>
                          <span className="text-sky-500 font-mono text-xs">{s.time}{s.endTime ? `~${s.endTime}` : ''}</span>
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold", getCategoryColor(s.category))}>
                            {getCategoryLabel(s.category)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground break-words block">{s.title}</span>
                          {s.location && (
                            <span className="text-muted-foreground text-xs flex items-start gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              <span className="break-words">{s.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('diary.planPreview.noSchedule')}</p>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              {extraAction}
              <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1">
                {t('diary.common.close')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

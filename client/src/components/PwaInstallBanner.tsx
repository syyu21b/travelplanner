import { useEffect, useRef, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const DISMISS_KEY = 'pwaInstallBannerDismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// 카카오톡/인스타그램/페이스북/라인/네이버 등 인앱 브라우저는 자체 웹뷰라서
// PWA 설치(beforeinstallprompt, 홈 화면에 추가)를 지원하지 않음 — 사용자에게
// "다른 브라우저로 열기"로 유도하는 것 외에는 코드로 우회할 방법이 없음
function detectInAppBrowser(ua: string): boolean {
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps/i.test(ua);
}

function isIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function PwaInstallBanner() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStandalone(isStandalone());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch { /* 무시 — 다음 방문 때 배너가 다시 보일 수 있음 */ }
  };

  const ua = navigator.userAgent;
  const inApp = detectInAppBrowser(ua);
  const ios = isIOS(ua);
  const visible = !standalone && !dismissed && (inApp || !!installEvent || ios);

  // 이 배너는 fixed로 화면 하단에 떠 있어서 실제 페이지 콘텐츠(예: 메인 화면 캘린더 하단부) 위에
  // 그대로 겹쳐 가려버림 — 배너가 보이는 동안에는 body에 배너 높이만큼 여백을 줘서 페이지
  // 콘텐츠가 배너 뒤로 가려지지 않고 그 위로 밀려나도록 한다.
  useEffect(() => {
    if (!visible) {
      document.body.style.paddingBottom = '';
      return;
    }
    const el = wrapperRef.current;
    if (!el) return;
    const applyPadding = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
    };
    applyPadding();
    const observer = new ResizeObserver(applyPadding);
    observer.observe(el);
    window.addEventListener('resize', applyPadding);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyPadding);
      document.body.style.paddingBottom = '';
    };
  }, [visible]);

  if (!visible) return null;

  const handleInstallClick = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
      setInstallEvent(null);
      dismiss();
    }
  };

  const title = inApp ? t('pwa.inAppTitle') : ios ? t('pwa.iosTitle') : t('pwa.installTitle');
  const body = inApp ? t('pwa.inAppBody') : ios ? t('pwa.iosBody') : t('pwa.installBody');

  return (
    <div ref={wrapperRef} className="fixed bottom-0 inset-x-0 z-[60] px-4 pb-4 sm:pb-6 pointer-events-none">
      <div className="pointer-events-auto max-w-md mx-auto bg-white border border-border rounded-2xl shadow-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          {ios || inApp ? <Share className="w-5 h-5" /> : <Download className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
          {!inApp && !ios && installEvent && (
            <button
              onClick={handleInstallClick}
              className="mt-2 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
            >
              {t('pwa.installButton')}
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t('pwa.dismiss')}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Plane, Mail, Phone, MapPin, Instagram, Facebook, Youtube, MessageCircle, Megaphone, FileText, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { addInquiry } from '@/lib/inquiries';

const NOTICE_KEYS = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;
const TERMS_SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'] as const;
const PRIVACY_SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'] as const;

export default function Footer() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [showInquiry, setShowInquiry] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const openInquiry = () => {
    setName(user?.nickname || '');
    setEmail(user?.email || '');
    setTitle('');
    setContent('');
    setShowInquiry(true);
  };

  const handleSubmitInquiry = async () => {
    if (!name.trim() || !email.trim() || !title.trim() || !content.trim()) {
      toast.error(t('footer.inquiryDialog.errorRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error(t('footer.inquiryDialog.errorInvalidEmail'));
      return;
    }
    const inquiryId = await addInquiry({
      userId: user?.id || null,
      name: name.trim(),
      email: email.trim(),
      title: title.trim(),
      content: content.trim(),
    });
    if (!inquiryId) {
      toast.error(t('footer.inquiryDialog.errorStorageFull'));
      return;
    }
    toast.success(t('footer.inquiryDialog.success'));
    setShowInquiry(false);
  };

  return (
    <footer className="bg-[#3D3530] text-[#D8CFC4] mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[#A68B77] rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-extrabold text-white">Travel Planner</span>
          </div>
          <p className="text-sm leading-relaxed text-[#B8A89A] whitespace-pre-line">
            {t('footer.tagline')}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="#" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Youtube className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3">{t('footer.quickLinks.title')}</h3>
          <ul className="space-y-2 text-sm text-[#B8A89A]">
            <li><a href="/" className="hover:text-white transition-colors">{t('footer.quickLinks.plan')}</a></li>
            <li><a href="/diary" className="hover:text-white transition-colors">{t('footer.quickLinks.diary')}</a></li>
            <li><a href="/community" className="hover:text-white transition-colors">{t('footer.quickLinks.community')}</a></li>
            <li><a href="/mypage" className="hover:text-white transition-colors">{t('footer.quickLinks.mypage')}</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3">{t('footer.support.title')}</h3>
          <ul className="space-y-2 text-sm text-[#B8A89A]">
            <li>
              <button type="button" onClick={() => setShowNotice(true)} className="hover:text-white transition-colors text-left">
                {t('footer.support.notice')}
              </button>
            </li>
            <li><a href="#" className="hover:text-white transition-colors">{t('footer.support.faq')}</a></li>
            <li>
              <button type="button" onClick={openInquiry} className="hover:text-white transition-colors text-left">
                {t('footer.support.inquiry')}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setShowTerms(true)} className="hover:text-white transition-colors text-left">
                {t('footer.support.terms')}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setShowPrivacy(true)} className="hover:text-white transition-colors text-left">
                {t('footer.support.privacy')}
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3">{t('footer.company.title')}</h3>
          <ul className="space-y-1.5 text-xs text-[#B8A89A] leading-relaxed">
            <li>{t('footer.company.name')}</li>
            <li>{t('footer.company.bizNumber')}</li>
            <li className="flex items-center gap-1.5"><MapPin className="w-3 h-3 flex-shrink-0" /> {t('footer.company.address')}</li>
            <li className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" /> syyu21b@gmail.com</li>
            <li className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" /> {t('footer.company.phone')}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8A7C6E] text-center">
          <p>{t('footer.bottom.copyright')}</p>
          <p>{t('footer.bottom.disclaimer')}</p>
        </div>
      </div>

      <Dialog open={showInquiry} onOpenChange={setShowInquiry}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <MessageCircle className="w-5 h-5 text-primary" /> {t('footer.inquiryDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('footer.inquiryDialog.nameLabel')} <span className="text-red-500">*</span></label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('footer.inquiryDialog.namePlaceholder')} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('footer.inquiryDialog.emailLabel')} <span className="text-red-500">*</span></label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('footer.inquiryDialog.emailPlaceholder')} className="h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('footer.inquiryDialog.subjectLabel')} <span className="text-red-500">*</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('footer.inquiryDialog.subjectPlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('footer.inquiryDialog.contentLabel')} <span className="text-red-500">*</span></label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={t('footer.inquiryDialog.contentPlaceholder')}
                className="min-h-[140px] resize-y"
              />
            </div>
            <Button onClick={handleSubmitInquiry} className="w-full bg-primary text-white h-11 text-base font-semibold">
              {t('footer.inquiryDialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 공지사항 다이얼로그 */}
      <Dialog open={showNotice} onOpenChange={setShowNotice}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Megaphone className="w-5 h-5 text-primary" /> {t('footer.notice.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4">
            {NOTICE_KEYS.map((key) => (
              <div key={key} className="pb-4 border-b border-border last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {t(`footer.notice.items.${key}.date`)}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground mb-1">{t(`footer.notice.items.${key}.title`)}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`footer.notice.items.${key}.content`)}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 이용약관 다이얼로그 */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <FileText className="w-5 h-5 text-primary" /> {t('footer.terms.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p className="text-xs bg-secondary rounded-lg p-3">
              {t('footer.terms.disclaimer')}
            </p>
            {TERMS_SECTION_KEYS.map((key) => (
              <section key={key}>
                <p className="font-bold text-foreground mb-1">{t(`footer.terms.${key}Title`)}</p>
                <p className="whitespace-pre-line">{t(`footer.terms.${key}Body`)}</p>
              </section>
            ))}
            <p className="text-xs">{t('footer.terms.effectiveDate')}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 개인정보처리방침 다이얼로그 */}
      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-primary" /> {t('footer.privacy.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p className="text-xs bg-secondary rounded-lg p-3">
              {t('footer.privacy.disclaimer')}
            </p>
            {PRIVACY_SECTION_KEYS.map((key) => (
              <section key={key}>
                <p className="font-bold text-foreground mb-1">{t(`footer.privacy.${key}Title`)}</p>
                <p className="whitespace-pre-line">{t(`footer.privacy.${key}Body`)}</p>
              </section>
            ))}
            <p className="text-xs">{t('footer.privacy.effectiveDate')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

import { useState } from 'react';
import { Plane, Mail, Phone, MapPin, Instagram, Facebook, Youtube, MessageCircle, Megaphone, FileText, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { addInquiry } from '@/lib/inquiries';

const NOTICES = [
  {
    date: '2026-07-15',
    title: 'PDF/텍스트 내보내기에 숙소·항공권·준비물·타임라인 추가',
    content: '여행 계획을 PDF나 텍스트 파일(.txt)로 저장할 때 일정뿐 아니라 숙소정보, 항공권, 예산, 쇼핑, 준비물 체크리스트, 타임라인까지 모두 포함되도록 개선했습니다.',
  },
  {
    date: '2026-07-14',
    title: '준비물 체크리스트 중복 제거',
    content: '국내/해외 여행 준비물 중 같은 이름의 항목은 여러 일정에 걸쳐 있어도 하나로 합쳐 한 번만 체크하면 되도록 개선했습니다.',
  },
  {
    date: '2026-07-14',
    title: '문의 접수 시 관리자 알림 발송',
    content: '문의하기를 통해 접수된 새 문의는 담당 관리자에게 즉시 알림으로 전달되어 더 빠르게 답변드릴 수 있습니다.',
  },
  {
    date: '2026-07-14',
    title: '해외 여행 준비물 체크리스트 및 앨범 지도 오픈',
    content: '해외 여행 계획에는 OpenStreetMap 기반 지도가 적용되며, 여행 기록 앨범에서도 사진이 촬영된 여행지 지도를 바로 확인할 수 있습니다.',
  },
  {
    date: '2026-06-01',
    title: '여권 정보 안전 보관 기능 출시',
    content: '마이페이지에서 비밀번호로 암호화된 여권 정보를 등록해두고, 필요할 때 비밀번호를 입력해 잠금 해제 후 확인할 수 있습니다.',
  },
];

export default function Footer() {
  const { user, getAllUsers } = useAuth();
  const { notify } = useNotifications();
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

  const handleSubmitInquiry = () => {
    if (!name.trim() || !email.trim() || !title.trim() || !content.trim()) {
      toast.error('모든 항목을 입력해주세요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('올바른 이메일을 입력해주세요.');
      return;
    }
    const inquiryId = addInquiry({
      userId: user?.id || null,
      name: name.trim(),
      email: email.trim(),
      title: title.trim(),
      content: content.trim(),
    });
    if (!inquiryId) {
      toast.error('이 브라우저에서는 문의를 저장할 수 없습니다. 다른 브라우저나 시크릿 모드 해제 후 다시 시도해주세요.');
      return;
    }
    getAllUsers().filter(u => u.isAdmin).forEach(admin => {
      notify({ recipientId: admin.id, type: 'inquiry-new', actorName: name.trim(), inquiryId, inquiryTitle: title.trim() });
    });
    toast.success('문의가 접수되었습니다. 답변까지 조금만 기다려주세요!');
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
          <p className="text-sm leading-relaxed text-[#B8A89A]">
            떠나고 싶은 순간, 계획하고 기록하고 나누는<br />모두의 여행 플랫폼입니다.
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
          <h3 className="text-white font-bold text-sm mb-3">바로가기</h3>
          <ul className="space-y-2 text-sm text-[#B8A89A]">
            <li><a href="/" className="hover:text-white transition-colors">여행 계획</a></li>
            <li><a href="/diary" className="hover:text-white transition-colors">여행 기록</a></li>
            <li><a href="/community" className="hover:text-white transition-colors">커뮤니티</a></li>
            <li><a href="/mypage" className="hover:text-white transition-colors">마이페이지</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3">고객지원</h3>
          <ul className="space-y-2 text-sm text-[#B8A89A]">
            <li>
              <button type="button" onClick={() => setShowNotice(true)} className="hover:text-white transition-colors text-left">
                공지사항
              </button>
            </li>
            <li><a href="#" className="hover:text-white transition-colors">자주 묻는 질문</a></li>
            <li>
              <button type="button" onClick={openInquiry} className="hover:text-white transition-colors text-left">
                문의하기
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setShowTerms(true)} className="hover:text-white transition-colors text-left">
                이용약관
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setShowPrivacy(true)} className="hover:text-white transition-colors text-left">
                개인정보처리방침
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3">회사 정보</h3>
          <ul className="space-y-1.5 text-xs text-[#B8A89A] leading-relaxed">
            <li>(주)트래블플래너 · 대표 유신영</li>
            <li>사업자등록번호 123-45-67890</li>
            <li className="flex items-center gap-1.5"><MapPin className="w-3 h-3 flex-shrink-0" /> 대전광역시 서구 대덕대로 179</li>
            <li className="flex items-center gap-1.5"><Mail className="w-3 h-3 flex-shrink-0" /> syyu21b@gmail.com</li>
            <li className="flex items-center gap-1.5"><Phone className="w-3 h-3 flex-shrink-0" /> 1588-0000 (평일 09:00~18:00)</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8A7C6E] text-center">
          <p>© 2026 Travel Planner. All rights reserved.</p>
          <p>본 사이트는 학습 및 포트폴리오 목적의 데모 서비스이며, 상단 회사 정보는 예시용 더미 텍스트입니다.</p>
        </div>
      </div>

      <Dialog open={showInquiry} onOpenChange={setShowInquiry}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <MessageCircle className="w-5 h-5 text-primary" /> 문의하기
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">이름 <span className="text-red-500">*</span></label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="이름 또는 닉네임" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">이메일 <span className="text-red-500">*</span></label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="답변받을 이메일" className="h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">제목 <span className="text-red-500">*</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="문의 제목" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">내용 <span className="text-red-500">*</span></label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="문의하실 내용을 자세히 적어주세요."
                className="min-h-[140px] resize-y"
              />
            </div>
            <Button onClick={handleSubmitInquiry} className="w-full bg-primary text-white h-11 text-base font-semibold">
              문의 접수하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 공지사항 다이얼로그 */}
      <Dialog open={showNotice} onOpenChange={setShowNotice}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Megaphone className="w-5 h-5 text-primary" /> 공지사항
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4">
            {NOTICES.map((n, idx) => (
              <div key={idx} className="pb-4 border-b border-border last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{n.date}</span>
                </div>
                <p className="text-sm font-bold text-foreground mb-1">{n.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{n.content}</p>
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
              <FileText className="w-5 h-5 text-primary" /> 이용약관
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p className="text-xs bg-secondary rounded-lg p-3">
              본 약관은 학습 및 포트폴리오 목적으로 제작된 데모 서비스에 적용되는 예시 약관이며, 실제 법적 효력을 갖는 계약서가 아닙니다.
            </p>
            <section>
              <p className="font-bold text-foreground mb-1">제1조 (목적)</p>
              <p>이 약관은 Travel Planner(이하 "회사")가 제공하는 여행 계획, 여행 기록, 커뮤니티 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 회원 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제2조 (정의)</p>
              <p>① "서비스"란 회원이 여행 일정, 숙소, 항공권, 예산, 쇼핑 목록, 준비물 체크리스트 등을 관리하고, 여행 기록을 작성·공유하며, 커뮤니티에 게시물을 등록할 수 있도록 회사가 제공하는 일체의 서비스를 말합니다.</p>
              <p>② "회원"이란 이 약관에 동의하고 회사와 이용계약을 체결한 자를 말합니다.</p>
              <p>③ "게시물"이란 회원이 서비스 이용 과정에서 등록한 여행 기록, 사진, 댓글 등 일체의 정보를 말합니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제3조 (약관의 효력 및 변경)</p>
              <p>회사는 관련 법령을 위반하지 않는 범위에서 이 약관을 개정할 수 있으며, 개정 시 서비스 내 공지사항을 통해 사전 안내합니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제4조 (회원가입 및 계정 관리)</p>
              <p>회원은 아이디, 닉네임, 이메일, 비밀번호를 정확히 입력하여 가입하며, 계정 정보의 관리 책임은 회원 본인에게 있습니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제5조 (서비스의 내용)</p>
              <p>회사는 다음과 같은 서비스를 제공합니다.</p>
              <p>1. 여행 일정·숙소·항공권·예산·쇼핑·준비물 체크리스트 등 여행 계획 관리</p>
              <p>2. 여행 기록(다이어리) 작성 및 PDF/텍스트 파일 내보내기</p>
              <p>3. 커뮤니티 게시글·댓글·좋아요·공유 기능</p>
              <p>4. 여행 일정 관련 알림 및 문의 접수·답변</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제6조 (정보의 정확성 및 책임 제한)</p>
              <p>회원이 입력한 항공권·숙소 예약 정보 등은 회원 본인이 직접 기록하는 참고용 정보이며, 실제 예약·발권 내역과 다를 수 있습니다. 최종 일정 확인은 항공사, 숙박업체 등 원 예약처를 통해 반드시 재확인하시기 바랍니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제7조 (게시물의 관리)</p>
              <p>회원이 등록한 게시물의 저작권은 회원 본인에게 있습니다. 다만 타인의 권리를 침해하거나 서비스 운영정책에 반하는 게시물은 회사가 사전 통지 없이 삭제하거나 노출을 제한할 수 있습니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제8조 (개인정보 보호)</p>
              <p>회사는 관련 법령이 정하는 바에 따라 회원의 개인정보를 보호하며, 자세한 내용은 개인정보처리방침을 따릅니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제9조 (면책조항)</p>
              <p>본 서비스는 실제 예약·결제를 중개하지 않으며, 지도·날씨 등 외부 정보의 정확성을 보증하지 않습니다. 천재지변, 회원의 귀책사유 등 회사가 통제할 수 없는 사유로 발생한 손해에 대해서는 책임을 지지 않습니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">제10조 (준거법 및 관할)</p>
              <p>이 약관과 관련된 분쟁에는 대한민국 법령을 적용하며, 관할법원은 민사소송법에 따릅니다.</p>
            </section>
            <p className="text-xs">시행일: 2026년 1월 1일</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 개인정보처리방침 다이얼로그 */}
      <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-primary" /> 개인정보처리방침
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p className="text-xs bg-secondary rounded-lg p-3">
              본 방침은 학습 및 포트폴리오 목적으로 제작된 데모 서비스에 적용되는 예시 개인정보처리방침입니다.
            </p>
            <section>
              <p className="font-bold text-foreground mb-1">1. 수집하는 개인정보 항목</p>
              <p>· 필수 항목: 아이디, 닉네임, 이메일 주소, 비밀번호(암호화 저장)</p>
              <p>· 선택 항목: 프로필 사진, 여권 정보(성명·여권번호·발급일·만료일 등 — 비밀번호 기반으로 암호화된 상태로 저장되며 조회 시에만 일시적으로 복호화됩니다)</p>
              <p>· 서비스 이용 과정에서 생성되는 정보: 여행 계획(일정·숙소·항공권·예산·쇼핑·준비물), 여행 기록(사진·글·댓글), 문의 내역</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">2. 개인정보의 수집 및 이용 목적</p>
              <p>회원 식별 및 서비스 제공, 여행 계획·기록 관리, 커뮤니티 기능 제공, 문의 응대 및 알림 발송을 위해 개인정보를 이용합니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">3. 개인정보의 저장 위치 및 보유 기간</p>
              <p>본 서비스는 별도의 서버 데이터베이스 없이 이용자의 브라우저 저장소(localStorage)에 데이터를 저장합니다. 회원 탈퇴 또는 브라우저 저장소 삭제 시 관련 데이터는 즉시 삭제됩니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">4. 개인정보의 제3자 제공 및 처리 위탁</p>
              <p>회사는 이용자의 개인정보를 외부에 제공하거나 제3자에게 처리를 위탁하지 않습니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">5. 이용자의 권리와 행사 방법</p>
              <p>이용자는 마이페이지에서 언제든지 본인의 개인정보를 열람·수정할 수 있으며, 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">6. 개인정보의 파기</p>
              <p>회원 탈퇴 시 브라우저에 저장된 회원의 개인정보 및 여행 계획·기록 데이터는 지체 없이 파기됩니다.</p>
            </section>
            <section>
              <p className="font-bold text-foreground mb-1">7. 개인정보 보호책임자</p>
              <p>성명: 유신영 · 이메일: syyu21b@gmail.com</p>
            </section>
            <p className="text-xs">시행일: 2026년 1월 1일</p>
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
}

import { Plane, Mail, Phone, MapPin, Instagram, Facebook, Youtube } from 'lucide-react';

export default function Footer() {
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
            <li><a href="#" className="hover:text-white transition-colors">공지사항</a></li>
            <li><a href="#" className="hover:text-white transition-colors">자주 묻는 질문</a></li>
            <li><a href="#" className="hover:text-white transition-colors">1:1 문의하기</a></li>
            <li><a href="#" className="hover:text-white transition-colors">이용약관</a></li>
            <li><a href="#" className="hover:text-white transition-colors">개인정보처리방침</a></li>
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
    </footer>
  );
}

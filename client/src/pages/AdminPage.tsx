import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth, type PublicUser } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Users, Search, Edit2, Trash2, Shield, ChevronLeft, ChevronRight, Crown,
  Eye, EyeOff, X, CheckCircle, MessageCircle, Mail, Receipt, DollarSign, Wallet, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { NaverMapsUsagePanel } from '@/components/NaverMapsUsagePanel';
import { GeminiUsagePanel } from '@/components/GeminiUsagePanel';
import { R2UsagePanel } from '@/components/R2UsagePanel';
import NotificationBell from '@/components/NotificationBell';
import { getInquiries, answerInquiry, type Inquiry } from '@/lib/inquiries';
import { paymentsApi, type AdminPaymentRecord } from '@/lib/api/payments';

const PACKAGE_LABEL: Record<string, string> = { '1': '1회권', '5': '5회권', '10': '10회권' };
const PAYMENT_STATUS_LABEL: Record<AdminPaymentRecord['status'], { label: string; className: string }> = {
  paid: { label: '결제완료', className: 'bg-emerald-100 text-emerald-700' },
  pending: { label: '대기중', className: 'bg-amber-100 text-amber-700' },
  failed: { label: '실패', className: 'bg-red-100 text-red-600' },
};

const ITEMS_PER_PAGE = 10;

export default function AdminPage() {
  const { user, getAllUsers, adminUpdateUser, adminDeleteUser } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [inquiryPage, setInquiryPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  // 수정 모달
  const [editTarget, setEditTarget] = useState<PublicUser | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPw, setShowEditPw] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);

  // 회원별 결제 내역 모달
  const [paymentUserTarget, setPaymentUserTarget] = useState<PublicUser | null>(null);

  // 문의 내역
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiryTarget, setInquiryTarget] = useState<Inquiry | null>(null);
  const [answerText, setAnswerText] = useState('');
  const refreshInquiries = useCallback(() => {
    getInquiries().then(setInquiries);
  }, []);

  const [allUsers, setAllUsers] = useState<PublicUser[]>([]);
  const refreshUsers = useCallback(() => {
    getAllUsers().then(setAllUsers);
  }, [getAllUsers]);

  // 결제 내역 / 정산
  const [allPayments, setAllPayments] = useState<AdminPaymentRecord[]>([]);
  const refreshPayments = useCallback(() => {
    paymentsApi.getAllPayments().then(r => setAllPayments(r.payments)).catch(() => setAllPayments([]));
  }, []);

  useEffect(() => {
    if (user?.isAdmin) { refreshUsers(); refreshInquiries(); refreshPayments(); }
  }, [user?.isAdmin, refreshUsers, refreshInquiries, refreshPayments]);

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500 font-bold">접근 권한이 없습니다.</p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(u =>
      u.nickname.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [search, allUsers]);

  const totalUsers = allUsers.length;
  const regularUsers = allUsers.filter(u => !u.isAdmin).length;

  const totalUserPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const userPageSafe = Math.min(userPage, totalUserPages);
  const pagedUsers = filtered.slice((userPageSafe - 1) * ITEMS_PER_PAGE, userPageSafe * ITEMS_PER_PAGE);

  const totalInquiryPages = Math.max(1, Math.ceil(inquiries.length / ITEMS_PER_PAGE));
  const inquiryPageSafe = Math.min(inquiryPage, totalInquiryPages);
  const pagedInquiries = inquiries.slice((inquiryPageSafe - 1) * ITEMS_PER_PAGE, inquiryPageSafe * ITEMS_PER_PAGE);

  const paidPayments = useMemo(() => allPayments.filter(p => p.status === 'paid'), [allPayments]);
  const totalRevenue = useMemo(() => paidPayments.reduce((sum, p) => sum + p.amountKrw, 0), [paidPayments]);
  const thisMonthRevenue = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return paidPayments.filter(p => (p.paidAt || p.createdAt).slice(0, 7) === ym).reduce((sum, p) => sum + p.amountKrw, 0);
  }, [paidPayments]);

  const totalPaymentPages = Math.max(1, Math.ceil(allPayments.length / ITEMS_PER_PAGE));
  const paymentPageSafe = Math.min(paymentPage, totalPaymentPages);
  const pagedPayments = allPayments.slice((paymentPageSafe - 1) * ITEMS_PER_PAGE, paymentPageSafe * ITEMS_PER_PAGE);

  const paymentUserHistory = useMemo(
    () => (paymentUserTarget ? allPayments.filter(p => p.userId === paymentUserTarget.id) : []),
    [allPayments, paymentUserTarget],
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    setUserPage(1);
  }

  function openEdit(u: PublicUser) {
    setEditTarget(u);
    setEditNickname(u.nickname);
    setEditEmail(u.email);
    setEditPassword('');
    setShowEditPw(false);
  }

  async function handleEditSave() {
    if (!editTarget) return;
    if (!editNickname.trim()) { toast.error('닉네임을 입력해주세요.'); return; }
    if (!editEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      toast.error('올바른 이메일을 입력해주세요.'); return;
    }
    const updates: { nickname?: string; email?: string; password?: string } = {};
    if (editNickname !== editTarget.nickname) updates.nickname = editNickname;
    if (editEmail !== editTarget.email) updates.email = editEmail;
    if (editPassword) {
      if (editPassword.length < 4) { toast.error('비밀번호는 4자 이상이어야 합니다.'); return; }
      updates.password = editPassword;
    }
    if (Object.keys(updates).length === 0) { toast('변경된 내용이 없습니다.'); return; }

    const result = await adminUpdateUser(editTarget.id, updates);
    if (result.success) {
      toast.success(result.message);
      setEditTarget(null);
      refreshUsers();
    } else {
      toast.error(result.message);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await adminDeleteUser(deleteTarget.id);
    if (result.success) {
      toast.success(result.message);
      setDeleteTarget(null);
      refreshUsers();
    } else {
      toast.error(result.message);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function formatKrw(amount: number) {
    return `${amount.toLocaleString()}원`;
  }

  const pendingInquiries = inquiries.filter(i => i.status === 'pending').length;

  function openInquiry(inquiry: Inquiry) {
    setInquiryTarget(inquiry);
    setAnswerText(inquiry.answer || '');
  }

  async function handleSendAnswer() {
    if (!inquiryTarget) return;
    if (!answerText.trim()) { toast.error('답변 내용을 입력해주세요.'); return; }
    const success = await answerInquiry(inquiryTarget.id, answerText.trim());
    if (!success) {
      toast.error('답변을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    refreshInquiries();
    toast.success('답변이 등록되었습니다.');
    setInquiryTarget(null);
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2]">
      {/* 헤더 */}
      <header className="bg-white border-b border-[#DED6CC] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center gap-1 text-[#A68B77] hover:text-[#7D6B5D] transition-colors text-sm font-semibold"
            >
              <ChevronLeft className="w-4 h-4" /> 홈으로
            </button>
            <span className="text-[#DED6CC]">|</span>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#A68B77]" />
              <h1 className="text-lg font-bold text-[#7D6B5D]">관리자 패널</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2 text-sm text-[#A68B77] bg-[#F9F7F2] px-3 py-1.5 rounded-full border border-[#DED6CC]">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="font-semibold">{user.nickname}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8E2D9] rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-[#A68B77]" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">전체 회원</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{totalUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8E2D9] rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">일반 회원</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{regularUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">관리자</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{totalUsers - regularUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">답변 대기 문의</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{pendingInquiries}</p>
              </div>
            </div>
          </Card>
        </div>

        <NaverMapsUsagePanel />

        <GeminiUsagePanel />

        <R2UsagePanel />

        {/* 결제 내역 / 정산 */}
        <Card className="bg-white border-[#DED6CC] mb-8">
          <div className="p-5 border-b border-[#E8E2D9]">
            <h2 className="text-base font-bold text-[#7D6B5D] flex items-center gap-2 mb-4">
              <Receipt className="w-4 h-4 text-[#A68B77]" /> 결제 내역 / 정산
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3.5 border border-emerald-100">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Wallet className="w-4.5 h-4.5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-emerald-700 font-medium">누적 매출</p>
                  <p className="text-lg font-bold text-emerald-800 truncate">{formatKrw(totalRevenue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3.5 border border-blue-100">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                  <TrendingUp className="w-4.5 h-4.5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-blue-700 font-medium">이번 달 매출</p>
                  <p className="text-lg font-bold text-blue-800 truncate">{formatKrw(thisMonthRevenue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-[#F9F7F2] rounded-xl p-3.5 border border-[#E8E2D9]">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                  <DollarSign className="w-4.5 h-4.5 text-[#A68B77]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#A68B77] font-medium">결제 완료 건수</p>
                  <p className="text-lg font-bold text-[#7D6B5D]">{paidPayments.length}건</p>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F7F2] border-b border-[#E8E2D9]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">회원</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden md:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">상품</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">금액</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">상태</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden lg:table-cell">결제일</th>
                </tr>
              </thead>
              <tbody>
                {allPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[#A68B77]">
                      결제 내역이 없습니다.
                    </td>
                  </tr>
                ) : pagedPayments.map((p, i) => (
                  <tr key={p.id} className={`border-b border-[#F9F7F2] hover:bg-[#FDFCFA] transition-colors ${i % 2 === 0 ? '' : 'bg-[#FDFCFA]'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#7D6B5D]">{p.nickname}</p>
                      <p className="text-[#A68B77] text-xs font-mono">{p.username}</p>
                    </td>
                    <td className="px-4 py-3 text-[#A68B77] hidden md:table-cell text-xs">{p.email}</td>
                    <td className="px-4 py-3 text-[#7D6B5D] text-xs">{PACKAGE_LABEL[p.packageId] ?? p.packageId} ({p.credits}회)</td>
                    <td className="px-4 py-3 text-[#7D6B5D] font-semibold text-xs">{formatKrw(p.amountKrw)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${PAYMENT_STATUS_LABEL[p.status].className}`}>
                        {PAYMENT_STATUS_LABEL[p.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#A68B77] hidden lg:table-cell text-xs">{formatDate(p.paidAt || p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allPayments.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E8E2D9] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-[#A68B77]">총 {allPayments.length}건</span>
              {totalPaymentPages > 1 && (
                <div className="flex items-center flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentPage(p => Math.max(1, p - 1))}
                    disabled={paymentPageSafe === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalPaymentPages }, (_, idx) => idx + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setPaymentPage(page)}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        page === paymentPageSafe ? 'bg-[#A68B77] text-white' : 'text-[#A68B77] hover:bg-[#E8E2D9]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPaymentPage(p => Math.min(totalPaymentPages, p + 1))}
                    disabled={paymentPageSafe === totalPaymentPages}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 문의 내역 */}
        <Card className="bg-white border-[#DED6CC] mb-8">
          <div className="p-5 border-b border-[#E8E2D9] flex items-center justify-between gap-4">
            <h2 className="text-base font-bold text-[#7D6B5D] flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#A68B77]" /> 문의 내역
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F7F2] border-b border-[#E8E2D9]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">제목</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">작성자</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden md:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden lg:table-cell">작성일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">상태</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">관리</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[#A68B77]">
                      접수된 문의가 없습니다.
                    </td>
                  </tr>
                ) : pagedInquiries.map((inq, i) => (
                  <tr key={inq.id} className={`border-b border-[#F9F7F2] hover:bg-[#FDFCFA] transition-colors ${i % 2 === 0 ? '' : 'bg-[#FDFCFA]'}`}>
                    <td className="px-4 py-3 font-semibold text-[#7D6B5D] max-w-[200px] truncate">{inq.title}</td>
                    <td className="px-4 py-3 text-[#7D6B5D] text-xs">{inq.name}</td>
                    <td className="px-4 py-3 text-[#A68B77] hidden md:table-cell text-xs">{inq.email}</td>
                    <td className="px-4 py-3 text-[#A68B77] hidden lg:table-cell text-xs">{formatDate(inq.createdAt)}</td>
                    <td className="px-4 py-3">
                      {inq.status === 'answered' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                          답변완료
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                          대기중
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => openInquiry(inq)}
                          className="p-1.5 rounded-lg hover:bg-[#E8E2D9] text-[#A68B77] hover:text-[#7D6B5D] transition-colors"
                          title="보기"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inquiries.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E8E2D9] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-[#A68B77]">
                총 {inquiries.length}건 (답변 대기 {pendingInquiries}건)
              </span>
              {totalInquiryPages > 1 && (
                <div className="flex items-center flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInquiryPage(p => Math.max(1, p - 1))}
                    disabled={inquiryPageSafe === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalInquiryPages }, (_, idx) => idx + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setInquiryPage(page)}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        page === inquiryPageSafe ? 'bg-[#A68B77] text-white' : 'text-[#A68B77] hover:bg-[#E8E2D9]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setInquiryPage(p => Math.min(totalInquiryPages, p + 1))}
                    disabled={inquiryPageSafe === totalInquiryPages}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 회원 목록 */}
        <Card className="bg-white border-[#DED6CC]">
          <div className="p-5 border-b border-[#E8E2D9] flex items-center justify-between gap-4">
            <h2 className="text-base font-bold text-[#7D6B5D] flex-shrink-0">회원 목록</h2>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#A68B77]" />
              <Input
                placeholder="닉네임, 아이디, 이메일 검색"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9 border-[#DED6CC] text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F7F2] border-b border-[#E8E2D9]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">닉네임</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">아이디</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden md:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden lg:table-cell">가입일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">등급</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">결제정보</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-[#A68B77]">
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : pagedUsers.map((u, i) => (
                  <tr key={u.id} className={`border-b border-[#F9F7F2] hover:bg-[#FDFCFA] transition-colors ${i % 2 === 0 ? '' : 'bg-[#FDFCFA]'}`}>
                    <td className="px-4 py-3 font-semibold text-[#7D6B5D]">
                      {u.nickname}
                    </td>
                    <td className="px-4 py-3 text-[#7D6B5D] font-mono text-xs">
                      {u.username}
                    </td>
                    <td className="px-4 py-3 text-[#A68B77] hidden md:table-cell text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-[#A68B77] hidden lg:table-cell text-xs">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                          <Crown className="w-3 h-3" /> 관리자
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#E8E2D9] text-[#7D6B5D] rounded-full text-xs font-medium">
                          일반
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => setPaymentUserTarget(u)}
                          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#E8E2D9] text-[#A68B77] hover:text-[#7D6B5D] transition-colors font-bold text-sm"
                          title="결제 내역 보기"
                        >
                          $
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg hover:bg-[#E8E2D9] text-[#A68B77] hover:text-[#7D6B5D] transition-colors"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!u.isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-[#A68B77] hover:text-red-500 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E8E2D9] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-[#A68B77]">
                총 {filtered.length}명 {search && `(전체 ${totalUsers}명 중 검색 결과)`}
              </span>
              {totalUserPages > 1 && (
                <div className="flex items-center flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    disabled={userPageSafe === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalUserPages }, (_, idx) => idx + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setUserPage(page)}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        page === userPageSafe ? 'bg-[#A68B77] text-white' : 'text-[#A68B77] hover:bg-[#E8E2D9]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                    disabled={userPageSafe === totalUserPages}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#DED6CC] text-[#A68B77] hover:bg-[#E8E2D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      </main>

      {/* 수정 모달 */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#7D6B5D] flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#A68B77]" />
              회원 정보 수정
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div className="bg-[#F9F7F2] rounded-lg px-3 py-2 text-xs text-[#A68B77]">
                아이디: <span className="font-mono font-semibold text-[#7D6B5D]">{editTarget.username}</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">닉네임</label>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="닉네임"
                  className="border-[#DED6CC]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">이메일</label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="이메일"
                  className="border-[#DED6CC]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">
                  비밀번호 초기화 <span className="text-xs font-normal text-[#A68B77]">(변경 시에만 입력)</span>
                </label>
                <div className="relative">
                  <Input
                    type={showEditPw ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="새 비밀번호 (선택)"
                    className="pr-10 border-[#DED6CC]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPw(!showEditPw)}
                    className="absolute right-3 top-2.5 text-[#A68B77]"
                  >
                    {showEditPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 border-[#DED6CC] text-[#7D6B5D]"
                >
                  취소
                </Button>
                <Button
                  onClick={handleEditSave}
                  className="flex-1 bg-[#A68B77] hover:bg-[#8B7355] text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 모달 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              회원 삭제
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="pt-2 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p><span className="font-bold">{deleteTarget.nickname}</span> ({deleteTarget.username}) 회원을 삭제하시겠습니까?</p>
                <p className="text-xs mt-1 text-red-500">이 작업은 되돌릴 수 없습니다.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 border-[#DED6CC] text-[#7D6B5D]"
                >
                  <X className="w-4 h-4 mr-1" />취소
                </Button>
                <Button
                  onClick={handleDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-1" />삭제
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 회원별 결제 내역 모달 */}
      <Dialog open={!!paymentUserTarget} onOpenChange={(o) => { if (!o) setPaymentUserTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#7D6B5D] flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#A68B77]" />
              {paymentUserTarget?.nickname}님의 결제 내역
            </DialogTitle>
          </DialogHeader>
          {paymentUserTarget && (
            <div className="space-y-3 pt-2">
              <div className="bg-[#F9F7F2] rounded-lg px-3 py-2 text-xs text-[#A68B77] flex flex-wrap gap-x-4 gap-y-1">
                <span>아이디: <span className="font-mono font-semibold text-[#7D6B5D]">{paymentUserTarget.username}</span></span>
                <span>이메일: <span className="font-semibold text-[#7D6B5D]">{paymentUserTarget.email}</span></span>
              </div>
              {paymentUserHistory.length === 0 ? (
                <p className="text-center py-8 text-[#A68B77] text-sm">결제 내역이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {paymentUserHistory.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#E8E2D9] bg-white">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#7D6B5D] text-sm">{PACKAGE_LABEL[p.packageId] ?? p.packageId} ({p.credits}회)</p>
                        <p className="text-xs text-[#A68B77]">{formatDate(p.paidAt || p.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-bold text-[#7D6B5D] text-sm">{formatKrw(p.amountKrw)}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${PAYMENT_STATUS_LABEL[p.status].className}`}>
                          {PAYMENT_STATUS_LABEL[p.status].label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 문의 상세 / 답변 모달 */}
      <Dialog open={!!inquiryTarget} onOpenChange={(o) => { if (!o) setInquiryTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#7D6B5D] flex items-center gap-2 break-words">
              <MessageCircle className="w-5 h-5 text-[#A68B77] flex-shrink-0" />
              {inquiryTarget?.title}
            </DialogTitle>
          </DialogHeader>
          {inquiryTarget && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[#A68B77]">
                <span className="font-semibold text-[#7D6B5D]">{inquiryTarget.name}</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {inquiryTarget.email}</span>
                <span>{formatDate(inquiryTarget.createdAt)}</span>
              </div>

              <div className="bg-[#F9F7F2] rounded-lg p-3 text-sm text-[#7D6B5D] whitespace-pre-wrap break-words">
                {inquiryTarget.content}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">
                  답변 {inquiryTarget.status === 'answered' && (
                    <span className="text-xs font-normal text-[#A68B77]">
                      ({formatDate(inquiryTarget.answeredAt || inquiryTarget.createdAt)} 답변됨)
                    </span>
                  )}
                </label>
                <Textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="답변 내용을 입력해주세요."
                  className="min-h-[140px] resize-y border-[#DED6CC]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setInquiryTarget(null)}
                  className="flex-1 border-[#DED6CC] text-[#7D6B5D]"
                >
                  닫기
                </Button>
                <Button
                  onClick={handleSendAnswer}
                  className="flex-1 bg-[#A68B77] hover:bg-[#8B7355] text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  {inquiryTarget.status === 'answered' ? '답변 수정' : '답변 등록'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

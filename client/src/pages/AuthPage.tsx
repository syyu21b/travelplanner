import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plane, Mail, Lock, User, Eye, EyeOff, AtSign, CheckCircle, XCircle, Shield, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Mode = 'login' | 'register' | 'findId' | 'findPassword';

function getPasswordStrength(pw: string) {
  if (!pw) return { score: 0, label: '', color: '', bgColor: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: '', color: '', bgColor: '' },
    { label: '매우 약함', color: 'text-red-500', bgColor: 'bg-red-500' },
    { label: '약함', color: 'text-orange-500', bgColor: 'bg-orange-400' },
    { label: '보통', color: 'text-yellow-600', bgColor: 'bg-yellow-400' },
    { label: '강함', color: 'text-blue-600', bgColor: 'bg-blue-400' },
    { label: '매우 강함', color: 'text-green-600', bgColor: 'bg-green-500' },
  ];
  return { score, ...levels[score] };
}

const BG = (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#E8E2D9] rounded-full opacity-40 blur-3xl" />
    <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#DED6CC] rounded-full opacity-40 blur-3xl" />
  </div>
);

const Logo = (
  <div className="text-center mb-8">
    <div className="inline-flex items-center justify-center w-16 h-16 bg-[#A68B77] rounded-2xl shadow-lg mb-4">
      <Plane className="w-8 h-8 text-white" />
    </div>
    <h1 className="text-4xl font-bold text-[#7D6B5D]">Travel Planner</h1>
    <p className="text-[#A68B77] mt-2 font-light">나만의 여행 계획을 시작해보세요</p>
  </div>
);

const Footer = (
  <p className="text-center text-[#A68B77] text-xs mt-6">
    Travel Planner © 2025 · 나만의 여행을 계획하세요
  </p>
);

export default function AuthPage() {
  const { login, register, checkUsername, checkNickname, findUsernameByEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  // ── Login
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ── Register
  const [nickname, setNickname] = useState('');
  const [nicknameOk, setNicknameOk] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [usernameOk, setUsernameOk] = useState<boolean | null>(null);
  const [regPw, setRegPw] = useState('');
  const [regPwConfirm, setRegPwConfirm] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [email, setEmail] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  // ── Find ID
  const [findEmail, setFindEmail] = useState('');
  const [findIdSearched, setFindIdSearched] = useState(false);
  const [foundId, setFoundId] = useState<string | null>(null);

  // ── Find Password
  const [fpId, setFpId] = useState('');
  const [fpEmail, setFpEmail] = useState('');
  const [fpVerified, setFpVerified] = useState(false);
  const [fpNewPw, setFpNewPw] = useState('');
  const [fpNewPwConfirm, setFpNewPwConfirm] = useState('');
  const [showFpPw, setShowFpPw] = useState(false);

  const pwStrength = getPasswordStrength(regPw);
  const fpPwStrength = getPasswordStrength(fpNewPw);

  function resetAll() {
    setLoginId(''); setLoginPw(''); setLoginError(''); setShowLoginPw(false);
    setNickname(''); setNicknameOk(null);
    setUsername(''); setUsernameOk(null);
    setRegPw(''); setRegPwConfirm(''); setShowRegPw(false);
    setEmail(''); setSentCode(''); setInputCode(''); setCodeSent(false); setEmailVerified(false);
    setFindEmail(''); setFindIdSearched(false); setFoundId(null);
    setFpId(''); setFpEmail(''); setFpVerified(false); setFpNewPw(''); setFpNewPwConfirm(''); setShowFpPw(false);
    setIsLoading(false);
  }

  function switchMode(m: Mode) { resetAll(); setMode(m); }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    if (!loginId || !loginPw) { setLoginError('아이디와 비밀번호를 입력해주세요.'); return; }
    setIsLoading(true);
    try {
      const result = await login(loginId, loginPw);
      if (result.success) toast.success(result.message);
      else setLoginError('아이디 또는 비밀번호가 일치하지 않습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleCheckNickname() {
    if (!nickname.trim()) { toast.error('닉네임을 입력해주세요.'); return; }
    if (nickname.length < 2 || nickname.length > 10) { toast.error('닉네임은 2~10자로 입력해주세요.'); return; }
    const ok = checkNickname(nickname);
    setNicknameOk(ok);
    toast[ok ? 'success' : 'error'](ok ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.');
  }

  function handleCheckUsername() {
    if (!username.trim()) { toast.error('아이디를 입력해주세요.'); return; }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) { toast.error('4~20자의 영문, 숫자, 밑줄(_)만 사용 가능합니다.'); return; }
    const ok = checkUsername(username);
    setUsernameOk(ok);
    toast[ok ? 'success' : 'error'](ok ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.');
  }

  function handleSendCode() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('올바른 이메일을 입력해주세요.'); return; }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    setCodeSent(true);
    setEmailVerified(false);
    setInputCode('');
    toast.success(`인증코드가 발송되었습니다. (테스트 코드: ${code})`);
  }

  function handleVerifyCode() {
    if (inputCode === sentCode) {
      setEmailVerified(true);
      toast.success('이메일 인증이 완료되었습니다!');
    } else {
      toast.error('인증코드가 올바르지 않습니다.');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (nicknameOk !== true) { toast.error('닉네임 중복 확인을 완료해주세요.'); return; }
    if (usernameOk !== true) { toast.error('아이디 중복 확인을 완료해주세요.'); return; }
    if (regPw.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (pwStrength.score < 3) { toast.error('비밀번호 보안이 너무 약합니다. 대문자, 숫자, 특수문자를 포함해주세요.'); return; }
    if (regPw !== regPwConfirm) { toast.error('비밀번호가 일치하지 않습니다.'); return; }
    if (!emailVerified) { toast.error('이메일 인증을 완료해주세요.'); return; }
    setIsLoading(true);
    try {
      const result = await register({ username, nickname, email, password: regPw });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFindId() {
    if (!findEmail) { toast.error('이메일을 입력해주세요.'); return; }
    const id = findUsernameByEmail(findEmail);
    setFindIdSearched(true);
    setFoundId(id);
    if (!id) toast.error('해당 이메일로 등록된 계정이 없습니다.');
  }

  function handleFpVerify() {
    if (!fpId || !fpEmail) { toast.error('아이디와 이메일을 모두 입력해주세요.'); return; }
    const id = findUsernameByEmail(fpEmail);
    if (id === fpId) {
      setFpVerified(true);
      toast.success('본인 확인이 완료되었습니다. 새 비밀번호를 설정해주세요.');
    } else {
      toast.error('아이디 또는 이메일이 올바르지 않습니다.');
    }
  }

  function handleFpReset() {
    if (fpNewPw.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (fpPwStrength.score < 3) { toast.error('비밀번호 보안이 너무 약합니다.'); return; }
    if (fpNewPw !== fpNewPwConfirm) { toast.error('비밀번호가 일치하지 않습니다.'); return; }
    const result = resetPassword(fpId, fpEmail, fpNewPw);
    if (result.success) { toast.success(result.message); switchMode('login'); }
    else toast.error(result.message);
  }

  // ── Find ID / Find Password 전용 레이아웃
  if (mode === 'findId' || mode === 'findPassword') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F9F7F2] via-white to-[#E8E2D9] flex items-center justify-center p-4 py-8">
        {BG}
        <div className="relative w-full max-w-md">
          {Logo}
          <Card className="p-8 bg-white/90 backdrop-blur-sm border border-[#DED6CC] shadow-xl">
            <button
              onClick={() => switchMode('login')}
              className="flex items-center gap-1 text-[#A68B77] text-sm font-semibold mb-6 hover:text-[#7D6B5D] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              로그인으로 돌아가기
            </button>

            {mode === 'findId' ? (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-[#7D6B5D]">아이디 찾기</h2>
                <p className="text-sm text-[#A68B77]">가입 시 등록한 이메일을 입력해주세요.</p>

                <div>
                  <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                    <Input
                      type="email"
                      placeholder="example@email.com"
                      value={findEmail}
                      onChange={(e) => { setFindEmail(e.target.value); setFindIdSearched(false); setFoundId(null); }}
                      className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleFindId}
                  className="w-full py-3 bg-[#A68B77] hover:bg-[#8B7355] text-white rounded-full font-bold"
                >
                  아이디 찾기
                </Button>

                {findIdSearched && (
                  <div className={`p-4 rounded-xl text-sm border ${foundId ? 'bg-[#F9F7F2] border-[#DED6CC]' : 'bg-red-50 border-red-200'}`}>
                    {foundId ? (
                      <>
                        <p className="text-xs text-[#A68B77] mb-1">회원님의 아이디</p>
                        <p className="text-lg font-bold text-[#7D6B5D] tracking-wide">{foundId}</p>
                        <button
                          onClick={() => switchMode('login')}
                          className="mt-3 text-xs text-[#A68B77] underline hover:text-[#7D6B5D]"
                        >
                          로그인하러 가기
                        </button>
                      </>
                    ) : (
                      <p className="text-red-600">해당 이메일로 등록된 계정이 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Find Password */
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-[#7D6B5D]">비밀번호 찾기</h2>

                {!fpVerified ? (
                  <>
                    <p className="text-sm text-[#A68B77]">아이디와 가입 시 등록한 이메일을 입력해주세요.</p>
                    <div>
                      <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">아이디</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                        <Input
                          type="text"
                          placeholder="아이디 입력"
                          value={fpId}
                          onChange={(e) => setFpId(e.target.value)}
                          className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">이메일</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                        <Input
                          type="email"
                          placeholder="example@email.com"
                          value={fpEmail}
                          onChange={(e) => setFpEmail(e.target.value)}
                          className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleFpVerify}
                      className="w-full py-3 bg-[#A68B77] hover:bg-[#8B7355] text-white rounded-full font-bold"
                    >
                      본인 확인
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-green-600 font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      본인 확인 완료. 새 비밀번호를 설정해주세요.
                    </p>

                    <div>
                      <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">새 비밀번호</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                        <Input
                          type={showFpPw ? 'text' : 'password'}
                          placeholder="8자 이상, 대소문자+숫자+특수문자"
                          value={fpNewPw}
                          onChange={(e) => setFpNewPw(e.target.value)}
                          className="pl-10 pr-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                        />
                        <button type="button" onClick={() => setShowFpPw(!showFpPw)} className="absolute right-3 top-3 text-[#A68B77]">
                          {showFpPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {fpNewPw && (
                        <div className="mt-2">
                          <div className="flex gap-1 mb-1">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= fpPwStrength.score ? fpPwStrength.bgColor : 'bg-gray-200'}`} />
                            ))}
                          </div>
                          <p className={`text-xs font-medium flex items-center gap-1 ${fpPwStrength.color}`}>
                            <Shield className="w-3 h-3" />{fpPwStrength.label}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">새 비밀번호 확인</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                        <Input
                          type={showFpPw ? 'text' : 'password'}
                          placeholder="비밀번호를 다시 입력해주세요"
                          value={fpNewPwConfirm}
                          onChange={(e) => setFpNewPwConfirm(e.target.value)}
                          className="pl-10 pr-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                        />
                        {fpNewPwConfirm && (
                          <span className="absolute right-3 top-3">
                            {fpNewPw === fpNewPwConfirm
                              ? <CheckCircle className="w-5 h-5 text-green-500" />
                              : <XCircle className="w-5 h-5 text-red-400" />}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={handleFpReset}
                      className="w-full py-3 bg-[#A68B77] hover:bg-[#8B7355] text-white rounded-full font-bold"
                    >
                      비밀번호 변경
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
          {Footer}
        </div>
      </div>
    );
  }

  // ── Login / Register 탭 레이아웃
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F9F7F2] via-white to-[#E8E2D9] flex items-center justify-center p-4 py-8">
      {BG}
      <div className="relative w-full max-w-md">
        {Logo}

        <Card className="p-8 bg-white/90 backdrop-blur-sm border border-[#DED6CC] shadow-xl">
          {/* 탭 */}
          <div className="mb-6">
            <div className="flex bg-[#E8E2D9] rounded-xl p-1 gap-1">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    mode === m ? 'bg-white text-[#A68B77] shadow-md' : 'text-[#A68B77] hover:text-[#7D6B5D]'
                  }`}
                >
                  {m === 'login' ? '로그인' : '회원가입'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'login' ? (
            /* ═══ 로그인 폼 ═══ */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">아이디</label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                  <Input
                    type="text"
                    placeholder="아이디 입력"
                    value={loginId}
                    onChange={(e) => { setLoginId(e.target.value); setLoginError(''); }}
                    className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">비밀번호</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                  <Input
                    type={showLoginPw ? 'text' : 'password'}
                    placeholder="비밀번호 입력"
                    value={loginPw}
                    onChange={(e) => { setLoginPw(e.target.value); setLoginError(''); }}
                    className="pl-10 pr-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                  />
                  <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-3 top-3 text-[#A68B77]">
                    {showLoginPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-red-500 text-sm font-medium flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {loginError}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#A68B77] hover:bg-[#8B7355] text-white rounded-full font-bold transition-all"
              >
                {isLoading ? '로그인 중...' : '로그인'}
              </Button>

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => switchMode('findId')}
                  className="text-xs text-[#A68B77] hover:text-[#7D6B5D] hover:underline underline-offset-2 transition-colors"
                >
                  아이디 찾기
                </button>
                <span className="text-[#DED6CC] text-sm">|</span>
                <button
                  type="button"
                  onClick={() => switchMode('findPassword')}
                  className="text-xs text-[#A68B77] hover:text-[#7D6B5D] hover:underline underline-offset-2 transition-colors"
                >
                  비밀번호 찾기
                </button>
              </div>
            </form>
          ) : (
            /* ═══ 회원가입 폼 ═══ */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* 닉네임 */}
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">닉네임</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                    <Input
                      type="text"
                      placeholder="2~10자"
                      value={nickname}
                      onChange={(e) => { setNickname(e.target.value); setNicknameOk(null); }}
                      className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleCheckNickname}
                    variant="outline"
                    className="px-3 text-xs font-bold whitespace-nowrap border-[#DED6CC] text-[#7D6B5D] hover:bg-[#E8E2D9]"
                  >
                    중복 확인
                  </Button>
                </div>
                {nicknameOk !== null && (
                  <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${nicknameOk ? 'text-green-600' : 'text-red-500'}`}>
                    {nicknameOk ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {nicknameOk ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.'}
                  </p>
                )}
              </div>

              {/* 아이디 */}
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">아이디</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <AtSign className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                    <Input
                      type="text"
                      placeholder="영문, 숫자, _ (4~20자)"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setUsernameOk(null); }}
                      className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleCheckUsername}
                    variant="outline"
                    className="px-3 text-xs font-bold whitespace-nowrap border-[#DED6CC] text-[#7D6B5D] hover:bg-[#E8E2D9]"
                  >
                    중복 확인
                  </Button>
                </div>
                {usernameOk !== null && (
                  <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${usernameOk ? 'text-green-600' : 'text-red-500'}`}>
                    {usernameOk ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {usernameOk ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'}
                  </p>
                )}
              </div>

              {/* 비밀번호 */}
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">비밀번호</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                  <Input
                    type={showRegPw ? 'text' : 'password'}
                    placeholder="8자 이상, 대소문자+숫자+특수문자"
                    value={regPw}
                    onChange={(e) => setRegPw(e.target.value)}
                    className="pl-10 pr-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                  />
                  <button type="button" onClick={() => setShowRegPw(!showRegPw)} className="absolute right-3 top-3 text-[#A68B77]">
                    {showRegPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {regPw && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= pwStrength.score ? pwStrength.bgColor : 'bg-gray-200'}`} />
                      ))}
                    </div>
                    <p className={`text-xs font-medium flex items-center gap-1 ${pwStrength.color}`}>
                      <Shield className="w-3 h-3" />{pwStrength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">비밀번호 확인</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                  <Input
                    type={showRegPw ? 'text' : 'password'}
                    placeholder="비밀번호를 다시 입력해주세요"
                    value={regPwConfirm}
                    onChange={(e) => setRegPwConfirm(e.target.value)}
                    className="pl-10 pr-10 py-3 border-[#DED6CC] focus:border-[#A68B77]"
                  />
                  {regPwConfirm && (
                    <span className="absolute right-3 top-3">
                      {regPw === regPwConfirm
                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                        : <XCircle className="w-5 h-5 text-red-400" />}
                    </span>
                  )}
                </div>
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">이메일</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-[#A68B77]" />
                    <Input
                      type="email"
                      placeholder="example@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setEmailVerified(false); }}
                      disabled={emailVerified}
                      className="pl-10 py-3 border-[#DED6CC] focus:border-[#A68B77] disabled:opacity-60"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSendCode}
                    disabled={emailVerified}
                    variant="outline"
                    className="px-3 text-xs font-bold whitespace-nowrap border-[#DED6CC] text-[#7D6B5D] hover:bg-[#E8E2D9] disabled:opacity-50"
                  >
                    {codeSent ? '재발송' : '인증코드 발송'}
                  </Button>
                </div>
                {emailVerified && (
                  <p className="text-xs mt-1 flex items-center gap-1 font-medium text-green-600">
                    <CheckCircle className="w-3.5 h-3.5" />이메일 인증 완료
                  </p>
                )}
              </div>

              {/* 인증코드 입력 */}
              {codeSent && !emailVerified && (
                <div>
                  <label className="block text-sm font-semibold text-[#7D6B5D] mb-2">인증코드</label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="6자리 코드 입력"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="py-3 border-[#DED6CC] focus:border-[#A68B77] tracking-[0.3em] font-mono text-center"
                    />
                    <Button
                      type="button"
                      onClick={handleVerifyCode}
                      className="px-4 bg-[#A68B77] hover:bg-[#8B7355] text-white text-xs font-bold whitespace-nowrap"
                    >
                      인증 확인
                    </Button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#A68B77] hover:bg-[#8B7355] text-white rounded-full font-bold transition-all mt-2"
              >
                {isLoading ? '처리 중...' : '회원가입'}
              </Button>
            </form>
          )}
        </Card>
        {Footer}
      </div>
    </div>
  );
}

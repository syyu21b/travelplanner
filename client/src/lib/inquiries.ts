export interface Inquiry {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  title: string;
  content: string;
  createdAt: string;
  status: 'pending' | 'answered';
  answer?: string;
  answeredAt?: string;
}

const STORAGE_KEY = 'inquiries';

export function getInquiries(): Inquiry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

// 시크릿/프라이빗 모드 등 localStorage 쓰기가 실패할 수 있는 환경에서도
// 앱이 크래시되지 않도록 성공 여부를 반환
function saveInquiries(list: Inquiry[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addInquiry(input: {
  userId: string | null;
  name: string;
  email: string;
  title: string;
  content: string;
}): boolean {
  const list = getInquiries();
  list.unshift({
    id: Date.now().toString(),
    userId: input.userId,
    name: input.name,
    email: input.email,
    title: input.title,
    content: input.content,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
  return saveInquiries(list);
}

export function answerInquiry(id: string, answer: string): boolean {
  const list = getInquiries();
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return false;
  list[idx] = {
    ...list[idx],
    answer,
    answeredAt: new Date().toISOString(),
    status: 'answered',
  };
  return saveInquiries(list);
}

// 클라이언트(client/src/**)와 서버(server/**)가 함께 사용하는 도메인 타입.
// 이전에는 페이지마다(Home.tsx/TravelDiary.tsx/Community.tsx) 같은 개념을 조금씩 다르게
// 재정의했는데, 그 드리프트를 없애기 위해 여기 하나로 모았다.

export type PlanRegion = "domestic" | "overseas";
export type ScheduleCategory = "accommodation" | "transport" | "meal" | "activity" | "other";
export type BudgetCategory = "accommodation" | "transport" | "meal" | "activity" | "shopping" | "other";
export type DiaryDisplayMode = "grid" | "slide" | "blog";
export type MediaKind = "photo" | "video";

export interface ScheduleItem {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  title: string;
  category: ScheduleCategory;
  location?: string;
  lat?: number;
  lng?: number;
  cost?: number;
  link?: string;
  notes?: string;
  preparations?: string[];
  completed?: boolean;
}

export interface Budget {
  id: string;
  category: BudgetCategory;
  amount: number;
  description: string;
}

export interface ShoppingItem {
  id: string;
  item: string;
  checked: boolean;
  imageUrl?: string;
  link?: string;
}

export interface Accommodation {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
  phone?: string;
  reservationNumber?: string;
  link?: string;
  notes?: string;
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  reservationNumber?: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate: string;
  arrivalTime?: string;
  terminal?: string;
  gate?: string;
  seat?: string;
  boardingTime?: string;
}

export interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  region: PlanRegion;
  coverPhoto?: string;
  schedules: ScheduleItem[];
  budgets: Budget[];
  shoppingList: ShoppingItem[];
  accommodations?: Accommodation[];
  flights?: Flight[];
  preparationChecks?: Record<string, boolean>;
  totalBudgetAmount?: number;
  travelers?: number;
  allowClone?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: MediaKind;
}

export interface DiaryBlock {
  id: string;
  type: "text" | "image" | "video";
  content: string;
  caption?: string;
}

export interface DiaryEntry {
  id: string;
  userId: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  content: string;
  blocks?: DiaryBlock[];
  rating: number;
  mainPhoto?: DiaryPhoto;
  photos: DiaryPhoto[];
  displayMode?: DiaryDisplayMode;
  tags: string[];
  isPublic: boolean;
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  commentsCount: number;
  bookmarksCount: number;
  viewCount: number;
  // 요청자 세션 기준으로 서버가 채워주는 필드 (목록/상세 응답에만 존재, 저장되지 않음)
  isLikedByMe?: boolean;
  isBookmarkedByMe?: boolean;
  // 커뮤니티 피드/상세 응답에만 채워지는 작성자 표시 이름
  userName?: string;
}

export interface LinkedPlanPreview {
  title: string;
  startDate: string;
  endDate: string;
  schedules: ScheduleItem[];
  budgets: { amount: number }[];
  accommodations: { id: string; name: string; address?: string; checkInDate: string; checkInTime?: string; checkOutDate: string; checkOutTime?: string }[];
  preparationChecks: Record<string, boolean>;
  isSnapshotOnly: boolean;
  allowClone: boolean;
  ownerId: string;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: MediaKind;
  lat?: number;
  lng?: number;
  address?: string;
}

export interface Album {
  id: string;
  userId: string;
  title: string;
  photos: AlbumPhoto[];
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
  linkedPlanRegion?: PlanRegion;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  diaryId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  likes: string[];
}

export interface User {
  id: string;
  username: string;
  nickname: string;
  name: string; // nickname 별칭 (기존 코드 호환)
  email: string;
  phoneNumber?: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export type NotificationType =
  | "like"
  | "comment"
  | "share"
  | "popular"
  | "trip-d3"
  | "trip-dday"
  | "inquiry-answer"
  | "inquiry-new";

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  actorName?: string;
  diaryId?: string;
  diaryTitle?: string;
  planId?: string;
  planTitle?: string;
  inquiryId?: string;
  inquiryTitle?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  tripD3: boolean;
  tripDDay: boolean;
  likes: boolean;
  comments: boolean;
  shares: boolean;
  popularPost: boolean;
  inquiryAnswer: boolean;
  inquiryNew: boolean;
}

export interface Inquiry {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  title: string;
  content: string;
  createdAt: string;
  status: "pending" | "answered";
  answer?: string;
  answeredAt?: string;
}

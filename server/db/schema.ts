import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  nickname: text("nickname").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// 회원가입 이메일 인증코드. 아직 계정이 없는 상태에서 이메일 하나로 여러 번 재발송할 수 있으므로
// email을 PK로 두고 재발송 시 덮어쓴다(가장 최근 코드만 유효).
export const emailVerifications = sqliteTable("email_verifications", {
  email: text("email").primaryKey(),
  code: text("code").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

export const passportVault = sqliteTable("passport_vault", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  salt: text("salt").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  photoKey: text("photo_key"),
});

// AI 일정 생성 크레딧. 행이 없는 사용자를 처음 만나면 1(첫 1회 무료)로 lazy 초기화한다
// (server/api/auth.ts의 seedAdmin과 동일한 lazy-init 패턴).
export const userCredits = sqliteTable("user_credits", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  remainingCredits: integer("remaining_credits").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(), // = PortOne paymentId
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    packageId: text("package_id", { enum: ["1", "5", "10"] }).notNull(),
    credits: integer("credits").notNull(),
    amountKrw: integer("amount_krw").notNull(),
    status: text("status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    paidAt: text("paid_at"),
    // 포트원 결제 단건 조회 응답에서 채워지는 상세 정보 — 확정 시도(성공/실패 모두) 후에만 값이 있음
    pgProvider: text("pg_provider"), // 예: "INICIS_V2"
    channelName: text("channel_name"), // 예: "이니시스 결제창 일반결제 및 API 일반결제"
    payMethod: text("pay_method"), // 예: "CARD"
    failureReason: text("failure_reason"),
  },
  (t) => [index("payments_user_id_idx").on(t.userId)],
);

// 네이버/카카오 간편 로그인 연동 정보. users.passwordHash는 소셜 전용 계정도 NOT NULL을
// 유지하기 위해 사용 불가능한 무작위 해시로 채운다(hashPassword(nanoid(32)))
// — 일반 로그인/비밀번호 검증 로직을 그대로 재사용할 수 있게 하기 위함.
export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["naver", "kakao"] }).notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("oauth_accounts_user_id_idx").on(t.userId),
    uniqueIndex("oauth_accounts_provider_uid_idx").on(t.provider, t.providerUserId),
  ],
);

export const travelPlans = sqliteTable(
  "travel_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    region: text("region", { enum: ["domestic", "overseas"] }).notNull(),
    coverPhotoKey: text("cover_photo_key"),
    schedulesJson: text("schedules_json").notNull().default("[]"),
    budgetsJson: text("budgets_json").notNull().default("[]"),
    shoppingListJson: text("shopping_list_json").notNull().default("[]"),
    accommodationsJson: text("accommodations_json").notNull().default("[]"),
    flightsJson: text("flights_json").notNull().default("[]"),
    preparationChecksJson: text("preparation_checks_json").notNull().default("{}"),
    totalBudgetAmount: integer("total_budget_amount"),
    travelers: integer("travelers"),
    allowClone: integer("allow_clone", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("travel_plans_user_id_idx").on(t.userId)],
);

export const travelDiaries = sqliteTable(
  "travel_diaries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    location: text("location").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    content: text("content").notNull().default(""),
    rating: integer("rating").notNull().default(0),
    displayMode: text("display_mode", { enum: ["grid", "slide", "blog"] }).notNull().default("grid"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    mainPhotoJson: text("main_photo_json"),
    blocksJson: text("blocks_json").notNull().default("[]"),
    photosJson: text("photos_json").notNull().default("[]"),
    linkedPlanId: text("linked_plan_id").references(() => travelPlans.id, { onDelete: "set null" }),
    linkedPlanTitle: text("linked_plan_title"),
    linkedPlanSchedulesJson: text("linked_plan_schedules_json"),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    bookmarksCount: integer("bookmarks_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("travel_diaries_user_id_idx").on(t.userId),
    index("travel_diaries_public_created_idx").on(t.isPublic, t.createdAt),
    index("travel_diaries_public_likes_idx").on(t.isPublic, t.likesCount, t.createdAt),
  ],
);

export const diaryTags = sqliteTable(
  "diary_tags",
  {
    diaryId: text("diary_id").notNull().references(() => travelDiaries.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.diaryId, t.tag] }), index("diary_tags_tag_idx").on(t.tag)],
);

export const diaryLikes = sqliteTable(
  "diary_likes",
  {
    diaryId: text("diary_id").notNull().references(() => travelDiaries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.diaryId, t.userId] }), index("diary_likes_user_id_idx").on(t.userId)],
);

export const diaryBookmarks = sqliteTable(
  "diary_bookmarks",
  {
    diaryId: text("diary_id").notNull().references(() => travelDiaries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.diaryId, t.userId] }), index("diary_bookmarks_user_id_idx").on(t.userId)],
);

export const diaryComments = sqliteTable(
  "diary_comments",
  {
    id: text("id").primaryKey(),
    diaryId: text("diary_id").notNull().references(() => travelDiaries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userName: text("user_name").notNull(),
    content: text("content").notNull(),
    likesJson: text("likes_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at"),
  },
  (t) => [index("diary_comments_diary_created_idx").on(t.diaryId, t.createdAt)],
);

export const albums = sqliteTable(
  "albums",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    photosJson: text("photos_json").notNull().default("[]"),
    linkedPlanId: text("linked_plan_id").references(() => travelPlans.id, { onDelete: "set null" }),
    linkedPlanTitle: text("linked_plan_title"),
    linkedPlanSchedulesJson: text("linked_plan_schedules_json"),
    linkedPlanRegion: text("linked_plan_region", { enum: ["domestic", "overseas"] }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("albums_user_id_idx").on(t.userId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorName: text("actor_name"),
    diaryId: text("diary_id"),
    diaryTitle: text("diary_title"),
    planId: text("plan_id"),
    planTitle: text("plan_title"),
    inquiryId: text("inquiry_id"),
    inquiryTitle: text("inquiry_title"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("notifications_recipient_created_idx").on(t.recipientId, t.createdAt),
    index("notifications_recipient_read_idx").on(t.recipientId, t.isRead),
    index("notifications_type_diary_idx").on(t.type, t.diaryId),
    index("notifications_type_plan_idx").on(t.type, t.planId),
  ],
);

export const notificationSettings = sqliteTable("notification_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  tripD3: integer("trip_d3", { mode: "boolean" }).notNull().default(true),
  tripDDay: integer("trip_dday", { mode: "boolean" }).notNull().default(true),
  likes: integer("likes", { mode: "boolean" }).notNull().default(true),
  comments: integer("comments", { mode: "boolean" }).notNull().default(true),
  shares: integer("shares", { mode: "boolean" }).notNull().default(true),
  popularPost: integer("popular_post", { mode: "boolean" }).notNull().default(true),
  inquiryAnswer: integer("inquiry_answer", { mode: "boolean" }).notNull().default(true),
  inquiryNew: integer("inquiry_new", { mode: "boolean" }).notNull().default(true),
});

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ["pending", "answered"] }).notNull().default("pending"),
    answer: text("answer"),
    answeredAt: text("answered_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("inquiries_user_id_idx").on(t.userId), index("inquiries_status_idx").on(t.status)],
);

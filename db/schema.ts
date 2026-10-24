import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  mediumtext,
  timestamp,
  bigint,
  boolean,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ------------------------------------------------------------------ */
/* Haven community tables                                             */
/* ------------------------------------------------------------------ */

/** Pseudonymous public profile — what other members see. */
export const profiles = mysqlTable(
  "profiles",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    pseudonym: varchar("pseudonym", { length: 60 }).notNull().default("Me"),
    avatarColor: varchar("avatarColor", { length: 20 })
      .notNull()
      .default("#7FA8C9"),
    /** Private — never exposed in public profile responses. */
    email: varchar("email", { length: 320 }),
    /** Onboarding: basic profile. */
    displayName: varchar("displayName", { length: 60 }),
    username: varchar("username", { length: 30 }),
    bio: varchar("bio", { length: 280 }),
    avatarUrl: mediumtext("avatarUrl"),
    coverImage: mediumtext("coverImage"),
    /** Onboarding: personalization. */
    interests: json("interests").$type<string[]>(),
    /** Support communities the user belongs to — used for feed targeting. */
    communities: json("communities").$type<string[]>(),
    /** Onboarding: privacy & safety (privacy-protective defaults). */
    isPrivate: boolean("isPrivate").notNull().default(true),
    dmPolicy: mysqlEnum("dmPolicy", ["everyone", "mutuals", "nobody"])
      .notNull()
      .default("nobody"),
    notifPrefs: json("notifPrefs").$type<{
      replies?: boolean;
      reactions?: boolean;
      messages?: boolean;
      /** Actor userIds the user muted — no notifications from them. */
      mutedActors?: number[];
      /** Post ids the user muted — no notifications about those posts. */
      mutedPosts?: number[];
      /** Reply ids the user muted — no notifications about those comments. */
      mutedReplies?: number[];
    }>(),
    contentFilter: boolean("contentFilter").notNull().default(true),
    /** Free-form UI preferences (hidden homepage cards etc.). */
    uiPrefs: json("uiPrefs").$type<{
      communityCarouselHidden?: boolean;
      /** Post ids this user hid from their own home feed. */
      hiddenPosts?: number[];
    }>(),
    /** Onboarding completion gate. */
    profileComplete: boolean("profileComplete").notNull().default(false),
    onboardingStep: varchar("onboardingStep", { length: 20 })
      .notNull()
      .default("profile"),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_profiles_username").on(t.username),
    uniqueIndex("uq_profiles_userId").on(t.userId),
  ],
);

export type Profile = typeof profiles.$inferSelect;

export const posts = mysqlTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: bigint("authorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    /** Snapshot of display identity at post time — keeps posts pseudonymous. */
    authorName: varchar("authorName", { length: 60 }).notNull(),
    avatarColor: varchar("avatarColor", { length: 20 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    /** Attached photo/GIF as a data URL (≤2MB). TODO: move to object storage. */
    image: mediumtext("image"),
    audience: json("audience").$type<string[]>(),
    emotions: json("emotions").$type<string[]>(),
    supportPreference: mysqlEnum("supportPreference", ["listen", "advice", "experience"]),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ix_posts_created").on(t.createdAt)],
);

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

/**
 * Per-user feed — one row per (user, post) meaning "this post belongs in
 * this user's home feed". Written by fan-out when a post is created (and
 * when a user finishes onboarding), read by the home feed query.
 */
export const feedItems = mysqlTable(
  "feed_items",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_feed_items_user_post").on(t.userId, t.postId),
    index("ix_feed_items_user").on(t.userId, t.postId),
  ],
);

export type FeedItem = typeof feedItems.$inferSelect;

export const replies = mysqlTable(
  "replies",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id),
    parentReplyId: bigint("parentReplyId", { mode: "number", unsigned: true }),
    authorId: bigint("authorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    authorName: varchar("authorName", { length: 60 }).notNull(),
    avatarColor: varchar("avatarColor", { length: 20 }).notNull(),
    body: text("body").notNull(),
    image: mediumtext("image"),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    editedAt: timestamp("editedAt"),
  },
  (t) => [index("ix_replies_post").on(t.postId)],
);

export type Reply = typeof replies.$inferSelect;
export type InsertReply = typeof replies.$inferInsert;

/** Supportive reactions — one per user per type per post (server-enforced). */
export const postReactions = mysqlTable(
  "post_reactions",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    type: mysqlEnum("type", ["here", "understand", "support"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_reaction").on(t.postId, t.userId, t.type)],
);

export const postHugs = mysqlTable(
  "post_hugs",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_post_hug").on(t.postId, t.userId)],
);

export const replyHugs = mysqlTable(
  "reply_hugs",
  {
    id: serial("id").primaryKey(),
    replyId: bigint("replyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => replies.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_reply_hug").on(t.replyId, t.userId)],
);

export const savedPosts = mysqlTable(
  "saved_posts",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => posts.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_saved").on(t.postId, t.userId)],
);

export const safetyReports = mysqlTable(
  "safety_reports",
  {
    id: serial("id").primaryKey(),
    targetType: mysqlEnum("targetType", ["post", "reply"]).notNull(),
    targetId: bigint("targetId", { mode: "number", unsigned: true }).notNull(),
    targetSnapshot: json("targetSnapshot")
      .$type<{ author: string; title: string; body: string }>()
      .notNull(),
    reporterId: bigint("reporterId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    category: mysqlEnum("category", [
      "self-harm",
      "abuse",
      "threats",
      "immediate-danger",
      "severe-distress",
      "harassment",
      "hate",
      "spam",
      "sexual-content",
      "impersonation",
      "private-info",
      "misinformation",
      "ip-violation",
      "other",
    ]).notNull(),
    context: text("context"),
    priority: mysqlEnum("priority", ["high", "medium", "low"]).notNull(),
    status: mysqlEnum("status", ["Pending", "Under Review", "Escalated", "Resolved"])
      .notNull()
      .default("Pending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One report per reporter per target per category — duplicates are
    // impossible at the database level. Re-reporting after resolution
    // reopens the same row instead of inserting a new one.
    uniqueIndex("uq_open_report").on(t.reporterId, t.targetType, t.targetId, t.category),
    index("ix_reports_status").on(t.status, t.priority),
  ],
);

/** Moderator action log — append-only. */
export const reportEvents = mysqlTable(
  "report_events",
  {
    id: serial("id").primaryKey(),
    reportId: bigint("reportId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => safetyReports.id),
    actorId: bigint("actorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ix_events_report").on(t.reportId)],
);


/* ------------------------------------------------------------------ */
/* Phase 4–5 tables: notifications, messaging, mood, journal, blocks  */
/* ------------------------------------------------------------------ */

/** In-app notifications for supported interactions (reply, hug, reaction). */
export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    /** Who receives it. */
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    /** Who caused it (never shown for sensitive contexts). */
    actorId: bigint("actorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    actorName: varchar("actorName", { length: 60 }).notNull(),
    type: mysqlEnum("type", ["reply", "hug", "reaction", "message"]).notNull(),
    postId: bigint("postId", { mode: "number", unsigned: true }),
    /** The exact reply a notification refers to, when relevant. */
    replyId: bigint("replyId", { mode: "number", unsigned: true }),
    excerpt: varchar("excerpt", { length: 280 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ix_notifications_user").on(t.userId, t.createdAt)],
);

export const conversations = mysqlTable("conversations", {
  id: serial("id").primaryKey(),
  /** DM requests must be accepted before free chatting. */
  status: mysqlEnum("status", ["pending", "accepted", "declined"])
    .notNull()
    .default("pending"),
  /** The member who started the conversation — only the other side can accept/decline. */
  createdById: bigint("createdById", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const conversationMembers = mysqlTable(
  "conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => conversations.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    lastReadAt: timestamp("lastReadAt"),
  },
  (t) => [uniqueIndex("uq_member").on(t.conversationId, t.userId)],
);

export const messages = mysqlTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => conversations.id),
    senderId: bigint("senderId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    body: varchar("body", { length: 2000 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ix_messages_convo").on(t.conversationId, t.createdAt)],
);

/** Private by default — never exposed to other users. */
export const moodCheckins = mysqlTable(
  "mood_checkins",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    /** Local date key YYYY-MM-DD — one check-in per day per user. */
    date: varchar("date", { length: 10 }).notNull(),
    mood: varchar("mood", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_mood_day").on(t.userId, t.date)],
);

/** Private by default — owner-only reads. */
export const journalEntries = mysqlTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 120 }).notNull().default(""),
    body: text("body").notNull(),
    moodChip: varchar("moodChip", { length: 20 }),
    moodLabel: varchar("moodLabel", { length: 30 }),
    starred: boolean("starred").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_journal_user").on(t.userId, t.createdAt)],
);

export const blocks = mysqlTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: bigint("blockerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    blockedId: bigint("blockedId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_block").on(t.blockerId, t.blockedId)],
);

/* ------------------------------------------------------------------ */
/* Community stories — inspirational long-form posts, published only   */
/* after a moderator approves them.                                    */
/* ------------------------------------------------------------------ */
export const stories = mysqlTable(
  "stories",
  {
    id: serial("id").primaryKey(),
    authorId: bigint("authorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    authorAlias: varchar("authorAlias", { length: 80 }).notNull(),
    avatarColor: varchar("avatarColor", { length: 20 }).notNull().default("#8E7CC3"),
    title: varchar("title", { length: 160 }).notNull(),
    body: mediumtext("body").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    reviewerId: bigint("reviewerId", { mode: "number", unsigned: true }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ix_stories_status").on(t.status, t.createdAt)],
);

CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`photos_json` text DEFAULT '[]' NOT NULL,
	`linked_plan_id` text,
	`linked_plan_title` text,
	`linked_plan_schedules_json` text,
	`linked_plan_region` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `albums_user_id_idx` ON `albums` (`user_id`);--> statement-breakpoint
CREATE TABLE `diary_bookmarks` (
	`diary_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`diary_id`, `user_id`),
	FOREIGN KEY (`diary_id`) REFERENCES `travel_diaries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diary_bookmarks_user_id_idx` ON `diary_bookmarks` (`user_id`);--> statement-breakpoint
CREATE TABLE `diary_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`diary_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`content` text NOT NULL,
	`likes_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`diary_id`) REFERENCES `travel_diaries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diary_comments_diary_created_idx` ON `diary_comments` (`diary_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `diary_likes` (
	`diary_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`diary_id`, `user_id`),
	FOREIGN KEY (`diary_id`) REFERENCES `travel_diaries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diary_likes_user_id_idx` ON `diary_likes` (`user_id`);--> statement-breakpoint
CREATE TABLE `diary_tags` (
	`diary_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`diary_id`, `tag`),
	FOREIGN KEY (`diary_id`) REFERENCES `travel_diaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diary_tags_tag_idx` ON `diary_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`answer` text,
	`answered_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inquiries_user_id_idx` ON `inquiries` (`user_id`);--> statement-breakpoint
CREATE INDEX `inquiries_status_idx` ON `inquiries` (`status`);--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`trip_d3` integer DEFAULT true NOT NULL,
	`trip_dday` integer DEFAULT true NOT NULL,
	`likes` integer DEFAULT true NOT NULL,
	`comments` integer DEFAULT true NOT NULL,
	`shares` integer DEFAULT true NOT NULL,
	`popular_post` integer DEFAULT true NOT NULL,
	`inquiry_answer` integer DEFAULT true NOT NULL,
	`inquiry_new` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_name` text,
	`diary_id` text,
	`diary_title` text,
	`plan_id` text,
	`plan_title` text,
	`inquiry_id` text,
	`inquiry_title` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_read_idx` ON `notifications` (`recipient_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `notifications_type_diary_idx` ON `notifications` (`type`,`diary_id`);--> statement-breakpoint
CREATE INDEX `notifications_type_plan_idx` ON `notifications` (`type`,`plan_id`);--> statement-breakpoint
CREATE TABLE `passport_vault` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`salt` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `travel_diaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`display_mode` text DEFAULT 'grid' NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`main_photo_json` text,
	`blocks_json` text DEFAULT '[]' NOT NULL,
	`photos_json` text DEFAULT '[]' NOT NULL,
	`linked_plan_id` text,
	`linked_plan_title` text,
	`linked_plan_schedules_json` text,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`comments_count` integer DEFAULT 0 NOT NULL,
	`bookmarks_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `travel_diaries_user_id_idx` ON `travel_diaries` (`user_id`);--> statement-breakpoint
CREATE INDEX `travel_diaries_public_created_idx` ON `travel_diaries` (`is_public`,`created_at`);--> statement-breakpoint
CREATE INDEX `travel_diaries_public_likes_idx` ON `travel_diaries` (`is_public`,`likes_count`,`created_at`);--> statement-breakpoint
CREATE TABLE `travel_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`region` text NOT NULL,
	`cover_photo_key` text,
	`schedules_json` text DEFAULT '[]' NOT NULL,
	`budgets_json` text DEFAULT '[]' NOT NULL,
	`shopping_list_json` text DEFAULT '[]' NOT NULL,
	`accommodations_json` text DEFAULT '[]' NOT NULL,
	`flights_json` text DEFAULT '[]' NOT NULL,
	`preparation_checks_json` text DEFAULT '{}' NOT NULL,
	`total_budget_amount` integer,
	`travelers` integer,
	`allow_clone` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `travel_plans_user_id_idx` ON `travel_plans` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`photo_key` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`nickname` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_nickname_unique` ON `users` (`nickname`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
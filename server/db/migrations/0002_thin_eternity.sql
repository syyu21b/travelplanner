CREATE TABLE `email_verifications` (
	`email` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);

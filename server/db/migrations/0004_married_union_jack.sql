ALTER TABLE `payments` ADD `pg_provider` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `channel_name` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `pay_method` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `failure_reason` text;
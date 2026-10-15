CREATE TABLE `wa_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `wa_inbox_status_idx` ON `wa_inbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `wa_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`direction` text NOT NULL,
	`body` text NOT NULL,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wa_messages_phone_idx` ON `wa_messages` (`phone`,`created_at`);--> statement-breakpoint
CREATE TABLE `wa_sessions` (
	`phone` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`last_media_at` integer,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `whatsapp_phone` text;
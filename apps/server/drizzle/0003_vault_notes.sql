CREATE TABLE `file_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`note_id` text NOT NULL,
	`path` text NOT NULL,
	`temp_path` text,
	`before_sha256` text,
	`after_sha256` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`fold_key` text NOT NULL,
	`title` text NOT NULL,
	`content_sha256` text NOT NULL,
	`size` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`eol` text NOT NULL,
	`bom` integer NOT NULL,
	`read_only_reason` text,
	`missing_since` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_path_unique` ON `notes` (`path`);--> statement-breakpoint
CREATE INDEX `notes_fold_key_idx` ON `notes` (`fold_key`);--> statement-breakpoint
CREATE INDEX `notes_sha_idx` ON `notes` (`content_sha256`);
CREATE TABLE `note_aliases` (
	`note_id` text NOT NULL,
	`alias` text NOT NULL,
	`alias_key` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_aliases_key_idx` ON `note_aliases` (`alias_key`);--> statement-breakpoint
CREATE TABLE `note_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_note_id` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`anchor` text,
	`target_note_id` text,
	`state` text NOT NULL,
	FOREIGN KEY (`from_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_links_from_idx` ON `note_links` (`from_note_id`);--> statement-breakpoint
CREATE INDEX `note_links_target_idx` ON `note_links` (`target_note_id`);--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_tags_note_idx` ON `note_tags` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_tags_tag_idx` ON `note_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `notes_fts_map` (
	`rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_fts_map_note_id_unique` ON `notes_fts_map` (`note_id`);
CREATE TABLE `note_spaces` (
	`note_id` text NOT NULL,
	`space_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`note_id`, `space_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_spaces_space_idx` ON `note_spaces` (`space_id`);--> statement-breakpoint
ALTER TABLE `spaces` ADD `note_folder` text;
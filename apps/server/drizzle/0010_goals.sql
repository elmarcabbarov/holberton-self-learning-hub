CREATE TABLE `goal_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	`done_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_tasks_goal_idx` ON `goal_tasks` (`goal_id`,`position`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`title` text NOT NULL,
	`criteria` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `goals_space_idx` ON `goals` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `note_topics` (
	`note_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`note_id`, `topic_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_topics_topic_idx` ON `note_topics` (`topic_id`);
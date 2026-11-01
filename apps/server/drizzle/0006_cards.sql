CREATE TABLE `card_reviews` (
	`event_id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`scheduler` text NOT NULL,
	`prev_state` text NOT NULL,
	`next_state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_reviews_card_idx` ON `card_reviews` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text,
	`note_id` text,
	`block_anchor` text,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`origin` text NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`due` text NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`scheduled_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`state` integer NOT NULL,
	`last_review` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due`);--> statement-breakpoint
CREATE INDEX `cards_topic_idx` ON `cards` (`topic_id`);
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`objective` text DEFAULT '' NOT NULL,
	`space_id` text,
	`task_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`learned` text,
	`stuck` text,
	`next` text,
	`reflected_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `goal_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `study_sessions_started_idx` ON `study_sessions` (`started_at`);
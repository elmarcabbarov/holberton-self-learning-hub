CREATE TABLE `exam_mode` (
	`id` integer PRIMARY KEY NOT NULL,
	`exam_until` text
);
--> statement-breakpoint
CREATE TABLE `tutor_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`request_id` text,
	`reply_to` text,
	`payload_json` text,
	`kind` text NOT NULL,
	`lang` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`mode` text,
	`hint_level` integer,
	`approach_step` integer,
	`provider_id` text,
	`model` text,
	`revision` integer,
	`prompt_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `tutor_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_messages_id_unique` ON `tutor_messages` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_messages_reply_to_unique` ON `tutor_messages` (`reply_to`);--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_messages_request_unique` ON `tutor_messages` (`thread_id`,`request_id`) WHERE "tutor_messages"."role" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_messages_streaming_unique` ON `tutor_messages` (`thread_id`) WHERE "tutor_messages"."role" = 'assistant' AND "tutor_messages"."status" = 'streaming';--> statement-breakpoint
CREATE INDEX `tutor_messages_thread_seq_idx` ON `tutor_messages` (`thread_id`,`seq`);--> statement-breakpoint
CREATE TABLE `tutor_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`topic_id` text,
	`framework_json` text NOT NULL,
	`hint_level` integer DEFAULT 0 NOT NULL,
	`approach_step` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tutor_threads_space_topic_idx` ON `tutor_threads` (`space_id`,`topic_id`);--> statement-breakpoint
ALTER TABLE `spaces` ADD `tutor_mode` text;
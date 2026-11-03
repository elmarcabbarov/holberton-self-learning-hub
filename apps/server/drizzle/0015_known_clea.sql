CREATE TABLE `ai_draft_commits` (
	`commit_id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`selection_json` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `ai_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_draft_items` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`position` integer NOT NULL,
	`payload_json` text NOT NULL,
	`original_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`committed_ref` text,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `ai_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_draft_items_draft_idx` ON `ai_draft_items` (`draft_id`,`position`);--> statement-breakpoint
CREATE TABLE `ai_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`request_json` text NOT NULL,
	`note_id` text NOT NULL,
	`topic_id` text,
	`kind` text NOT NULL,
	`lang` text NOT NULL,
	`note_text` text NOT NULL,
	`note_sha256` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`dropped` integer DEFAULT 0 NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`revision` integer NOT NULL,
	`prompt_version` text NOT NULL,
	`locality` text NOT NULL,
	`consent_json` text,
	`consented_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_drafts_request_id_unique` ON `ai_drafts` (`request_id`);--> statement-breakpoint
CREATE INDEX `ai_drafts_note_idx` ON `ai_drafts` (`note_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cards` ADD `draft_item_id` text;
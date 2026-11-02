CREATE TABLE `vault_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_name` text NOT NULL,
	`prefix` text NOT NULL,
	`state` text NOT NULL,
	`entries_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`finished_at` text
);

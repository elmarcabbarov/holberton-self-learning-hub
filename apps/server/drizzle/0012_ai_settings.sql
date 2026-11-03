CREATE TABLE `ai_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'disabled' NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`max_output_tokens` integer DEFAULT 1024 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`key_binding` text,
	`probes_json` text,
	`probed_revision` integer,
	`probed_at` text
);

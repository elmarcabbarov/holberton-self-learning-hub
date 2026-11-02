DROP INDEX `notes_path_unique`;--> statement-breakpoint
ALTER TABLE `notes` ADD `vault` text DEFAULT 'hub' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `notes_vault_path_unique` ON `notes` (`vault`,`path`);--> statement-breakpoint
CREATE INDEX `notes_vault_fold_key_idx` ON `notes` (`vault`,`fold_key`);
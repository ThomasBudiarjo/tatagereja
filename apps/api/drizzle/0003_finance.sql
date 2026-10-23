ALTER TABLE `expense_requests` ADD `editor_user_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `offering_batch_lines` ADD `account_id` text REFERENCES finance_accounts(id);--> statement-breakpoint
ALTER TABLE `offering_batches` ADD `submitted_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `offering_batches` ADD `updated_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `offering_batches` ADD `editor_user_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_contributions_campaign_idx` ON `finance_contributions` (`campaign_id`);
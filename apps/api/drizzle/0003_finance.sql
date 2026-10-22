ALTER TABLE `offering_batches` ADD `submitted_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `offering_batches` ADD `updated_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `finance_contributions_campaign_idx` ON `finance_contributions` (`campaign_id`);
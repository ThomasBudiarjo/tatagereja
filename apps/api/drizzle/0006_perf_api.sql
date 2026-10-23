DROP INDEX `finance_contributions_church_received_idx`;--> statement-breakpoint
CREATE INDEX `finance_contributions_church_received_idx` ON `finance_contributions` (`church_id`,`received_at`,`created_at`,`voided_at`,`amount`);--> statement-breakpoint
DROP INDEX `finance_entries_church_date_idx`;--> statement-breakpoint
CREATE INDEX `finance_entries_church_balance_idx` ON `finance_entries` (`church_id`,`account_id`,`fund_id`,`voided_at`,`amount`);--> statement-breakpoint
CREATE INDEX `finance_entries_church_date_idx` ON `finance_entries` (`church_id`,`entry_date`,`voided_at`,`source_type`,`amount`,`account_id`,`fund_id`,`category_id`);--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `session_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `attendance_records_session_status_idx` ON `attendance_records` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `attendance_records_church_status_person_idx` ON `attendance_records` (`church_id`,`status`,`person_id`,`session_at`);
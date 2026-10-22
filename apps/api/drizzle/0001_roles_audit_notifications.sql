CREATE TABLE `church_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`permissions` text DEFAULT '[]' NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`template_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `church_roles_church_name_unique` ON `church_roles` (`church_id`,`name`);--> statement-breakpoint
CREATE INDEX `church_roles_church_idx` ON `church_roles` (`church_id`);--> statement-breakpoint
CREATE TABLE `membership_roles` (
	`membership_id` text NOT NULL,
	`role_id` text NOT NULL,
	`church_id` text NOT NULL,
	`assigned_by` text,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`membership_id`, `role_id`),
	FOREIGN KEY (`membership_id`) REFERENCES `church_memberships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `church_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `membership_roles_role_idx` ON `membership_roles` (`role_id`);--> statement-breakpoint
CREATE INDEX `membership_roles_church_idx` ON `membership_roles` (`church_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text,
	`actor_user_id` text,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`before` text,
	`after` text,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_church_created_idx` ON `audit_logs` (`church_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_church_module_idx` ON `audit_logs` (`church_id`,`module`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`church_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`in_app` integer DEFAULT true NOT NULL,
	`email` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `type`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_church_idx` ON `notifications` (`church_id`);--> statement-breakpoint
CREATE INDEX `notifications_entity_idx` ON `notifications` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `church_memberships` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `church_memberships` ADD `suspended_at` text;--> statement-breakpoint
ALTER TABLE `churches` ADD `currency` text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE `churches` ADD `timezone` text DEFAULT 'Asia/Jakarta' NOT NULL;--> statement-breakpoint
ALTER TABLE `churches` ADD `enabled_modules` text DEFAULT '["worship","care","records","finance","facilities","checkin"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `churches` ADD `settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `churches` ADD `role_templates_seeded_at` text;
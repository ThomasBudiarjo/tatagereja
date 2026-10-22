CREATE TABLE `event_series` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`group_id` text,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`frequency` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration_minutes` integer,
	`is_all_day` integer DEFAULT false NOT NULL,
	`until_date` text NOT NULL,
	`capacity` integer,
	`registration_required` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_series_church_idx` ON `event_series` (`church_id`);--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_events_user_created_idx` ON `login_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_events_email_created_idx` ON `login_events` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `two_factor_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`ip` text,
	`user_agent` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_challenges_token_hash_unique` ON `two_factor_challenges` (`token_hash`);--> statement-breakpoint
CREATE INDEX `two_factor_challenges_user_idx` ON `two_factor_challenges` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_recovery_codes_user_hash_unique` ON `user_recovery_codes` (`user_id`,`code_hash`);--> statement-breakpoint
CREATE INDEX `user_recovery_codes_user_idx` ON `user_recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_two_factor` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret_encrypted` text NOT NULL,
	`enabled_at` text,
	`last_used_step` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `area_coordinators` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`area_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `area_coordinators_area_user_unique` ON `area_coordinators` (`area_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `area_coordinators_user_idx` ON `area_coordinators` (`church_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`description` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `areas_church_name_unique` ON `areas` (`church_id`,`name`);--> statement-breakpoint
CREATE INDEX `areas_church_idx` ON `areas` (`church_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`help_text` text,
	`is_required` integer DEFAULT false NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_definitions_church_key_unique` ON `custom_field_definitions` (`church_id`,`key`);--> statement-breakpoint
CREATE INDEX `custom_field_definitions_church_idx` ON `custom_field_definitions` (`church_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`person_id` text NOT NULL,
	`field_id` text NOT NULL,
	`church_id` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`person_id`, `field_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `custom_field_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_field_values_field_value_idx` ON `custom_field_values` (`field_id`,`value`);--> statement-breakpoint
CREATE TABLE `group_join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`group_id` text NOT NULL,
	`person_id` text NOT NULL,
	`requested_by` text,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `group_join_requests_group_status_idx` ON `group_join_requests` (`group_id`,`status`);--> statement-breakpoint
CREATE INDEX `group_join_requests_person_idx` ON `group_join_requests` (`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `group_join_requests_pending_unique` ON `group_join_requests` (`group_id`,`person_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`household_id` text NOT NULL,
	`person_id` text NOT NULL,
	`relationship` text NOT NULL,
	`is_primary_contact` integer DEFAULT false NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_person_unique` ON `household_members` (`person_id`);--> statement-breakpoint
CREATE INDEX `household_members_household_idx` ON `household_members` (`household_id`);--> statement-breakpoint
CREATE INDEX `household_members_church_idx` ON `household_members` (`church_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`area_id` text,
	`address` text,
	`city` text,
	`postal_code` text,
	`phone` text,
	`photo_url` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `households_church_name_idx` ON `households` (`church_id`,`name`);--> statement-breakpoint
CREATE INDEX `households_area_idx` ON `households` (`area_id`);--> statement-breakpoint
CREATE TABLE `person_areas` (
	`person_id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`area_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_areas_area_idx` ON `person_areas` (`area_id`);--> statement-breakpoint
CREATE TABLE `person_privacy_settings` (
	`person_id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`show_phone` integer DEFAULT true NOT NULL,
	`show_email` integer DEFAULT true NOT NULL,
	`show_address` integer DEFAULT false NOT NULL,
	`show_birthday` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `person_tag_assignments` (
	`person_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`church_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`person_id`, `tag_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `person_tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_tag_assignments_tag_idx` ON `person_tag_assignments` (`tag_id`);--> statement-breakpoint
CREATE TABLE `person_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_tags_church_name_unique` ON `person_tags` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `announcement_audience_roles` (
	`announcement_id` text NOT NULL,
	`role_id` text NOT NULL,
	`church_id` text NOT NULL,
	PRIMARY KEY(`announcement_id`, `role_id`),
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `church_roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `announcement_audience_roles_role_idx` ON `announcement_audience_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `announcement_reads` (
	`announcement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`church_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`announcement_id`, `user_id`),
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `announcement_reads_user_idx` ON `announcement_reads` (`user_id`);--> statement-breakpoint
CREATE TABLE `bulletins` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`title` text NOT NULL,
	`issue_date` text NOT NULL,
	`theme` text,
	`cover_image_url` text,
	`sections` text DEFAULT '[]' NOT NULL,
	`include_finance_summary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bulletins_church_issue_idx` ON `bulletins` (`church_id`,`issue_date`);--> statement-breakpoint
CREATE TABLE `calendar_feed_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text,
	`sources` text DEFAULT '[]' NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feed_tokens_token_hash_unique` ON `calendar_feed_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `calendar_feed_tokens_user_idx` ON `calendar_feed_tokens` (`church_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `event_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`registered_by` text,
	`status` text NOT NULL,
	`party_size` integer DEFAULT 1 NOT NULL,
	`note` text,
	`promoted_at` text,
	`cancelled_at` text,
	`checked_in_at` text,
	`checked_in_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_in_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_registrations_event_person_unique` ON `event_registrations` (`event_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `event_registrations_event_status_idx` ON `event_registrations` (`event_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `event_registrations_person_idx` ON `event_registrations` (`person_id`);--> statement-breakpoint
CREATE TABLE `absence_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text NOT NULL,
	`streak` integer NOT NULL,
	`last_present_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`care_task_id` text,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`care_task_id`) REFERENCES `care_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `absence_alerts_church_person_unique` ON `absence_alerts` (`church_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `absence_alerts_church_status_idx` ON `absence_alerts` (`church_id`,`status`);--> statement-breakpoint
CREATE TABLE `dashboard_preferences` (
	`user_id` text NOT NULL,
	`church_id` text NOT NULL,
	`hidden_widgets` text DEFAULT '[]' NOT NULL,
	`widget_order` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `church_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `liturgy_items` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`service_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`duration_minutes` integer,
	`song_id` text,
	`song_key` text,
	`person_id` text,
	`person_name` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `worship_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `liturgy_items_service_position_idx` ON `liturgy_items` (`service_id`,`position`);--> statement-breakpoint
CREATE INDEX `liturgy_items_song_idx` ON `liturgy_items` (`song_id`);--> statement-breakpoint
CREATE TABLE `roster_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`service_id` text NOT NULL,
	`team_id` text NOT NULL,
	`position_id` text NOT NULL,
	`person_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decline_reason` text,
	`responded_at` text,
	`notified_at` text,
	`notes` text,
	`assigned_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `worship_services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `serving_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`position_id`) REFERENCES `serving_positions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_assignments_service_position_person_unique` ON `roster_assignments` (`service_id`,`position_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `roster_assignments_person_status_idx` ON `roster_assignments` (`person_id`,`status`);--> statement-breakpoint
CREATE INDEX `roster_assignments_church_service_idx` ON `roster_assignments` (`church_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `service_types` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`default_time` text,
	`default_duration_minutes` integer,
	`default_location` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_types_church_name_unique` ON `service_types` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `serving_member_positions` (
	`team_member_id` text NOT NULL,
	`position_id` text NOT NULL,
	`church_id` text NOT NULL,
	PRIMARY KEY(`team_member_id`, `position_id`),
	FOREIGN KEY (`team_member_id`) REFERENCES `serving_team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`position_id`) REFERENCES `serving_positions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `serving_member_positions_position_idx` ON `serving_member_positions` (`position_id`);--> statement-breakpoint
CREATE TABLE `serving_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`needed` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `serving_teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serving_positions_team_name_unique` ON `serving_positions` (`team_id`,`name`);--> statement-breakpoint
CREATE TABLE `serving_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`team_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `serving_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serving_team_members_team_person_unique` ON `serving_team_members` (`team_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `serving_team_members_person_idx` ON `serving_team_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `serving_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`group_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serving_teams_church_name_unique` ON `serving_teams` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`default_key` text,
	`tempo` integer,
	`lyrics` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`ccli_number` text,
	`hymnal` text,
	`hymnal_number` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `songs_church_title_idx` ON `songs` (`church_id`,`title`);--> statement-breakpoint
CREATE INDEX `songs_church_hymnal_idx` ON `songs` (`church_id`,`hymnal`,`hymnal_number`);--> statement-breakpoint
CREATE TABLE `volunteer_blockouts` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `volunteer_blockouts_person_start_idx` ON `volunteer_blockouts` (`person_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `worship_services` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`service_type_id` text,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`location` text,
	`theme` text,
	`scripture_readings` text DEFAULT '[]' NOT NULL,
	`preacher_person_id` text,
	`preacher_name` text,
	`notes` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`attendance_session_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_type_id`) REFERENCES `service_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`preacher_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`attendance_session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `worship_services_church_starts_idx` ON `worship_services` (`church_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `worship_services_type_idx` ON `worship_services` (`service_type_id`);--> statement-breakpoint
CREATE INDEX `worship_services_preacher_idx` ON `worship_services` (`preacher_person_id`);--> statement-breakpoint
CREATE TABLE `care_case_caregivers` (
	`case_id` text NOT NULL,
	`user_id` text NOT NULL,
	`church_id` text NOT NULL,
	`assigned_by` text,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `user_id`),
	FOREIGN KEY (`case_id`) REFERENCES `care_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `care_case_caregivers_user_idx` ON `care_case_caregivers` (`church_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `care_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text,
	`household_id` text,
	`category` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`confidentiality` text DEFAULT 'normal' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`next_action_date` text,
	`next_action_note` text,
	`reminder_sent_at` text,
	`closed_at` text,
	`closed_reason` text,
	`opened_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `care_cases_church_status_idx` ON `care_cases` (`church_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `care_cases_church_next_action_idx` ON `care_cases` (`church_id`,`next_action_date`);--> statement-breakpoint
CREATE INDEX `care_cases_person_idx` ON `care_cases` (`person_id`);--> statement-breakpoint
CREATE TABLE `care_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`case_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`body` text NOT NULL,
	`author_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `care_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `care_notes_case_created_idx` ON `care_notes` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_user_id` text,
	`follow_up_id` text,
	`case_id` text,
	`person_id` text,
	`completed_at` text,
	`completed_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`follow_up_id`) REFERENCES `visitor_follow_ups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `care_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `care_tasks_assignee_status_idx` ON `care_tasks` (`church_id`,`assigned_user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `care_tasks_follow_up_idx` ON `care_tasks` (`follow_up_id`);--> statement-breakpoint
CREATE INDEX `care_tasks_case_idx` ON `care_tasks` (`case_id`);--> statement-breakpoint
CREATE TABLE `care_visit_visitors` (
	`visit_id` text NOT NULL,
	`person_id` text NOT NULL,
	`church_id` text NOT NULL,
	PRIMARY KEY(`visit_id`, `person_id`),
	FOREIGN KEY (`visit_id`) REFERENCES `care_visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `care_visit_visitors_person_idx` ON `care_visit_visitors` (`person_id`);--> statement-breakpoint
CREATE TABLE `care_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`case_id` text,
	`person_id` text,
	`household_id` text,
	`visit_date` text NOT NULL,
	`location` text,
	`summary` text,
	`confidentiality` text DEFAULT 'normal' NOT NULL,
	`follow_up_needed` integer DEFAULT false NOT NULL,
	`follow_up_note` text,
	`other_visitors` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `care_cases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `care_visits_church_date_idx` ON `care_visits` (`church_id`,`visit_date`);--> statement-breakpoint
CREATE INDEX `care_visits_person_idx` ON `care_visits` (`person_id`);--> statement-breakpoint
CREATE INDEX `care_visits_case_idx` ON `care_visits` (`case_id`);--> statement-breakpoint
CREATE TABLE `diakonia_aid` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text,
	`household_id` text,
	`case_id` text,
	`recipient_name` text,
	`category` text NOT NULL,
	`form` text DEFAULT 'cash' NOT NULL,
	`description` text,
	`amount` integer,
	`given_at` text NOT NULL,
	`finance_reference` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`case_id`) REFERENCES `care_cases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `diakonia_aid_church_given_idx` ON `diakonia_aid` (`church_id`,`given_at`);--> statement-breakpoint
CREATE INDEX `diakonia_aid_person_idx` ON `diakonia_aid` (`person_id`);--> statement-breakpoint
CREATE TABLE `prayer_request_prayers` (
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`church_id` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`last_prayed_at` text NOT NULL,
	PRIMARY KEY(`request_id`, `user_id`),
	FOREIGN KEY (`request_id`) REFERENCES `prayer_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prayer_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text,
	`submitted_by` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'church' NOT NULL,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`moderation_status` text DEFAULT 'pending' NOT NULL,
	`moderated_by` text,
	`moderated_at` text,
	`moderation_note` text,
	`prayed_count` integer DEFAULT 0 NOT NULL,
	`answered_at` text,
	`testimony` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prayer_requests_church_status_idx` ON `prayer_requests` (`church_id`,`moderation_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `prayer_requests_submitter_idx` ON `prayer_requests` (`submitted_by`);--> statement-breakpoint
CREATE TABLE `visitor_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`source` text,
	`first_visit_date` text,
	`assigned_user_id` text,
	`notes` text,
	`closed_reason` text,
	`stage_changed_at` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visitor_follow_ups_church_stage_idx` ON `visitor_follow_ups` (`church_id`,`stage`);--> statement-breakpoint
CREATE INDEX `visitor_follow_ups_person_idx` ON `visitor_follow_ups` (`person_id`);--> statement-breakpoint
CREATE INDEX `visitor_follow_ups_assignee_idx` ON `visitor_follow_ups` (`assigned_user_id`);--> statement-breakpoint
CREATE TABLE `registry_record_people` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`record_id` text NOT NULL,
	`person_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `registry_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `registry_record_people_record_idx` ON `registry_record_people` (`record_id`,`position`);--> statement-breakpoint
CREATE INDEX `registry_record_people_person_idx` ON `registry_record_people` (`person_id`);--> statement-breakpoint
CREATE TABLE `registry_records` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`year` integer NOT NULL,
	`sequence` integer NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`place` text,
	`officiant_person_id` text,
	`officiant_name` text,
	`details` text DEFAULT '{}' NOT NULL,
	`document_url` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`officiant_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_records_church_type_year_sequence_unique` ON `registry_records` (`church_id`,`type`,`year`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `registry_records_church_number_unique` ON `registry_records` (`church_id`,`number`);--> statement-breakpoint
CREATE INDEX `registry_records_church_type_date_idx` ON `registry_records` (`church_id`,`type`,`date`);--> statement-breakpoint
CREATE TABLE `expense_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category_id` text NOT NULL,
	`fund_id` text NOT NULL,
	`amount` integer NOT NULL,
	`payee_name` text,
	`needed_by` text,
	`attachment_urls` text DEFAULT '[]' NOT NULL,
	`is_reimbursement` integer DEFAULT false NOT NULL,
	`reimburse_person_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`requested_by` text,
	`submitted_at` text,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text,
	`paid_at` text,
	`paid_by` text,
	`paid_from_account_id` text,
	`payment_reference` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reimburse_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`paid_from_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expense_requests_church_status_idx` ON `expense_requests` (`church_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `expense_requests_requester_idx` ON `expense_requests` (`requested_by`);--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`bank_name` text,
	`account_number` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_church_name_unique` ON `finance_accounts` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `finance_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`year` integer NOT NULL,
	`category_id` text NOT NULL,
	`amount` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_budgets_church_year_category_unique` ON `finance_budgets` (`church_id`,`year`,`category_id`);--> statement-breakpoint
CREATE TABLE `finance_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`fund_id` text NOT NULL,
	`target_amount` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_campaigns_church_idx` ON `finance_campaigns` (`church_id`,`status`);--> statement-breakpoint
CREATE TABLE `finance_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_categories_church_kind_name_unique` ON `finance_categories` (`church_id`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `finance_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text,
	`donor_name` text,
	`kind` text NOT NULL,
	`fund_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`campaign_id` text,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`received_at` text NOT NULL,
	`reference` text,
	`receipt_number` text,
	`note` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`recorded_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `finance_campaigns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finance_contributions_church_received_idx` ON `finance_contributions` (`church_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `finance_contributions_person_idx` ON `finance_contributions` (`person_id`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_contributions_church_receipt_unique` ON `finance_contributions` (`church_id`,`receipt_number`);--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`account_id` text NOT NULL,
	`fund_id` text NOT NULL,
	`category_id` text,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finance_entries_church_date_idx` ON `finance_entries` (`church_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `finance_entries_account_date_idx` ON `finance_entries` (`account_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `finance_entries_fund_idx` ON `finance_entries` (`fund_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_category_idx` ON `finance_entries` (`category_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_source_idx` ON `finance_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `finance_funds` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`description` text,
	`is_restricted` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_funds_church_name_unique` ON `finance_funds` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `finance_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`status` text NOT NULL,
	`closed_by` text,
	`closed_at` text NOT NULL,
	`reopened_by` text,
	`reopened_at` text,
	`reopen_reason` text,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reopened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_periods_church_year_month_unique` ON `finance_periods` (`church_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `finance_pledges` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`person_id` text,
	`donor_name` text,
	`amount` integer NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `finance_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finance_pledges_campaign_idx` ON `finance_pledges` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `finance_pledges_person_idx` ON `finance_pledges` (`person_id`);--> statement-breakpoint
CREATE TABLE `finance_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`fund_id` text NOT NULL,
	`amount` integer NOT NULL,
	`transfer_date` text NOT NULL,
	`note` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `finance_transfers_church_date_idx` ON `finance_transfers` (`church_id`,`transfer_date`);--> statement-breakpoint
CREATE TABLE `offering_batch_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`fund_id` text NOT NULL,
	`category_id` text,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`denominations` text DEFAULT '{}' NOT NULL,
	`note` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `offering_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id`) REFERENCES `finance_funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offering_batch_lines_batch_idx` ON `offering_batch_lines` (`batch_id`,`position`);--> statement-breakpoint
CREATE TABLE `offering_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`service_date` text NOT NULL,
	`worship_service_id` text,
	`service_label` text,
	`account_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_amount` integer DEFAULT 0 NOT NULL,
	`counter1_user_id` text,
	`counter1_name` text,
	`counter2_user_id` text,
	`counter2_name` text,
	`notes` text,
	`submitted_at` text,
	`verified_by` text,
	`verified_at` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worship_service_id`) REFERENCES `worship_services`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counter1_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`counter2_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offering_batches_church_date_idx` ON `offering_batches` (`church_id`,`service_date`);--> statement-breakpoint
CREATE INDEX `offering_batches_church_status_idx` ON `offering_batches` (`church_id`,`status`);--> statement-breakpoint
CREATE TABLE `asset_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`borrower_person_id` text,
	`borrower_name` text NOT NULL,
	`group_id` text,
	`checked_out_at` text NOT NULL,
	`due_date` text,
	`returned_at` text,
	`condition_out` text,
	`condition_in` text,
	`notes` text,
	`checked_out_by` text,
	`returned_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `inventory_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`borrower_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_out_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`returned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_loans_asset_idx` ON `asset_loans` (`asset_id`,`checked_out_at`);--> statement-breakpoint
CREATE INDEX `asset_loans_church_open_idx` ON `asset_loans` (`church_id`,`returned_at`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_loans_open_unique` ON `asset_loans` (`asset_id`) WHERE returned_at is null;--> statement-breakpoint
CREATE TABLE `asset_maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text DEFAULT 'service' NOT NULL,
	`description` text NOT NULL,
	`cost` integer,
	`performed_by` text,
	`next_due_date` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `inventory_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_maintenance_asset_date_idx` ON `asset_maintenance` (`asset_id`,`date`);--> statement-breakpoint
CREATE TABLE `facility_booking_exceptions` (
	`booking_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`church_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`booking_id`, `occurrence_date`),
	FOREIGN KEY (`booking_id`) REFERENCES `facility_bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `facility_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`title` text NOT NULL,
	`purpose` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`recurrence_until` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expected_attendees` integer,
	`group_id` text,
	`event_id` text,
	`requested_by` text,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text,
	`cancelled_at` text,
	`cancelled_by` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `facility_resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `facility_bookings_resource_starts_idx` ON `facility_bookings` (`resource_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `facility_bookings_church_status_idx` ON `facility_bookings` (`church_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `facility_bookings_requester_idx` ON `facility_bookings` (`requested_by`);--> statement-breakpoint
CREATE TABLE `facility_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'room' NOT NULL,
	`description` text,
	`location` text,
	`capacity` integer,
	`features` text DEFAULT '[]' NOT NULL,
	`photo_url` text,
	`color` text,
	`requires_approval` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facility_resources_church_name_unique` ON `facility_resources` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `inventory_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`description` text,
	`resource_id` text,
	`location` text,
	`condition` text DEFAULT 'good' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`acquisition_date` text,
	`acquisition_value` integer,
	`custodian_person_id` text,
	`serial_number` text,
	`photo_url` text,
	`notes` text,
	`retired_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `facility_resources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`custodian_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_assets_church_code_unique` ON `inventory_assets` (`church_id`,`code`);--> statement-breakpoint
CREATE INDEX `inventory_assets_church_category_idx` ON `inventory_assets` (`church_id`,`category`);--> statement-breakpoint
CREATE INDEX `inventory_assets_custodian_idx` ON `inventory_assets` (`custodian_person_id`);--> statement-breakpoint
CREATE TABLE `checkin_authorized_pickups` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`child_person_id` text NOT NULL,
	`pickup_person_id` text,
	`name` text NOT NULL,
	`relationship` text,
	`phone` text,
	`notes` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pickup_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checkin_authorized_pickups_child_idx` ON `checkin_authorized_pickups` (`child_person_id`);--> statement-breakpoint
CREATE TABLE `checkin_child_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`description` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checkin_child_alerts_person_idx` ON `checkin_child_alerts` (`person_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `checkin_child_profiles` (
	`person_id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`default_class_id` text,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_class_id`) REFERENCES `checkin_classes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `checkin_class_teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`class_id` text NOT NULL,
	`person_id` text NOT NULL,
	`is_lead` integer DEFAULT false NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `checkin_classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkin_class_teachers_class_person_unique` ON `checkin_class_teachers` (`class_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `checkin_class_teachers_person_idx` ON `checkin_class_teachers` (`person_id`);--> statement-breakpoint
CREATE TABLE `checkin_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`min_age` integer,
	`max_age` integer,
	`resource_id` text,
	`location` text,
	`capacity` integer,
	`max_children_per_teacher` integer,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `facility_resources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkin_classes_church_name_unique` ON `checkin_classes` (`church_id`,`name`);--> statement-breakpoint
CREATE TABLE `checkin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`worship_service_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`attendance_session_id` text,
	`opened_by` text,
	`opened_at` text NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worship_service_id`) REFERENCES `worship_services`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`attendance_session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checkin_sessions_church_date_idx` ON `checkin_sessions` (`church_id`,`date`);--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`session_id` text NOT NULL,
	`class_id` text NOT NULL,
	`child_person_id` text NOT NULL,
	`guardian_person_id` text,
	`security_code` text NOT NULL,
	`method` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'checked_in' NOT NULL,
	`checked_in_at` text NOT NULL,
	`checked_in_by` text,
	`checked_out_at` text,
	`checked_out_by` text,
	`pickup_person_id` text,
	`pickup_name` text,
	`override_reason` text,
	`label_printed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `checkin_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `checkin_classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guardian_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_in_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_out_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pickup_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_session_code_unique` ON `checkins` (`session_id`,`security_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_session_child_open_unique` ON `checkins` (`session_id`,`child_person_id`) WHERE status = 'checked_in';--> statement-breakpoint
CREATE INDEX `checkins_session_class_idx` ON `checkins` (`session_id`,`class_id`,`status`);--> statement-breakpoint
CREATE INDEX `checkins_child_idx` ON `checkins` (`child_person_id`,`checked_in_at`);--> statement-breakpoint
ALTER TABLE `announcements` ADD `audience` text DEFAULT 'church' NOT NULL;--> statement-breakpoint
ALTER TABLE `announcements` ADD `publish_at` text;--> statement-breakpoint
ALTER TABLE `announcements` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `announcements` ADD `pinned_at` text;--> statement-breakpoint
ALTER TABLE `announcements` ADD `cover_image_url` text;--> statement-breakpoint
ALTER TABLE `announcements` ADD `notified_at` text;--> statement-breakpoint
UPDATE `announcements` SET `audience` = 'group' WHERE `group_id` IS NOT NULL;--> statement-breakpoint
UPDATE `announcements` SET `notified_at` = `published_at` WHERE `status` = 'published';--> statement-breakpoint
CREATE INDEX `announcements_church_pinned_idx` ON `announcements` (`church_id`,`pinned_at`);--> statement-breakpoint
CREATE INDEX `announcements_group_idx` ON `announcements` (`group_id`);--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `mode` text DEFAULT 'roster' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `headcount_men` integer;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `headcount_women` integer;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `headcount_children` integer;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `headcount_visitors` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `series_id` text REFERENCES event_series(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `events` ADD `is_series_exception` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `cover_color` text;--> statement-breakpoint
ALTER TABLE `events` ADD `capacity` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `registration_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `registration_closes_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `waitlist_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `check_in_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `cancelled_at` text;--> statement-breakpoint
CREATE INDEX `events_series_idx` ON `events` (`series_id`,`starts_at`);--> statement-breakpoint
ALTER TABLE `groups` ADD `meeting_day` integer;--> statement-breakpoint
ALTER TABLE `groups` ADD `meeting_time` text;--> statement-breakpoint
ALTER TABLE `groups` ADD `meeting_frequency` text;--> statement-breakpoint
ALTER TABLE `groups` ADD `location` text;--> statement-breakpoint
ALTER TABLE `groups` ADD `capacity` integer;--> statement-breakpoint
ALTER TABLE `groups` ADD `cover_color` text;--> statement-breakpoint
ALTER TABLE `groups` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `join_policy` text DEFAULT 'request' NOT NULL;--> statement-breakpoint
CREATE INDEX `groups_church_type_idx` ON `groups` (`church_id`,`type`);--> statement-breakpoint
ALTER TABLE `people` ADD `wedding_date` text;--> statement-breakpoint
CREATE INDEX `people_church_name_idx` ON `people` (`church_id`,`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `people_church_status_idx` ON `people` (`church_id`,`membership_status`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip` text;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_failed_login_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` text;
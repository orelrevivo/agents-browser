CREATE TABLE `automation_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`task` text NOT NULL,
	`frequency` text NOT NULL,
	`time_of_day` text NOT NULL,
	`weekly_day` integer DEFAULT 1 NOT NULL,
	`timezone` text NOT NULL,
	`agent_ids` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

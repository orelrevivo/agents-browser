CREATE TABLE `browser_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`agent_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`current_step` text DEFAULT 'Queued' NOT NULL,
	`tab_ids` text DEFAULT '[]' NOT NULL,
	`progress` text DEFAULT '[]' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

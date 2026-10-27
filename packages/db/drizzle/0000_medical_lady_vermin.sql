CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`avatar_type` text DEFAULT 'icon' NOT NULL,
	`avatar_data` text DEFAULT 'sparkles' NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model` text DEFAULT 'gpt-4.1-mini' NOT NULL,
	`system_instructions` text DEFAULT '' NOT NULL,
	`goals` text DEFAULT '' NOT NULL,
	`custom_instructions` text DEFAULT '' NOT NULL,
	`temperature` real,
	`model_settings` text DEFAULT '{}' NOT NULL,
	`tool_permissions` text DEFAULT '{}' NOT NULL,
	`memory_preferences` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

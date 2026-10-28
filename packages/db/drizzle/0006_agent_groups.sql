CREATE TABLE `agent_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `allow_agent_messages` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_group_members` (
  `group_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `group_id` text;

CREATE TABLE `catalog_undo_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actorUserId` text NOT NULL,
	`action` text NOT NULL,
	`entityType` text NOT NULL,
	`inverse` text NOT NULL,
	`undone` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `undo_actor_idx` ON `catalog_undo_log` (`actorUserId`,`undone`,`createdAt`);
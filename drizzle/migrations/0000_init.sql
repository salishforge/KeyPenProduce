CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'client' NOT NULL,
	`phone` text,
	`stripeCustomerId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_role_idx` ON `user` (`role`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`supplierId` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`category` text,
	`unit` text DEFAULT 'each' NOT NULL,
	`imageKey` text,
	`defaultWholesaleCents` integer DEFAULT 0 NOT NULL,
	`defaultRetailCents` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `products_supplier_idx` ON `products` (`supplierId`);--> statement-breakpoint
CREATE INDEX `products_active_idx` ON `products` (`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_supplier_slug_uq` ON `products` (`supplierId`,`slug`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contactName` text,
	`email` text,
	`phone` text,
	`notes` text,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`windowId` text NOT NULL,
	`productId` text NOT NULL,
	`supplierId` text NOT NULL,
	`displayName` text NOT NULL,
	`unit` text NOT NULL,
	`priceCents` integer NOT NULL,
	`wholesaleCostCents` integer NOT NULL,
	`quantityAvailable` integer NOT NULL,
	`quantityReserved` integer DEFAULT 0 NOT NULL,
	`staysOpenAfterCutoff` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`windowId`) REFERENCES `ordering_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `listings_window_idx` ON `listings` (`windowId`);--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE INDEX `listings_supplier_idx` ON `listings` (`supplierId`);--> statement-breakpoint
CREATE UNIQUE INDEX `listings_window_product_uq` ON `listings` (`windowId`,`productId`);--> statement-breakpoint
CREATE TABLE `ordering_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`opensAt` integer NOT NULL,
	`closesAt` integer NOT NULL,
	`pickupDate` integer NOT NULL,
	`reopenForEveryone` integer DEFAULT false NOT NULL,
	`committedAt` integer,
	`reconciledAt` integer,
	`completedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `windows_status_idx` ON `ordering_windows` (`status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`windowId` text NOT NULL,
	`userId` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotalCents` integer DEFAULT 0 NOT NULL,
	`taxCents` integer DEFAULT 0 NOT NULL,
	`totalCents` integer DEFAULT 0 NOT NULL,
	`paymentStatus` text DEFAULT 'unpaid' NOT NULL,
	`paymentMethod` text,
	`pickupName` text,
	`stripeCheckoutSessionId` text,
	`stripePaymentLinkId` text,
	`stripePaymentLinkUrl` text,
	`stripePaymentIntentId` text,
	`committedAt` integer,
	`activatedAt` integer,
	`completedAt` integer,
	`paidAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`windowId`) REFERENCES `ordering_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `orders_window_idx` ON `orders` (`windowId`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`userId`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_window_user_uq` ON `orders` (`windowId`,`userId`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`listingId` text NOT NULL,
	`productId` text NOT NULL,
	`supplierId` text NOT NULL,
	`windowId` text NOT NULL,
	`displayName` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	`quantityFulfilled` integer,
	`unitPriceCents` integer NOT NULL,
	`unitWholesaleCostCents` integer NOT NULL,
	`lineSubtotalCents` integer NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`shortfallQuantity` integer DEFAULT 0 NOT NULL,
	`refundCents` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `reservations_order_idx` ON `reservations` (`orderId`);--> statement-breakpoint
CREATE INDEX `reservations_listing_idx` ON `reservations` (`listingId`);--> statement-breakpoint
CREATE INDEX `reservations_supplier_idx` ON `reservations` (`supplierId`);--> statement-breakpoint
CREATE INDEX `reservations_window_idx` ON `reservations` (`windowId`);--> statement-breakpoint
CREATE INDEX `reservations_listing_created_idx` ON `reservations` (`listingId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_order_listing_uq` ON `reservations` (`orderId`,`listingId`);--> statement-breakpoint
CREATE TABLE `window_access_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`windowId` text NOT NULL,
	`userId` text NOT NULL,
	`grantedByUserId` text NOT NULL,
	`expiresAt` integer,
	`reason` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`windowId`) REFERENCES `ordering_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `overrides_window_idx` ON `window_access_overrides` (`windowId`);--> statement-breakpoint
CREATE UNIQUE INDEX `overrides_window_user_uq` ON `window_access_overrides` (`windowId`,`userId`);--> statement-breakpoint
CREATE TABLE `pickup_sheet_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`sheetId` text NOT NULL,
	`productId` text NOT NULL,
	`displayName` text NOT NULL,
	`unit` text NOT NULL,
	`quantityOrdered` integer NOT NULL,
	`quantityReceived` integer,
	`unitCostCents` integer NOT NULL,
	`substitutionNotes` text,
	FOREIGN KEY (`sheetId`) REFERENCES `supplier_pickup_sheets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `pickup_lines_sheet_idx` ON `pickup_sheet_lines` (`sheetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_lines_sheet_product_uq` ON `pickup_sheet_lines` (`sheetId`,`productId`);--> statement-breakpoint
CREATE TABLE `supplier_pickup_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`windowId` text NOT NULL,
	`supplierId` text NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	`expectedCostCents` integer DEFAULT 0 NOT NULL,
	`actualCostCents` integer,
	`notes` text,
	`generatedAt` integer NOT NULL,
	`reconciledAt` integer,
	FOREIGN KEY (`windowId`) REFERENCES `ordering_windows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `pickup_sheets_window_idx` ON `supplier_pickup_sheets` (`windowId`);--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_sheets_window_supplier_uq` ON `supplier_pickup_sheets` (`windowId`,`supplierId`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`direction` text NOT NULL,
	`amountCents` integer NOT NULL,
	`orderId` text,
	`reservationId` text,
	`supplierId` text,
	`windowId` text,
	`paymentId` text,
	`stripeObjectId` text,
	`memo` text,
	`createdByUserId` text,
	`occurredAt` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_type_idx` ON `ledger_entries` (`type`);--> statement-breakpoint
CREATE INDEX `ledger_order_idx` ON `ledger_entries` (`orderId`);--> statement-breakpoint
CREATE INDEX `ledger_window_idx` ON `ledger_entries` (`windowId`);--> statement-breakpoint
CREATE INDEX `ledger_supplier_idx` ON `ledger_entries` (`supplierId`);--> statement-breakpoint
CREATE INDEX `ledger_occurred_idx` ON `ledger_entries` (`occurredAt`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`provider` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amountCents` integer NOT NULL,
	`feeCents` integer DEFAULT 0 NOT NULL,
	`netCents` integer DEFAULT 0 NOT NULL,
	`refundedCents` integer DEFAULT 0 NOT NULL,
	`stripePaymentIntentId` text,
	`stripeChargeId` text,
	`recordedByUserId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_intent_uq` ON `payments` (`stripePaymentIntentId`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processedAt` integer NOT NULL
);

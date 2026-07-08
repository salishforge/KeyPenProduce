CREATE TABLE `product_suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`productId` text NOT NULL,
	`supplierId` text NOT NULL,
	`wholesaleCostCents` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `product_suppliers_product_idx` ON `product_suppliers` (`productId`);--> statement-breakpoint
CREATE INDEX `product_suppliers_supplier_idx` ON `product_suppliers` (`supplierId`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_suppliers_product_supplier_uq` ON `product_suppliers` (`productId`,`supplierId`);--> statement-breakpoint
-- Backfill: give every existing product a link to its current supplier, carrying
-- its wholesale cost. MUST run before the products table is recreated below
-- (which drops the supplierId column).
INSERT INTO `product_suppliers` ("id", "productId", "supplierId", "wholesaleCostCents", "isActive", "createdAt", "updatedAt")
SELECT 'ps_' || "id", "id", "supplierId", "defaultWholesaleCents", 1, "createdAt", "updatedAt" FROM `products`;--> statement-breakpoint
-- Recreate products WITHOUT supplierId (SQLite can't DROP a FK column in place).
-- defer_foreign_keys (unlike foreign_keys=OFF) is honored inside D1's migration
-- transaction: FK checks are deferred to COMMIT, where every product id still
-- resolves because the ids are preserved through the copy + rename.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`category` text,
	`preservationSlug` text,
	`unit` text DEFAULT 'each' NOT NULL,
	`imageKey` text,
	`defaultWholesaleCents` integer DEFAULT 0 NOT NULL,
	`defaultRetailCents` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "name", "slug", "description", "category", "preservationSlug", "unit", "imageKey", "defaultWholesaleCents", "defaultRetailCents", "isActive", "createdAt", "updatedAt") SELECT "id", "name", "slug", "description", "category", "preservationSlug", "unit", "imageKey", "defaultWholesaleCents", "defaultRetailCents", "isActive", "createdAt", "updatedAt" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
CREATE INDEX `products_active_idx` ON `products` (`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_uq` ON `products` (`slug`);

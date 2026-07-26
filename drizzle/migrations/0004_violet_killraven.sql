ALTER TABLE `reservations` ADD `paidStatus` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `paidAt` integer;--> statement-breakpoint
-- Backfill per-line payment state from the order it belongs to, so orders that
-- were already paid before this migration keep an accurate manifest.
--   online_card                -> prepaid        (paid in advance)
--   cash / in_person_card      -> paid_at_pickup (settled at the desk)
--   anything unpaid/refunded   -> unpaid         (the column default)
UPDATE `reservations`
SET `paidStatus` = 'prepaid',
    `paidAt` = (SELECT `paidAt` FROM `orders` WHERE `orders`.`id` = `reservations`.`orderId`)
WHERE `orderId` IN (
  SELECT `id` FROM `orders`
  WHERE `paymentStatus` = 'paid' AND `paymentMethod` = 'online_card'
);--> statement-breakpoint
UPDATE `reservations`
SET `paidStatus` = 'paid_at_pickup',
    `paidAt` = (SELECT `paidAt` FROM `orders` WHERE `orders`.`id` = `reservations`.`orderId`)
WHERE `orderId` IN (
  SELECT `id` FROM `orders`
  WHERE `paymentStatus` = 'paid' AND `paymentMethod` IN ('cash', 'in_person_card')
);

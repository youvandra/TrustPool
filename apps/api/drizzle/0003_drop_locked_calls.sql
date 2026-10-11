DROP TABLE "callers" CASCADE;--> statement-breakpoint
DROP TABLE "calls" CASCADE;--> statement-breakpoint
DROP TABLE "early_buyer_scans" CASCADE;--> statement-breakpoint
DROP TABLE "early_buyers" CASCADE;--> statement-breakpoint
DROP TABLE "prices" CASCADE;--> statement-breakpoint
DROP TABLE "slashes" CASCADE;--> statement-breakpoint
DROP TABLE "tokens" CASCADE;--> statement-breakpoint
-- Pooled calls replace locked calls on a new TrustPool deployment. Chain data is rebuilt by
-- indexing it from its start block, so the cursor and the deployment binding go too. Watches
-- and alerts point at call ids of the old deployment; profiles and follows (by address) stay.
DELETE FROM "meta";--> statement-breakpoint
DELETE FROM "watches";--> statement-breakpoint
DELETE FROM "alerts";

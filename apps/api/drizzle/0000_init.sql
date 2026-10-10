CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"call_id" integer NOT NULL,
	"at" bigint NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	CONSTRAINT "alerts_once" UNIQUE("user_id","kind","call_id")
);
--> statement-breakpoint
CREATE TABLE "callers" (
	"address" text PRIMARY KEY NOT NULL,
	"bond_wei" numeric(78, 0) DEFAULT '0' NOT NULL,
	"bond" double precision DEFAULT 0 NOT NULL,
	"withdraw_ready_at" bigint,
	"first_seen" bigint NOT NULL,
	"settled" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"released" integer DEFAULT 0 NOT NULL,
	"open" integer DEFAULT 0 NOT NULL,
	"slashes" integer DEFAULT 0 NOT NULL,
	"stale" integer DEFAULT 0 NOT NULL,
	"sum_return_bps" bigint DEFAULT 0 NOT NULL,
	"last_active" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" integer PRIMARY KEY NOT NULL,
	"caller" text NOT NULL,
	"token" text NOT NULL,
	"adapter" text NOT NULL,
	"mon_in_wei" numeric(78, 0) NOT NULL,
	"tokens_wei" numeric(78, 0) NOT NULL,
	"mon_out_wei" numeric(78, 0),
	"mon_in" double precision NOT NULL,
	"tokens" double precision NOT NULL,
	"mon_out" double precision,
	"opened_at" bigint NOT NULL,
	"unlock_at" bigint NOT NULL,
	"notice" bigint NOT NULL,
	"announced_at" bigint,
	"exit_at" bigint,
	"closed_at" bigint,
	"state" text NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"return_bps" integer,
	"thesis" text NOT NULL,
	"marked_value" double precision,
	"marked_at" bigint,
	"open_tx" text NOT NULL,
	"open_block" bigint
);
--> statement-breakpoint
CREATE TABLE "early_buyer_scans" (
	"call_id" integer PRIMARY KEY NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "early_buyers" (
	"call_id" integer NOT NULL,
	"wallet" text NOT NULL,
	"amount" double precision NOT NULL,
	"first_block" bigint NOT NULL,
	"transfers" integer NOT NULL,
	CONSTRAINT "early_buyers_call_id_wallet_pk" PRIMARY KEY("call_id","wallet")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" text NOT NULL,
	"caller" text NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "follows_user_id_caller_pk" PRIMARY KEY("user_id","caller")
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"call_id" integer NOT NULL,
	"at" bigint NOT NULL,
	"price" double precision NOT NULL,
	CONSTRAINT "prices_call_id_at_pk" PRIMARY KEY("call_id","at")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"address" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"bio" text NOT NULL,
	"signed_at" bigint NOT NULL,
	CONSTRAINT "profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "slashes" (
	"id" serial PRIMARY KEY NOT NULL,
	"caller" text NOT NULL,
	"amount" double precision NOT NULL,
	"reason" text NOT NULL,
	"at" bigint NOT NULL,
	"tx" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"address" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"decimals" integer NOT NULL,
	"hue" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"user_id" text NOT NULL,
	"call_id" integer NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "watches_user_id_call_id_pk" PRIMARY KEY("user_id","call_id")
);
--> statement-breakpoint
ALTER TABLE "early_buyer_scans" ADD CONSTRAINT "early_buyer_scans_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_buyers" ADD CONSTRAINT "early_buyers_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_user" ON "alerts" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "calls_caller" ON "calls" USING btree ("caller");--> statement-breakpoint
CREATE INDEX "calls_state" ON "calls" USING btree ("state");--> statement-breakpoint
CREATE INDEX "follows_caller" ON "follows" USING btree ("caller");--> statement-breakpoint
CREATE INDEX "slashes_caller" ON "slashes" USING btree ("caller");--> statement-breakpoint
CREATE INDEX "watches_call" ON "watches" USING btree ("call_id");
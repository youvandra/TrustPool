CREATE TABLE "callers" (
	"address" text PRIMARY KEY NOT NULL,
	"bond_wei" numeric(78, 0) DEFAULT '0' NOT NULL,
	"bond" double precision DEFAULT 0 NOT NULL,
	"withdraw_ready_at" bigint,
	"first_seen" bigint NOT NULL,
	"settled" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"negligent" integer DEFAULT 0 NOT NULL,
	"refunded" integer DEFAULT 0 NOT NULL,
	"split" integer DEFAULT 0 NOT NULL,
	"slashes" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 0 NOT NULL,
	"sum_net_bps" bigint DEFAULT 0 NOT NULL,
	"last_active" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" integer PRIMARY KEY NOT NULL,
	"caller" text NOT NULL,
	"token" text NOT NULL,
	"adapter" text NOT NULL,
	"tier" integer NOT NULL,
	"thesis" text NOT NULL,
	"opened_at" bigint NOT NULL,
	"state" text NOT NULL,
	"window_end" bigint NOT NULL,
	"buy_deadline" bigint NOT NULL,
	"max_hold" bigint NOT NULL,
	"take_profit_bps" integer NOT NULL,
	"stop_loss_bps" integer NOT NULL,
	"share_bps" integer NOT NULL,
	"min_caller_bps" integer NOT NULL,
	"max_impact_bps" integer NOT NULL,
	"sell_tolerance_bps" integer NOT NULL,
	"keeper_bps" integer NOT NULL,
	"checkpoint_gap" bigint NOT NULL,
	"split_grace" bigint NOT NULL,
	"cap_wei" numeric(78, 0) NOT NULL,
	"cap" double precision NOT NULL,
	"min_pool_wei" numeric(78, 0) NOT NULL,
	"min_pool" double precision NOT NULL,
	"total_in_wei" numeric(78, 0) DEFAULT '0' NOT NULL,
	"total_in" double precision DEFAULT 0 NOT NULL,
	"caller_stake_wei" numeric(78, 0) DEFAULT '0' NOT NULL,
	"caller_stake" double precision DEFAULT 0 NOT NULL,
	"depositors" integer DEFAULT 0 NOT NULL,
	"live_cap" double precision,
	"closing_alerted" boolean DEFAULT false NOT NULL,
	"tokens_wei" numeric(78, 0),
	"tokens" double precision,
	"bought_at" bigint,
	"hold_until" bigint,
	"buy_block" bigint,
	"prev_value" double precision,
	"prev_at" bigint,
	"last_value_wei" numeric(78, 0),
	"last_value" double precision,
	"last_at" bigint,
	"sale_reason" text,
	"keeper" text,
	"gross_wei" numeric(78, 0),
	"gross" double precision,
	"keeper_reward" double precision,
	"fee_wei" numeric(78, 0),
	"fee" double precision,
	"payout_wei" numeric(78, 0),
	"payout" double precision,
	"net_return_bps" integer,
	"negligent" boolean,
	"closed_at" bigint,
	"marked_value" double precision,
	"marked_at" bigint,
	"open_tx" text NOT NULL,
	"open_block" bigint
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"call_id" integer NOT NULL,
	"account" text NOT NULL,
	"mon_wei" numeric(78, 0) NOT NULL,
	"mon" double precision NOT NULL,
	"tokens_wei" numeric(78, 0) NOT NULL,
	"tokens" double precision NOT NULL,
	"at" bigint NOT NULL,
	"tx" text NOT NULL,
	CONSTRAINT "claims_call_id_account_pk" PRIMARY KEY("call_id","account")
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"call_id" integer NOT NULL,
	"account" text NOT NULL,
	"deposit_wei" numeric(78, 0) NOT NULL,
	"deposit" double precision NOT NULL,
	"first_at" bigint NOT NULL,
	"last_at" bigint NOT NULL,
	CONSTRAINT "deposits_call_id_account_pk" PRIMARY KEY("call_id","account")
);
--> statement-breakpoint
CREATE TABLE "early_buyer_scans" (
	"call_id" integer PRIMARY KEY NOT NULL,
	"from_block" bigint NOT NULL,
	"to_block" bigint NOT NULL,
	"at" bigint NOT NULL,
	"funding_checked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "early_buyers" (
	"call_id" integer NOT NULL,
	"wallet" text NOT NULL,
	"amount" double precision NOT NULL,
	"first_block" bigint NOT NULL,
	"transfers" integer NOT NULL,
	"funded_by_caller" boolean DEFAULT false NOT NULL,
	CONSTRAINT "early_buyers_call_id_wallet_pk" PRIMARY KEY("call_id","wallet")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"call_id" integer NOT NULL,
	"at" bigint NOT NULL,
	"price" double precision NOT NULL,
	CONSTRAINT "prices_call_id_at_pk" PRIMARY KEY("call_id","at")
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
	"hue" integer NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_buyer_scans" ADD CONSTRAINT "early_buyer_scans_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_buyers" ADD CONSTRAINT "early_buyers_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_caller" ON "calls" USING btree ("caller");--> statement-breakpoint
CREATE INDEX "calls_state" ON "calls" USING btree ("state");--> statement-breakpoint
CREATE INDEX "deposits_account" ON "deposits" USING btree ("account");--> statement-breakpoint
CREATE INDEX "slashes_caller" ON "slashes" USING btree ("caller");
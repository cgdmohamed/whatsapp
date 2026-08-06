CREATE TABLE IF NOT EXISTS "budget_override_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_policy_id" uuid NOT NULL,
	"related_campaign_id" uuid,
	"related_message_id" uuid,
	"requested_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"reason" text NOT NULL,
	"amount_before" numeric(14, 4),
	"amount_after" numeric(14, 4),
	"currency" varchar(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"scope_type" varchar(30) NOT NULL,
	"scope_id" uuid,
	"currency" varchar(3) NOT NULL,
	"period_type" varchar(30) NOT NULL,
	"amount_limit" numeric(14, 4) NOT NULL,
	"warning_threshold_percentage" integer DEFAULT 70 NOT NULL,
	"critical_threshold_percentage" integer DEFAULT 90 NOT NULL,
	"hard_stop_enabled" boolean DEFAULT true NOT NULL,
	"allow_admin_override" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_usage_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_policy_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"estimated_usage" numeric(14, 4) DEFAULT '0' NOT NULL,
	"confirmed_usage" numeric(14, 4) DEFAULT '0' NOT NULL,
	"adjusted_usage" numeric(14, 4) DEFAULT '0' NOT NULL,
	"remaining_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_entry_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"whatsapp_phone_number_id" varchar(100),
	"source_type" varchar(40) NOT NULL,
	"source_reference" varchar(255),
	"source_message_id" varchar(200),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid,
	"outcome" varchar(30) NOT NULL,
	"revenue_amount" numeric(14, 4),
	"revenue_currency" varchar(3),
	"notes" text,
	"recorded_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cost_reconciliation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(40) DEFAULT 'CSV' NOT NULL,
	"original_filename" varchar(255),
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"currency" varchar(3),
	"status" varchar(20) DEFAULT 'UPLOADED' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"matched_rows" integer DEFAULT 0 NOT NULL,
	"unmatched_rows" integer DEFAULT 0 NOT NULL,
	"adjusted_rows" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_cost_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_cost_id" uuid NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"previous_status" varchar(20),
	"new_status" varchar(20),
	"previous_amount" numeric(14, 4),
	"new_amount" numeric(14, 4),
	"currency" varchar(3),
	"reason" text,
	"source" varchar(60),
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"campaign_id" uuid,
	"campaign_recipient_id" uuid,
	"conversation_id" uuid,
	"contact_id" uuid,
	"whatsapp_phone_number_id" varchar(100),
	"pricing_rule_id" uuid,
	"recipient_market" varchar(20),
	"recipient_country" varchar(2),
	"message_category" varchar(30) NOT NULL,
	"billing_model" varchar(20) NOT NULL,
	"currency" varchar(3),
	"unit_price" numeric(14, 4),
	"input_token_count" integer,
	"output_token_count" integer,
	"estimated_cost" numeric(14, 4),
	"confirmed_cost" numeric(14, 4),
	"adjusted_cost" numeric(14, 4),
	"final_cost" numeric(14, 4),
	"calculation_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"charge_status" varchar(20) DEFAULT 'UNKNOWN' NOT NULL,
	"free_reason" varchar(40),
	"customer_service_window_open" boolean,
	"free_entry_point_window_open" boolean,
	"cost_calculated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"adjusted_at" timestamp with time zone,
	"adjustment_reason" text,
	"adjusted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(100) DEFAULT 'Meta' NOT NULL,
	"description" text,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"source_type" varchar(30) DEFAULT 'MANUAL' NOT NULL,
	"source_reference" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pricing_rule_set_id" uuid NOT NULL,
	"market_code" varchar(20) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"message_category" varchar(30) NOT NULL,
	"message_type" varchar(40) DEFAULT '*' NOT NULL,
	"billing_model" varchar(20) NOT NULL,
	"unit_price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"token_input_price" numeric(14, 6),
	"token_output_price" numeric(14, 6),
	"minimum_charge" numeric(14, 4),
	"currency" varchar(3) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"customer_service_window_required" boolean DEFAULT false NOT NULL,
	"free_entry_point_eligible" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "recipient_market" varchar(20);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "recipient_country" varchar(2);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "message_category" varchar(30);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "estimated_cost" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "final_cost" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "charge_status" varchar(20);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "free_reason" varchar(40);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricing_rule_set_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "estimated_cost" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "final_cost" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cost_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricing_calculated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricing_warning_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricing_warning_acknowledged_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "service_window_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "service_window_source_message_id" varchar(200);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_override_events" ADD CONSTRAINT "budget_override_events_budget_policy_id_budget_policies_id_fk" FOREIGN KEY ("budget_policy_id") REFERENCES "public"."budget_policies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_override_events" ADD CONSTRAINT "budget_override_events_related_campaign_id_campaigns_id_fk" FOREIGN KEY ("related_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_override_events" ADD CONSTRAINT "budget_override_events_related_message_id_messages_id_fk" FOREIGN KEY ("related_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_override_events" ADD CONSTRAINT "budget_override_events_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_override_events" ADD CONSTRAINT "budget_override_events_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_usage_snapshots" ADD CONSTRAINT "budget_usage_snapshots_budget_policy_id_budget_policies_id_fk" FOREIGN KEY ("budget_policy_id") REFERENCES "public"."budget_policies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_entry_windows" ADD CONSTRAINT "conversation_entry_windows_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_entry_windows" ADD CONSTRAINT "conversation_entry_windows_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_outcomes" ADD CONSTRAINT "conversation_outcomes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_outcomes" ADD CONSTRAINT "conversation_outcomes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_outcomes" ADD CONSTRAINT "conversation_outcomes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_outcomes" ADD CONSTRAINT "conversation_outcomes_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cost_reconciliation_jobs" ADD CONSTRAINT "cost_reconciliation_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_cost_events" ADD CONSTRAINT "message_cost_events_message_cost_id_message_costs_id_fk" FOREIGN KEY ("message_cost_id") REFERENCES "public"."message_costs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_cost_events" ADD CONSTRAINT "message_cost_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_campaign_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("campaign_recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_pricing_rule_id_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_costs" ADD CONSTRAINT "message_costs_adjusted_by_user_id_users_id_fk" FOREIGN KEY ("adjusted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rule_sets" ADD CONSTRAINT "pricing_rule_sets_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_pricing_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("pricing_rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_override_policy_idx" ON "budget_override_events" USING btree ("budget_policy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_policies_scope_idx" ON "budget_policies" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_policies_status_idx" ON "budget_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_usage_policy_idx" ON "budget_usage_snapshots" USING btree ("budget_policy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_usage_period_idx" ON "budget_usage_snapshots" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_windows_contact_idx" ON "conversation_entry_windows" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_windows_conversation_idx" ON "conversation_entry_windows" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_windows_status_idx" ON "conversation_entry_windows" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_windows_expires_idx" ON "conversation_entry_windows" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_outcomes_conversation_idx" ON "conversation_outcomes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_outcomes_campaign_idx" ON "conversation_outcomes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_reconciliation_status_idx" ON "cost_reconciliation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_reconciliation_created_idx" ON "cost_reconciliation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_cost_events_cost_idx" ON "message_cost_events" USING btree ("message_cost_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_cost_events_created_at_idx" ON "message_cost_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_costs_message_id_idx" ON "message_costs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_campaign_idx" ON "message_costs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_conversation_idx" ON "message_costs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_contact_idx" ON "message_costs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_calculated_at_idx" ON "message_costs" USING btree ("cost_calculated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_category_idx" ON "message_costs" USING btree ("message_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_charge_status_idx" ON "message_costs" USING btree ("charge_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_costs_market_idx" ON "message_costs" USING btree ("recipient_market");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_status_idx" ON "pricing_rule_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_effective_from_idx" ON "pricing_rule_sets" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rule_sets_currency_idx" ON "pricing_rule_sets" USING btree ("currency");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rules_set_idx" ON "pricing_rules" USING btree ("pricing_rule_set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rules_market_idx" ON "pricing_rules" USING btree ("market_code","country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rules_category_idx" ON "pricing_rules" USING btree ("message_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_rules_effective_idx" ON "pricing_rules" USING btree ("effective_from","effective_to");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pricing_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("pricing_rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pricing_warning_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("pricing_warning_acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

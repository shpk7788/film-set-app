CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'sent_back', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."approval_step" AS ENUM('pm', 'ep', 'reopen');--> statement-breakpoint
CREATE TYPE "public"."code_purpose" AS ENUM('join', 'reset');--> statement-breakpoint
CREATE TYPE "public"."crew_category" AS ENUM('artist', 'crew', 'junior_artist');--> statement-breakpoint
CREATE TYPE "public"."crew_list_status" AS ENUM('draft', 'awaiting_pm', 'awaiting_ep', 'locked');--> statement-breakpoint
CREATE TYPE "public"."deal_type" AS ENUM('per_day', 'package');--> statement-breakpoint
CREATE TYPE "public"."film_role" AS ENUM('producer', 'executive_producer', 'production_manager', 'production_team', 'director', 'co_director', 'first_ad', 'second_ad', 'direction_intern', 'department_head', 'department_crew', 'actor');--> statement-breakpoint
CREATE TYPE "public"."film_status" AS ENUM('shooting', 'wrapped');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'sent');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_list_id" uuid NOT NULL,
	"step" "approval_step" NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"note" text,
	"membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid,
	"actor_person_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"deal_type" "deal_type" NOT NULL,
	"rate_paise" bigint,
	"total_paise" bigint,
	"signed_on" date,
	"notes" text,
	CONSTRAINT "contracts_membership_id_unique" UNIQUE("membership_id")
);
--> statement-breakpoint
CREATE TABLE "crew_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_list_id" uuid NOT NULL,
	"membership_id" uuid,
	"label" text NOT NULL,
	"category" "crew_category" NOT NULL,
	"department_id" uuid,
	"headcount" integer DEFAULT 1 NOT NULL,
	"called_tenths" integer DEFAULT 10 NOT NULL,
	"worked_tenths" integer DEFAULT 10 NOT NULL,
	"released_at" text,
	"release_reason" text,
	"released_by_membership_id" uuid,
	"present" boolean DEFAULT true NOT NULL,
	"added_on_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"shoot_day_id" uuid NOT NULL,
	"status" "crew_list_status" DEFAULT 'draft' NOT NULL,
	"sent_back_note" text,
	"locked_at" timestamp with time zone,
	CONSTRAINT "crew_lists_shoot_day_id_unique" UNIQUE("shoot_day_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "films" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "film_status" DEFAULT 'shooting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"person_id" uuid,
	"display_name" text NOT NULL,
	"role" "film_role" NOT NULL,
	"department_id" uuid,
	"character_name" text,
	"phone" text,
	"can_see_script" boolean DEFAULT false NOT NULL,
	"can_see_contacts" boolean DEFAULT false NOT NULL,
	"allow_screenshots" boolean DEFAULT false NOT NULL,
	"access_ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_reads" (
	"notice_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"text" text NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shoot_day_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"change_summary" jsonb,
	"edited_by_membership_id" uuid,
	"sent_by_membership_id" uuid,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"current_film_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoot_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"date" date NOT NULL,
	"live_item_key" text,
	"live_note" text,
	"live_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"film_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"purpose" "code_purpose" DEFAULT 'join' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_crew_list_id_crew_lists_id_fk" FOREIGN KEY ("crew_list_id") REFERENCES "public"."crew_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_version_id_program_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."program_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_entries" ADD CONSTRAINT "crew_entries_crew_list_id_crew_lists_id_fk" FOREIGN KEY ("crew_list_id") REFERENCES "public"."crew_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_entries" ADD CONSTRAINT "crew_entries_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_entries" ADD CONSTRAINT "crew_entries_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_entries" ADD CONSTRAINT "crew_entries_released_by_membership_id_memberships_id_fk" FOREIGN KEY ("released_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_lists" ADD CONSTRAINT "crew_lists_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_lists" ADD CONSTRAINT "crew_lists_shoot_day_id_shoot_days_id_fk" FOREIGN KEY ("shoot_day_id") REFERENCES "public"."shoot_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "films" ADD CONSTRAINT "films_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_shoot_day_id_shoot_days_id_fk" FOREIGN KEY ("shoot_day_id") REFERENCES "public"."shoot_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_edited_by_membership_id_memberships_id_fk" FOREIGN KEY ("edited_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_sent_by_membership_id_memberships_id_fk" FOREIGN KEY ("sent_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_current_film_id_films_id_fk" FOREIGN KEY ("current_film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoot_days" ADD CONSTRAINT "shoot_days_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_film_time" ON "audit_log" USING btree ("film_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "confirmations_version_member" ON "confirmations" USING btree ("version_id","membership_id");--> statement-breakpoint
CREATE INDEX "crew_entries_list" ON "crew_entries" USING btree ("crew_list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_film_name" ON "departments" USING btree ("film_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_film_person" ON "memberships" USING btree ("film_id","person_id");--> statement-breakpoint
CREATE INDEX "memberships_film" ON "memberships" USING btree ("film_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notice_reads_pk" ON "notice_reads" USING btree ("notice_id","membership_id");--> statement-breakpoint
CREATE INDEX "notifications_member" ON "notifications" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_day_version" ON "program_versions" USING btree ("shoot_day_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "shoot_days_film_day" ON "shoot_days" USING btree ("film_id","day_number");
ALTER TABLE "sign_in_codes" ALTER COLUMN "codeHash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_in_codes" ADD COLUMN "callReference" varchar(200);--> statement-breakpoint
ALTER TABLE "sign_in_codes" ADD COLUMN "callTo" varchar(50);--> statement-breakpoint
ALTER TABLE "sign_in_codes" ADD CONSTRAINT "sign_in_codes_one_kind" CHECK (("sign_in_codes"."codeHash" IS NULL) <> ("sign_in_codes"."callReference" IS NULL)
        AND ("sign_in_codes"."callReference" IS NULL) = ("sign_in_codes"."callTo" IS NULL));
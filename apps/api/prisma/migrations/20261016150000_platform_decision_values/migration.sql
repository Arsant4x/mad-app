-- A subscription change decision carries the end date it approves, and an executed decision names
-- the administrator who applied it.
--
-- The end date is written when the decision is requested, so the approver approves that value and
-- applying any other end is refused (in the service with a named 409). Only a subscription change
-- carries one. From the moment of this migration the database also refuses a subscription change
-- decision without an end and an executed decision without an executor; the moment is taken when
-- the migration runs (clock_timestamp in UTC, as createdAt is written) and fixed in the constraint
-- text, so rows that predate it stay as they are.
--
-- Open subscription change decisions requested before this migration carry no end: they can no
-- longer be applied, and they no longer block a new request for the same company. They are
-- counted and announced. No row is written.

ALTER TABLE "platform_decisions" ADD COLUMN "executedById" TEXT;
ALTER TABLE "platform_decisions" ADD COLUMN "requestedSubEnd" TIMESTAMP(3);

-- Restrict, like the requester and the approver: deleting an administrator cannot erase who applied a decision.
ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_executedById_fkey"
  FOREIGN KEY ("executedById") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_sub_end_only_on_subscription"
  CHECK ("requestedSubEnd" IS NULL OR "action" = 'SUBSCRIPTION_CHANGE');

ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_executor_only_when_executed"
  CHECK ("executedById" IS NULL OR "status" = 'EXECUTED');

DO $$
DECLARE
  open_without_end integer;
  cutover timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO open_without_end FROM "platform_decisions"
   WHERE "action" = 'SUBSCRIPTION_CHANGE' AND "status" IN ('PENDING', 'APPROVED') AND "requestedSubEnd" IS NULL;

  EXECUTE format(
    'ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_subscription_carries_end" CHECK ("action" <> ''SUBSCRIPTION_CHANGE'' OR "requestedSubEnd" IS NOT NULL OR "createdAt" < %L)',
    cutover
  );
  EXECUTE format(
    'ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_executed_names_executor" CHECK ("status" <> ''EXECUTED'' OR "executedById" IS NOT NULL OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'platform decisions: % open subscription change decision(s) carry no approved end date; they can no longer be applied and do not block a new request. From % (UTC) every subscription change decision carries its end date and every executed decision names its executor',
    open_without_end, cutover;
END $$;

-- A notification kind for a simplified document that has not reached the authority 20 hours
-- after issue, or has passed the 24 hour reporting deadline. No data is written here.
ALTER TYPE "NotificationKind" ADD VALUE 'ZATCA_REPORTING_DEADLINE';

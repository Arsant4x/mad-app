-- Master-data lock: company-wide freeze on properties/units, with a per-employee exemption.
ALTER TABLE "companies" ADD COLUMN     "masterDataLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_users" ADD COLUMN     "canEditMasterData" BOOLEAN NOT NULL DEFAULT false;

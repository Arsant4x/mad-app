/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `permission_templates` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "permission_templates_name_key" ON "permission_templates"("name");

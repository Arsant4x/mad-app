-- التذكرةُ الداخلية مهمّةٌ بحقلين لا محرّكٌ ثانٍ (SPEC 1.11 · SPEC 14.2 · ق-٥٣٢):
-- أولويةٌ من قائمةٍ مغلقة في القاعدة، وقسمٌ نصّيّ. لا DML — والجدولُ تحت FORCE كما هو.
CREATE TYPE "TaskPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL');
ALTER TABLE "tasks" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "tasks" ADD COLUMN "department" TEXT;

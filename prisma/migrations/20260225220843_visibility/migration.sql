-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActiveActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUpn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "lastHeartbeatAt" DATETIME NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "redactedLabel" TEXT
);
INSERT INTO "new_ActiveActivity" ("id", "lastHeartbeatAt", "referenceId", "startedAt", "title", "type", "userUpn") SELECT "id", "lastHeartbeatAt", "referenceId", "startedAt", "title", "type", "userUpn" FROM "ActiveActivity";
DROP TABLE "ActiveActivity";
ALTER TABLE "new_ActiveActivity" RENAME TO "ActiveActivity";
CREATE INDEX "ActiveActivity_userUpn_idx" ON "ActiveActivity"("userUpn");
CREATE TABLE "new_ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUpn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "redactedLabel" TEXT
);
INSERT INTO "new_ActivityEvent" ("endedAt", "id", "referenceId", "startedAt", "title", "type", "userUpn") SELECT "endedAt", "id", "referenceId", "startedAt", "title", "type", "userUpn" FROM "ActivityEvent";
DROP TABLE "ActivityEvent";
ALTER TABLE "new_ActivityEvent" RENAME TO "ActivityEvent";
CREATE INDEX "ActivityEvent_userUpn_idx" ON "ActivityEvent"("userUpn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

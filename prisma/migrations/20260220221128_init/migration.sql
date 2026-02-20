-- CreateTable
CREATE TABLE "ActiveActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUpn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "lastHeartbeatAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUpn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ActiveActivity_userUpn_idx" ON "ActiveActivity"("userUpn");

-- CreateIndex
CREATE INDEX "ActivityEvent_userUpn_idx" ON "ActivityEvent"("userUpn");

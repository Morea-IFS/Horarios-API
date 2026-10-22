-- CreateTable
CREATE TABLE "schedule_versions" (
    "id" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "pdfCreatedAt" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomCount" INTEGER NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_version" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "versionId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_external_refs" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "room_external_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_rooms" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "candidates" JSONB,

    CONSTRAINT "version_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "endPeriod" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "classCodes" TEXT[],
    "classCodesRaw" TEXT[],
    "lines" TEXT[],
    "rawText" TEXT NOT NULL,
    "page" INTEGER NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "contentSha256" TEXT,
    "semester" TEXT,
    "versionId" TEXT,
    "errorCode" TEXT,
    "issues" JSONB NOT NULL,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_versions_contentSha256_key" ON "schedule_versions"("contentSha256");

-- CreateIndex
CREATE UNIQUE INDEX "current_version_versionId_key" ON "current_version"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_normalizedKey_key" ON "rooms"("normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "room_external_refs_system_externalId_key" ON "room_external_refs"("system", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "room_external_refs_roomId_system_key" ON "room_external_refs"("roomId", "system");

-- CreateIndex
CREATE INDEX "version_rooms_matchStatus_idx" ON "version_rooms"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "version_rooms_versionId_roomId_key" ON "version_rooms"("versionId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_versionId_code_key" ON "periods"("versionId", "code");

-- CreateIndex
CREATE INDEX "class_sessions_versionId_roomId_weekday_idx" ON "class_sessions"("versionId", "roomId", "weekday");

-- CreateIndex
CREATE INDEX "class_sessions_versionId_weekday_idx" ON "class_sessions"("versionId", "weekday");

-- CreateIndex
CREATE INDEX "import_runs_startedAt_idx" ON "import_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "current_version" ADD CONSTRAINT "current_version_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "schedule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_external_refs" ADD CONSTRAINT "room_external_refs_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_rooms" ADD CONSTRAINT "version_rooms_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "schedule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_rooms" ADD CONSTRAINT "version_rooms_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "schedule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "schedule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

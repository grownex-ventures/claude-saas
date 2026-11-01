-- DropIndex
DROP INDEX "WebChatMessage_sessionId_id_idx";

-- CreateIndex
CREATE INDEX "WebChatMessage_sessionId_createdAt_idx" ON "WebChatMessage"("sessionId", "createdAt");

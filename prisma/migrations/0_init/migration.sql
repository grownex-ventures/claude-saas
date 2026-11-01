-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "botToken" TEXT,
    "panelApiUrl" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "crawledData" JSONB,
    "lastCrawledAt" TIMESTAMP(3),
    "whatsAppPhoneNumber" TEXT,
    "whatsAppEnabled" BOOLEAN NOT NULL DEFAULT false,
    "widgetApiKey" TEXT,
    "widgetTitle" TEXT DEFAULT 'Customer Support',
    "widgetWelcomeMessage" TEXT DEFAULT 'Hello! How can we help you today? Ask about our services, pricing, or order tracking.',
    "widgetAccentColor" TEXT DEFAULT '#ea580c',
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotUserSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "userPanelKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotUserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "whatsappJid" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "userPanelKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebChatSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_botToken_key" ON "Tenant"("botToken");

-- CreateIndex
CREATE INDEX "BotUserSession_tenantId_telegramUserId_idx" ON "BotUserSession"("tenantId", "telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BotUserSession_tenantId_telegramUserId_key" ON "BotUserSession"("tenantId", "telegramUserId");

-- CreateIndex
CREATE INDEX "WhatsAppSession_tenantId_whatsappJid_idx" ON "WhatsAppSession"("tenantId", "whatsappJid");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_tenantId_whatsappJid_key" ON "WhatsAppSession"("tenantId", "whatsappJid");

-- CreateIndex
CREATE UNIQUE INDEX "WebChatSession_sessionId_key" ON "WebChatSession"("sessionId");

-- CreateIndex
CREATE INDEX "WebChatSession_tenantId_sessionId_idx" ON "WebChatSession"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebChatSession_tenantId_sessionId_key" ON "WebChatSession"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "WebChatMessage_sessionId_id_idx" ON "WebChatMessage"("sessionId", "id");

-- AddForeignKey
ALTER TABLE "BotUserSession" ADD CONSTRAINT "BotUserSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebChatSession" ADD CONSTRAINT "WebChatSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebChatMessage" ADD CONSTRAINT "WebChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WebChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "BotUserSession" ADD COLUMN     "telegramFirstName" TEXT,
ADD COLUMN     "telegramUsername" TEXT,
ALTER COLUMN "userPanelKey" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeadRequest" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "hasTelegram" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hasWhatsapp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasWidget" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaBackupCodes" JSONB,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramPanelUrl" TEXT,
ADD COLUMN     "whatsappPanelUrl" TEXT,
ADD COLUMN     "widgetPanelUrl" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppSession" ALTER COLUMN "userPanelKey" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TelegramChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "whatsappJid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Super Admin',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PaymentInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'cryptomus',
    "gatewayPaymentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "selectedChannels" JSONB NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paymentUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramChatMessage_tenantId_telegramUserId_createdAt_idx" ON "TelegramChatMessage"("tenantId", "telegramUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramChatMessage_tenantId_createdAt_idx" ON "TelegramChatMessage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppChatMessage_tenantId_whatsappJid_createdAt_idx" ON "WhatsAppChatMessage"("tenantId", "whatsappJid", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppChatMessage_tenantId_createdAt_idx" ON "WhatsAppChatMessage"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_tokenHash_expiresAt_idx" ON "EmailVerificationToken"("tokenHash", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInvoice_orderId_key" ON "PaymentInvoice"("orderId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_tenantId_createdAt_idx" ON "PaymentInvoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentInvoice_orderId_idx" ON "PaymentInvoice"("orderId");

-- CreateIndex
CREATE INDEX "PaymentInvoice_status_idx" ON "PaymentInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_googleId_key" ON "Tenant"("googleId");

-- AddForeignKey
ALTER TABLE "TelegramChatMessage" ADD CONSTRAINT "TelegramChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChatMessage" ADD CONSTRAINT "TelegramChatMessage_tenantId_telegramUserId_fkey" FOREIGN KEY ("tenantId", "telegramUserId") REFERENCES "BotUserSession"("tenantId", "telegramUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppChatMessage" ADD CONSTRAINT "WhatsAppChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppChatMessage" ADD CONSTRAINT "WhatsAppChatMessage_tenantId_whatsappJid_fkey" FOREIGN KEY ("tenantId", "whatsappJid") REFERENCES "WhatsAppSession"("tenantId", "whatsappJid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInvoice" ADD CONSTRAINT "PaymentInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


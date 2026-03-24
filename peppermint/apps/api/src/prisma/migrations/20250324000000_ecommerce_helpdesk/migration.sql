-- AlterEnum: Add e-commerce ticket types to TicketType
ALTER TYPE "TicketType" ADD VALUE 'refund';
ALTER TYPE "TicketType" ADD VALUE 'shipping';
ALTER TYPE "TicketType" ADD VALUE 'product_inquiry';
ALTER TYPE "TicketType" ADD VALUE 'order_issue';
ALTER TYPE "TicketType" ADD VALUE 'return_exchange';
ALTER TYPE "TicketType" ADD VALUE 'payment';

-- CreateTable: Order for e-commerce
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "items" JSONB,
    "clientId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add shippingAddress to Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;

-- AlterTable: Add orderId to Ticket
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

import { prisma } from '../common/database/prisma.js';
import type { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

export interface CreateTicketDto {
  subject: string;
  category?: string;
  priority?: string;
  message: string;
}

export class TicketsService {
  /**
   * Generates a clean human-friendly ticket number, e.g. TCK-1001
   */
  private async generateTicketNumber(): Promise<string> {
    const count = await prisma.supportTicket.count();
    return `TCK-${1001 + count}`;
  }

  private normalizeCategory(cat?: string): TicketCategory {
    const upper = (cat || 'TECHNICAL').toUpperCase();
    const valid: TicketCategory[] = ['TECHNICAL', 'CHANNEL', 'PANEL', 'BILLING', 'FEATURE', 'OTHER'];
    return valid.includes(upper as TicketCategory) ? (upper as TicketCategory) : 'TECHNICAL';
  }

  private normalizePriority(pri?: string): TicketPriority {
    const upper = (pri || 'NORMAL').toUpperCase();
    const valid: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    return valid.includes(upper as TicketPriority) ? (upper as TicketPriority) : 'NORMAL';
  }

  private normalizeStatus(st?: string): TicketStatus {
    const upper = (st || 'OPEN').toUpperCase();
    const valid: TicketStatus[] = ['OPEN', 'ANSWERED', 'CLOSED'];
    return valid.includes(upper as TicketStatus) ? (upper as TicketStatus) : 'OPEN';
  }

  // ---------------------------------------------------------------------------
  // Tenant Operations
  // ---------------------------------------------------------------------------

  async createTenantTicket(tenantId: string, dto: CreateTicketDto) {
    if (!dto.subject || dto.subject.trim().length < 5) {
      throw new Error('Subject must be at least 5 characters');
    }
    if (!dto.message || dto.message.trim().length < 10) {
      throw new Error('Message must be at least 10 characters');
    }

    const ticketNumber = await this.generateTicketNumber();
    const category = this.normalizeCategory(dto.category);
    const priority = this.normalizePriority(dto.priority);

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        tenantId,
        subject: dto.subject.trim(),
        category,
        priority,
        status: 'OPEN',
        messages: {
          create: [
            {
              sender: 'user',
              text: dto.message.trim()
            },
            {
              sender: 'support',
              senderName: 'Support System',
              text: 'Thanks for reaching out! Your ticket has been dispatched to our engineering & support team. We will review and reply right here.'
            }
          ]
        }
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return ticket;
  }

  async getTenantTickets(tenantId: string, filters: { status?: string; search?: string } = {}) {
    const where: any = { tenantId };

    if (filters.status && filters.status.toLowerCase() !== 'all') {
      where.status = this.normalizeStatus(filters.status);
    }

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { ticketNumber: { contains: q, mode: 'insensitive' } }
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return tickets.map((t) => ({
      id: t.ticketNumber,
      ticketId: t.id,
      subject: t.subject,
      category: t.category.toLowerCase(),
      priority: t.priority.toLowerCase(),
      status: t.status.toLowerCase(),
      createdAt: t.createdAt.getTime(),
      updatedAt: t.updatedAt.getTime(),
      preview: t.messages[0]?.text || '',
      replies: t.messages.length
    }));
  }

  async getTenantTicket(tenantId: string, idOrNumber: string) {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }]
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    if (ticket.unreadByTenant) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { unreadByTenant: false }
      }).catch(() => {});
    }

    return {
      id: ticket.ticketNumber,
      ticketId: ticket.id,
      subject: ticket.subject,
      category: ticket.category.toLowerCase(),
      priority: ticket.priority.toLowerCase(),
      status: ticket.status.toLowerCase(),
      createdAt: ticket.createdAt.getTime(),
      updatedAt: ticket.updatedAt.getTime(),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        from: m.sender,
        senderName: m.senderName,
        text: m.text,
        at: m.createdAt.getTime()
      }))
    };
  }

  async replyTenantTicket(tenantId: string, idOrNumber: string, message: string) {
    if (!message || !message.trim()) {
      throw new Error('Reply message cannot be empty');
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }]
      }
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        sender: 'user',
        text: message.trim()
      }
    });

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'OPEN',
        unreadByAdmin: true,
        unreadByTenant: false,
        updatedAt: new Date()
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return {
      id: updated.ticketNumber,
      ticketId: updated.id,
      status: updated.status.toLowerCase(),
      updatedAt: updated.updatedAt.getTime(),
      messages: updated.messages.map((m) => ({
        id: m.id,
        from: m.sender,
        senderName: m.senderName,
        text: m.text,
        at: m.createdAt.getTime()
      }))
    };
  }

  async closeTenantTicket(tenantId: string, idOrNumber: string) {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }]
      }
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        unreadByAdmin: false,
        unreadByTenant: false,
        updatedAt: new Date()
      }
    });

    return { id: updated.ticketNumber, status: 'closed' };
  }

  async reopenTenantTicket(tenantId: string, idOrNumber: string) {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrNumber }, { ticketNumber: idOrNumber }]
      }
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'OPEN', updatedAt: new Date() }
    });

    return { id: updated.ticketNumber, status: 'open' };
  }

  // ---------------------------------------------------------------------------
  // Super Admin Operations
  // ---------------------------------------------------------------------------

  async getAdminTickets(filters: {
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const where: any = {};

    if (filters.status && filters.status.toLowerCase() !== 'all') {
      where.status = this.normalizeStatus(filters.status);
    }
    if (filters.priority && filters.priority.toLowerCase() !== 'all') {
      where.priority = this.normalizePriority(filters.priority);
    }

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { ticketNumber: { contains: q, mode: 'insensitive' } },
        { tenant: { email: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 50));
    const skip = (page - 1) * limit;

    const [total, tickets] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, email: true, panelApiUrl: true }
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        tenantId: t.tenantId,
        tenantEmail: t.tenant.email,
        panelUrl: t.tenant.panelApiUrl,
        lastMessage: t.messages[0]?.text || '',
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getAdminTicket(ticketId: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        tenant: {
          select: { id: true, email: true, panelApiUrl: true }
        },
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) throw new Error('Ticket not found');

    // Auto mark as read by admin when opened
    if (ticket.unreadByAdmin) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { unreadByAdmin: false }
      }).catch(() => {});
    }

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      tenantId: ticket.tenantId,
      tenantEmail: ticket.tenant.email,
      panelUrl: ticket.tenant.panelApiUrl,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        senderName: m.senderName,
        text: m.text,
        createdAt: m.createdAt.toISOString()
      }))
    };
  }

  async replyAdminTicket(ticketId: string, message: string, adminName: string = 'Support') {
    if (!message || !message.trim()) {
      throw new Error('Reply message cannot be empty');
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) throw new Error('Ticket not found');

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        sender: 'support',
        senderName: adminName,
        text: message.trim()
      }
    });

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'ANSWERED',
        unreadByAdmin: false,
        unreadByTenant: true,
        updatedAt: new Date()
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return updated;
  }

  async updateAdminTicketStatus(ticketId: string, status: string) {
    const nextStatus = this.normalizeStatus(status);
    const data: any = {
      status: nextStatus,
      updatedAt: new Date()
    };
    if (nextStatus === 'CLOSED') {
      data.unreadByAdmin = false;
      data.unreadByTenant = false;
    }
    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data
    });
    return updated;
  }

  async getAdminUnreadCount(): Promise<{ unreadCount: number }> {
    const unreadCount = await prisma.supportTicket.count({
      where: {
        unreadByAdmin: true,
        status: { not: 'CLOSED' }
      }
    });
    return { unreadCount };
  }

  async getTenantUnreadCount(tenantId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await prisma.supportTicket.count({
      where: {
        tenantId,
        unreadByTenant: true,
        status: { not: 'CLOSED' }
      }
    });
    return { unreadCount };
  }
}

export const ticketsService = new TicketsService();


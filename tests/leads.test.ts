import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadsController } from '../src/leads/leads.controller.js';
import { prisma } from '../src/common/database/prisma.js';

describe('Lead Capture Controller (POST /api/v1/leads)', () => {
  let controller: LeadsController;

  beforeEach(() => {
    vi.restoreAllMocks();
    controller = new LeadsController();
  });

  const getPostHandler = () => {
    const layer = (controller.router as any).stack.find((l: any) => l.route && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  it('successfully captures lead with valid email, panelUrl, and contactNumber', async () => {
    const handler = getPostHandler();

    const mockLead = {
      id: 'lead-123',
      email: 'founder@mysmmpanel.com',
      panelUrl: 'https://mysmmpanel.com',
      contactNumber: '+1234567890',
      message: 'Interested in annual enterprise tier',
      createdAt: new Date()
    };

    const createSpy = vi.spyOn(prisma.leadRequest, 'create').mockResolvedValueOnce(mockLead as any);

    const req = {
      body: {
        email: 'founder@mysmmpanel.com',
        panelUrl: 'https://mysmmpanel.com',
        contactNumber: '+1234567890',
        message: 'Interested in annual enterprise tier'
      },
      headers: { 'user-agent': 'Mozilla/5.0' },
      ip: '127.0.0.1'
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        leadId: 'lead-123',
        message: expect.stringContaining('Thank you!')
      })
    );
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'founder@mysmmpanel.com',
          panelUrl: 'https://mysmmpanel.com',
          contactNumber: '+1234567890',
          message: 'Interested in annual enterprise tier'
        })
      })
    );
  });

  it('rejects submission with missing email', async () => {
    const handler = getPostHandler();
    const req = {
      body: { panelUrl: 'https://mysmmpanel.com', contactNumber: '+123' },
      headers: {}
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'A valid email address is required.' });
  });

  it('rejects submission with malformed email', async () => {
    const handler = getPostHandler();
    const req = {
      body: { email: 'invalid-email', panelUrl: 'https://mysmmpanel.com', contactNumber: '+123' },
      headers: {}
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'A valid email address is required.' });
  });

  it('rejects submission with malformed panel URL', async () => {
    const handler = getPostHandler();
    const req = {
      body: { email: 'owner@mysmmpanel.com', panelUrl: 'ftp://invalid', contactNumber: '+123' },
      headers: {}
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A valid SMM panel URL starting with http:// or https:// is required.'
    });
  });

  it('rejects submission with short or missing contact number', async () => {
    const handler = getPostHandler();
    const req = {
      body: { email: 'owner@mysmmpanel.com', panelUrl: 'https://mypanel.com', contactNumber: 'hi' },
      headers: {}
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'A contact number or handle is required (at least 3 characters).'
    });
  });
});

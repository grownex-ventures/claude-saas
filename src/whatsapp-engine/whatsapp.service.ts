import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { formatWhatsAppMessage } from './formatter.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';
import { prisma } from '../common/database/prisma.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

export interface WhatsAppServiceConfig {
  tenantId: string;
  phoneNumber?: string | null;
  mode?: 'qr' | 'pairing';
  authBaseDir?: string;
}

export interface ConnectionUpdatePayload {
  status: 'connecting' | 'open' | 'close';
  qr?: string;
  qrDataUrl?: string;
  pairingCode?: string;
  user?: any;
  error?: any;
}

export class WhatsAppService {
  private sock: WASocket | null = null;
  private config: WhatsAppServiceConfig;
  private authDir: string;
  private reconnectAttempts = 0;
  private isShuttingDown = false;
  private maxReconnectDelayMs = 30000;
  private onMessageCallback?: (sock: WASocket, msg: proto.IWebMessageInfo) => Promise<void>;

  public events = new EventEmitter();
  public onQR?: (qr: string, dataUrl?: string) => void;
  public onConnectionUpdate?: (update: ConnectionUpdatePayload) => void;
  public lastQR: string | null = null;
  public lastQRDataUrl: string | null = null;
  public pairingCode: string | null = null;
  public connectionStatus: 'connecting' | 'open' | 'close' = 'close';

  constructor(config: WhatsAppServiceConfig) {
    this.config = config;
    const baseDir = config.authBaseDir || process.env.WHATSAPP_AUTH_DIR || './baileys_auth';
    this.authDir = path.isAbsolute(baseDir)
      ? path.join(baseDir, config.tenantId)
      : path.resolve(process.cwd(), baseDir, config.tenantId);
  }

  public getSocket(): WASocket | null {
    return this.sock;
  }

  public isConnected(): boolean {
    return this.connectionStatus === 'open' && !!this.sock;
  }

  public setMessageListener(callback: (sock: WASocket, msg: proto.IWebMessageInfo) => Promise<void>) {
    this.onMessageCallback = callback;
  }

  /**
   * Initializes the Baileys WhatsApp connection for the tenant.
   */
  public async start(): Promise<WASocket> {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    let version: [number, number, number] = [2, 3000, 1015901307];
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
    } catch {
      // Fallback in offline/test environment
    }

    const isExplicitQr = this.config.mode === 'qr';
    const isPairingMode = this.config.mode === 'pairing' || (!isExplicitQr && Boolean(this.config.phoneNumber && this.config.phoneNumber.trim()));

    this.sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false
    });

    // Request 8-Digit Pairing Code if pairing mode enabled and not yet registered
    if (isPairingMode && !isExplicitQr && !this.sock.authState.creds.registered && this.config.phoneNumber) {
      const cleanPhone = this.config.phoneNumber.replace(/[^0-9]/g, '');
      if (cleanPhone) {
        setTimeout(async () => {
          try {
            await this.requestPairingCode(cleanPhone);
          } catch (err: any) {
            console.error(`[WhatsApp] Failed to request pairing code for tenant ${this.config.tenantId}:`, err?.message);
          }
        }, 2500);
      }
    }

    // Connection events
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.lastQR = qr;
        try {
          this.lastQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
        } catch {
          this.lastQRDataUrl = null;
        }

        RuntimeLogService.record({
          tenantId: this.config.tenantId,
          channel: 'whatsapp',
          level: 'info',
          event: 'WHATSAPP_QR_GENERATED',
          message: 'WhatsApp authentication QR code refreshed'
        }).catch(() => {});

        const qrPayload: ConnectionUpdatePayload = {
          status: 'connecting',
          qr,
          qrDataUrl: this.lastQRDataUrl || undefined
        };
        this.events.emit('qr', qrPayload);
        this.events.emit('connection.update', qrPayload);
        if (this.onQR) this.onQR(qr, this.lastQRDataUrl || undefined);
        if (this.onConnectionUpdate) {
          this.onConnectionUpdate(qrPayload);
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.lastQR = null;
        this.lastQRDataUrl = null;
        this.pairingCode = null;
        this.connectionStatus = 'open';

        const rawId = this.sock?.user?.id || '';
        const phone = rawId.split(':')[0].replace(/[^0-9]/g, '');
        if (phone) {
          prisma.tenant.update({
            where: { id: this.config.tenantId },
            data: {
              whatsAppPhoneNumber: `+${phone}`,
              whatsAppEnabled: true,
              hasWhatsapp: true
            }
          }).catch(() => null);
        }

        RuntimeLogService.record({
          tenantId: this.config.tenantId,
          channel: 'whatsapp',
          level: 'success',
          event: 'WHATSAPP_CONNECTED',
          message: `WhatsApp connected (${this.sock?.user?.id || 'Active Session'})`,
          details: { user: this.sock?.user?.id }
        }).catch(() => {});

        const openPayload: ConnectionUpdatePayload = { status: 'open', user: this.sock?.user };
        this.events.emit('connection.update', openPayload);
        if (this.onConnectionUpdate) {
          this.onConnectionUpdate(openPayload);
        }
      } else if (connection === 'close') {
        this.connectionStatus = 'close';

        RuntimeLogService.record({
          tenantId: this.config.tenantId,
          channel: 'whatsapp',
          level: 'warn',
          event: 'WHATSAPP_DISCONNECTED',
          message: 'WhatsApp connection closed'
        }).catch(() => {});

        const closePayload: ConnectionUpdatePayload = { status: 'close', error: lastDisconnect?.error };
        this.events.emit('connection.update', closePayload);
        if (this.onConnectionUpdate) {
          this.onConnectionUpdate(closePayload);
        }

        if (this.isShuttingDown) {
          return;
        }

        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === DisconnectReason.loggedOut) {
          try {
            fs.rmSync(this.authDir, { recursive: true, force: true });
          } catch {}
        }

        if (shouldReconnect) {
          this.reconnectAttempts++;
          const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
          setTimeout(() => {
            if (!this.isShuttingDown) {
              this.start().catch(() => {});
            }
          }, delay);
        }
      } else if (connection === 'connecting') {
        this.connectionStatus = 'connecting';
        const connPayload: ConnectionUpdatePayload = { status: 'connecting', qr };
        this.events.emit('connection.update', connPayload);
        if (this.onConnectionUpdate) {
          this.onConnectionUpdate(connPayload);
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    // Incoming Messages
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const rawJid = msg.key.remoteJid;
        // Block group chats, broadcasts, newsletters to guarantee 1-on-1 customer isolation
        if (!rawJid || rawJid.endsWith('@broadcast') || rawJid.includes('@newsletter') || rawJid.endsWith('@g.us')) {
          continue;
        }

        if (this.onMessageCallback && this.sock) {
          await this.onMessageCallback(this.sock, msg);
        }
      }
    });

    return this.sock;
  }

  /**
   * Requests an 8-digit pairing code for a specific phone number.
   */
  public async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.sock) {
      await this.start();
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      throw new Error('Valid phone number with country code is required (min 8 digits).');
    }

    if (this.sock?.authState?.creds?.registered) {
      throw new Error('This WhatsApp instance is already linked and registered.');
    }

    // Wait briefly for WebSocket handshake to be ready if connecting
    let attempts = 0;
    while (this.sock && (!this.sock.ws || (this.sock.ws as any).readyState !== 1)) {
      if (attempts++ > 15) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const code = await this.sock!.requestPairingCode(cleanPhone);
    this.pairingCode = code;
    this.lastQR = null;
    this.lastQRDataUrl = null;

    const pairingPayload: ConnectionUpdatePayload = { status: 'connecting', pairingCode: code };
    this.events.emit('pairingCode', pairingPayload);
    this.events.emit('connection.update', pairingPayload);
    if (this.onConnectionUpdate) {
      this.onConnectionUpdate(pairingPayload);
    }

    return code;
  }

  /**
   * Sends a formatted message with simulated human-like typing presence delay.
   */
  public async sendReply(jid: string, text: string): Promise<void> {
    if (!this.sock || !text) return;
    try {
      await this.sock.sendPresenceUpdate('composing', jid);
      await new Promise((resolve) => setTimeout(resolve, 600));

      const formatted = formatWhatsAppMessage(text);
      await this.sock.sendMessage(jid, { text: formatted });

      await this.sock.sendPresenceUpdate('paused', jid);
    } catch (err: any) {
      console.error(`[WhatsApp] Failed to send message to ${jid}:`, err?.message);
    }
  }

  /**
   * Deletes a message from chat history (used to wipe raw customer API keys for privacy).
   */
  public async deleteMessage(jid: string, key: proto.IMessageKey): Promise<void> {
    if (!this.sock || !key) return;
    try {
      await this.sock.sendMessage(jid, { delete: key });
    } catch {
      // Best effort deletion
    }
  }

  /**
   * Disconnects cleanly.
   */
  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.sock) {
      try {
        await this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.connectionStatus = 'close';
  }

  /**
   * Clears auth directory credentials on disk.
   */
  public clearAuth(): void {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

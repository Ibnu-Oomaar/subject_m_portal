import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayInit } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { SessionService } from '../security/session.service';
import { TeacherScopeService } from '../teachers/teachers.service';
import { EventsService } from './events.service';

const REVALIDATE_MS = 60_000;
const MAX_SOCKETS_PER_TEACHER = 10;

interface SocketData {
  sid: string;
  teacherId: string;
}

/** The Cookie header is parsed by hand so the gateway needs no extra dependency. */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Real-time notices for the teacher's own screens ("these marks were just changed elsewhere"). It carries no marks and
 * no student data, only which section/term/examination changed, and only to teachers assigned to that section.
 *
 * Security: the HTTP session cookie authenticates the connection; the Origin is checked (cross-site WebSocket
 * hijacking); students are refused; rooms are joined from the server-side section assignments only (the client cannot
 * ask to join a room); and sessions are re-checked every minute without being extended, so logging out or expiry ends
 * the connection.
 */
@WebSocketGateway({
  path: '/api/socket.io',
  serveClient: false,
  cors: { origin: env.appOrigins, credentials: true },
})
export class EventsGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() private server!: Server;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly events: EventsService,
    private readonly sessions: SessionService,
    private readonly scope: TeacherScopeService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        (e: unknown) => next(new Error(e instanceof Error ? e.message : 'UNAUTHENTICATED')),
      );
    });
    server.on('connection', (socket) => {
      socket.emit('ready', { sections: [...socket.rooms].filter((r) => r.startsWith('section:')).length });
    });

    this.unsubscribe = this.events.subscribe((event) => {
      this.server.to(`section:${event.sectionId}`).emit(event.type, event);
    });
    this.timer = setInterval(() => void this.recheckSessions(), REVALIDATE_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
  }

  private async authenticate(socket: Socket): Promise<void> {
    const origin = socket.handshake.headers.origin;
    if (origin && !env.appOrigins.includes(origin)) throw new Error('FORBIDDEN_ORIGIN');
    const sid = readCookie(socket.handshake.headers.cookie, env.SESSION_COOKIE_NAME);
    const session = sid ? await this.sessions.resolve(sid) : null;
    if (!sid || !session) throw new Error('UNAUTHENTICATED');
    if (session.role !== 'teacher') throw new Error('FORBIDDEN');

    const existing = await this.server.in(`teacher:${session.userId}`).fetchSockets();
    if (existing.length >= MAX_SOCKETS_PER_TEACHER) throw new Error('TOO_MANY_CONNECTIONS');

    (socket.data as SocketData) = { sid, teacherId: session.userId };
    const sectionIds = await this.scope.sectionIds(session.userId);
    await socket.join([`teacher:${session.userId}`, ...sectionIds.map((id) => `section:${id}`)]);
  }

  /** Disconnects sockets whose session has ended. Runs every minute; public so tests can trigger it. */
  async recheckSessions(): Promise<void> {
    try {
      for (const socket of this.server.sockets.sockets.values()) {
        const data = socket.data as Partial<SocketData>;
        const alive = data.sid ? await this.sessions.peek(data.sid) : null;
        if (!alive) {
          socket.emit('session.expired');
          socket.disconnect(true);
        }
      }
    } catch (e) {
      this.logger.warn(`Session re-check failed: ${(e as Error).message}`);
    }
  }
}

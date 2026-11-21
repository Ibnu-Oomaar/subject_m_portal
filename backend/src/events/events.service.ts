import { Injectable } from '@nestjs/common';

export interface MarksChangedEvent {
  type: 'marks.changed';
  academicYearId: string;
  sectionId: string;
  kind: 'assessment' | 'exam';
  term: number;
  examId?: string;
  at: string;
}
export type PortalEvent = MarksChangedEvent;

/** Tiny in-process pub/sub. Domain services publish; the Socket.IO gateway subscribes and relays to teachers. */
@Injectable()
export class EventsService {
  private readonly listeners = new Set<(event: PortalEvent) => void>();

  publish(event: PortalEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must never fail a save
      }
    }
  }

  subscribe(listener: (event: PortalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

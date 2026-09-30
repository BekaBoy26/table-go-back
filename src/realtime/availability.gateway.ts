import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

export interface AvailabilityEvent {
  restaurantId: string;
  /** 'YYYY-MM-DD'; null when any day may have changed (tables edited, restaurant removed). */
  date: string | null;
}

export const AVAILABILITY_EVENT = 'availability';

/**
 * Pushes "free tables changed" to every open page the moment a booking is made
 * or cancelled, so slot lists, the table grid and "available today" badges update
 * without a reload. Events carry no guest data — clients refetch the public
 * availability endpoints. Broadcast to all: the home list needs every restaurant,
 * and per-restaurant rooms would save little at this scale. CORS is set in main.ts.
 */
@WebSocketGateway()
export class AvailabilityGateway {
  @WebSocketServer()
  private readonly server: Server;

  notify(restaurantId: string, date: string | null = null): void {
    const event: AvailabilityEvent = { restaurantId, date };
    this.server.emit(AVAILABILITY_EVENT, event);
  }
}

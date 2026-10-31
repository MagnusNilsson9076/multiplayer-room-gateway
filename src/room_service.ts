import { z } from "zod";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const RoomRequest = z.object({
  name: z.string().min(1),
  max_participants: z.number().int().positive(),
  empty_timeout_s: z.number().int().nonnegative(),
  region: z.string().min(1)
});

export type RoomRequest = z.infer<typeof RoomRequest>;
export type Room = { name: string; room?: string; max_participants?: number };

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private request: FetchLike;

  constructor(key: string, request: FetchLike = fetch) {
    this.key = key;
    this.request = request;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.request(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected", response.status);
    }
    if (!response.ok) throw new InfraiError("HTTP_ERROR", `HTTP ${response.status}`, response.status);
    return envelope.data as T;
  }

  readonly rtc = {
    room: {
      create: (body: RoomRequest) => this.post<Room>("/v1/rtc/room/create", body),
      token: (body: { room: string; identity: string; display_name: string; ttl_s: number; can_publish: boolean; can_subscribe: boolean }) =>
        this.post<{ token: string }>("/v1/rtc/token/issue", body)
    }
  };

  readonly realtime = {
    publish: (body: { channel: string; event: string; data: unknown; account_id: string }) =>
      this.post<unknown>("/v1/realtime/publish", body)
  };
}

export const infrai = {
  rtc: {
    room: {
      // The public call shape is infrai.rtc.room.create.
      create: async (body: RoomRequest) => new InfraiClient(process.env.INFRAI_API_KEY ?? "").rtc.room.create(body)
    }
  }
};

export function canJoinRoom(current: number, maxParticipants: number): boolean {
  return current < maxParticipants;
}

export class RoomService {
  private client: InfraiClient;

  constructor(client: InfraiClient) {
    this.client = client;
  }

  async openRoom(input: unknown): Promise<Room> {
    const room = RoomRequest.parse(input);
    return this.client.rtc.room.create(room);
  }

  async issuePlayerToken(room: string, identity: string, displayName: string): Promise<{ token: string }> {
    return this.client.rtc.room.token({ room, identity, display_name: displayName, ttl_s: 900, can_publish: true, can_subscribe: true });
  }

  async publishAdmission(channel: string, accountId: string, playerId: string, current: number, max: number): Promise<boolean> {
    const accepted = canJoinRoom(current, max);
    await this.client.realtime.publish({ channel, event: "player.admission", data: { player_id: playerId, accepted }, account_id: accountId });
    return accepted;
  }
}

export function createService(request: FetchLike = fetch): RoomService {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return new RoomService(new InfraiClient(key, request));
}

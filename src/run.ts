import { createService } from "./room_service.ts";

const service = createService();
const room = await service.openRoom({
  name: "ranked-eu-01",
  max_participants: 8,
  empty_timeout_s: 120,
  region: "eu"
});
const accepted = await service.publishAdmission(room.name, "game-backend", "player-17", 3, 8);
console.log(JSON.stringify({ room: room.name, player: "player-17", accepted }));

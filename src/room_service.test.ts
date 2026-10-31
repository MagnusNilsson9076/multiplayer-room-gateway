import test from "node:test";
import assert from "node:assert/strict";
import { canJoinRoom } from "./room_service.ts";

test("a full room rejects the next player", () => {
  assert.equal(canJoinRoom(4, 4), false);
  assert.equal(canJoinRoom(3, 4), true);
});

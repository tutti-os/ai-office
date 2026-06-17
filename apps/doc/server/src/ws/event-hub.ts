import { EventHub as SharedEventHub } from "@ai-app/shared/event-hub";
import type { StreamEventType } from "@ai-doc/shared";
import { getDb } from "../db/database.js";

export class EventHub extends SharedEventHub<StreamEventType> {
  constructor() {
    super(getDb);
  }
}

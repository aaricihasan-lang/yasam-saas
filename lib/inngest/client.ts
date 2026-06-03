import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "yasamSistemiInngest",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

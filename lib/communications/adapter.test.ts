import { describe, expect, it } from "vitest";
import { MockCommunicationAdapter } from "./adapter";

describe("MockCommunicationAdapter", () => {
  it("records sent messages and returns an incrementing mock message id", async () => {
    const adapter = new MockCommunicationAdapter("telegram");
    const first = await adapter.send({
      channel: "telegram",
      externalConversationId: "owner-chat",
      text: "Hello",
    });
    const second = await adapter.send({
      channel: "telegram",
      externalConversationId: "owner-chat",
      text: "Update",
    });

    expect(adapter.sentMessages).toHaveLength(2);
    expect(first.externalMessageId).not.toBe(second.externalMessageId);
    expect(adapter.channel).toBe("telegram");
  });
});

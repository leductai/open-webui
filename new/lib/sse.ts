export type ParsedSseEvent = {
  event?: string;
  data: string;
  id?: string;
};

export function parseSseChunks(buffer: string): {events: ParsedSseEvent[]; rest: string} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ParsedSseEvent[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName: string | undefined;
    let eventId: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith("id:")) {
        eventId = line.slice(3).trim();
      }
    }

    events.push({
      event: eventName,
      data: dataLines.join("\n"),
      id: eventId,
    });
  }

  return {events, rest};
}

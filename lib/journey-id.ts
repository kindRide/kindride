/** UUID v4 for journey and ride ids (matches active-trip / post-trip pattern). */
export function createJourneyId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return Math.floor(v).toString(16);
  });
}

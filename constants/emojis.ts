// 채팅 이모티콘/스티커 (chat.tsx, chats.tsx에서 공통 사용)
export const EMOJIS = [
  { id: "1", source: require("../assets/images/emojis/1.png"), label: "1" },
  { id: "2", source: require("../assets/images/emojis/2.png"), label: "2" },
  { id: "3", source: require("../assets/images/emojis/3.png"), label: "3" },
  { id: "4", source: require("../assets/images/emojis/4.png"), label: "4" },
  { id: "5", source: require("../assets/images/emojis/5.png"), label: "5" },
  { id: "6", source: require("../assets/images/emojis/6.png"), label: "6" },
  { id: "7", source: require("../assets/images/emojis/7.png"), label: "7" },
  { id: "8", source: require("../assets/images/emojis/8.png"), label: "8" },
];

export const STICKER_PREFIX = "__sticker:";
export const STICKER_SUFFIX = "__";

export function formatLastMessageAsSticker(lastMessage?: string): string | null {
  if (!lastMessage) return null;
  // 새 형식: __sticker:1__
  if (lastMessage.startsWith(STICKER_PREFIX) && lastMessage.endsWith(STICKER_SUFFIX)) {
    return lastMessage.slice(STICKER_PREFIX.length, -STICKER_SUFFIX.length);
  }
  // 기존 형식: lastMessage가 스티커 id(1~8)인 경우
  if (EMOJIS.some((e) => e.id === lastMessage)) return lastMessage;
  return null;
}

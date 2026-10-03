export function normalizeBotCommand(text: string, botName?: string): string {
  const [token] = text.trim().split(' ', 1);
  const parts = token.split('@');
  if (parts.length === 1) {
    return token;
  }
  if (parts.length === 2 && parts[1] === botName) {
    return parts[0];
  }
  return text.trim();
}

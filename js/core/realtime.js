import { db } from "../dataClient.js";
const channels = new Map();
export function subscribeChannel(key, builder) {
  unsubscribeChannel(key);
  const channel = builder(db.channel(key));
  channels.set(key, channel);
  channel.subscribe();
  return channel;
}
export function unsubscribeChannel(key) {
  const channel = channels.get(key);
  if (!channel) return;
  channels.delete(key);
  db.removeChannel(channel);
}
export function unsubscribeByPrefix(prefix) { for (const key of [...channels.keys()]) if (key.startsWith(prefix)) unsubscribeChannel(key); }
export function unsubscribeAll() { for (const key of [...channels.keys()]) unsubscribeChannel(key); }
export function activeChannelKeys() { return [...channels.keys()]; }

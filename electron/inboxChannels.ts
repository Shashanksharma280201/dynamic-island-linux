/** IPC channels the hub panel uses to browse chats and mail. */
export const INBOX = {
  SOURCES: 'inbox:sources',
  CHATS: 'inbox:chats',
  CHAT: 'inbox:chat',
  CHAT_SEND: 'inbox:chat-send',
  CHAT_MEDIA: 'inbox:chat-media', // invoke(chatId, msgId) -> ChatMediaFile
  CHAT_MEDIA_OPEN: 'inbox:chat-media-open', // invoke(chatId, msgId): save to Downloads and open
  MAIL_LIST: 'inbox:mail-list',
  MAIL_GET: 'inbox:mail-get',
  MAIL_REPLY: 'inbox:mail-reply',
  MAIL_READ: 'inbox:mail-read',
  NOTES_LIST: 'notes:list',
  NOTE_GET: 'notes:get',
  NOTE_SAVE: 'notes:save',
  NOTE_DELETE: 'notes:delete',
  CHANGED: 'inbox:changed', // main -> renderer: 'whatsapp' | 'mail' | 'sources' | 'unread'
  UNREAD: 'inbox:unread', // invoke -> InboxUnread
} as const

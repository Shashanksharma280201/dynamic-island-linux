/** IPC channels the hub panel uses to browse chats and mail. */
export const INBOX = {
  SOURCES: 'inbox:sources',
  CHATS: 'inbox:chats',
  CHAT: 'inbox:chat',
  CHAT_SEND: 'inbox:chat-send',
  MAIL_LIST: 'inbox:mail-list',
  MAIL_GET: 'inbox:mail-get',
  MAIL_REPLY: 'inbox:mail-reply',
  MAIL_READ: 'inbox:mail-read',
  NOTES_LIST: 'notes:list',
  NOTE_GET: 'notes:get',
  NOTE_SAVE: 'notes:save',
  NOTE_DELETE: 'notes:delete',
  CHANGED: 'inbox:changed', // main -> renderer: 'whatsapp' | 'mail' | 'sources'
} as const

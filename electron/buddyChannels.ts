/** The buddy's messages between the main process, the island, the pointer and Settings. */
export const BUDDY = {
  STATE: 'buddy:state', // main -> island: BuddyView
  KEY: 'buddy:key', // main -> island: the buddy's shortcut was pressed
  ASK: 'buddy:ask', // island -> main (invoke): what you said or typed
  CMD: 'buddy:cmd', // island -> main (invoke): 'next' | 'back' | 'stop' | 'repeat'
  ANSWER: 'buddy:answer', // island -> main (invoke): yes or no to what it offered
  GET: 'buddy:get', // island -> main (invoke): BuddyView
  SPEAK: 'buddy:speak', // main -> island: { id, phonemes, voice, speed } for Kokoro
  SPOKEN: 'buddy:spoken', // island -> main: { id, ok, error? }
  POINTER: 'buddy:pointer', // main -> pointer page: PointerCmd
  POINTER_READY: 'buddy:pointer-ready', // pointer page -> main
  SET: 'buddy:set', // settings -> main (invoke): Partial<BuddyConfig>
  VOICE_GET: 'buddy:voice-get', // settings -> main (invoke): download the natural voice
  VOICE_TRY: 'buddy:voice-try', // settings -> main (invoke): say a line in the chosen voice
  ROUTINE_SET: 'buddy:routine-set', // settings -> main (invoke): a routine -> why not, or null
  ROUTINE_DEL: 'buddy:routine-del', // settings -> main (invoke): its id
  HEAR: 'buddy:hear', // main -> island: { id, mime, data (base64), fake? }: speech from the phone to make out
  HEARD: 'buddy:heard', // island -> main (invoke): (id, { text } | { error })
} as const

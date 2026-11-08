/** IPC channels for Settings → You and Settings → Brain. */
export const BRAIN = {
  CREATE: 'brain:create', // (folder?) -> error | null
  PICK_FOLDER: 'brain:pick-folder', // -> folder | null
  SET_ON: 'brain:set-on', // (on)
  SET: 'brain:set', // ({ captureSessions?, distil?, skip? })
  ADD_SKIP: 'brain:add-skip', // pick a folder never to capture
  CONNECT: 'brain:connect', // (tool id, on) -> error | null
  MINE: 'brain:mine', // -> a sentence saying what it did
  KEEP: 'brain:keep', // (path) -> error | null
  KEEP_ALL: 'brain:keep-all', // -> how many
  ARCHIVE: 'brain:archive', // (path) -> error | null
  OPEN: 'brain:open', // (path | '') in Obsidian or the file manager
  OPEN_FOLDER: 'brain:open-folder',
  INTERVIEW: 'brain:interview', // -> error | null
  ME_GET: 'brain:me-get', // (file) -> text
  ME_SAVE: 'brain:me-save', // (file, text) -> error | null
  BRIEF: 'brain:brief', // -> the brief's text
  JOB_RUN: 'brain:job-run', // (job id): run one of the loop's jobs now
  JOB_ON: 'brain:job-on', // (job id, on)
  FILING: 'brain:filing', // ('apply' | 'undo' | 'dismiss') -> how many moved
} as const

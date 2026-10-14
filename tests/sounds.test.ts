import { customSoundFiles, soundMime } from '../shared/sounds'

test('files named after a sound replace it', () => {
  expect(customSoundFiles(['done.mp3', 'Ask.WAV', 'notes.txt', 'song.mp3', 'error.ogg', 'error.wav'])).toEqual({ done: 'done.mp3', ask: 'Ask.WAV', error: 'error.ogg' })
  expect(customSoundFiles([])).toEqual({})
  expect(soundMime('a.m4a')).toBe('audio/mp4')
  expect(soundMime('a.exe')).toBeNull()
})

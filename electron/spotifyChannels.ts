/** IPC channels for the island's Music (Spotify) tab. */
export const SPOTIFY = {
  STATE: 'spotify:state', // invoke -> SpotifyView
  CHANGED: 'spotify:changed', // main -> renderer: SpotifyView
  SIGN_IN: 'spotify:sign-in',
  HOME: 'spotify:home', // invoke -> SpHome
  PAGE: 'spotify:page', // invoke(uri) -> SpPage
  SEARCH: 'spotify:search', // invoke(q) -> SpSearch
  PLAY: 'spotify:play', // invoke({ contextUri?, trackUri? })
  CONTROL: 'spotify:control', // invoke(cmd)
  LIKE: 'spotify:like', // invoke(uri, on)
  WATCH: 'spotify:watch', // send(on): the Music tab is showing
  IMAGE: 'island:image', // invoke(url) -> data URL (for colour sampling)
} as const

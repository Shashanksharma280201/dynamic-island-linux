/** IPC channels of the Services tab. */
export const SERVICES = {
  VIEW: 'services:view', // invoke -> ServiceState[]
  CHANGED: 'services:changed', // main -> renderer: ServiceState[]
  REFRESH: 'services:refresh', // invoke(id): look again now
  OPEN: 'services:open', // invoke(url): open a service's page in the browser
} as const

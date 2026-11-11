import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const overviewApi = {
  surveyTickets: (args) => ipcRenderer.invoke('overview:surveyTickets', args)
} satisfies PreloadApi['overview']


export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface ProcessedFile {
  originalName: string;
  newName: string;
  blob: Blob;
  folder: string;
  size: number;
  sourceUrl?: string;
}

export interface BatchSummary {
  styleName: string;
  sourceLink: string;
  status: 'Success' | 'Partial' | 'Failed';
  filesFound: number;
  notes: string;
}

export enum AppTab {
  DRIVE = 'drive',
  WEB = 'web',
  POSTIMG = 'postimg',
  CATEGORIZER = 'categorizer',
  RENAMER = 'renamer'
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

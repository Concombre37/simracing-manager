export enum UserRole {
  ADMIN = 'admin',
  TECHNICIAN = 'technician',
}

export enum StationStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  IN_GAME = 'in_game',
  UPDATING = 'updating',
}

export enum StationRole {
  SIMULATOR = 'simulator',
  ADMIN = 'admin',
}

export enum LaunchMode {
  CONTENT_MANAGER = 'cm',
  DIRECT = 'ac',
}

export enum ScreenMode {
  SINGLE = 'single',
  TRIPLE = 'triple',
  VR = 'vr',
}

export enum AssistPreset {
  EASY = 'easy',
  PRO = 'pro',
  CUSTOM = 'custom',
}

export enum SessionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum Difficulty {
  EASY = 'EASY',
  PRO = 'PRO',
  CUSTOM = 'CUSTOM',
}

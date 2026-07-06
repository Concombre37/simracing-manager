import { Logger } from 'pino';
import { TelemetrySnapshot } from '@simracing/shared';

let koffi: typeof import('koffi') | null = null;
try {
  if (process.platform === 'win32') {
    koffi = require('koffi');
  }
} catch {
  // koffi is optional and only available on Windows
}

const FILE_MAP_READ = 0x0004;

interface SPageFilePhysics {
  packetId: number;
  gas: number;
  brake: number;
  fuel: number;
  gear: number;
  rpms: number;
  steerAngle: number;
  speedKmh: number;
  velocity: number[];
  accG: number[];
  wheelSlip: number[];
  wheelLoad: number[];
  wheelsPressure: number[];
  wheelAngularSpeed: number[];
  tyreWear: number[];
  tyreDirtyLevel: number[];
  tyreCoreTemperature: number[];
  camberRAD: number[];
  suspensionTravel: number[];
  drs: number;
  tc: number;
  heading: number;
  pitch: number;
  roll: number;
  cgHeight: number;
  carDamage: number[];
  numberOfTyresOut: number;
  pitLimiterOn: number;
  abs: number;
  kersCharge: number;
  kersInput: number;
  autoShifterOn: number;
  rideHeight: number[];
  turboBoost: number;
  ballast: number;
  airDensity: number;
  airTemp: number;
  roadTemp: number;
  localAngularVel: number[];
  finalFF: number;
  performanceMeter: number;
  engineBrake: number;
  ersRecoveryLevel: number;
  ersPowerLevel: number;
  ersHeatCharging: number;
  ersIsCharging: number;
  kersCurrentKJ: number;
  drsAvailable: number;
  drsEnabled: number;
  brakeTemp: number[];
  clutch: number;
  tyreTempI: number[];
  tyreTempM: number[];
  tyreTempO: number[];
  isAIControlled: number;
  tyreContactPoint: number[];
  tyreContactNormal: number[];
  tyreContactHeading: number[];
  brakeBias: number;
  localVelocity: number[];
}

interface SPageFileGraphic {
  packetId: number;
  status: number;
  session: number;
  currentTime: number[];
  lastTime: number[];
  bestTime: number[];
  split: number[];
  completedLaps: number;
  position: number;
  iCurrentTime: number;
  iLastTime: number;
  iBestTime: number;
  sessionTimeLeft: number;
  distanceTraveled: number;
  isInPit: number;
  currentSectorIndex: number;
  lastSectorTime: number;
  numberOfLaps: number;
  tyreCompound: number[];
  _pad1: number[];
  replayTimeMultiplier: number;
  normalizedCarPosition: number;
  activeCars: number;
  carCoordinates: number[];
  carID: number[];
  playerCarID: number;
  penaltyTime: number;
  flag: number;
  penalty: number;
  idealLineOn: number;
  isInPitLane: number;
  surfaceGrip: number;
  mandatoryPitDone: number;
  windSpeed: number;
  windDirection: number;
  isSetupMenuVisible: number;
  mainDisplayIndex: number;
  secondaryDisplayIndex: number;
  TC: number;
  TCCut: number;
  EngineMap: number;
  ABS: number;
  fuelXLap: number;
  rainLights: number;
  flashingLights: number;
  lightsStage: number;
  exhaustTemperature: number;
  wiperLV: number;
  driverStintTotalTimeLeft: number;
  driverStintTimeLeft: number;
  rainTyres: number;
}

interface SPageFileStatic {
  smVersion: number[];
  acVersion: number[];
  numberOfSessions: number;
  numCars: number;
  carModel: number[];
  track: number[];
  playerName: number[];
  playerSurname: number[];
  playerNick: number[];
  sectorCount: number;
  maxTorque: number;
  maxPower: number;
  maxRpm: number;
  maxFuel: number;
  suspensionMaxTravel: number[];
  tyreRadius: number[];
  maxTurboBoost: number;
  deprecated_1: number;
  deprecated_2: number;
  penaltiesEnabled: number;
  aidFuelRate: number;
  aidTireRate: number;
  aidMechanicalDamage: number;
  aidAllowTyreBlankets: number;
  aidStability: number;
  aidAutoClutch: number;
  aidAutoBlip: number;
  hasDRS: number;
  hasERS: number;
  hasKERS: number;
  kersMaxJ: number;
  engineBrakeSettingsCount: number;
  ersPowerControllerCount: number;
  trackSplineLength: number;
  trackConfiguration: number[];
  ersMaxJ: number;
  isTimedRace: number;
  hasExtraLap: number;
  carSkin: number[];
  reversedGridPositions: number;
  pitWindowStart: number;
  pitWindowEnd: number;
  isOnline: number;
}

export class AcSharedMemoryReader {
  private interval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private staticData: {
    playerName: string;
    carModel: string;
    track: string;
    isOnline: boolean;
  } | null = null;

  private kernel32: ReturnType<typeof import('koffi').load> | null = null;
  private OpenFileMappingW: ((...args: unknown[]) => unknown) | null = null;
  private MapViewOfFile: ((...args: unknown[]) => unknown) | null = null;
  private UnmapViewOfFile: ((...args: unknown[]) => unknown) | null = null;
  private CloseHandle: ((...args: unknown[]) => unknown) | null = null;

  private SPageFilePhysics: ReturnType<typeof import('koffi').pack> | null = null;
  private SPageFileGraphic: ReturnType<typeof import('koffi').pack> | null = null;
  private SPageFileStatic: ReturnType<typeof import('koffi').pack> | null = null;

  private hMapPhysics: unknown = null;
  private pPhysics: unknown = null;
  private hMapGraphics: unknown = null;
  private pGraphics: unknown = null;
  private hMapStatic: unknown = null;
  private pStatic: unknown = null;

  constructor(
    private readonly logger: Logger,
    private readonly stationId: string,
    private sessionId: string | undefined,
    private readonly onSnapshot: (snapshot: TelemetrySnapshot) => void,
  ) {
    if (!koffi) {
      this.logger.warn('koffi not available; shared-memory telemetry disabled');
      return;
    }

    try {
      this.kernel32 = koffi.load('kernel32.dll');
      this.OpenFileMappingW = this.kernel32.func(
        'void* OpenFileMappingW(uint32 dwDesiredAccess, int bInheritHandle, str16 lpName)',
      );
      this.MapViewOfFile = this.kernel32.func(
        'void* MapViewOfFile(void* hFileMappingObject, uint32 dwDesiredAccess, uint32 dwFileOffsetHigh, uint32 dwFileOffsetLow, size_t dwNumberOfBytesToMap)',
      );
      this.UnmapViewOfFile = this.kernel32.func('int UnmapViewOfFile(void* lpBaseAddress)');
      this.CloseHandle = this.kernel32.func('int CloseHandle(void* hObject)');

      this.SPageFilePhysics = koffi.pack('SPageFilePhysics', {
        packetId: 'int32',
        gas: 'float',
        brake: 'float',
        fuel: 'float',
        gear: 'int32',
        rpms: 'int32',
        steerAngle: 'float',
        speedKmh: 'float',
        velocity: koffi.array('float', 3),
        accG: koffi.array('float', 3),
        wheelSlip: koffi.array('float', 4),
        wheelLoad: koffi.array('float', 4),
        wheelsPressure: koffi.array('float', 4),
        wheelAngularSpeed: koffi.array('float', 4),
        tyreWear: koffi.array('float', 4),
        tyreDirtyLevel: koffi.array('float', 4),
        tyreCoreTemperature: koffi.array('float', 4),
        camberRAD: koffi.array('float', 4),
        suspensionTravel: koffi.array('float', 4),
        drs: 'float',
        tc: 'float',
        heading: 'float',
        pitch: 'float',
        roll: 'float',
        cgHeight: 'float',
        carDamage: koffi.array('float', 5),
        numberOfTyresOut: 'int32',
        pitLimiterOn: 'int32',
        abs: 'float',
        kersCharge: 'float',
        kersInput: 'float',
        autoShifterOn: 'int32',
        rideHeight: koffi.array('float', 2),
        turboBoost: 'float',
        ballast: 'float',
        airDensity: 'float',
        airTemp: 'float',
        roadTemp: 'float',
        localAngularVel: koffi.array('float', 3),
        finalFF: 'float',
        performanceMeter: 'float',
        engineBrake: 'int32',
        ersRecoveryLevel: 'int32',
        ersPowerLevel: 'int32',
        ersHeatCharging: 'int32',
        ersIsCharging: 'int32',
        kersCurrentKJ: 'float',
        drsAvailable: 'int32',
        drsEnabled: 'int32',
        brakeTemp: koffi.array('float', 4),
        clutch: 'float',
        tyreTempI: koffi.array('float', 4),
        tyreTempM: koffi.array('float', 4),
        tyreTempO: koffi.array('float', 4),
        isAIControlled: 'int32',
        tyreContactPoint: koffi.array('float', 12),
        tyreContactNormal: koffi.array('float', 12),
        tyreContactHeading: koffi.array('float', 12),
        brakeBias: 'float',
        localVelocity: koffi.array('float', 3),
      });

      this.SPageFileGraphic = koffi.pack('SPageFileGraphic', {
        packetId: 'int32',
        status: 'int32',
        session: 'int32',
        currentTime: koffi.array('char16_t', 15),
        lastTime: koffi.array('char16_t', 15),
        bestTime: koffi.array('char16_t', 15),
        split: koffi.array('char16_t', 15),
        completedLaps: 'int32',
        position: 'int32',
        iCurrentTime: 'int32',
        iLastTime: 'int32',
        iBestTime: 'int32',
        sessionTimeLeft: 'float',
        distanceTraveled: 'float',
        isInPit: 'int32',
        currentSectorIndex: 'int32',
        lastSectorTime: 'int32',
        numberOfLaps: 'int32',
        tyreCompound: koffi.array('char16_t', 33),
        _pad1: koffi.array('uint8', 2),
        replayTimeMultiplier: 'float',
        normalizedCarPosition: 'float',
        activeCars: 'int32',
        carCoordinates: koffi.array('float', 3),
        carID: koffi.array('int32', 60),
        playerCarID: 'int32',
        penaltyTime: 'float',
        flag: 'int32',
        penalty: 'int32',
        idealLineOn: 'int32',
        isInPitLane: 'int32',
        surfaceGrip: 'float',
        mandatoryPitDone: 'int32',
        windSpeed: 'float',
        windDirection: 'float',
        isSetupMenuVisible: 'int32',
        mainDisplayIndex: 'int32',
        secondaryDisplayIndex: 'int32',
        TC: 'int32',
        TCCut: 'int32',
        EngineMap: 'int32',
        ABS: 'int32',
        fuelXLap: 'float',
        rainLights: 'int32',
        flashingLights: 'int32',
        lightsStage: 'int32',
        exhaustTemperature: 'float',
        wiperLV: 'int32',
        driverStintTotalTimeLeft: 'int32',
        driverStintTimeLeft: 'int32',
        rainTyres: 'int32',
      });

      this.SPageFileStatic = koffi.pack('SPageFileStatic', {
        smVersion: koffi.array('char16_t', 15),
        acVersion: koffi.array('char16_t', 15),
        numberOfSessions: 'int32',
        numCars: 'int32',
        carModel: koffi.array('char16_t', 33),
        track: koffi.array('char16_t', 33),
        playerName: koffi.array('char16_t', 33),
        playerSurname: koffi.array('char16_t', 33),
        playerNick: koffi.array('char16_t', 33),
        sectorCount: 'int32',
        maxTorque: 'float',
        maxPower: 'float',
        maxRpm: 'int32',
        maxFuel: 'float',
        suspensionMaxTravel: koffi.array('float', 4),
        tyreRadius: koffi.array('float', 4),
        maxTurboBoost: 'float',
        deprecated_1: 'float',
        deprecated_2: 'float',
        penaltiesEnabled: 'int32',
        aidFuelRate: 'float',
        aidTireRate: 'float',
        aidMechanicalDamage: 'float',
        aidAllowTyreBlankets: 'int32',
        aidStability: 'float',
        aidAutoClutch: 'int32',
        aidAutoBlip: 'int32',
        hasDRS: 'int32',
        hasERS: 'int32',
        hasKERS: 'int32',
        kersMaxJ: 'float',
        engineBrakeSettingsCount: 'int32',
        ersPowerControllerCount: 'int32',
        trackSplineLength: 'float',
        trackConfiguration: koffi.array('char16_t', 33),
        ersMaxJ: 'float',
        isTimedRace: 'int32',
        hasExtraLap: 'int32',
        carSkin: koffi.array('char16_t', 33),
        reversedGridPositions: 'int32',
        pitWindowStart: 'int32',
        pitWindowEnd: 'int32',
        isOnline: 'int32',
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize koffi shared memory bindings');
    }
  }

  /** True once started and successfully polling (false on non-Windows/no koffi). */
  isActive(): boolean {
    return this.interval !== null;
  }

  start(): void {
    if (this.interval) return;
    if (!koffi) {
      this.logger.debug('Shared-memory telemetry skipped: koffi not available');
      return;
    }
    this.logger.info('Starting AC shared-memory telemetry reader');
    this.interval = setInterval(() => this.loop(), 100);
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    this.disconnect();
    this.logger.info('Stopped AC shared-memory telemetry reader');
  }

  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  private connect(): boolean {
    if (
      !this.OpenFileMappingW ||
      !this.MapViewOfFile ||
      !this.SPageFilePhysics ||
      !this.SPageFileGraphic ||
      !this.SPageFileStatic
    ) {
      return false;
    }
    try {
      this.hMapPhysics = this.OpenFileMappingW(FILE_MAP_READ, 0, 'Local\\acpmf_physics');
      if (!this.hMapPhysics) return false;
      this.pPhysics = this.MapViewOfFile(
        this.hMapPhysics,
        FILE_MAP_READ,
        0,
        0,
        koffi!.sizeof(this.SPageFilePhysics),
      );

      this.hMapGraphics = this.OpenFileMappingW(FILE_MAP_READ, 0, 'Local\\acpmf_graphics');
      if (!this.hMapGraphics) return false;
      this.pGraphics = this.MapViewOfFile(
        this.hMapGraphics,
        FILE_MAP_READ,
        0,
        0,
        koffi!.sizeof(this.SPageFileGraphic),
      );

      this.hMapStatic = this.OpenFileMappingW(FILE_MAP_READ, 0, 'Local\\acpmf_static');
      if (!this.hMapStatic) return false;
      this.pStatic = this.MapViewOfFile(
        this.hMapStatic,
        FILE_MAP_READ,
        0,
        0,
        koffi!.sizeof(this.SPageFileStatic),
      );

      if (this.pPhysics && this.pGraphics && this.pStatic) {
        this.isConnected = true;
        this.refreshStaticData();
        this.logger.info('Connected to Assetto Corsa shared memory');
        return true;
      }
    } catch (err) {
      this.logger.debug({ err }, 'Failed to connect to AC shared memory');
    }
    this.disconnect();
    return false;
  }

  private disconnect(): void {
    try {
      if (this.pPhysics && this.UnmapViewOfFile) this.UnmapViewOfFile(this.pPhysics);
      if (this.hMapPhysics && this.CloseHandle) this.CloseHandle(this.hMapPhysics);
      if (this.pGraphics && this.UnmapViewOfFile) this.UnmapViewOfFile(this.pGraphics);
      if (this.hMapGraphics && this.CloseHandle) this.CloseHandle(this.hMapGraphics);
      if (this.pStatic && this.UnmapViewOfFile) this.UnmapViewOfFile(this.pStatic);
      if (this.hMapStatic && this.CloseHandle) this.CloseHandle(this.hMapStatic);
    } catch (err) {
      this.logger.debug({ err }, 'Error disconnecting from AC shared memory');
    }
    this.hMapPhysics = null;
    this.pPhysics = null;
    this.hMapGraphics = null;
    this.pGraphics = null;
    this.hMapStatic = null;
    this.pStatic = null;
    this.isConnected = false;
    this.staticData = null;
  }

  private refreshStaticData(): void {
    if (!this.pStatic || !this.SPageFileStatic) return;
    try {
      const staticData = koffi!.decode<SPageFileStatic>(this.pStatic, this.SPageFileStatic);
      this.staticData = {
        playerName: this.decodeString(staticData.playerName),
        carModel: this.decodeString(staticData.carModel),
        track: this.decodeString(staticData.track),
        isOnline: staticData.isOnline === 1,
      };
      this.logger.debug(this.staticData, 'AC static data refreshed');
    } catch (err) {
      this.logger.debug({ err }, 'Failed to refresh AC static data');
    }
  }

  private decodeString(buffer: number[] | string): string {
    let str = '';
    if (typeof buffer === 'string') {
      str = buffer;
    } else {
      for (const val of buffer) {
        if (val === 0) break;
        str += String.fromCharCode(val);
      }
    }
    let cleaned = '';
    for (const char of str) {
      const code = char.charCodeAt(0);
      if (code >= 32) cleaned += char;
    }
    return cleaned.trim();
  }

  private loop(): void {
    if (!koffi) return;

    if (!this.isConnected) {
      if (this.connect()) {
        this.logger.info('Assetto Corsa shared memory connected');
      }
      return;
    }

    try {
      const graphics = koffi.decode<SPageFileGraphic>(this.pGraphics, this.SPageFileGraphic!);

      // status: 0 = off/menu, 1 = replay, 2 = live, 3 = paused
      const isSessionStarted = graphics.status === 2 || graphics.status === 3;
      const isInMainMenu = graphics.status === 0;

      if (!this.staticData && isSessionStarted) {
        this.refreshStaticData();
      }

      const physics = koffi.decode<SPageFilePhysics>(this.pPhysics, this.SPageFilePhysics!);

      const snapshot: TelemetrySnapshot = {
        stationId: this.stationId,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        speedKmh: physics.speedKmh,
        rpm: physics.rpms,
        // AC gear: 0 = reverse, 1 = neutral, 2 = first gear
        gear: Math.max(0, physics.gear - 1),
        throttle: physics.gas,
        brake: physics.brake,
        steering: physics.steerAngle,
        lapTimeMs: graphics.iCurrentTime,
        bestLapMs: graphics.iBestTime,
        lastLapMs: graphics.iLastTime,
        lapCount: graphics.completedLaps,
        position: graphics.position,
        trackPosition: graphics.normalizedCarPosition,
        worldPosition: {
          x: graphics.carCoordinates[0],
          y: graphics.carCoordinates[1],
          z: graphics.carCoordinates[2],
        },
        isInMainMenu,
        isSessionStarted,
        isOnlineRace: this.staticData?.isOnline ?? false,
      };

      this.onSnapshot(snapshot);
    } catch (err) {
      this.logger.debug({ err }, 'Lost AC shared memory connection');
      this.disconnect();
    }
  }
}

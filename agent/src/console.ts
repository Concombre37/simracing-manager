import blessed from 'blessed';

interface AgentStatus {
  version: string;
  stationName: string;
  stationId: string;
  serverUrl: string;
  launchMode: string;
  status: string;
  currentSessionId?: string;
  acRunning: boolean;
  cmRunning: boolean;
  serversRunning: number;
}

const status: AgentStatus = {
  version: '',
  stationName: '',
  stationId: '',
  serverUrl: '',
  launchMode: '',
  status: 'offline',
  acRunning: false,
  cmRunning: false,
  serversRunning: 0,
};

const screen = blessed.screen({
  smartCSR: true,
  title: 'SimRacing Manager Agent',
  mouse: true,
});

const headerBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '{center}{bold}SimRacing Manager Agent{/bold}{/center}',
  tags: true,
  style: { fg: 'cyan', bg: 'black' },
  border: { type: 'line' },
});

const infoBox = blessed.box({
  top: 3,
  left: 0,
  width: '50%',
  height: '40%',
  label: ' {bold}Informations{/bold} ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'gray' } },
  scrollable: true,
  alwaysScroll: true,
});

const logBox = blessed.log({
  top: 3,
  left: '50%',
  width: '50%',
  height: '40%',
  label: ' {bold}Logs{/bold} ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'gray' }, fg: 'white' },
  scrollable: true,
  alwaysScroll: true,
  scrollbar: { ch: ' ', style: { bg: 'gray' } },
});

const statusBox = blessed.box({
  top: '40%-1',
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
});

screen.append(headerBox);
screen.append(infoBox);
screen.append(logBox);
screen.append(statusBox);

screen.key(['escape', 'q', 'C-c'], () => {
  process.exit(0);
});

function renderInfo() {
  const lines = [
    `Version      : {yellow-fg}${status.version || '—'}{/yellow-fg}`,
    `Poste        : {white-fg}${status.stationName}{/white-fg} ({gray-fg}${status.stationId}{/gray-fg})`,
    `Serveur      : {white-fg}${status.serverUrl}{/white-fg}`,
    `Mode         : {white-fg}${status.launchMode.toUpperCase()}{/white-fg}`,
    `Statut       : ${coloredStatus(status.status)}`,
    `Session      : ${status.currentSessionId ? '{yellow-fg}' + status.currentSessionId + '{/yellow-fg}' : '{gray-fg}Aucune{/gray-fg}'}`,
    `AC actif     : ${status.acRunning ? '{green-fg}Oui{/green-fg}' : '{gray-fg}Non{/gray-fg}'}`,
    `CM actif     : ${status.cmRunning ? '{green-fg}Oui{/green-fg}' : '{gray-fg}Non{/gray-fg}'}`,
    `Serveurs loc.: {white-fg}${status.serversRunning}{/white-fg}`,
  ];
  infoBox.setContent(lines.join('\n'));
  screen.render();
}

function renderStatusLine() {
  const line = `{center}Agent ${status.status === 'online' ? '{green-fg}' : status.status === 'in_use' ? '{yellow-fg}' : '{gray-fg}'}${status.status.toUpperCase()}{/} | AC ${status.acRunning ? '{green-fg}●{/green-fg}' : '{gray-fg}●{/gray-fg}'} | CM ${status.cmRunning ? '{green-fg}●{/green-fg}' : '{gray-fg}●{/gray-fg}'} | ${status.serversRunning} serveur(s){/center}`;
  statusBox.setContent(line);
  screen.render();
}

function coloredStatus(s: string) {
  if (s === 'online' || s === 'running') return `{green-fg}${s}{/green-fg}`;
  if (s === 'in_use') return `{yellow-fg}${s}{/yellow-fg}`;
  if (s === 'offline') return `{gray-fg}${s}{/gray-fg}`;
  return `{white-fg}${s}{/white-fg}`;
}

function formatTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false });
}

export function setStatus(update: Partial<AgentStatus>) {
  Object.assign(status, update);
  renderInfo();
  renderStatusLine();
}

export function log(level: 'info' | 'success' | 'warn' | 'error', text: string) {
  const color = level === 'success' ? 'green' : level === 'warn' ? 'yellow' : level === 'error' ? 'red' : 'cyan';
  const prefix = level === 'info' ? 'ℹ' : level === 'success' ? '✔' : level === 'warn' ? '⚠' : '✖';
  logBox.log(`{gray-fg}${formatTime()}{/gray-fg} {${color}-fg}${prefix}{/${color}-fg} ${text}`);
  screen.render();
}

export function setupConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('info', text);
    // originalLog.apply(console, args);
  };
  console.error = (...args: any[]) => {
    const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('error', text);
    // originalError.apply(console, args);
  };
  console.warn = (...args: any[]) => {
    const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('warn', text);
    // originalWarn.apply(console, args);
  };

  screen.render();
}

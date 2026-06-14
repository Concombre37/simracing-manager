import chalk from 'chalk';
import boxen from 'boxen';

export function printBanner(version: string) {
  console.clear();
  console.log(
    boxen(
      chalk.bold.cyan('SimRacing Manager Agent') + '\n' +
      chalk.gray(`Version ${version}`),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );
}

export function printInfo(label: string, value: string) {
  console.log(`${chalk.bold.gray('[')}${chalk.cyan('INFO')}${chalk.bold.gray(']')} ${chalk.bold(label)} ${value}`);
}

export function printSuccess(label: string, value: string) {
  console.log(`${chalk.bold.gray('[')}${chalk.green('OK')}${chalk.bold.gray(']')} ${chalk.bold(label)} ${value}`);
}

export function printWarn(label: string, value: string) {
  console.log(`${chalk.bold.gray('[')}${chalk.yellow('WARN')}${chalk.bold.gray(']')} ${chalk.bold(label)} ${value}`);
}

export function printError(label: string, value: string) {
  console.log(`${chalk.bold.gray('[')}${chalk.red('ERR')}${chalk.bold.gray(']')} ${chalk.bold(label)} ${value}`);
}

export function printStatus(label: string, status: string) {
  const color = status === 'online' || status === 'running' || status === 'in_use' ? 'green' : 'gray';
  console.log(`${chalk.bold.gray('[')}${chalk[color]('STATUS')}${chalk.bold.gray(']')} ${chalk.bold(label)} ${chalk[color](status)}`);
}

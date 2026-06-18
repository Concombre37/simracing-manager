declare module 'wake_on_lan' {
  export function wake(
    macAddress: string,
    options?: {
      address?: string;
      port?: number;
      num_packets?: number;
      interval?: number;
    },
    callback?: (err?: Error) => void,
  ): void;
}

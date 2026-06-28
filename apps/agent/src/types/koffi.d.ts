declare module 'koffi' {
  export function load(library: string): KoffiLibrary;
  export function pack(name: string, definition: Record<string, unknown>): KoffiType;
  export function array(type: string, length: number): KoffiType;
  export function decode<T>(pointer: unknown, type: KoffiType): T;
  export function sizeof(type: KoffiType): number;

  export interface KoffiType {
    /* opaque type */
  }

  export interface KoffiLibrary {
    func(signature: string): (...args: unknown[]) => unknown;
  }
}

import { describe, it, expect } from 'vitest';
import { LogRingBuffer } from './logRingBuffer';

describe('LogRingBuffer', () => {
  it('returns lines in the order they were pushed', () => {
    const buffer = new LogRingBuffer(5);
    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    expect(buffer.getLines()).toEqual(['a', 'b', 'c']);
  });

  it('truncates to the configured max, keeping the most recent lines', () => {
    const buffer = new LogRingBuffer(3);
    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    buffer.push('d');
    buffer.push('e');
    expect(buffer.getLines()).toEqual(['c', 'd', 'e']);
  });

  it('getLines() returns a copy, not the internal array', () => {
    const buffer = new LogRingBuffer(5);
    buffer.push('a');
    const lines = buffer.getLines();
    lines.push('mutated');
    expect(buffer.getLines()).toEqual(['a']);
  });
});

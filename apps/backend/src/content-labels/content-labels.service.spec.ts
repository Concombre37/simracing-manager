import {
  mergeRawContentItem,
  type RawContentItem,
} from './content-labels.service';

describe('mergeRawContentItem', () => {
  it('keeps layouts discovered on another station', () => {
    const items = new Map<string, RawContentItem>();

    mergeRawContentItem(items, {
      type: 'track',
      acId: 'imola',
      rawName: 'Imola',
      layoutNames: ['imola_f1_2022'],
    });
    mergeRawContentItem(items, {
      type: 'track',
      acId: 'imola',
      rawName: 'Imola',
      layoutNames: ['imola_f1_2025', 'imola_f1_2022'],
    });

    expect(items.get('track:imola')?.layoutNames).toEqual([
      'imola_f1_2022',
      'imola_f1_2025',
    ]);
  });

  it('does not let a later stale station remove a newly known track', () => {
    const items = new Map<string, RawContentItem>();
    mergeRawContentItem(items, {
      type: 'track',
      acId: 'new_track',
      rawName: 'New Track',
      layoutNames: ['main'],
    });
    mergeRawContentItem(items, {
      type: 'track',
      acId: 'other_track',
      rawName: 'Other Track',
    });

    expect(items.has('track:new_track')).toBe(true);
    expect(items.get('track:new_track')?.layoutNames).toEqual(['main']);
  });
});

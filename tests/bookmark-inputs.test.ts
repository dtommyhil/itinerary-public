import { bookmarkUpdateInput } from '../src/domain/bookmarks/inputs';
import { expect, it } from 'vitest';
import {
  bookmarkDetails,
  normalizeBookmarkUrl,
} from '../src/domain/bookmarks/inputs';
it('accepts ideas without a physical place or URL', () => {
  expect(bookmarkDetails.parse({ title: ' Explore old town ' })).toEqual({
    title: 'Explore old town',
    url: null,
    category: 'other',
    notes: '',
    collectionIds: [],
  });
});
it('normalizes hostnames but preserves meaningful paths, query strings and fragments', () => {
  expect(
    normalizeBookmarkUrl(' HTTPS://EXAMPLE.COM/event?day=1#tickets '),
  ).toBe('https://example.com/event?day=1#tickets');
});
it.each([
  'javascript:alert(1)',
  'http://example.com',
  'https://user:secret@example.com',
  'https://example.com:8443',
  'not a url',
])('rejects unsafe or invalid link %s', (url) => {
  expect(bookmarkDetails.safeParse({ title: 'Idea', url }).success).toBe(false);
});
it('rejects blank titles, oversized notes and invalid categories', () => {
  for (const input of [
    { title: ' ' },
    { title: 'Valid', notes: 'a'.repeat(5001) },
    { title: 'Valid', category: 'unknown' },
  ])
    expect(bookmarkDetails.safeParse(input).success).toBe(false);
});

it('requires an explicit bookmark revision on updates', () => {
  for (const version of [undefined, -1, 0.5, '0'])
    expect(
      bookmarkUpdateInput.safeParse({ title: 'Idea', version }).success,
    ).toBe(false);
  expect(
    bookmarkUpdateInput.safeParse({ title: 'Idea', version: 0 }).success,
  ).toBe(true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, createMemoryStorage } from '../src/audio.js';

// Il bug segnalato: la traccia suonava UNA INDIETRO rispetto al girone.
// La traccia del girone deve partire quando il girone INIZIA (non quando finisce).

test('play riproduce la traccia del girone corrente anche se non ancora sbloccata', async () => {
  const played = [];
  const a = createAudio({
    storage: createMemoryStorage(),
    loadClip: async id => 'clip:' + id,
  });
  // sostituisci Audio con uno stub
  globalThis.Audio = class { constructor(src) { this.src = src; played.push(src); } play() { return Promise.resolve(); } pause() {} };
  await a.play('03-tuoni');
  assert.deepEqual(played, ['clip:03-tuoni'], 'la traccia corrente deve partire subito');
});

test('markUnlocked abilita la tracklist (riascolto)', () => {
  const st = createMemoryStorage();
  const a = createAudio({ storage: st, loadClip: async () => null });
  assert.equal(a.isUnlocked('05-hosonno'), false);
  a.markUnlocked('05-hosonno');
  assert.equal(a.isUnlocked('05-hosonno'), true);
});

test('il toggle spegne l\'audio', async () => {
  const played = [];
  globalThis.Audio = class { constructor(src) { played.push(src); } play() { return Promise.resolve(); } pause() {} };
  const a = createAudio({ storage: createMemoryStorage(), loadClip: async id => 'clip:' + id });
  a.toggle(); // off
  await a.play('01-intro');
  assert.deepEqual(played, [], 'audio spento: non deve suonare');
});

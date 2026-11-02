// instructor/files.js parsing: which part of a synced Canvas body is the
// student's own writing (shown) and which is the old extracted copy of an
// upload (dropped once the file has its own card), and where the sandbox
// policy goes in a student's HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = new URL('.', import.meta.url);
const { bodyWithoutUploads, sandboxedHtml, isCanvasFileLink } = await import(new URL('../../instructor/files.js', here));

// The shape worker/resync.py writes: text, upload blocks, then the comment.
const synced = [
  'My reflection on the week.',
  '**Uploaded: [a.pdf](https://canvas.colorado.edu/files/1/download?verifier=x)**\n\nextracted A',
].join('\n\n') + '\n\n---\n\n' +
  '**Uploaded build: [b.html](https://canvas.colorado.edu/files/2/download)** (3 KB HTML, the artifact itself)' +
  '\n\n**Comment on Canvas:**\n\nSee page two.';

test('keeps the writing and the Canvas comment, drops the extracted copies', () => {
  assert.equal(bodyWithoutUploads(synced), 'My reflection on the week.\n\n**Comment on Canvas:**\n\nSee page two.');
});

test('an upload-only body leaves nothing; a body without uploads is untouched', () => {
  assert.equal(bodyWithoutUploads('**Uploaded: [a.pdf](u)**\n\ntext'), '');
  assert.equal(bodyWithoutUploads('Just writing. **Uploaded: [x](y)** mentioned inline'), 'Just writing. **Uploaded: [x](y)** mentioned inline');
  assert.equal(bodyWithoutUploads(null), '');
});

test('the sandbox policy comes before any student markup, after a doctype', () => {
  const withDoctype = sandboxedHtml('<!DOCTYPE html><html><head><script>x()</script>');
  assert.match(withDoctype, /^<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'/);
  assert.ok(withDoctype.indexOf('Content-Security-Policy') < withDoctype.indexOf('<script>'));
  assert.match(sandboxedHtml('<script>x()</script>'), /^<meta http-equiv="Content-Security-Policy"/);
  assert.match(sandboxedHtml('﻿  <!doctype html>\n<p>'), /^﻿ {2}<!doctype html><meta /);
});

test('a Canvas download link is recognised only when the submission has files', () => {
  const files = [{ canvas_url: 'https://canvas.colorado.edu/files/1/download?verifier=x' }];
  assert.equal(isCanvasFileLink(files[0].canvas_url, files), true);
  assert.equal(isCanvasFileLink('https://canvas.colorado.edu/files/9/download', files), true);
  assert.equal(isCanvasFileLink('https://one.example/app', files), false);
  assert.equal(isCanvasFileLink(files[0].canvas_url, []), false);
});

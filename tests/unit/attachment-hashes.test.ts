import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllAttachmentHashes, getAnyAttachment } from '../../src/main/parser/AnyMessage';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('getAllAttachmentHashes', () => {
  it('coincide con hashear cada adjunto por la vía independiente', async () => {
    const buf = readFileSync(join(FIXTURES, 'html-basic.msg'));
    const hashes = await getAllAttachmentHashes(buf);
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) {
      const att = await getAnyAttachment(buf, h.id);
      expect(att).not.toBeNull();
      expect(createHash('sha256').update(att!.content).digest('hex')).toBe(h.sha256);
    }
  });

  it('funciona igual en .eml', async () => {
    const buf = readFileSync(join(FIXTURES, 'sample.eml'));
    const hashes = await getAllAttachmentHashes(buf);
    for (const h of hashes) {
      const att = await getAnyAttachment(buf, h.id);
      expect(createHash('sha256').update(att!.content).digest('hex')).toBe(h.sha256);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_PAGE_SIZE,
  emailSchema,
  fullNameSchema,
  paginationQuerySchema,
  passwordSchema,
  reasonSchema,
  uuidSchema,
} from './index.js';

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Sam@Autonova.CO.KE ')).toBe('sam@autonova.co.ke');
  });
  it('rejects malformed emails', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });
  it('coerces query strings', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });
  it('caps page size', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
  it('rejects page 0', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accepts a uuid and rejects junk', () => {
    expect(uuidSchema.safeParse('0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60').success).toBe(true);
    expect(uuidSchema.safeParse('123').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a long passphrase with spaces', () => {
    expect(passwordSchema.safeParse('correct horse battery staple').success).toBe(true);
  });
  it('rejects short passwords', () => {
    expect(passwordSchema.safeParse('Sh0rt!pw').success).toBe(false);
  });
  it('rejects overlong passwords (hashing DoS guard)', () => {
    expect(passwordSchema.safeParse('a1'.repeat(65)).success).toBe(false);
  });
  it('rejects common passwords case-insensitively', () => {
    expect(passwordSchema.safeParse('PassWord1234').success).toBe(false);
  });
  it('rejects trivially repetitive passwords', () => {
    expect(passwordSchema.safeParse('aaaaaaaaaaaaaaaa').success).toBe(false);
  });
  it('does not trim: surrounding spaces are part of the secret', () => {
    expect(passwordSchema.parse('  padded passphrase  ')).toBe('  padded passphrase  ');
  });
});

describe('fullNameSchema', () => {
  it('trims and accepts ordinary names', () => {
    expect(fullNameSchema.parse('  Wanjiru Kamau ')).toBe('Wanjiru Kamau');
    expect(fullNameSchema.parse('Ngũgĩ wa Thiong’o')).toBe('Ngũgĩ wa Thiong’o');
  });
  it('rejects empty, overlong and control-character names', () => {
    expect(fullNameSchema.safeParse('   ').success).toBe(false);
    expect(fullNameSchema.safeParse('a'.repeat(121)).success).toBe(false);
    expect(fullNameSchema.safeParse('line\nbreak').success).toBe(false);
    expect(fullNameSchema.safeParse('nul\u0000byte').success).toBe(false);
  });
});

describe('reasonSchema', () => {
  it('requires non-blank text of at most 500 characters', () => {
    expect(reasonSchema.safeParse('  duplicate account ').success).toBe(true);
    expect(reasonSchema.safeParse('   ').success).toBe(false);
    expect(reasonSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
});

describe('attachment rules', () => {
  it('gives an early answer from size and name, and refuses dangerous extensions for every category', async () => {
    const { checkAttachmentCandidate, categoryForExtension, fileExtension, ATTACHMENT_RULES } =
      await import('./index.js');
    expect(checkAttachmentCandidate('PHOTO', { name: 'a.JPG', size: 100 })).toEqual({ ok: true });
    expect(checkAttachmentCandidate('PHOTO', { name: 'a.jpg', size: 0 })).toEqual({
      ok: false,
      code: 'EMPTY',
    });
    expect(
      checkAttachmentCandidate('PHOTO', {
        name: 'a.jpg',
        size: ATTACHMENT_RULES.PHOTO.maxBytes + 1,
      }),
    ).toEqual({ ok: false, code: 'TOO_LARGE' });
    for (const name of ['a.svg', 'a.html', 'a.exe', 'a.js', 'a.php', 'a.sh', 'a']) {
      for (const category of ['PHOTO', 'VOICE_NOTE', 'DOCUMENT'] as const) {
        expect(
          checkAttachmentCandidate(category, { name, size: 10 }),
          `${category} ${name}`,
        ).toEqual({ ok: false, code: 'TYPE_NOT_ALLOWED' });
      }
    }
    expect(categoryForExtension('memo.M4A')).toBe('VOICE_NOTE');
    expect(categoryForExtension('prices.xlsx')).toBe('DOCUMENT');
    expect(categoryForExtension('x.svg')).toBeNull();
    expect(fileExtension('C:\\a\\b.tar.GZ')).toBe('gz');
    expect(fileExtension('.bashrc')).toBe('');
  });

  it('uses the decided limits and accepted types, and no longer accepts HEIC or OGG', async () => {
    const { ATTACHMENT_RULES, DEFAULT_ACTIVITY_ATTACHMENT_TOTAL_MB, categoryForExtension } =
      await import('./index.js');
    const mb = 1024 * 1024;
    expect(ATTACHMENT_RULES.PHOTO.maxBytes).toBe(10 * mb);
    expect(ATTACHMENT_RULES.DOCUMENT.maxBytes).toBe(25 * mb);
    expect(ATTACHMENT_RULES.VOICE_NOTE.maxBytes).toBe(20 * mb);
    expect(DEFAULT_ACTIVITY_ATTACHMENT_TOTAL_MB).toBe(50);
    expect([...ATTACHMENT_RULES.PHOTO.extensions]).toEqual(['jpg', 'jpeg', 'png', 'webp']);
    expect([...ATTACHMENT_RULES.VOICE_NOTE.extensions]).toEqual(['mp3', 'm4a', 'wav', 'webm']);
    expect([...ATTACHMENT_RULES.DOCUMENT.extensions]).toEqual(['pdf', 'docx', 'xlsx', 'csv']);
    expect(categoryForExtension('a.heic')).toBeNull();
    expect(categoryForExtension('a.ogg')).toBeNull();
    expect(categoryForExtension('a.wav')).toBe('VOICE_NOTE');
  });

  it('sanitises display names: no paths, control or direction-override characters, bounded, never empty', async () => {
    const { sanitizeFileName } = await import('./index.js');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\x\\price list.pdf')).toBe('price list.pdf');
    expect(sanitizeFileName('a\u0000b\u202ec.pdf')).toBe('abc.pdf');
    expect(sanitizeFileName('  ..hidden  ')).toBe('hidden');
    expect(sanitizeFileName('"><script>.pdf')).toBe('script.pdf');
    expect(sanitizeFileName('///')).toBe('file');
    const long = sanitizeFileName(`${'x'.repeat(300)}.pdf`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});

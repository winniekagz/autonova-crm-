import { deflateRawSync } from 'node:zlib';

/** Real file bytes for upload tests. Nothing here is a mock of the sniffer: these are genuine signatures. */
export const JPEG = Buffer.concat([
  Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb004300', 'hex'),
  Buffer.alloc(256, 1),
  Buffer.from('ffd9', 'hex'),
]);
export const PNG = Buffer.concat([
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  Buffer.alloc(64),
]);
export const PDF = Buffer.from(
  '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n',
  'latin1',
);
export const EXE = Buffer.concat([
  Buffer.from('4d5a90000300000004000000ffff0000', 'hex'),
  Buffer.alloc(64),
]);
export const HTML = Buffer.from('<!doctype html><html><script>alert(1)</script></html>');
export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
export const CSV = Buffer.from('name,phone\nAchieng,0712345678\nBrian,0700111222\n');
export const MP3 = Buffer.concat([
  Buffer.from('fffb90640000000000000000', 'hex'),
  Buffer.alloc(2048),
]);
export const M4A = Buffer.concat([
  Buffer.from('0000001c667479704d3441200000000069736f6d4d344120', 'hex'),
  Buffer.alloc(256),
]);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Buffer) => {
  let c = 0xffffffff;
  for (const byte of data) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A minimal but valid Office Open XML package: a zip with `[Content_Types].xml` and one main part. */
function ooxml(mainPart: string, contentType: string): Buffer {
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${mainPart}" ContentType="${contentType}"/></Types>`,
    ],
    [
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    ],
    [mainPart, '<x/>'],
  ];
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.concat([local, nameBuf, packed]);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBuf]));
    locals.push(entry);
    offset += entry.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

export const DOCX = ooxml(
  'word/document.xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
);
export const XLSX = ooxml(
  'xl/workbook.xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
);

export const WAV = Buffer.concat([
  Buffer.from('52494646', 'hex'),
  Buffer.from([0x24, 0x08, 0x00, 0x00]),
  Buffer.from('57415645666d7420', 'hex'),
  Buffer.from('10000000010001004401000088580100020010006461746100080000', 'hex'),
  Buffer.alloc(2048),
]);

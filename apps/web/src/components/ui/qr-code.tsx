'use client';

import QRCode from 'react-qr-code';

interface QrCodeProps {
  value: string;
  title: string;
  size?: number;
  className?: string;
}

/** Reusable, accessible QR code with the quiet zone needed for reliable scanning. */
export function QrCode({ value, title, size = 216, className = '' }: QrCodeProps) {
  return (
    <div
      className={`inline-flex max-w-full rounded-md border border-line bg-white p-4 ${className}`}
    >
      <QRCode
        value={value}
        title={title}
        role="img"
        aria-label={title}
        size={size}
        level="M"
        bgColor="var(--color-surface)"
        fgColor="var(--color-navy)"
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: size }}
      />
    </div>
  );
}

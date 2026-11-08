import { vi } from 'vitest';

/**
 * A minimal XMLHttpRequest for upload tests. Each `send` is held until the test decides how the
 * server answers, so progress, success, server errors, dropped connections and cancellation can all
 * be driven deterministically against the real `apiUpload`.
 */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  sent: FormData | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  send(body: FormData) {
    this.sent = body;
  }
  abort() {
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
  dropConnection() {
    this.onerror?.();
  }
}

export function installFakeXhr() {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return FakeXhr;
}

export const lastUpload = () => {
  const found = FakeXhr.instances.at(-1);
  if (!found) throw new Error('no upload was started');
  return found;
};

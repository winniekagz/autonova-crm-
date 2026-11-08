// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeolocation } from './use-geolocation';

afterEach(() => vi.unstubAllGlobals());

type Success = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (e: { code: number; PERMISSION_DENIED: number; TIMEOUT: number }) => void;
const codes = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

function stub(behaviour: (ok: Success, fail: Failure) => void) {
  const getCurrentPosition = vi.fn(behaviour);
  const watchPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition, watchPosition } });
  return { getCurrentPosition, watchPosition };
}

describe('useGeolocation', () => {
  it('asks for nothing until locate is called, and then only once, never watching', () => {
    const { getCurrentPosition, watchPosition } = stub((ok) =>
      ok({ coords: { latitude: -1.29, longitude: 36.82, accuracy: 12 } }),
    );
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    act(() => result.current.locate());
    expect(result.current.state).toEqual({
      status: 'ready',
      latitude: -1.29,
      longitude: 36.82,
      accuracyMetres: 12,
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('reports error code %i as %s', (code, status) => {
    stub((_ok, fail) => fail({ code, ...codes }));
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.locate());
    expect(result.current.state).toEqual({ status });
  });

  it('says unavailable when the device has no location support, without throwing', () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.locate());
    expect(result.current.state).toEqual({ status: 'unavailable' });
  });

  it('forgets a fix when cleared', () => {
    stub((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }));
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.locate());
    act(() => result.current.clear());
    expect(result.current.state).toEqual({ status: 'idle' });
  });
});

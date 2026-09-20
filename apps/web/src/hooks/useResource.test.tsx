import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { partial, useMutation, useResource } from './useResource';

/** يصنع خطأً بشكل axios كما يصل فعلاً — بلا استيراد axios. */
const axiosError = (status: number, message: string, headers: Record<string, string> = {}) => Object.assign(new Error(message), { response: { status, data: { message }, headers } });

describe('useResource — الرفضُ حالةٌ لا ردُّ نداء', () => {
  it('السقوطُ يصير `error` بسبب الخادم ورقم الطلب — ولا يصير فارغاً', async () => {
    const { result } = renderHook(() => useResource<{ items: string[] }>(() => Promise.reject(axiosError(500, 'انقطاعٌ مؤقّت', { 'x-request-id': 'r-7' })), { deps: [] }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    const r = result.current;
    if (r.status !== 'error') throw new Error('unreachable');
    expect(r.error).toMatchObject({ status: 500, message: 'انقطاعٌ مؤقّت', requestId: 'r-7' });
  });

  it('403 يصير `forbidden` لا `error`', async () => {
    const { result } = renderHook(() => useResource<string[]>(() => Promise.reject(axiosError(403, 'لا صلاحية')), { deps: [] }));
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
  });

  it('مصفوفةٌ فارغة ⇒ `empty` ويحمل `filtered` كما مُرِّر', async () => {
    const { result } = renderHook(() => useResource<string[]>(() => Promise.resolve([]), { deps: [], filtered: true }));
    await waitFor(() => expect(result.current.status).toBe('empty'));
    const r = result.current;
    if (r.status !== 'empty') throw new Error('unreachable');
    expect(r.filtered).toBe(true);
  });

  it('صفحةٌ بلا items ⇒ `empty`، وبعناصر ⇒ `ready` بالبيانات كما وصلت', async () => {
    const { result, rerender } = renderHook(({ items }: { items: string[] }) => useResource(() => Promise.resolve({ items, total: 9, page: 1, pageSize: 25 }), { deps: [items.length] }), { initialProps: { items: [] as string[] } });
    await waitFor(() => expect(result.current.status).toBe('empty'));
    rerender({ items: ['a'] });
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('`partial()` يصير حالةً ناقصةً تسمّي ما سقط', async () => {
    const { result } = renderHook(() => useResource(() => Promise.resolve(partial({ rows: [1] }, [{ status: 500, message: 'zatca' }])), { deps: [] }));
    await waitFor(() => expect(result.current.status).toBe('partial'));
    const r = result.current;
    if (r.status !== 'partial') throw new Error('unreachable');
    expect(r.failed).toHaveLength(1);
  });

  it('النتيجةُ المتقادمة تُهمَل: بحثٌ أبطأ لا يدهس بحثاً أحدث', async () => {
    let resolveSlow: (v: string[]) => void = () => {};
    const slow = new Promise<string[]>((res) => (resolveSlow = res));
    const { result, rerender } = renderHook(({ q }: { q: string }) => useResource(() => (q === 'slow' ? slow : Promise.resolve(['fast'])), { deps: [q] }), { initialProps: { q: 'slow' } });
    rerender({ q: 'fast' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      resolveSlow(['slow']);
      await Promise.resolve();
    });
    const r = result.current;
    if (r.status !== 'ready') throw new Error('unreachable');
    expect(r.data).toEqual(['fast']);
  });
});

describe('useMutation — onError إلزاميّ ويصل الخطأُ كما قاله الخادم', () => {
  it('الرفضُ يُسلَّم إلى onError ويبقى في `failure`، ولا يُرمى', async () => {
    const seen: string[] = [];
    const { result } = renderHook(() => useMutation<number, string>(() => Promise.reject(axiosError(400, 'الرجاء اختيار تصنيف العقد')), { onError: (f) => seen.push(f.message) }));
    let out: string | undefined = 'x';
    await act(async () => {
      out = await result.current.mutate(1);
    });
    expect(out).toBeUndefined();
    expect(seen).toEqual(['الرجاء اختيار تصنيف العقد']);
    expect(result.current.failure?.status).toBe(400);
    expect(result.current.pending).toBe(false);
  });
});

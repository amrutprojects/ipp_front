import { act, render, screen } from '@testing-library/react';
import type { Options } from '../src/types';

/*
 * A form that is already open gets what was changed in Masters → Form fields: the options are asked for again when the
 * student comes back to the tab, and at once after a change made in the panel.
 */
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const withLabel = (label: string) =>
  ({
    fields: [{ key: 'first_name', step: 1, label_en: label, label_mr: null, required: true, type: 'TEXT', custom: false, order: 1 }],
    lists: {},
    document_types: [],
  }) as unknown as Options;

let label = 'First Name';
let asked = 0;
beforeEach(() => {
  vi.resetModules();
  label = 'First Name';
  asked = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/edp/options')) {
      asked++;
      return json({ data: withLabel(label) });
    }
    return json({ data: {} });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function showLabel() {
  const ui = await import('../src/components/ui');
  function Label() {
    const options = ui.useOptions();
    return <p>{options?.fields?.[0]?.label_en ?? 'loading'}</p>;
  }
  render(<Label />);
  expect(await screen.findByText('First Name')).toBeInTheDocument();
  return ui;
}
const comeBack = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });

it('asks again when the student comes back to the tab after a while', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await showLabel();
  label = 'Given Name';
  /* Just now: the kept answer is used. */
  await comeBack();
  expect(asked).toBe(1);
  vi.setSystemTime(Date.now() + 20_000);
  await comeBack();
  expect(await screen.findByText('Given Name')).toBeInTheDocument();
  expect(asked).toBe(2);
});

it('asks again at once after a change in the panel', async () => {
  const ui = await showLabel();
  const { api } = await import('../src/api');
  label = 'Given Name';
  await api('/manage/fields/f1', { method: 'PATCH', realm: 'manage', body: { label_en: 'Given Name' } });
  await act(async () => {
    await ui.loadOptions();
  });
  expect(await screen.findByText('Given Name')).toBeInTheDocument();
});

it('an answer that changed nothing draws nothing again', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const ui = await showLabel();
  const first = await ui.loadOptions();
  vi.setSystemTime(Date.now() + 20_000);
  expect(await ui.loadOptions()).toBe(first);
  expect(asked).toBe(2);
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FloatingPanelMinimize, isPanelMinimized } from './FloatingPanelMinimize';
afterEach(cleanup);
describe('floating panel minimize', () => {
 it('keeps draft inputs mounted and restores the same panel from outside it', () => {
  const view=render(<section data-test-panel><FloatingPanelMinimize label="Test panel"/><input aria-label="Draft" defaultValue="original"/></section>);
  const input=screen.getByLabelText('Draft');
  fireEvent.change(input,{target:{value:'unsaved draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Minimize Test panel'}));
  expect(isPanelMinimized('[data-test-panel]')).toBe(true);
  expect(view.container.querySelector('section')?.dataset.floatingPanelMinimized).toBe('true');
  const restore=screen.getByRole('button',{name:'Restore Test panel'});
  expect(view.container.contains(restore)).toBe(false);
  fireEvent.click(restore);
  expect(isPanelMinimized('[data-test-panel]')).toBe(false);
  expect(screen.getByLabelText('Draft')).toBe(input);
  expect((input as HTMLInputElement).value).toBe('unsaved draft');
 });
 it('removes the restore control when its parent panel closes',()=>{
  const view=render(<div><FloatingPanelMinimize label="Temporary"/></div>);
  fireEvent.click(screen.getByRole('button',{name:'Minimize Temporary'}));
  expect(screen.getByRole('button',{name:'Restore Temporary'})).toBeTruthy();
  view.unmount(); expect(screen.queryByRole('button',{name:'Restore Temporary'})).toBeNull();
 });
});

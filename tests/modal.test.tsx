import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from '../src/components/ui';

/*
 * A dialog stays open until it is closed on purpose: a text selected with the mouse that ends outside it, or a click
 * outside it, keeps it open with what was typed.
 */
function Editing({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Edit Category" onClose={onClose} closeLabel="Close">
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

it('stays open when a selection made in a box ends outside it, and when the page behind is clicked', async () => {
  const onClose = vi.fn();
  render(<Editing onClose={onClose} />);
  const box = screen.getByRole('textbox', { name: 'Name' });
  await userEvent.type(box, 'Maratha Kunbi');
  const backdrop = document.querySelector('.backdrop')!;
  /* Pressed in the box, let go outside: the browser clicks the backdrop. */
  fireEvent.mouseDown(box);
  fireEvent.mouseUp(backdrop);
  fireEvent.click(backdrop);
  await userEvent.click(backdrop);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Edit Category' })).toBeInTheDocument();
  expect(box).toHaveValue('Maratha Kunbi');
  /* Closed on purpose: its buttons, and Escape. */
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(3);
});

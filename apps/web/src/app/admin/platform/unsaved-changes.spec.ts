import { UnsavedChanges } from './unsaved-changes';

describe('UnsavedChanges', () => {
  let form = { name: '' };
  const unsaved = () => new UnsavedChanges(() => JSON.stringify(form));

  beforeEach(() => {
    form = { name: 'Teas' };
  });

  it('counts nothing before the form is loaded', () => {
    const changes = unsaved();
    form = { name: 'Coffee' };

    expect(changes.any()).toBe(false);
  });

  it('counts an edit against what was loaded, and not its undoing', () => {
    const changes = unsaved();
    changes.loaded();

    form = { name: 'Coffee' };
    expect(changes.any()).toBe(true);

    form = { name: 'Teas' };
    expect(changes.any()).toBe(false);
  });

  it('lets a saved form leave', () => {
    const changes = unsaved();
    changes.loaded();
    form = { name: 'Coffee' };

    changes.leave();

    expect(changes.any()).toBe(false);
  });
});

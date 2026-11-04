import { signal } from '@angular/core';

/**
 * An editor's edits against what it loaded, for the unsaved-changes guard.
 * Nothing counts until `loaded()`, so a record still loading or never found
 * lets the admin leave without a question.
 */
export class UnsavedChanges {
  private readonly original = signal<string | null>(null);
  private leaving = false;

  /** The form as JSON: two equal strings are an unchanged form. */
  constructor(private readonly snapshot: () => string) {}

  /** Takes the form as it stands as the state to compare against. */
  loaded(): void {
    this.original.set(this.snapshot());
  }

  /** The edits are saved: the navigation that follows passes the guard. */
  leave(): void {
    this.leaving = true;
  }

  any(): boolean {
    const original = this.original();
    return !this.leaving && original !== null && this.snapshot() !== original;
  }
}

import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import {
  emptyPackaging,
  PackagingDraft,
  parseCount,
  ProductPackagingEditor,
} from './product-packaging-editor';

/** Intl separates a number from its currency symbol with a non-breaking space. */
const plainSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const config = {
  catalog: {
    currency: { code: 'EUR', locale: 'de-DE' },
    boxUnits: { volume: 'm³', weight: 'kg' },
  },
} as unknown as DeploymentConfig;

function render(
  value: PackagingDraft,
  priceMinor: number | null = null,
): {
  fixture: ComponentFixture<ProductPackagingEditor>;
  emitted: PackagingDraft[];
} {
  TestBed.configureTestingModule({
    imports: [ProductPackagingEditor],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
    ],
  });
  const fixture = TestBed.createComponent(ProductPackagingEditor);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('priceMinor', priceMinor);
  const emitted: PackagingDraft[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  fixture.detectChanges();
  return { fixture, emitted };
}

/** Types into one of the packaging fields by its label. */
function type(
  fixture: ComponentFixture<ProductPackagingEditor>,
  id: string,
  text: string,
): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector(
    `#packaging-${id}`,
  );
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('parseCount', () => {
  it('accepts whole numbers of one or more', () => {
    expect(parseCount('6')).toBe(6);
    expect(parseCount(' 100 ')).toBe(100);
  });

  it('rejects anything else, so a typo is not read as a packaging rule', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount('0')).toBeNull();
    expect(parseCount('1.5')).toBeNull();
    expect(parseCount('six')).toBeNull();
    expect(parseCount('-6')).toBeNull();
  });
});

describe('ProductPackagingEditor', () => {
  it('lets the minimum follow the pack size while it has not been set apart', () => {
    const { fixture, emitted } = render(emptyPackaging());

    type(fixture, 'piecesPerPack', '6');

    expect(emitted.at(-1)).toMatchObject({
      piecesPerPack: '6',
      minPieceQty: '6',
    });
  });

  it('leaves a minimum somebody chose alone', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      piecesPerPack: '6',
      minPieceQty: '100',
    });

    type(fixture, 'piecesPerPack', '12');

    expect(emitted.at(-1)).toMatchObject({
      piecesPerPack: '12',
      minPieceQty: '100',
    });
  });

  it('prices each unit beside the row that defines it', () => {
    // €19.99 for ten pieces, ten to a pack, four packs to a box.
    const { fixture } = render(
      {
        ...emptyPackaging(),
        priceBasisPieces: '10',
        piecesPerPack: '10',
        minPieceQty: '10',
        packsPerBox: '4',
      },
      1999,
    );
    const text = plainSpaces(fixture.nativeElement.textContent);

    expect(text).toContain('1,999 € per piece');
    expect(text).toContain('19,99 € per pack');
    expect(text).toContain('79,96 € per box');
  });

  it('says nothing about a per-piece price when the price is already per piece', () => {
    const { fixture } = render(emptyPackaging(), 1999);

    expect(fixture.nativeElement.textContent).not.toContain('per piece');
  });

  it('puts a required count back to 1 when it is emptied', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      minPieceQty: '',
    });

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '#packaging-minPieceQty',
    );
    input.dispatchEvent(new Event('blur'));

    expect(emitted.at(-1)).toMatchObject({ minPieceQty: '1' });
  });

  it('leaves an optional count empty on blur — it means "not sold that way"', () => {
    const { fixture, emitted } = render(emptyPackaging());

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '#packaging-piecesPerPack',
    );
    input.dispatchEvent(new Event('blur'));

    expect(emitted).toEqual([]);
  });

  it('gives a box its first count as a real value, not a placeholder', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      piecesPerPack: '6',
    });

    type(fixture, 'packsPerBox', '4');

    expect(emitted.at(-1)).toMatchObject({ packsPerBox: '4', boxCount: '1' });
  });

  it('leaves a box count somebody raised alone', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      piecesPerPack: '6',
      packsPerBox: '4',
      boxCount: '2',
    });

    type(fixture, 'packsPerBox', '5');

    expect(emitted.at(-1)).toMatchObject({ boxCount: '2' });
  });

  it('takes the count away with the box it counted', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      piecesPerPack: '6',
      packsPerBox: '4',
      boxCount: '2',
      boxVolume: '0,250',
    });

    type(fixture, 'packsPerBox', '');

    expect(emitted.at(-1)).toMatchObject({
      boxCount: '',
      boxVolume: '',
      boxWeight: '',
    });
  });

  it('disables the count until there is a box to count, and puts it last', () => {
    const { fixture } = render({ ...emptyPackaging(), piecesPerPack: '6' });

    const count: HTMLInputElement = fixture.nativeElement.querySelector(
      '#packaging-boxCount',
    );
    expect(count.disabled).toBe(true);
    // No standing "1" to read as a rule on a product that has no box at all.
    expect(count.placeholder).toBe('');

    const ids = [...fixture.nativeElement.querySelectorAll('tbody input')].map(
      (i: HTMLInputElement) => i.id,
    );
    expect(ids.at(-1)).toBe('packaging-boxCount');
  });

  it('puts the count back to 1 when it is emptied under a box', () => {
    const { fixture, emitted } = render({
      ...emptyPackaging(),
      piecesPerPack: '6',
      packsPerBox: '4',
      boxCount: '',
    });

    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '#packaging-boxCount',
    );
    input.dispatchEvent(new Event('blur'));

    expect(emitted.at(-1)).toMatchObject({ boxCount: '1' });
  });

  it('warns while the basis does not divide the quantities', () => {
    const { fixture } = render({
      ...emptyPackaging(),
      piecesPerPack: '10',
      minPieceQty: '10',
      priceBasisPieces: '3',
    });

    expect(fixture.nativeElement.textContent).toContain(
      defaultAdminText.productEditor.packaging.basisMustDivide,
    );
  });

  it('stays quiet when the basis divides both', () => {
    const { fixture } = render({
      ...emptyPackaging(),
      piecesPerPack: '10',
      minPieceQty: '100',
      priceBasisPieces: '10',
    });

    expect(fixture.nativeElement.textContent).not.toContain(
      defaultAdminText.productEditor.packaging.basisMustDivide,
    );
  });
});

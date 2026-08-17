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

  it('shows what a piece costs once the price covers more than one', () => {
    // €19.99 for ten pieces — the case where a rounded per-piece price would
    // misrepresent the pack.
    const { fixture } = render(
      { ...emptyPackaging(), priceBasisPieces: '10' },
      1999,
    );

    expect(fixture.nativeElement.textContent).toContain('1,999');
  });

  it('says nothing about a per-piece price when the price is already per piece', () => {
    const { fixture } = render(emptyPackaging(), 1999);

    expect(fixture.nativeElement.textContent).not.toContain(
      defaultAdminText.productEditor.packaging.piecePricePreview.split('{')[0],
    );
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

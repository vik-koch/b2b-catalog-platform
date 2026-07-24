import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { defaultAppText } from '../config/app-text.fixture';

describe('Home', () => {
  it('renders the placeholder', async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: APP_TEXT, useValue: defaultAppText },
        provideRouter([]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Wholesale specialty coffee',
    );
  });
});

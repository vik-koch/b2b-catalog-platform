import { TestBed } from '@angular/core/testing';
import { Home } from './home';
import { AppService } from '../app.service';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHelloWorld: () =>
              Promise.resolve({
                status: 200,
                body: { message: 'Hello API' },
                headers: new Headers(),
              }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should render the message from the server', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Value from server',
    );
    expect(compiled.querySelector('p')?.textContent).toContain('Hello API');
  });
});

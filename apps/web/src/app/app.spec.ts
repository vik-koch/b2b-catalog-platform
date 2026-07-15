import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { AppService } from './app.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Value from server',
    );
    expect(compiled.querySelector('p')?.textContent).toContain('Hello API');
  });
});

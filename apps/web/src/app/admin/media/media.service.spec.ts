import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MediaService } from './media.service';

describe('MediaService', () => {
  let service: MediaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MediaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts the file as multipart to /api/media and returns the stored URL', async () => {
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    const promise = service.upload(file);

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/media'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);

    req.flush({ url: '/media/abc123.webp' });
    expect(await promise).toBe('/media/abc123.webp');
  });
});

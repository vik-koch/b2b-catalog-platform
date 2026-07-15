import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { initClient } from '@ts-rest/core';
import { helloWorldContract } from '@b2b-catalog-platform/shared';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppService {
  private http = inject(HttpClient);

  // During SSR the relative /api URL would resolve against the SSR server
  // itself, which does not serve the API — reach the NestJS process directly.
  private baseUrl = isPlatformServer(inject(PLATFORM_ID))
    ? (process.env['API_URL'] ?? 'http://localhost:3000/api')
    : '/api';

  private client = initClient(helloWorldContract, {
    baseUrl: this.baseUrl,
    api: async ({ path, method, headers, body }) => {
      const response = await lastValueFrom(
        this.http.request(method, path, {
          body,
          headers,
          observe: 'response',
          responseType: 'json',
        }),
      );

      return {
        status: response.status,
        body: response.body,
        headers: new Headers(
          response.headers
            .keys()
            .map((key): [string, string] => [
              key,
              response.headers.get(key) ?? '',
            ]),
        ),
      };
    },
  });

  getHelloWorld() {
    return this.client.getHelloWorld();
  }
}

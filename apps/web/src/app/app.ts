import { Component, inject, resource } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppService } from './app.service';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: `
    @if (helloWorldResource.isLoading()) {
      <p>Loading hello world from server...</p>
    } @else if (helloWorldResource.error()) {
      <p>Error: Failed to fetch hello world.</p>
    } @else if (helloWorldResource.value(); as value) {
      <h1>Value from server</h1>
      <p>{{ value.message }}</p>
    }
  `,
})
export class App {
  private appService = inject(AppService);

  helloWorldResource = resource({
    loader: async () => {
      const response = await this.appService.getHelloWorld();

      if (response.status === 200) {
        return response.body;
      }

      throw new Error('No response from server available');
    },
  });
}

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './layout/footer';
import { Header } from './layout/header';

@Component({
  imports: [RouterOutlet, Header, Footer],
  selector: 'app-root',
  template: `
    <div class="flex min-h-dvh flex-col bg-surface text-ink">
      <app-header />
      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <router-outlet />
      </main>
      <app-footer />
    </div>
  `,
})
export class App {}

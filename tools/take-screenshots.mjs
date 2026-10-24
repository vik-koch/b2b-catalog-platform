#!/usr/bin/env node
/**
 * Takes the screenshots the README and docs/features.md show, from the live
 * demo shops, and writes them to docs/images/ as WebP.
 *
 * Run it by hand when the storefront or the admin has visibly changed, or
 * before a release whose notes point at a screen; nothing checks it in CI,
 * because a picture of a live shop differs on every run.
 *
 *   node tools/take-screenshots.mjs
 *
 * Shots that need a login are skipped unless it is given:
 *   STAFF_EMAIL, STAFF_PASSWORD   an admin of the English shop
 *   REVIEWER_PASSWORD             the reviewer login in front of /erp/
 * SHOP_URL and KONTOR_URL default to the two demo shops; CUSTOMER_EMAIL and
 * CUSTOMER_PASSWORD to the customer login the README publishes. Pass shot names
 * as arguments to take only those.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'docs/images';
const SHOP = process.env.SHOP_URL ?? 'https://b2b.vikkoch.com';
const KONTOR = process.env.KONTOR_URL ?? 'https://b2b-dev.vikkoch.com';
const CUSTOMER = {
  email: process.env.CUSTOMER_EMAIL ?? 'purchasing@brennan-biologics.example',
  password: process.env.CUSTOMER_PASSWORD ?? 'demo-slaney-2014',
};
const STAFF = process.env.STAFF_EMAIL
  ? { email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD }
  : null;
const REVIEWER = process.env.REVIEWER_PASSWORD;

const DESKTOP = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
};
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const PRODUCT = '/product/single-channel-pipette-20-200';
const ORDER = 'SL-260811-4207';

/** Each pass is one browser context: who is signed in, and what it shows. */
const passes = [
  {
    name: 'guest',
    device: DESKTOP,
    shots: {
      'storefront-category': (page) => open(page, '/catalog/tubes'),
      'storefront-product': (page) => open(page, PRODUCT),
      'storefront-search': async (page) => {
        await open(page, '/');
        // Typed key by key, as a person would: suggestions follow input events.
        const answered = page.waitForResponse(
          (response) =>
            response.url().includes('/search/suggestions?q=tube') &&
            response.ok(),
        );
        await page
          .getByRole('combobox', { name: 'Search products' })
          .pressSequentially('tube', { delay: 120 });
        await answered;
        await settle(page);
      },
    },
  },
  {
    name: 'phone',
    device: MOBILE,
    shots: {
      'mobile-home': (page) => open(page, '/'),
      'mobile-product': (page) => open(page, PRODUCT),
    },
  },
  {
    name: 'customer',
    device: DESKTOP,
    signIn: CUSTOMER,
    shots: {
      'customer-checkout': async (page) => {
        for (const path of [PRODUCT, '/product/pipette-tips-200-racked']) {
          await open(page, path);
          await page
            .getByRole('button', { name: 'Add to cart' })
            .first()
            .click();
        }
        await open(page, '/checkout');
      },
      'customer-order': (page) => open(page, `/account/orders/${ORDER}`),
    },
  },
  {
    name: 'staff',
    device: DESKTOP,
    signIn: STAFF,
    shots: {
      'admin-products': (page) => open(page, '/admin/products'),
      'admin-catalog-runs': (page) => open(page, '/admin/sync/catalog'),
      'admin-order': (page) => open(page, `/admin/orders/${ORDER}`),
    },
  },
  {
    name: 'reviewer',
    device: {
      ...DESKTOP,
      httpCredentials: { username: 'reviewer', password: REVIEWER },
    },
    enabled: Boolean(REVIEWER),
    shots: { 'back-office': (page) => open(page, '/erp/') },
  },
  {
    name: 'german',
    device: DESKTOP,
    base: KONTOR,
    shots: { 'kontor-home': (page) => open(page, '/') },
  },
];

let base = SHOP;

/** Network quiet, fonts in, and every picture on screen loaded. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate('document.fonts.ready');
  const pending = `[...document.images].filter((img) => {
    const box = img.getBoundingClientRect();
    const onScreen = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    // A slide not yet shown has no source and never loads; it is not waited for.
    return onScreen && box.width > 0 && img.getAttribute('src') && !(img.complete && img.naturalWidth > 0);
  })`;
  await page
    .waitForFunction(`${pending}.length === 0`, null, { timeout: 15000 })
    .catch(async () => {
      const sources = await page.evaluate(
        `${pending}.map((img) => img.currentSrc || img.src)`,
      );
      console.warn(`  pictures still loading: ${sources.join(', ')}`);
    });
}

async function open(page, path) {
  await page.goto(base + path);
  await settle(page);
}

/** Answers the cookie banner once per context, so it is not in every picture. */
async function dismissBanner(page) {
  const reject = page.getByRole('button', { name: /^(Reject|Ablehnen)$/ });
  if (await reject.isVisible()) await reject.click();
}

async function signIn(page, { email, password }) {
  await open(page, '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;
for (const pass of passes) {
  const wanted = Object.keys(pass.shots).filter(
    (name) => !only.length || only.includes(name),
  );
  if (!wanted.length) continue;
  if (pass.enabled === false || pass.signIn === null) {
    console.log(
      `${pass.name}: skipped (no login given) — ${wanted.join(', ')}`,
    );
    continue;
  }
  base = pass.base ?? SHOP;
  const context = await browser.newContext(pass.device);
  const page = await context.newPage();
  await open(page, '/');
  await dismissBanner(page);
  if (pass.signIn) await signIn(page, pass.signIn);
  for (const name of wanted) {
    try {
      await pass.shots[name](page);
      const png = await page.screenshot();
      await sharp(png).webp({ quality: 80 }).toFile(`${OUT}/${name}.webp`);
      console.log(`${name}: ${base}${new URL(page.url()).pathname}`);
    } catch (error) {
      failed = true;
      console.error(`${name}: ${error.message.split('\n')[0]}`);
    }
  }
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);

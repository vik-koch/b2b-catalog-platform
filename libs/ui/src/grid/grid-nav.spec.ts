import { gridParam } from './grid-nav';

describe('gridParam', () => {
  it('drops the default, so the plain URL is the default view', () => {
    expect(gridParam('all', 'all')).toBeNull();
  });

  it('keeps anything else', () => {
    expect(gridParam('price', 'relevance')).toBe('price');
  });
});

import metadata from '../metadata.min.json' with { type: 'json' };
import getCountries from './getCountries.js';
describe('getCountries', function () {
  it('should get countries list', function () {
    expect(getCountries(metadata).indexOf('RU') > 0).to.equal(true);
  });
});
//# sourceMappingURL=getCountries.test.js.map
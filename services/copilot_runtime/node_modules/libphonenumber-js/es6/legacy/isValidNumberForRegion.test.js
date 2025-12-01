import metadata from '../../metadata.min.json' with { type: 'json' };
import isValidNumberForRegionCustom from './isValidNumberForRegion.js';
import _isValidNumberForRegion from './isValidNumberForRegion_.js';
function isValidNumberForRegion() {
  for (var _len = arguments.length, parameters = new Array(_len), _key = 0; _key < _len; _key++) {
    parameters[_key] = arguments[_key];
  }
  parameters.push(metadata);
  return isValidNumberForRegionCustom.apply(this, parameters);
}
describe('isValidNumberForRegion', function () {
  it('should detect if is valid number for region', function () {
    expect(isValidNumberForRegion('07624369230', 'GB')).to.equal(false);
    expect(isValidNumberForRegion('07624369230', 'IM')).to.equal(true);
  });
  it('should validate arguments', function () {
    expect(function () {
      return isValidNumberForRegion({
        phone: '7624369230',
        country: 'GB'
      });
    }).to["throw"]('number must be a string');
    expect(function () {
      return isValidNumberForRegion('7624369230');
    }).to["throw"]('country must be a string');
  });
  it('should work in edge cases', function () {
    // Not a "viable" phone number.
    expect(isValidNumberForRegion('7', 'GB')).to.equal(false);

    // `options` argument `if/else` coverage.
    expect(_isValidNumberForRegion('07624369230', 'GB', {}, metadata)).to.equal(false);
  });
});
//# sourceMappingURL=isValidNumberForRegion.test.js.map
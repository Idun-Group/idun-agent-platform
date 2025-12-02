import _isValidPhoneNumber from './isValidPhoneNumber.js';
import metadata from '../metadata.min.json' with { type: 'json' };
function isValidPhoneNumber() {
  for (var _len = arguments.length, parameters = new Array(_len), _key = 0; _key < _len; _key++) {
    parameters[_key] = arguments[_key];
  }
  parameters.push(metadata);
  return _isValidPhoneNumber.apply(this, parameters);
}
describe('isValidPhoneNumber', function () {
  it('should detect whether a phone number is valid', function () {
    expect(isValidPhoneNumber('8 (800) 555 35 35', 'RU')).to.equal(true);
    expect(isValidPhoneNumber('8 (800) 555 35 35 0', 'RU')).to.equal(false);
    expect(isValidPhoneNumber('Call: 8 (800) 555 35 35', 'RU')).to.equal(false);
    expect(isValidPhoneNumber('8 (800) 555 35 35', {
      defaultCountry: 'RU'
    })).to.equal(true);
    expect(isValidPhoneNumber('+7 (800) 555 35 35')).to.equal(true);
    expect(isValidPhoneNumber('+7 1 (800) 555 35 35')).to.equal(false);
    expect(isValidPhoneNumber(' +7 (800) 555 35 35')).to.equal(false);
    expect(isValidPhoneNumber(' ')).to.equal(false);
  });
});
//# sourceMappingURL=isValidPhoneNumber.test.js.map
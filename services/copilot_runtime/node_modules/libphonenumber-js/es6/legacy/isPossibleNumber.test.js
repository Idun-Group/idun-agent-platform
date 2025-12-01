import metadata from '../../metadata.min.json' with { type: 'json' };
import _isPossibleNumber from './isPossibleNumber.js';
function isPossibleNumber() {
  for (var _len = arguments.length, parameters = new Array(_len), _key = 0; _key < _len; _key++) {
    parameters[_key] = arguments[_key];
  }
  parameters.push(metadata);
  return _isPossibleNumber.apply(this, parameters);
}
describe('isPossibleNumber', function () {
  it('should work', function () {
    expect(isPossibleNumber('+79992223344')).to.equal(true);
    expect(isPossibleNumber({
      phone: '1112223344',
      country: 'RU'
    })).to.equal(true);
    expect(isPossibleNumber({
      phone: '111222334',
      country: 'RU'
    })).to.equal(false);
    expect(isPossibleNumber({
      phone: '11122233445',
      country: 'RU'
    })).to.equal(false);
    expect(isPossibleNumber({
      phone: '1112223344',
      countryCallingCode: 7
    })).to.equal(true);
  });
  it('should work v2', function () {
    expect(isPossibleNumber({
      nationalNumber: '111222334',
      countryCallingCode: 7
    }, {
      v2: true
    })).to.equal(false);
    expect(isPossibleNumber({
      nationalNumber: '1112223344',
      countryCallingCode: 7
    }, {
      v2: true
    })).to.equal(true);
    expect(isPossibleNumber({
      nationalNumber: '11122233445',
      countryCallingCode: 7
    }, {
      v2: true
    })).to.equal(false);
  });
  it('should work in edge cases', function () {
    // Invalid `PhoneNumber` argument.
    expect(function () {
      return isPossibleNumber({}, {
        v2: true
      });
    }).to["throw"]('Invalid phone number object passed');

    // Empty input is passed.
    // This is just to support `isValidNumber({})`
    // for cases when `parseNumber()` returns `{}`.
    expect(isPossibleNumber({})).to.equal(false);
    expect(function () {
      return isPossibleNumber({
        phone: '1112223344'
      });
    }).to["throw"]('Invalid phone number object passed');

    // Incorrect country.
    expect(function () {
      return isPossibleNumber({
        phone: '1112223344',
        country: 'XX'
      });
    }).to["throw"]('Unknown country');
  });
});
//# sourceMappingURL=isPossibleNumber.test.js.map
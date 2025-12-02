function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
import metadata from '../../metadata.max.json' with { type: 'json' };
import Metadata from '../metadata.js';
import _getNumberType from './getNumberType.js';
function getNumberType() {
  for (var _len = arguments.length, parameters = new Array(_len), _key = 0; _key < _len; _key++) {
    parameters[_key] = arguments[_key];
  }
  parameters.push(metadata);
  return _getNumberType.apply(this, parameters);
}
describe('getNumberType', function () {
  it('should infer phone number type MOBILE', function () {
    expect(getNumberType('9150000000', 'RU')).to.equal('MOBILE');
    expect(getNumberType('7912345678', 'GB')).to.equal('MOBILE');
    expect(getNumberType('51234567', 'EE')).to.equal('MOBILE');
  });
  it('should infer phone number types', function () {
    expect(getNumberType('88005553535', 'RU')).to.equal('TOLL_FREE');
    expect(getNumberType('8005553535', 'RU')).to.equal('TOLL_FREE');
    expect(getNumberType('4957777777', 'RU')).to.equal('FIXED_LINE');
    expect(getNumberType('8030000000', 'RU')).to.equal('PREMIUM_RATE');
    expect(getNumberType('2133734253', 'US')).to.equal('FIXED_LINE_OR_MOBILE');
    expect(getNumberType('5002345678', 'US')).to.equal('PERSONAL_NUMBER');
  });
  it('should work when no country is passed', function () {
    expect(getNumberType('+79150000000')).to.equal('MOBILE');
  });
  it('should return FIXED_LINE_OR_MOBILE when there is ambiguity', function () {
    // (no such country in the metadata, therefore no unit test for this `if`)
  });
  it('should work in edge cases', function () {
    var thrower;

    // // No metadata
    // thrower = () => _getNumberType({ phone: '+78005553535' })
    // thrower.should.throw('`metadata` argument not passed')

    // Parsed phone number
    expect(getNumberType({
      phone: '8005553535',
      country: 'RU'
    })).to.equal('TOLL_FREE');

    // Invalid phone number
    expect(type(getNumberType('123', 'RU'))).to.equal('undefined');

    // Invalid country
    thrower = function thrower() {
      return getNumberType({
        phone: '8005553535',
        country: 'RUS'
      });
    };
    expect(thrower).to["throw"]('Unknown country');

    // Numerical `value`
    thrower = function thrower() {
      return getNumberType(89150000000, 'RU');
    };
    expect(thrower).to["throw"]('A phone number must either be a string or an object of shape { phone, [country] }.');

    // When `options` argument is passed.
    expect(getNumberType('8005553535', 'RU', {})).to.equal('TOLL_FREE');
    expect(getNumberType('+78005553535', {})).to.equal('TOLL_FREE');
    expect(getNumberType({
      phone: '8005553535',
      country: 'RU'
    }, {})).to.equal('TOLL_FREE');
  });
});
function type(something) {
  return _typeof(something);
}
//# sourceMappingURL=getNumberType.test.js.map
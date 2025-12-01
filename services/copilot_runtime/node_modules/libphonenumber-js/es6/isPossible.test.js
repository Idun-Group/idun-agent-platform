function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
import metadata from '../metadata.min.json' with { type: 'json' };
import _isPossibleNumber from './isPossible.js';
import parsePhoneNumber from './parsePhoneNumber.js';
function isPossibleNumber() {
  var v2;
  for (var _len = arguments.length, parameters = new Array(_len), _key = 0; _key < _len; _key++) {
    parameters[_key] = arguments[_key];
  }
  if (parameters.length < 1) {
    // `input` parameter.
    parameters.push(undefined);
  } else {
    // Convert string `input` to a `PhoneNumber` instance.
    if (typeof parameters[0] === 'string') {
      v2 = true;
      parameters[0] = parsePhoneNumber(parameters[0], _objectSpread(_objectSpread({}, parameters[1]), {}, {
        extract: false
      }), metadata);
    }
  }
  if (parameters.length < 2) {
    // `options` parameter.
    parameters.push(undefined);
  }
  // Set `v2` flag.
  parameters[1] = _objectSpread({
    v2: v2
  }, parameters[1]);
  // Add `metadata` parameter.
  parameters.push(metadata);
  // Call the function.
  return _isPossibleNumber.apply(this, parameters);
}
describe('isPossible', function () {
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
  it('should handle the cases when multiple countries share the same country calling code and a phone number is possible in non-"main" country and is not possible in the "main" country', function () {
    // Tests that Californian numbers `+1310xxxx` are considered possible.
    // https://gitlab.com/catamphetamine/react-phone-number-input/-/issues/228#note_1872536721
    var phoneNumber = parsePhoneNumber('+13100000', undefined, metadata);
    expect(phoneNumber.country).to.equal('CA');
    expect(phoneNumber.isPossible()).to.equal(true);
    expect(phoneNumber.isValid()).to.equal(true);
    expect(phoneNumber.nationalNumber).to.equal('3100000');
  });
});
//# sourceMappingURL=isPossible.test.js.map
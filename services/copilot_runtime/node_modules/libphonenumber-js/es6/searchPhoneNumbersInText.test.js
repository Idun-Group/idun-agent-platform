function _createForOfIteratorHelperLoose(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (t) return (t = t.call(r)).next.bind(t); if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var o = 0; return function () { return o >= r.length ? { done: !0 } : { done: !1, value: r[o++] }; }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
import searchPhoneNumbersInText from './searchPhoneNumbersInText.js';
import metadata from '../metadata.min.json' with { type: 'json' };
describe('searchPhoneNumbersInText', function () {
  it('should find phone numbers (with default country)', function () {
    var NUMBERS = ['+78005553535', '+12133734253'];
    for (var _iterator = _createForOfIteratorHelperLoose(searchPhoneNumbersInText('The number is +7 (800) 555-35-35 and not (213) 373-4253 as written in the document.', 'US', metadata)), _step; !(_step = _iterator()).done;) {
      var number = _step.value;
      expect(number.number.number).to.equal(NUMBERS[0]);
      NUMBERS.shift();
    }
  });
  it('should find phone numbers', function () {
    var NUMBERS = ['+78005553535', '+12133734253'];
    for (var _iterator2 = _createForOfIteratorHelperLoose(searchPhoneNumbersInText('The number is +7 (800) 555-35-35 and not (213) 373-4253 as written in the document.', metadata)), _step2; !(_step2 = _iterator2()).done;) {
      var number = _step2.value;
      expect(number.number.number).to.equal(NUMBERS[0]);
      NUMBERS.shift();
    }
  });
  it('should find phone numbers in text', function () {
    var expectedNumbers = [{
      country: 'RU',
      nationalNumber: '8005553535',
      startsAt: 14,
      endsAt: 32
    }, {
      country: 'US',
      nationalNumber: '2133734253',
      startsAt: 41,
      endsAt: 55
    }];
    for (var _iterator3 = _createForOfIteratorHelperLoose(searchPhoneNumbersInText('The number is +7 (800) 555-35-35 and not (213) 373-4253 as written in the document.', 'US', metadata)), _step3; !(_step3 = _iterator3()).done;) {
      var number = _step3.value;
      var expected = expectedNumbers.shift();
      expect(number.startsAt).to.equal(expected.startsAt);
      expect(number.endsAt).to.equal(expected.endsAt);
      expect(number.number.nationalNumber).to.equal(expected.nationalNumber);
      expect(number.number.country).to.equal(expected.country);
    }
    expect(expectedNumbers.length).to.equal(0);
  });
});
//# sourceMappingURL=searchPhoneNumbersInText.test.js.map
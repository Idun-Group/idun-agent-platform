import parseIncompletePhoneNumber, { parsePhoneNumberCharacter } from './parseIncompletePhoneNumber.js';
describe('parseIncompletePhoneNumber', function () {
  it('should fix `for ... of` loop coverage', function () {
    // For some weird reason, "istanbul" doesn't know how to properly cover
    // a `for ... of` loop that has been transpiled with Babel.
    // For some reason, it attempts to cover the `for ... of` polyfill coode too,
    // meaning that it complains if that polyfill's edge case is not covered.
    // This test case works around that weird bug by covering that edge case of the polyfill.
    //
    // When it runs `npm test` command, it does so without `babel` transpilation,
    // so the error is gonna be "string.split is not a function or its return value is not iterable".
    //
    // When it runs `npm run test-coverage` command, it does so with `babel` transpilation,
    // so the error is gonna be "Invalid attempt to iterate non-iterable instance.".
    //
    expect(function () {
      parseIncompletePhoneNumber({
        split: function split() {
          return 123;
        }
      });
    }).to["throw"](/(not iterable|non-iterable)/);
  });
  it('should parse phone number character', function () {
    // Accepts leading `+`.
    expect(parsePhoneNumberCharacter('+')).to.equal('+');

    // Doesn't accept non-leading `+`.
    expect(parsePhoneNumberCharacter('+', '+')).to.be.undefined;

    // Parses digits.
    expect(parsePhoneNumberCharacter('1')).to.equal('1');

    // Parses non-European digits.
    expect(parsePhoneNumberCharacter('٤')).to.equal('4');

    // Dismisses other characters.
    expect(parsePhoneNumberCharacter('-')).to.be.undefined;
  });
  it('should parse incomplete phone number', function () {
    expect(parseIncompletePhoneNumber('')).to.equal('');

    // Doesn't accept non-leading `+`.
    expect(parseIncompletePhoneNumber('++')).to.equal('+');

    // Accepts leading `+`.
    expect(parseIncompletePhoneNumber('+7 800 555')).to.equal('+7800555');

    // Parses digits.
    expect(parseIncompletePhoneNumber('8 (800) 555')).to.equal('8800555');

    // Parses non-European digits.
    expect(parseIncompletePhoneNumber('+٤٤٢٣٢٣٢٣٤')).to.equal('+442323234');
  });
  it('should work with a new `context` argument in `parsePhoneNumberCharacter()` function (international number)', function () {
    var stopped = false;
    var emit = function emit(event) {
      switch (event) {
        case 'end':
          stopped = true;
          break;
      }
    };
    expect(parsePhoneNumberCharacter('+', undefined, emit)).to.equal('+');
    expect(stopped).to.equal(false);
    expect(parsePhoneNumberCharacter('1', '+', emit)).to.equal('1');
    expect(stopped).to.equal(false);
    expect(parsePhoneNumberCharacter('+', '+1', emit)).to.be.undefined;
    expect(stopped).to.equal(true);
    expect(parsePhoneNumberCharacter('2', '+1', emit)).to.equal('2');
    expect(stopped).to.equal(true);
  });
  it('should work with a new `context` argument in `parsePhoneNumberCharacter()` function (national number)', function () {
    var stopped = false;
    var emit = function emit(event) {
      switch (event) {
        case 'end':
          stopped = true;
          break;
      }
    };
    expect(parsePhoneNumberCharacter('2', undefined, emit)).to.equal('2');
    expect(stopped).to.equal(false);
    expect(parsePhoneNumberCharacter('+', '2', emit)).to.be.undefined;
    expect(stopped).to.equal(true);
    expect(parsePhoneNumberCharacter('1', '2', emit)).to.equal('1');
    expect(stopped).to.equal(true);
  });
  it('should call `eventListener` when the input ends abruptly', function () {
    var parsingEnded = false;
    var eventListener = function eventListener(event) {
      parsingEnded = true;
      if (event !== 'end') {
        throw new Error("Unexpected event: ".concat(event));
      }
    };

    // Doesn't accept non-leading `+`.
    expect(parsePhoneNumberCharacter('+', '+123', eventListener)).to.be.undefined;
    expect(parsingEnded).to.equal(true);
  });
});
//# sourceMappingURL=parseIncompletePhoneNumber.test.js.map
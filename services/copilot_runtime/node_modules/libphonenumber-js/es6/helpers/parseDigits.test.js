import parseDigits from './parseDigits.js';
describe('parseDigits', function () {
  it('should parse digits', function () {
    expect(parseDigits('+٤٤٢٣٢٣٢٣٤')).to.equal('442323234');
  });
});
//# sourceMappingURL=parseDigits.test.js.map
import extractCountryCallingCode from './extractCountryCallingCode.js';
import metadata from '../../metadata.min.json' with { type: 'json' };
describe('extractCountryCallingCode', function () {
  it('should extract country calling code from a number', function () {
    expect(extractCountryCallingCode('+78005553535', null, null, null, metadata)).to.deep.equal({
      countryCallingCodeSource: 'FROM_NUMBER_WITH_PLUS_SIGN',
      countryCallingCode: '7',
      number: '8005553535'
    });
    expect(extractCountryCallingCode('+7800', null, null, null, metadata)).to.deep.equal({
      countryCallingCodeSource: 'FROM_NUMBER_WITH_PLUS_SIGN',
      countryCallingCode: '7',
      number: '800'
    });
    expect(extractCountryCallingCode('', null, null, null, metadata)).to.deep.equal({});
  });
});
//# sourceMappingURL=extractCountryCallingCode.test.js.map
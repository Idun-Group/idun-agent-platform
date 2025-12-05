import Metadata from '../metadata.js';
import metadata from '../../metadata.min.json' with { type: 'json' };
import extractNationalNumberFromPossiblyIncompleteNumber from './extractNationalNumberFromPossiblyIncompleteNumber.js';
describe('extractNationalNumberFromPossiblyIncompleteNumber', function () {
  it('should parse a carrier code when there is no national prefix transform rule', function () {
    var meta = new Metadata(metadata);
    meta.country('AU');
    expect(extractNationalNumberFromPossiblyIncompleteNumber('18311800123', meta)).to.deep.equal({
      nationalPrefix: undefined,
      carrierCode: '1831',
      nationalNumber: '1800123'
    });
  });
});
//# sourceMappingURL=extractNationalNumberFromPossiblyIncompleteNumber.test.js.map
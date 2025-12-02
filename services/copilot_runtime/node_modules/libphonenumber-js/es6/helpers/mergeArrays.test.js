import mergeArrays from './mergeArrays.js';
describe('mergeArrays', function () {
  it('should merge arrays', function () {
    expect(mergeArrays([1, 2], [2, 3])).to.deep.equal([1, 2, 3]);
  });
});
//# sourceMappingURL=mergeArrays.test.js.map
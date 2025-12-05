import matchesEntirely from './matchesEntirely.js';
describe('matchesEntirely', function () {
  it('should work in edge cases', function () {
    // No text.
    expect(matchesEntirely(undefined, '')).to.equal(true);

    // "OR" in regexp.
    expect(matchesEntirely('911231231', '4\d{8}|[1-9]\d{7}')).to.equal(false);
  });
});
//# sourceMappingURL=matchesEntirely.test.js.map
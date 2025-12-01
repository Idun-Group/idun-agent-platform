import applyInternationalSeparatorStyle from './applyInternationalSeparatorStyle.js';
describe('applyInternationalSeparatorStyle', function () {
  it('should change Google\'s international format style', function () {
    expect(applyInternationalSeparatorStyle('(xxx) xxx-xx-xx')).to.equal('xxx xxx xx xx');
    expect(applyInternationalSeparatorStyle('(xxx)xxx')).to.equal('xxx xxx');
  });
});
//# sourceMappingURL=applyInternationalSeparatorStyle.test.js.map
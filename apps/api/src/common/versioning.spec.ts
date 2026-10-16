import { API_VERSION_PREFIX, withoutVersionPrefix } from './versioning';

describe('withoutVersionPrefix', () => {
  it('drops the leading version segment the web sends', () => {
    expect(withoutVersionPrefix(`/${API_VERSION_PREFIX}/customers`)).toBe('/customers');
    expect(withoutVersionPrefix(`/${API_VERSION_PREFIX}/contracts/abc/payments`)).toBe('/contracts/abc/payments');
    expect(withoutVersionPrefix(`/${API_VERSION_PREFIX}`)).toBe('/');
    expect(withoutVersionPrefix('/v12/leaves/types')).toBe('/leaves/types');
  });

  it('leaves a path without a version prefix as it is', () => {
    expect(withoutVersionPrefix('/customers')).toBe('/customers');
    expect(withoutVersionPrefix('/vendors/v1')).toBe('/vendors/v1');
    expect(withoutVersionPrefix('/v1x/customers')).toBe('/v1x/customers');
    expect(withoutVersionPrefix('/customers/v1/notes')).toBe('/customers/v1/notes');
  });
});

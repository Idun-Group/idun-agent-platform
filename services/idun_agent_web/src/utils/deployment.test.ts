import { describe, expect, it } from 'vitest';

import { getDeploymentType } from './deployment';

describe('getDeploymentType', () => {
    it('returns "cloud" for cloud.idunplatform.com', () => {
        expect(getDeploymentType('cloud.idunplatform.com')).toBe('cloud');
    });

    it('returns "self-hosted" for localhost', () => {
        expect(getDeploymentType('localhost')).toBe('self-hosted');
    });

    it('returns "self-hosted" for a custom domain', () => {
        expect(getDeploymentType('agents.mycompany.com')).toBe('self-hosted');
    });

    it('returns "self-hosted" for a private IP address', () => {
        expect(getDeploymentType('192.168.1.10')).toBe('self-hosted');
    });

    it('returns "self-hosted" for 127.0.0.1', () => {
        expect(getDeploymentType('127.0.0.1')).toBe('self-hosted');
    });

    it('is case-sensitive — mixed-case cloud hostname is self-hosted', () => {
        // Hostnames are always lowercase in browsers, so "CLOUD.idunplatform.com"
        // would never occur in practice, but we verify exact matching.
        expect(getDeploymentType('CLOUD.idunplatform.com')).toBe('self-hosted');
    });

    it('does not match a subdomain of cloud.idunplatform.com', () => {
        expect(getDeploymentType('api.cloud.idunplatform.com')).toBe('self-hosted');
    });

    it('does not match an unrelated idunplatform.com subdomain', () => {
        expect(getDeploymentType('app.idunplatform.com')).toBe('self-hosted');
    });
});

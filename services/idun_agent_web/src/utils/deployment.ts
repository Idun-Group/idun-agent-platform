/**
 * Deployment type detection for PostHog analytics.
 *
 * Events from cloud.idunplatform.com are tagged "cloud".
 * All other deployments (self-hosted, localhost, custom domains) are tagged "self-hosted".
 */

export type DeploymentType = 'cloud' | 'self-hosted';

const CLOUD_HOSTNAME = 'cloud.idunplatform.com';

/**
 * Returns the deployment type based on the current hostname.
 *
 * Detects cloud deployment by matching `cloud.idunplatform.com`.
 * Everything else is considered self-hosted.
 */
export function getDeploymentType(hostname: string = window.location.hostname): DeploymentType {
    return hostname === CLOUD_HOSTNAME ? 'cloud' : 'self-hosted';
}

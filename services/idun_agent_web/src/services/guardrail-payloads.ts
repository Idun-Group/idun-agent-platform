/**
 * Guardrail payload builders aligned to the actual manager backend.
 *
 * The manager currently supports exactly 2 guardrail types:
 *   - SimpleBanListConfig  (config_id: "ban_list")
 *   - SimplePIIConfig      (config_id: "detect_pii")
 *
 * Source of truth: libs/idun_agent_schema/src/idun_agent_schema/manager/guardrail_configs.py
 *
 * The `guardrail` field on ManagedGuardrailCreate is a FLAT union
 * (not wrapped in { input: [...] }). The manager's convert_guardrail()
 * handles expansion to the engine format internally.
 */

export interface SimpleBanListConfig {
    config_id: 'ban_list';
    banned_words: string[];
}

export interface SimplePIIConfig {
    config_id: 'detect_pii';
    pii_entities: string[];
}

export type ManagerGuardrailConfig = SimpleBanListConfig | SimplePIIConfig;

export const PII_ENTITY_VALUES = [
    'Email',
    'Phone Number',
    'Credit Card',
    'SSN',
    'Location',
] as const;

export type PIIEntity = typeof PII_ENTITY_VALUES[number];

export type SupportedGuardrailAppType = 'BanList' | 'DetectPII';

export const SUPPORTED_GUARDRAIL_TYPES: SupportedGuardrailAppType[] = [
    'BanList',
    'DetectPII',
];

export function isSupportedGuardrailType(type: string): type is SupportedGuardrailAppType {
    return SUPPORTED_GUARDRAIL_TYPES.includes(type as SupportedGuardrailAppType);
}

type FormValues = Record<string, string>;

function splitLines(val: string | undefined): string[] {
    return val ? val.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

function splitComma(val: string | undefined): string[] {
    return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}

export function buildGuardrailConfig(
    appType: string,
    formValues: FormValues,
): ManagerGuardrailConfig {
    switch (appType) {
        case 'BanList':
            return {
                config_id: 'ban_list',
                banned_words: splitLines(formValues.banned_words),
            };

        case 'DetectPII':
            return {
                config_id: 'detect_pii',
                pii_entities: splitComma(formValues.pii_entities),
            };

        default:
            throw new Error(`Unsupported guardrail type: ${appType}. Only BanList and DetectPII are supported by the backend.`);
    }
}

export interface GuardrailValidationError {
    field: string;
    message: string;
}

export function validateGuardrailForm(
    appType: string,
    formValues: FormValues,
): GuardrailValidationError[] {
    const errors: GuardrailValidationError[] = [];

    switch (appType) {
        case 'BanList':
            if (!splitLines(formValues.banned_words).length)
                errors.push({ field: 'banned_words', message: 'At least one banned word is required' });
            break;

        case 'DetectPII':
            if (!splitComma(formValues.pii_entities).length)
                errors.push({ field: 'pii_entities', message: 'At least one PII entity is required' });
            else {
                const invalid = splitComma(formValues.pii_entities).filter(
                    e => !(PII_ENTITY_VALUES as readonly string[]).includes(e),
                );
                if (invalid.length)
                    errors.push({ field: 'pii_entities', message: `Invalid entities: ${invalid.join(', ')}` });
            }
            break;

        default:
            errors.push({ field: '_type', message: `${appType} is not yet supported by the backend` });
    }

    return errors;
}

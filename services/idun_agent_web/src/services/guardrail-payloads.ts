/**
 * Guardrail payload builders aligned to the actual manager backend.
 *
 * Source of truth: libs/idun_agent_schema/src/idun_agent_schema/manager/guardrail_configs.py
 *
 * The `guardrail` field on ManagedGuardrailCreate is a FLAT union
 * (not wrapped in { input: [...] }). Configs include api_key and
 * reject_message and are stored directly in engine-ready format.
 */

export interface SimpleBanListConfig {
    config_id: 'ban_list';
    api_key?: string;
    reject_message?: string;
    banned_words: string[];
}

export interface SimplePIIConfig {
    config_id: 'detect_pii';
    api_key?: string;
    reject_message?: string;
    pii_entities: string[];
}

export interface SimpleNSFWTextConfig {
    config_id: 'nsfw_text';
    api_key?: string;
    reject_message?: string;
    threshold: number;
}

export interface SimpleToxicLanguageConfig {
    config_id: 'toxic_language';
    api_key?: string;
    reject_message?: string;
    threshold: number;
}

export interface SimpleGibberishTextConfig {
    config_id: 'gibberish_text';
    api_key?: string;
    reject_message?: string;
    threshold: number;
}

export interface SimpleBiasCheckConfig {
    config_id: 'bias_check';
    api_key?: string;
    reject_message?: string;
    threshold: number;
}

export interface SimpleCompetitionCheckConfig {
    config_id: 'competition_check';
    api_key?: string;
    reject_message?: string;
    competitors: string[];
}

export interface SimpleCorrectLanguageConfig {
    config_id: 'correct_language';
    api_key?: string;
    reject_message?: string;
    expected_languages: string[];
}

export interface SimpleRestrictToTopicConfig {
    config_id: 'restrict_to_topic';
    api_key?: string;
    reject_message?: string;
    topics: string[];
}

export type ManagerGuardrailConfig =
    | SimpleBanListConfig
    | SimplePIIConfig
    | SimpleNSFWTextConfig
    | SimpleToxicLanguageConfig
    | SimpleGibberishTextConfig
    | SimpleBiasCheckConfig
    | SimpleCompetitionCheckConfig
    | SimpleCorrectLanguageConfig
    | SimpleRestrictToTopicConfig;

export const PII_ENTITY_VALUES = [
    'Email',
    'Phone Number',
    'Credit Card',
    'SSN',
    'Location',
] as const;

export type PIIEntity = typeof PII_ENTITY_VALUES[number];

export type SupportedGuardrailAppType =
    | 'BanList'
    | 'DetectPII'
    | 'NSFWText'
    | 'ToxicLanguage'
    | 'GibberishText'
    | 'BiasCheck'
    | 'CompetitionCheck'
    | 'CorrectLanguage'
    | 'RestrictTopic';

export const SUPPORTED_GUARDRAIL_TYPES: SupportedGuardrailAppType[] = [
    'BanList',
    'DetectPII',
    'NSFWText',
    'ToxicLanguage',
    'GibberishText',
    'BiasCheck',
    'CompetitionCheck',
    'CorrectLanguage',
    'RestrictTopic',
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

function parseThreshold(val: string | undefined): number {
    const n = parseFloat(val ?? '0.5');
    return isNaN(n) ? 0.5 : Math.min(1, Math.max(0, n));
}

export function buildGuardrailConfig(
    appType: string,
    formValues: FormValues,
): ManagerGuardrailConfig {
    const apiKey = formValues.api_key?.trim() || undefined;
    const rejectMessage = formValues.reject_message?.trim() || undefined;

    const common = {
        ...(apiKey && { api_key: apiKey }),
        ...(rejectMessage && { reject_message: rejectMessage }),
    };

    switch (appType) {
        case 'BanList':
            return {
                config_id: 'ban_list',
                ...common,
                banned_words: splitLines(formValues.banned_words),
            };

        case 'DetectPII':
            return {
                config_id: 'detect_pii',
                ...common,
                pii_entities: splitComma(formValues.pii_entities),
            };

        case 'NSFWText':
            return {
                config_id: 'nsfw_text',
                ...common,
                threshold: parseThreshold(formValues.threshold),
            };

        case 'ToxicLanguage':
            return {
                config_id: 'toxic_language',
                ...common,
                threshold: parseThreshold(formValues.threshold),
            };

        case 'GibberishText':
            return {
                config_id: 'gibberish_text',
                ...common,
                threshold: parseThreshold(formValues.threshold),
            };

        case 'BiasCheck':
            return {
                config_id: 'bias_check',
                ...common,
                threshold: parseThreshold(formValues.threshold),
            };

        case 'CompetitionCheck':
            return {
                config_id: 'competition_check',
                ...common,
                competitors: splitLines(formValues.competitors),
            };

        case 'CorrectLanguage':
            return {
                config_id: 'correct_language',
                ...common,
                expected_languages: splitLines(formValues.expected_languages),
            };

        case 'RestrictTopic':
            return {
                config_id: 'restrict_to_topic',
                ...common,
                topics: splitLines(formValues.valid_topics),
            };

        default:
            throw new Error(`Unsupported guardrail type: ${appType}`);
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

    if (!formValues.api_key?.trim()) {
        errors.push({ field: 'api_key', message: 'Guardrails AI API key is required' });
    }

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

        case 'NSFWText':
        case 'ToxicLanguage':
        case 'GibberishText':
        case 'BiasCheck': {
            const t = parseFloat(formValues.threshold ?? '');
            if (isNaN(t) || t < 0 || t > 1)
                errors.push({ field: 'threshold', message: 'Threshold must be a number between 0 and 1' });
            break;
        }

        case 'CompetitionCheck':
            if (!splitLines(formValues.competitors).length)
                errors.push({ field: 'competitors', message: 'At least one competitor name is required' });
            break;

        case 'CorrectLanguage':
            if (!splitLines(formValues.expected_languages).length)
                errors.push({ field: 'expected_languages', message: 'At least one language code is required' });
            break;

        case 'RestrictTopic':
            if (!splitLines(formValues.valid_topics).length)
                errors.push({ field: 'valid_topics', message: 'At least one topic is required' });
            break;

        default:
            errors.push({ field: '_type', message: `${appType} is not yet supported by the backend` });
    }

    return errors;
}

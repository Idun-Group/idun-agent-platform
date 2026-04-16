import { describe, it, expect } from 'vitest';
import en from '../../../i18n/locales/en.json';
import fr from '../../../i18n/locales/fr.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import ru from '../../../i18n/locales/ru.json';
import pt from '../../../i18n/locales/pt.json';
import it_locale from '../../../i18n/locales/it.json';

// Every leaf reached from settings.workspaces.users should be a string
// in every locale, OR every locale should agree it's a nested object.
// The shape of settings.workspaces.users must match the English shape.
type AnyObj = Record<string, unknown>;

function shape(value: unknown): 'string' | 'object' | 'other' {
    if (typeof value === 'string') return 'string';
    if (value && typeof value === 'object') return 'object';
    return 'other';
}

function walk(refObj: AnyObj, candObj: AnyObj, path: string, errors: string[]) {
    for (const k of Object.keys(refObj)) {
        const refVal = refObj[k];
        const candVal = candObj?.[k];
        const p = `${path}.${k}`;
        if (shape(refVal) !== shape(candVal)) {
            errors.push(`${p}: ref=${shape(refVal)} cand=${shape(candVal)}`);
            continue;
        }
        if (shape(refVal) === 'object') {
            walk(refVal as AnyObj, (candVal ?? {}) as AnyObj, p, errors);
        }
    }
}

describe('settings.workspaces.users i18n shape', () => {
    const ref = (en as AnyObj).settings as AnyObj;
    const refUsers = (ref.workspaces as AnyObj).users as AnyObj;

    // Verify the English locale itself has the correct nested structure —
    // settings.workspaces.users must be a proper nested object (not a shallow
    // 5-key stub) so that i18next can resolve all component keys without
    // falling back to the default strings.
    it('en has all required leaf keys as strings under settings.workspaces.users', () => {
        const requiredLeafKeys = [
            'fetchError',
            'memberAdded',
            'memberRemoved',
            'roleUpdated',
            'invitationCancelled',
            'members',
            'addMember',
            'noMembers',
            'name',
            'email',
            'role',
            'owner',
            'ownerDesc',
            'member',
            'memberDesc',
            'remove',
            'invitations',
            'projects',
            'allProjects',
            'cancel',
            'confirmRoleTitle',
            'confirmPromoteMessage',
            'confirmDemoteMessage',
            'confirmChange',
            'ownerToggle',
            'projectAssignments',
            'noInvitations',
        ];
        const missingOrWrong: string[] = [];
        for (const k of requiredLeafKeys) {
            const val = refUsers?.[k];
            if (typeof val !== 'string') {
                missingOrWrong.push(
                    `settings.workspaces.users.${k}: expected string, got ${shape(val)} (${JSON.stringify(val)})`,
                );
            }
        }
        expect(missingOrWrong).toEqual([]);
    });

    it('en has all required nested keys under settings.workspaces.users.modal', () => {
        const modal = refUsers?.modal as AnyObj | undefined;
        const requiredModalLeafKeys = [
            'title',
            'emailLabel',
            'emailPlaceholder',
            'roleLabel',
            'projectsLabel',
            'submit',
        ];
        const missingOrWrong: string[] = [];
        for (const k of requiredModalLeafKeys) {
            const val = modal?.[k];
            if (typeof val !== 'string') {
                missingOrWrong.push(
                    `settings.workspaces.users.modal.${k}: expected string, got ${shape(val)}`,
                );
            }
        }
        const role = modal?.role as AnyObj | undefined;
        for (const k of ['owner', 'contributor', 'reader']) {
            const val = role?.[k];
            if (typeof val !== 'string') {
                missingOrWrong.push(
                    `settings.workspaces.users.modal.role.${k}: expected string, got ${shape(val)}`,
                );
            }
        }
        const perm = modal?.perm as AnyObj | undefined;
        for (const k of [
            'ownerWorkspace',
            'ownerMembers',
            'ownerProjects',
            'ownerRoles',
            'contribAgents',
            'contribResources',
            'contribPrompts',
            'contribView',
            'readerAgents',
            'readerResources',
            'readerLogs',
            'readerNoEdit',
        ]) {
            const val = perm?.[k];
            if (typeof val !== 'string') {
                missingOrWrong.push(
                    `settings.workspaces.users.modal.perm.${k}: expected string, got ${shape(val)}`,
                );
            }
        }
        expect(missingOrWrong).toEqual([]);
    });

    const locales: [string, AnyObj][] = [
        ['fr', fr as AnyObj],
        ['de', de as AnyObj],
        ['es', es as AnyObj],
        ['ru', ru as AnyObj],
        ['pt', pt as AnyObj],
        ['it', it_locale as AnyObj],
    ];

    for (const [lang, locale] of locales) {
        it(`shape matches en for ${lang}`, () => {
            const lu = ((locale.settings as AnyObj)?.workspaces as AnyObj)
                ?.users as AnyObj;
            const errors: string[] = [];
            walk(refUsers, lu ?? {}, 'settings.workspaces.users', errors);
            expect(errors).toEqual([]);
        });
    }
});

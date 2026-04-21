import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { ChevronRight, Search, Plus, Trash2, Link, Unlink, FileText, ExternalLink, Info } from 'lucide-react';
import { listPrompts, deletePrompt, assignPrompt, unassignPrompt, listAgentPrompts } from '../../services/prompts';
import type { ManagedPrompt } from '../../services/prompts';
import { listAgents } from '../../services/agents';
import type { BackendAgent } from '../../services/agents';
import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';
import NoProjectState from '../../components/general/no-project-state/component';
import { extractVariables } from '../../utils/jinja';
import { notify } from '../../components/toast/notify';
import CreatePromptModal from '../../components/prompts/create-prompt-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import CodeSnippet from '../agent-form/components/code-snippet';
import {
    PageWrapper, PageHeader, TitleBlock, PageTitle, PageSubtitle, DocsLink,
    HeaderActions, SearchBar, SearchInput, PrimaryBtn,
    CenterBox, Spinner, MutedText,
    EmptyState, EmptyIconWrap, EmptyTextBlock, EmptyTitle, EmptyDesc, EmptyCTA,
    GroupList, GroupCard, GroupHeader, GroupLeft, GroupRight,
    ChevronWrap, GroupId, VersionBadge, VersionCount,
    VarGroup, VarPill, AgentIndicator,
    ExpandedBody, SectionLabel, UsageSection, UsageHeader, TooltipContainer, TooltipContent, AssignmentSection, SectionRow, AssignBtn,
    ChipRow, AgentChip, ChipX, EmptyAssign,
    VersionSection, VersionTable, VersionRow, VersionLeft, VersionRight,
    VNum, TagRow, TagPill, VDate, DeleteIcon,
    ViewToggle, ToggleBtn, VersionContent, MarkdownWrap,
    ModalOverlay, PickerModal, PickerHeader, PickerTitle, CloseBtn,
    PickerBody, PickerEmpty, PickerItem, PickerName, PickerMeta,
} from './styled';

const DOCS_URL = 'https://docs.idunplatform.com/prompts';

function generateUsageSnippet(promptId: string, variables: string[]): string {
    const lines = [
        'from idun_agent_engine import get_prompt',
        '',
        `prompt = get_prompt("${promptId}")`,
    ];
    if (variables.length > 0) {
        const args = variables.map(v => `${v}="..."`).join(', ');
        lines.push(`rendered = prompt.format(${args})`);
    }
    return lines.join('\n');
}

type PromptGroup = {
    prompt_id: string;
    versions: ManagedPrompt[];
    latest: ManagedPrompt;
};

const groupByPromptId = (prompts: ManagedPrompt[]): PromptGroup[] => {
    const map = new Map<string, ManagedPrompt[]>();
    for (const p of prompts) {
        const existing = map.get(p.prompt_id);
        if (existing) existing.push(p);
        else map.set(p.prompt_id, [p]);
    }
    return Array.from(map.entries()).map(([prompt_id, versions]) => {
        const sorted = versions.sort((a, b) => b.version - a.version);
        return { prompt_id, versions: sorted, latest: sorted[0] };
    });
};

const PromptsPage = () => {
    const { t } = useTranslation();
    const { selectedProjectId, projects, isLoadingProjects, currentProject, canWrite, canAdmin } = useProject();
    const { isCurrentWorkspaceOwner } = useWorkspace();
    const [prompts, setPrompts] = useState<ManagedPrompt[]>([]);
    const [agents, setAgents] = useState<BackendAgent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [promptToDelete, setPromptToDelete] = useState<ManagedPrompt | null>(null);
    const [assigningPrompt, setAssigningPrompt] = useState<ManagedPrompt | null>(null);
    const [agentAssignments, setAgentAssignments] = useState<Map<string, string[]>>(new Map());
    const [updateTarget, setUpdateTarget] = useState<PromptGroup | null>(null);
    const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
    const [rawVersions, setPreviewVersions] = useState<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [promptData, agentData] = await Promise.all([
                listPrompts(),
                listAgents(),
            ]);
            setPrompts(promptData);
            setAgents(agentData);

            const assignmentMap = new Map<string, string[]>();
            await Promise.all(
                agentData.map(async (agent) => {
                    try {
                        const assigned = await listAgentPrompts(agent.id);
                        for (const p of assigned) {
                            const existing = assignmentMap.get(p.id) || [];
                            existing.push(agent.id);
                            assignmentMap.set(p.id, existing);
                        }
                    } catch (e) {
                        console.error(`Failed to load prompts for agent ${agent.id}`, e);
                    }
                })
            );
            setAgentAssignments(assignmentMap);
        } catch (e) {
            console.error('Failed to load data', e);
            notify.error('Failed to load prompts');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const groups = useMemo(() => {
        const filtered = prompts.filter(p =>
            !searchTerm ||
            p.prompt_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        return groupByPromptId(filtered);
    }, [prompts, searchTerm]);

    const toggleGroup = (promptId: string) => {
        const group = groups.find(g => g.prompt_id === promptId);
        setExpandedGroups(prev => {
            const next = new Set(prev);
            const isClosing = next.has(promptId);
            if (isClosing) {
                next.delete(promptId);
                if (group) {
                    setExpandedVersions(ev => {
                        const nev = new Set(ev);
                        for (const v of group.versions) nev.delete(v.id);
                        return nev;
                    });
                }
            } else {
                next.add(promptId);
                if (group) {
                    setExpandedVersions(ev => new Set(ev).add(group.latest.id));
                }
            }
            return next;
        });
    };

    const toggleRaw = (versionId: string) => {
        setPreviewVersions(prev => {
            const next = new Set(prev);
            if (next.has(versionId)) next.delete(versionId);
            else next.add(versionId);
            return next;
        });
    };

    const toggleVersion = (versionId: string) => {
        setExpandedVersions(prev => {
            const next = new Set(prev);
            if (next.has(versionId)) next.delete(versionId);
            else next.add(versionId);
            return next;
        });
    };

    const handleDeleteConfirm = async () => {
        if (!promptToDelete) return;
        if (!canAdmin) {
            notify.error('Project admin access required to delete prompts');
            return;
        }
        try {
            await deletePrompt(promptToDelete.id);
            notify.success('Prompt version deleted');
        } catch (e) {
            console.error('Failed to delete prompt', e);
            notify.error('Failed to delete prompt');
            throw e;
        } finally {
            loadData();
        }
    };

    const getAssignedAgents = (promptId: string): BackendAgent[] => {
        const agentIds = agentAssignments.get(promptId) || [];
        return agents.filter(a => agentIds.includes(a.id));
    };

    const getUnassignedAgents = (promptId: string): BackendAgent[] => {
        const agentIds = agentAssignments.get(promptId) || [];
        return agents.filter(a => !agentIds.includes(a.id));
    };

    const handleAssign = async (prompt: ManagedPrompt, agentId: string) => {
        if (!canWrite) {
            notify.error('Contributor access required to assign prompts');
            return;
        }
        try {
            await assignPrompt(prompt.id, agentId);
            setAgentAssignments(prev => {
                const next = new Map(prev);
                const existing = next.get(prompt.id) || [];
                next.set(prompt.id, [...existing, agentId]);
                return next;
            });
            setAssigningPrompt(null);
            notify.success('Prompt assigned to agent');
        } catch (e) {
            console.error('Failed to assign prompt', e);
            notify.error('Failed to assign prompt');
        }
    };

    const handleUnassign = async (promptId: string, agentId: string) => {
        if (!canWrite) {
            notify.error('Contributor access required to update prompt assignments');
            return;
        }
        try {
            await unassignPrompt(promptId, agentId);
            setAgentAssignments(prev => {
                const next = new Map(prev);
                const existing = next.get(promptId) || [];
                next.set(promptId, existing.filter(id => id !== agentId));
                return next;
            });
            notify.success('Prompt unassigned');
        } catch (e) {
            console.error('Failed to unassign prompt', e);
            notify.error('Failed to unassign prompt');
        }
    };

    const handlePromptCreated = async (created: ManagedPrompt) => {
        try {
            if (created.version > 1) {
                const oldGroup = groups.find(g => g.prompt_id === created.prompt_id);
                if (oldGroup) {
                    const agentIdSet = new Set<string>();
                    const oldVersionIds: string[] = [];
                    for (const version of oldGroup.versions) {
                        const ids = agentAssignments.get(version.id) || [];
                        ids.forEach(id => agentIdSet.add(id));
                        if (ids.length > 0) oldVersionIds.push(version.id);
                    }
                    await Promise.allSettled(
                        [...agentIdSet].map(agentId => assignPrompt(created.id, agentId))
                    );
                    await Promise.allSettled(
                        oldVersionIds.flatMap(versionId => {
                            const ids = agentAssignments.get(versionId) || [];
                            return ids.map(agentId => unassignPrompt(versionId, agentId));
                        })
                    );
                }
            }
        } catch (e) {
            console.error('Failed to migrate assignments to new version', e);
            notify.warning('Prompt created but some agent assignments could not be migrated');
        } finally {
            if (created.version === 1) {
                notify.success(`Prompt created — use get_prompt("${created.prompt_id}") in your agent code`);
            } else {
                notify.success('Prompt version updated');
            }
            loadData();
        }
    };

    const handlePickerKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') setAssigningPrompt(null);
    };

    if (!isLoadingProjects && !selectedProjectId) {
        const variant =
            projects.length === 0
                ? isCurrentWorkspaceOwner
                    ? 'no-access-owner'
                    : 'no-access-member'
                : 'none-selected';
        return (
            <NoProjectState
                variant={variant}
                pageTitle="Prompts"
                pageSubtitle="Versioned prompt templates you can assign to any agent."
            />
        );
    }

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Prompts</PageTitle>
                    <PageSubtitle>
                        Versioned prompt templates for {currentProject?.name ?? 'the active project'} with Jinja2 variables{' · '}
                        <DocsLink href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                            Docs <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                        </DocsLink>
                    </PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} />
                        <SearchInput
                            placeholder="Search prompts..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            aria-label="Search prompts"
                        />
                    </SearchBar>
                    {canWrite && (
                        <PrimaryBtn onClick={() => setIsModalOpen(true)} aria-label="Create new prompt">
                            <Plus size={15} /> New Prompt
                        </PrimaryBtn>
                    )}
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <Spinner />
                    <MutedText>Loading prompts…</MutedText>
                </CenterBox>
            ) : groups.length === 0 ? (
                <EmptyState>
                    <EmptyIconWrap><FileText size={28} strokeWidth={1.5} /></EmptyIconWrap>
                    <EmptyTextBlock>
                        {canWrite ? (
                            <>
                                <EmptyTitle>Create your first prompt</EmptyTitle>
                                <EmptyDesc>
                                    Versioned templates you can assign to any agent.
                                    Use <code>get_prompt("id")</code> in your agent code to load them at runtime.
                                </EmptyDesc>
                            </>
                        ) : (
                            <>
                                <EmptyTitle>
                                    {t('scopedEmpty.prompts.readerTitle', 'No prompts in {{project}} yet', { project: currentProject?.name ?? 'the active project' })}
                                </EmptyTitle>
                                <EmptyDesc>
                                    {t('scopedEmpty.prompts.readerDescription', 'Ask a contributor or admin to create one.')}
                                </EmptyDesc>
                            </>
                        )}
                    </EmptyTextBlock>
                    {canWrite && (
                        <EmptyCTA onClick={() => setIsModalOpen(true)} aria-label="Create new prompt">
                            <Plus size={15} /> New Prompt
                        </EmptyCTA>
                    )}
                </EmptyState>
            ) : (
                <GroupList>
                    {groups.map((group, idx) => {
                        const isExpanded = expandedGroups.has(group.prompt_id);
                        const variables = extractVariables(group.latest.content);
                        const assigned = getAssignedAgents(group.latest.id);

                        return (
                            <GroupCard key={group.prompt_id} style={{ animationDelay: `${idx * 0.04}s` }}>
                                <GroupHeader
                                    onClick={() => toggleGroup(group.prompt_id)}
                                    aria-label={`Toggle ${group.prompt_id} details`}
                                    aria-expanded={isExpanded}
                                >
                                    <GroupLeft>
                                        <ChevronWrap $expanded={isExpanded}>
                                            <ChevronRight size={14} />
                                        </ChevronWrap>
                                        <GroupId>{group.prompt_id}</GroupId>
                                        <VersionBadge>v{group.latest.version}</VersionBadge>
                                        {group.versions.length > 1 && (
                                            <VersionCount>{group.versions.length} versions</VersionCount>
                                        )}
                                    </GroupLeft>
                                    <GroupRight>
                                        {variables.length > 0 && (
                                            <VarGroup>
                                                {variables.slice(0, 3).map(v => (
                                                    <VarPill key={v}>{'{{' + v + '}}'}</VarPill>
                                                ))}
                                                {variables.length > 3 && (
                                                    <VarPill>+{variables.length - 3}</VarPill>
                                                )}
                                            </VarGroup>
                                        )}
                                        {assigned.length > 0 && (
                                            <AgentIndicator title={assigned.map(a => a.name).join(', ')}>
                                                <Link size={11} />
                                                <span>{assigned.length}</span>
                                            </AgentIndicator>
                                        )}
                                    </GroupRight>
                                </GroupHeader>

                                {isExpanded && (
                                    <ExpandedBody>
                                        <UsageSection>
                                            <UsageHeader>
                                                <SectionLabel style={{ marginBottom: 0 }}>Usage</SectionLabel>
                                                <TooltipContainer>
                                                    <Info size={13} color="hsl(var(--muted-foreground))" />
                                                    <TooltipContent>
                                                        Prompts are not auto-injected. Your agent code must call get_prompt() to load the template, then .format() to render variables before passing it to the LLM.
                                                    </TooltipContent>
                                                </TooltipContainer>
                                            </UsageHeader>
                                            <CodeSnippet
                                                code={generateUsageSnippet(group.prompt_id, variables)}
                                                language="python"
                                            />
                                        </UsageSection>

                                        <AssignmentSection>
                                            <SectionRow>
                                                <SectionLabel>Agents</SectionLabel>
                                                <AssignBtn
                                                    disabled={!canWrite}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!canWrite) return;
                                                        setAssigningPrompt(group.latest);
                                                    }}
                                                    aria-label="Assign to agent"
                                                >
                                                    <Plus size={12} /> Assign
                                                </AssignBtn>
                                            </SectionRow>
                                            {assigned.length > 0 ? (
                                                <ChipRow>
                                                    {assigned.map(agent => (
                                                        <AgentChip key={agent.id}>
                                                            <span>{agent.name}</span>
                                                            <ChipX
                                                                onClick={() => handleUnassign(group.latest.id, agent.id)}
                                                                aria-label={`Unassign ${agent.name}`}
                                                            >
                                                                <Unlink size={10} />
                                                            </ChipX>
                                                        </AgentChip>
                                                    ))}
                                                </ChipRow>
                                            ) : (
                                                <EmptyAssign>No agents assigned</EmptyAssign>
                                            )}
                                        </AssignmentSection>

                                        <VersionSection>
                                            <SectionRow>
                                                <SectionLabel>Versions</SectionLabel>
                                                <AssignBtn onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!canWrite) return;
                                                    setUpdateTarget(group);
                                                }} disabled={!canWrite}>
                                                    <Plus size={12} /> Update Version
                                                </AssignBtn>
                                            </SectionRow>
                                            <VersionTable>
                                                {group.versions.map((v, i) => {
                                                    const isVersionExpanded = expandedVersions.has(v.id);
                                                    return (
                                                        <div key={v.id}>
                                                            <VersionRow
                                                                onClick={() => toggleVersion(v.id)}
                                                                style={{ cursor: 'pointer', animationDelay: `${i * 0.03}s` }}
                                                            >
                                                                <VersionLeft>
                                                                    <ChevronWrap $expanded={isVersionExpanded}>
                                                                        <ChevronRight size={12} />
                                                                    </ChevronWrap>
                                                                    <VNum $active={v.tags.includes('latest')}>v{v.version}</VNum>
                                                                    <TagRow>
                                                                        {v.tags.map(tag => (
                                                                            <TagPill key={tag} $latest={tag === 'latest'}>{tag}</TagPill>
                                                                        ))}
                                                                    </TagRow>
                                                                </VersionLeft>
                                                                <VersionRight>
                                                                    <VDate>{new Date(v.created_at).toLocaleDateString()}</VDate>
                                                                    <DeleteIcon
                                                                        disabled={!canAdmin}
                                                                        onClick={(e) => { e.stopPropagation(); setPromptToDelete(v); }}
                                                                        aria-label={`Delete version ${v.version}`}
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </DeleteIcon>
                                                                </VersionRight>
                                                            </VersionRow>
                                                            {isVersionExpanded && (
                                                                <>
                                                                    <ViewToggle>
                                                                        <ToggleBtn $active={rawVersions.has(v.id)} onClick={() => !rawVersions.has(v.id) && toggleRaw(v.id)}>Raw</ToggleBtn>
                                                                        <ToggleBtn $active={!rawVersions.has(v.id)} onClick={() => rawVersions.has(v.id) && toggleRaw(v.id)}>Preview</ToggleBtn>
                                                                    </ViewToggle>
                                                                    {rawVersions.has(v.id) ? (
                                                                        <VersionContent>{v.content}</VersionContent>
                                                                    ) : (
                                                                        <MarkdownWrap><ReactMarkdown>{v.content}</ReactMarkdown></MarkdownWrap>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </VersionTable>
                                        </VersionSection>
                                    </ExpandedBody>
                                )}
                            </GroupCard>
                        );
                    })}
                </GroupList>
            )}

            {assigningPrompt && (
                <ModalOverlay
                    onClick={(e) => { if (e.target === e.currentTarget) setAssigningPrompt(null); }}
                    onKeyDown={handlePickerKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Assign prompt to agent"
                >
                    <PickerModal>
                        <PickerHeader>
                            <PickerTitle>Assign to Agent</PickerTitle>
                            <CloseBtn onClick={() => setAssigningPrompt(null)} aria-label="Close">×</CloseBtn>
                        </PickerHeader>
                        <PickerBody>
                            {getUnassignedAgents(assigningPrompt.id).length === 0 ? (
                                <PickerEmpty>All agents already assigned</PickerEmpty>
                            ) : (
                                getUnassignedAgents(assigningPrompt.id).map(agent => (
                                    <PickerItem
                                        key={agent.id}
                                        onClick={() => handleAssign(assigningPrompt, agent.id)}
                                        aria-label={`Assign to ${agent.name}`}
                                    >
                                        <PickerName>{agent.name}</PickerName>
                                        <PickerMeta>{agent.framework}</PickerMeta>
                                    </PickerItem>
                                ))
                            )}
                        </PickerBody>
                    </PickerModal>
                </ModalOverlay>
            )}

            <CreatePromptModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={handlePromptCreated}
            />
            <CreatePromptModal
                isOpen={!!updateTarget}
                onClose={() => setUpdateTarget(null)}
                onCreated={handlePromptCreated}
                initialPromptId={updateTarget?.prompt_id}
                initialContent={updateTarget?.latest.content}
                lockPromptId
            />
            <DeleteConfirmModal
                isOpen={!!promptToDelete}
                onClose={() => setPromptToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={promptToDelete ? `${promptToDelete.prompt_id} v${promptToDelete.version}` : ''}
            />
        </PageWrapper>
    );
};

export default PromptsPage;

import { useState, useEffect, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import ReactMarkdown from 'react-markdown';
import { ChevronRight, Search, Plus, Trash2, Link, Unlink, FileText } from 'lucide-react';
import { listPrompts, deletePrompt, assignPrompt, unassignPrompt, listAgentPrompts } from '../../services/prompts';
import type { ManagedPrompt } from '../../services/prompts';
import { listAgents } from '../../services/agents';
import type { BackendAgent } from '../../services/agents';
import { extractVariables } from '../../utils/jinja';
import CreatePromptModal from '../../components/prompts/create-prompt-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';

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
        try {
            await deletePrompt(promptToDelete.id);
        } catch (e) {
            console.error('Failed to delete prompt', e);
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
        try {
            await assignPrompt(prompt.id, agentId);
            setAgentAssignments(prev => {
                const next = new Map(prev);
                const existing = next.get(prompt.id) || [];
                next.set(prompt.id, [...existing, agentId]);
                return next;
            });
            setAssigningPrompt(null);
        } catch (e) {
            console.error('Failed to assign prompt', e);
        }
    };

    const handleUnassign = async (promptId: string, agentId: string) => {
        try {
            await unassignPrompt(promptId, agentId);
            setAgentAssignments(prev => {
                const next = new Map(prev);
                const existing = next.get(promptId) || [];
                next.set(promptId, existing.filter(id => id !== agentId));
                return next;
            });
        } catch (e) {
            console.error('Failed to unassign prompt', e);
        }
    };

    const handlePromptCreated = async (created: ManagedPrompt) => {
        try {
            if (created.version > 1) {
                const oldGroup = groups.find(g => g.prompt_id === created.prompt_id);
                if (oldGroup) {
                    // Collect agents assigned to ANY old version
                    const agentIdSet = new Set<string>();
                    const oldVersionIds: string[] = [];
                    for (const version of oldGroup.versions) {
                        const ids = agentAssignments.get(version.id) || [];
                        ids.forEach(id => agentIdSet.add(id));
                        if (ids.length > 0) oldVersionIds.push(version.id);
                    }
                    // Assign to new version first
                    await Promise.allSettled(
                        [...agentIdSet].map(agentId => assignPrompt(created.id, agentId))
                    );
                    // Unassign from all old versions
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
        } finally {
            loadData();
        }
    };

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>Prompts</PageTitle>
                    <PageSubtitle>Versioned prompt templates with Jinja2 variables</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} />
                        <SearchInput
                            placeholder="Search prompts..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <PrimaryBtn onClick={() => setIsModalOpen(true)}>
                        <Plus size={15} /> New Prompt
                    </PrimaryBtn>
                </HeaderActions>
            </PageHeader>

            {isLoading ? (
                <CenterBox>
                    <Spinner />
                    <MutedText>Loading prompts…</MutedText>
                </CenterBox>
            ) : groups.length === 0 ? (
                <EmptyState>
                    <EmptyTextBlock>
                        <EmptyTitle>Create your first prompt</EmptyTitle>
                        <EmptyDesc>
                            Versioned templates you can assign to any agent.
                        </EmptyDesc>
                    </EmptyTextBlock>
                    <EmptyCTA onClick={() => setIsModalOpen(true)}>
                        <Plus size={15} /> New Prompt
                    </EmptyCTA>
                </EmptyState>
            ) : (
                <GroupList>
                    {groups.map((group, idx) => {
                        const isExpanded = expandedGroups.has(group.prompt_id);
                        const variables = extractVariables(group.latest.content);
                        const assigned = getAssignedAgents(group.latest.id);

                        return (
                            <GroupCard key={group.prompt_id} style={{ animationDelay: `${idx * 0.04}s` }}>
                                <GroupHeader onClick={() => toggleGroup(group.prompt_id)}>
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
                                        <AssignmentSection>
                                            <SectionRow>
                                                <SectionLabel>Agents</SectionLabel>
                                                <AssignBtn onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAssigningPrompt(group.latest);
                                                }}>
                                                    <Plus size={12} /> Assign
                                                </AssignBtn>
                                            </SectionRow>
                                            {assigned.length > 0 ? (
                                                <ChipRow>
                                                    {assigned.map(agent => (
                                                        <AgentChip key={agent.id}>
                                                            <span>{agent.name}</span>
                                                            <ChipX onClick={() => handleUnassign(group.latest.id, agent.id)}>
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
                                                    setUpdateTarget(group);
                                                }}>
                                                    <Plus size={12} /> Update Version
                                                </AssignBtn>
                                            </SectionRow>
                                            <VersionTable>
                                                {group.versions.map(v => {
                                                    const isVersionExpanded = expandedVersions.has(v.id);
                                                    return (
                                                        <div key={v.id}>
                                                            <VersionRow onClick={() => toggleVersion(v.id)} style={{ cursor: 'pointer' }}>
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
                                                                    <DeleteIcon onClick={(e) => { e.stopPropagation(); setPromptToDelete(v); }}>
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
                <ModalOverlay onClick={(e) => { if (e.target === e.currentTarget) setAssigningPrompt(null); }}>
                    <PickerModal>
                        <PickerHeader>
                            <PickerTitle>Assign to Agent</PickerTitle>
                            <CloseBtn onClick={() => setAssigningPrompt(null)}>×</CloseBtn>
                        </PickerHeader>
                        <PickerBody>
                            {getUnassignedAgents(assigningPrompt.id).length === 0 ? (
                                <PickerEmpty>All agents already assigned</PickerEmpty>
                            ) : (
                                getUnassignedAgents(assigningPrompt.id).map(agent => (
                                    <PickerItem key={agent.id} onClick={() => handleAssign(assigningPrompt, agent.id)}>
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

/* ── Animations ─────────────────────────────────────────────────────────────── */

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

/* ── Layout ─────────────────────────────────────────────────────────────────── */

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow-y: auto;
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
`;

const TitleBlock = styled.div``;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: white;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
`;

const PageSubtitle = styled.p`
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
    color: rgba(255, 255, 255, 0.35);
    transition: border-color 0.15s;
    &:focus-within { border-color: hsl(262 83% 58% / 0.5); }
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 14px;
    width: 200px;
    &::placeholder { color: rgba(255, 255, 255, 0.3); }
`;

const PrimaryBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    height: 38px;
    background: #8c52ff;
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    &:hover { background: #7a47e6; }
`;

/* ── States ──────────────────────────────────────────────────────────────────── */

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px;
`;

const Spinner = styled.div`
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.08);
    border-top-color: #8c52ff;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const MutedText = styled.p`
    font-size: 14px;
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    padding: 100px 40px 80px;
    text-align: center;
    position: relative;

    &::before {
        content: '';
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        height: 320px;
        background: radial-gradient(circle, rgba(140, 82, 255, 0.06) 0%, transparent 70%);
        pointer-events: none;
    }
`;

const EmptyTextBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
`;

const EmptyTitle = styled.p`
    font-size: 18px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    letter-spacing: -0.02em;
`;

const EmptyDesc = styled.p`
    font-size: 14px;
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
    line-height: 1.5;
`;

const EmptyCTA = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    height: 42px;
    background: rgba(140, 82, 255, 0.12);
    border: 1px solid rgba(140, 82, 255, 0.25);
    border-radius: 10px;
    color: #a78bfa;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: rgba(140, 82, 255, 0.2);
        border-color: rgba(140, 82, 255, 0.4);
        color: #c4b5fd;
        box-shadow: 0 0 24px rgba(140, 82, 255, 0.12);
    }
`;


/* ── Group Cards ─────────────────────────────────────────────────────────────── */

const GroupList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const GroupCard = styled.div`
    background: var(--color-surface, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-left: 3px solid rgba(140, 82, 255, 0.3);
    border-radius: 16px;
    overflow: hidden;
    animation: ${fadeIn} 0.3s ease both;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    &:hover {
        border-color: rgba(140, 82, 255, 0.25);
        border-left-color: #8c52ff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
        transform: translateY(-1px);
    }
`;

const GroupHeader = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 16px 22px;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background 0.12s;
    &:hover { background: rgba(255, 255, 255, 0.015); }
`;

const GroupLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ChevronWrap = styled.span<{ $expanded: boolean }>`
    color: rgba(255, 255, 255, 0.35);
    display: flex;
    transition: transform 0.2s ease, color 0.15s;
    transform: rotate(${p => p.$expanded ? '90deg' : '0deg'});
`;

const GroupId = styled.span`
    font-size: 15px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    letter-spacing: -0.02em;
`;

const VersionBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    font-family: 'SF Mono', 'Fira Code', monospace;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(140, 82, 255, 0.1);
    color: #a78bfa;
    border: 1px solid rgba(140, 82, 255, 0.15);
`;

const VersionCount = styled.span`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
`;

const GroupRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const VarGroup = styled.div`
    display: flex;
    gap: 4px;
`;

const VarPill = styled.span`
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

const AgentIndicator = styled.span`
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: rgba(52, 211, 153, 0.7);
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(52, 211, 153, 0.08);
    border: 1px solid rgba(52, 211, 153, 0.12);
`;

/* ── Expanded Body ───────────────────────────────────────────────────────────── */

const ExpandedBody = styled.div`
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding: 20px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const SectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.3);
    margin-bottom: 10px;
`;

/* ── Assignment ──────────────────────────────────────────────────────────────── */

const AssignmentSection = styled.div``;

const SectionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
`;

const AssignBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    background: rgba(140, 82, 255, 0.08);
    border: 1px solid rgba(140, 82, 255, 0.18);
    border-radius: 8px;
    color: #a78bfa;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(140, 82, 255, 0.16); border-color: rgba(140, 82, 255, 0.3); }
`;

const ChipRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const AgentChip = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    transition: border-color 0.15s;
    &:hover { border-color: rgba(255, 255, 255, 0.15); }
`;

const ChipX = styled.button`
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.25);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
    &:hover { color: #f87171; }
`;

const EmptyAssign = styled.span`
    font-size: 13px;
    color: rgba(255, 255, 255, 0.25);
`;

/* ── Version History ─────────────────────────────────────────────────────────── */

const VersionSection = styled.div`
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 16px;
`;

const VersionTable = styled.div``;

const VersionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    & + & { border-top: 1px solid rgba(255, 255, 255, 0.03); }
`;

const VersionLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const VNum = styled.span<{ $active?: boolean }>`
    font-size: 12px;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: ${p => p.$active ? '#a78bfa' : 'rgba(255, 255, 255, 0.45)'};
    min-width: 28px;
`;

const TagRow = styled.div`
    display: flex;
    gap: 4px;
`;

const TagPill = styled.span<{ $latest?: boolean }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: ${p => p.$latest ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.04)'};
    color: ${p => p.$latest ? '#34d399' : 'rgba(255, 255, 255, 0.4)'};
    border: 1px solid ${p => p.$latest ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255, 255, 255, 0.06)'};
`;

const VersionRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const VDate = styled.span`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.25);
`;

const DeleteIcon = styled.button`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
    &:hover { color: #f87171; background: rgba(248, 113, 113, 0.08); }
`;

const VersionContent = styled.pre`
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0 0 8px;
    max-height: 180px;
    overflow-y: auto;
    line-height: 1.6;
    background: rgba(0, 0, 0, 0.2);
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.04);
`;

const ViewToggle = styled.div`
    display: flex;
    gap: 2px;
    margin-bottom: 6px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    padding: 2px;
    width: fit-content;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
    padding: 3px 12px;
    font-size: 11px;
    font-weight: 500;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    background: ${p => p.$active ? 'rgba(140, 82, 255, 0.15)' : 'transparent'};
    color: ${p => p.$active ? '#a78bfa' : 'rgba(255, 255, 255, 0.35)'};
    &:hover { color: ${p => p.$active ? '#a78bfa' : 'rgba(255, 255, 255, 0.55)'}; }
`;

const MarkdownWrap = styled.div`
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.7;
    margin: 0 0 8px;
    max-height: 180px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.04);

    h1, h2, h3, h4 { color: white; margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    h3 { font-size: 1.05em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.06);
    }
    pre {
        background: rgba(0, 0, 0, 0.3);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        code { padding: 0; background: none; }
    }
    ul, ol { padding-left: 1.4em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    blockquote {
        border-left: 3px solid rgba(140, 82, 255, 0.3);
        padding-left: 12px;
        margin: 0.5em 0;
        color: rgba(255, 255, 255, 0.6);
    }
    a { color: #a78bfa; }
    hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 0.8em 0; }
`;

/* ── Picker Modal ────────────────────────────────────────────────────────────── */

const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const PickerModal = styled.div`
    background: var(--color-surface, #1a1a2e);
    border-radius: 16px;
    width: 420px;
    max-width: 94vw;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
`;

const PickerHeader = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const PickerTitle = styled.h3`
    font-size: 16px;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    &:hover { background: rgba(255, 255, 255, 0.12); color: white; }
`;

const PickerBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px;
`;

const PickerEmpty = styled.div`
    padding: 36px;
    text-align: center;
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
`;

const PickerItem = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: white;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background 0.12s;
    &:hover { background: rgba(255, 255, 255, 0.05); }
`;

const PickerName = styled.span`
    font-size: 14px;
    font-weight: 500;
`;

const PickerMeta = styled.span`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
`;

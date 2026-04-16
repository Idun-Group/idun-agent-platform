import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import { useProject } from '../../hooks/use-project';
import useWorkspace from '../../hooks/use-workspace';

const ProjectSelector = () => {
    const navigate = useNavigate();
    const { selectedWorkspaceId } = useWorkspace();
    const {
        projects,
        currentProject,
        currentRole,
        isLoadingProjects,
    } = useProject();

    if (!selectedWorkspaceId) return null;

    return (
        <Container>
            <TopRow>
                <Label>Project</Label>
                <ManageButton onClick={() => navigate('/settings/workspace-projects')}>
                    Manage
                </ManageButton>
            </TopRow>
            <ProjectName>
                {isLoadingProjects
                    ? 'Loading projects...'
                    : currentProject?.name ?? (projects.length === 0 ? 'No project access' : 'No project selected')}
            </ProjectName>
            <RoleBadge>{currentRole ?? 'no access'}</RoleBadge>
        </Container>
    );
};

export default ProjectSelector;

const Container = styled.div`
    margin: 12px 16px 20px;
    padding: 14px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--overlay-subtle);
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const TopRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const Label = styled.span`
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: hsl(var(--muted-foreground));
`;

const ManageButton = styled.button`
    border: none;
    background: transparent;
    color: hsl(var(--primary));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
`;

const ProjectName = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const RoleBadge = styled.span`
    align-self: flex-start;
    padding: 4px 8px;
    border-radius: 999px;
    background: hsla(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
`;

import React, { useMemo, useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { 
    Database, 
    HardDrive, 
    Search, 
    Plus, 
    Layers, 
    Users, 
    RefreshCw, 
    MoreHorizontal,
    Cpu
} from 'lucide-react';
import { CreateMemoryModal } from '../../components/applications/create-memory-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import { fetchApplications, deleteApplication } from '../../services/applications';
import type { ApplicationConfig } from '../../types/application.types';
import { toast } from 'react-toastify';
import { Loader } from 'lucide-react';

const MemoryPage = () => {
  const [memories, setMemories] = useState<ApplicationConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFrameworkForCreate, setSelectedFrameworkForCreate] = useState<string | undefined>(undefined);
  const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
  const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadMemories = async () => {
      setIsLoading(true);
      try {
          const apps = await fetchApplications();
          const memoryApps = apps.filter(app => app.category === 'Memory');
          setMemories(memoryApps);
      } catch (error) {
          console.error("Failed to fetch memories", error);
          toast.error("Failed to fetch memory stores");
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      loadMemories();
  }, []);

  // Group memories by framework
  const groupedMemories = useMemo(() => {
      const groups: Record<string, ApplicationConfig[]> = {
          'LANGGRAPH': [],
          'ADK': []
      };
      
      const filtered = memories.filter(m => 
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          m.type.toLowerCase().includes(searchTerm.toLowerCase())
      );

      filtered.forEach(mem => {
          const framework = mem.framework || 'Other';
          if (!groups[framework]) {
              groups[framework] = [];
          }
          groups[framework].push(mem);
      });
      return groups;
  }, [memories, searchTerm]);

  const openCreateModal = (framework?: string) => {
      setAppToEdit(null);
      setSelectedFrameworkForCreate(framework);
      setIsModalOpen(true);
  };

  const openEditModal = (app: ApplicationConfig) => {
      setAppToEdit(app);
      setIsModalOpen(true);
  };

  const closeModal = () => {
      setIsModalOpen(false);
      setAppToEdit(null);
  };

  const handleDeleteRequest = (app: ApplicationConfig) => setAppToDelete(app);

  const handleDeleteConfirm = async () => {
      if (!appToDelete?.id) return;
      await deleteApplication(appToDelete.id);
      toast.success('Memory store removed');
      setAppToDelete(null);
      loadMemories();
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'active': return 'bg-emerald-400';
          case 'syncing': return 'bg-blue-400';
          case 'maintenance': return 'bg-amber-400';
          default: return 'bg-gray-400';
      }
  };

  return (
     <PageContainer>
       <Header>
          <div>
            <Title>Memory Stores</Title>
            <Subtitle>Manage vector databases and state persistence by agent framework.</Subtitle>
          </div>
          <HeaderActions>
             <SearchWrapper>
                <Search className="icon" size={16} />
                <SearchInput 
                    type="text" 
                    placeholder="Search stores..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
             </SearchWrapper>
             <CreateButton onClick={() => openCreateModal()}>
                <Plus size={16} /> Create Store
             </CreateButton>
          </HeaderActions>
       </Header>

       {isLoading ? (
           <LoaderContainer>
               <Loader size={32} className="animate-spin" />
           </LoaderContainer>
       ) : (
           <ContentSpace>
               {Object.entries(groupedMemories).map(([framework, groupItems]) => {
                   // Only skip empty groups if there's a search term, otherwise show all frameworks
                   if (searchTerm && groupItems.length === 0) return null;
                   
                   const frameworkName = framework === 'LANGGRAPH' ? 'LangGraph' : framework;

                   return (
                       <div key={framework}>
                           <GroupHeader>
                               <IconBadge>
                                   {framework === 'LANGGRAPH' ? <Layers size={16} color="#8c52ff" /> : <Cpu size={16} color="#3b82f6" />}
                               </IconBadge>
                               <GroupTitle>{frameworkName} Ecosystem</GroupTitle>
                               <CountBadge>
                                   {groupItems.length} stores
                               </CountBadge>
                           </GroupHeader>

                           <Grid>
                               {groupItems.map((mem) => (
                                   <Card key={mem.id}>
                                       {/* Header */}
                                       <CardHeader>
                                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                               <CardIcon>
                                                   <Database size={20} />
                                               </CardIcon>
                                               <div>
                                                   <CardTitle>{mem.name}</CardTitle>
                                                   <CardMeta>
                                                       <TypeBadge>{mem.type}</TypeBadge>
                                                       <Status>
                                                           <StatusDot color="#34d399" /> {/* Mock active */}
                                                           Active
                                                       </Status>
                                                   </CardMeta>
                                               </div>
                                           </div>
                                           <MoreButton>
                                               <MoreHorizontal size={16} />
                                           </MoreButton>
                                       </CardHeader>
                                       
                                       {/* Description - Use config as description placeholder if unavailable */}
                                       <Description>
                                           {/* mem.description is not in ApplicationConfig, show something else or generic */}
                                           {mem.type} storage for {frameworkName} agents.
                                       </Description>

                                       {/* Stats Grid - Modified as requested: Only Connected Agents */}
                                       <StatsGrid>
                                            <StatBox>
                                                <StatLabel>
                                                    <Users size={10} style={{ marginRight: '4px' }} /> Connected Agents
                                                </StatLabel>
                                                {/* Mock connected agents count as we don't have it in ApplicationConfig yet */}
                                                <StatValue>0</StatValue> 
                                            </StatBox>
                                       </StatsGrid>

                                       {/* Footer */}
                                       <CardFooter>
                                           <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                               Updated {new Date(mem.updatedAt).toLocaleDateString()}
                                           </span>
                                           <CardActions>
                                               <ActionBtn onClick={() => openEditModal(mem)}>Edit</ActionBtn>
                                               <ActionBtnDanger onClick={() => handleDeleteRequest(mem)}>Remove</ActionBtnDanger>
                                           </CardActions>
                                       </CardFooter>
                                   </Card>
                               ))}
                               
                               {/* Add New Card for Framework */}
                               <AddCard onClick={() => openCreateModal(framework)}>
                                    <AddIconWrapper>
                                       <Plus size={20} />
                                    </AddIconWrapper>
                                    <AddText>Add {frameworkName} Store</AddText>
                               </AddCard>
                           </Grid>
                       </div>
                   );
               })}
           </ContentSpace>
       )}

       <CreateMemoryModal
         isOpen={isModalOpen}
         onClose={closeModal}
         onSaved={() => { loadMemories(); }}
         appToEdit={appToEdit}
         initialFramework={selectedFrameworkForCreate}
       />
       <DeleteConfirmModal
         isOpen={!!appToDelete}
         onClose={() => setAppToDelete(null)}
         onConfirm={handleDeleteConfirm}
         itemName={appToDelete?.name ?? ''}
       />
    </PageContainer>
  );
};

export default MemoryPage;

// Styled Components
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    background-color: #040210; /* Dark background */
    overflow: hidden;
    color: white;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const Title = styled.h1`
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const Subtitle = styled.p`
    color: #9ca3af;
    font-size: 0.875rem;
    margin: 0.25rem 0 0 0;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 0.75rem;
`;

const SearchWrapper = styled.div`
    position: relative;
    
    .icon {
        position: absolute;
        left: 0.75rem;
        top: 0.625rem;
        color: #6b7280;
    }
`;

const SearchInput = styled.input`
    background-color: #0B0A15;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    padding: 0.5rem 1rem 0.5rem 2.25rem;
    font-size: 0.875rem;
    color: #d1d5db;
    outline: none;
    width: 16rem;
    transition: all 0.2s;

    &:focus {
        border-color: #8c52ff;
        width: 18rem;
    }
`;

const CreateButton = styled.button`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background-color: #8c52ff;
    color: white;
    font-size: 0.875rem;
    font-weight: 700;
    border-radius: 0.5rem;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
    box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.2);

    &:hover {
        background-color: #7c3aed;
    }
`;

const ContentSpace = styled.div`
    padding: 2.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
`;

const GroupHeader = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 1rem;
`;

const IconBadge = styled.div`
    padding: 0.375rem;
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    margin-right: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const GroupTitle = styled.h2`
    font-size: 1.125rem;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const CountBadge = styled.span`
    margin-left: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.75rem;
    color: #6b7280;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    
    @media (min-width: 1024px) {
        grid-template-columns: repeat(2, 1fr);
    }
    @media (min-width: 1280px) {
        grid-template-columns: repeat(3, 1fr);
    }
`;

const Card = styled.div`
    background-color: #0B0A15; /* card bg */
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    padding: 1.25rem;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    height: 100%;

    &:hover {
        border-color: rgba(255, 255, 255, 0.1);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
    }
`;

const CardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
`;

const CardIcon = styled.div`
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    background-color: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #818cf8;
`;

const CardTitle = styled.h3`
    font-size: 1rem;
    font-weight: 700;
    color: white;
    margin: 0;
    line-height: 1.25;
`;

const CardMeta = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
`;

const TypeBadge = styled.span`
    font-size: 0.75rem;
    color: #6b7280;
    background-color: rgba(255, 255, 255, 0.05);
    padding: 0 0.375rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-family: monospace;
`;

const Status = styled.div`
    display: flex;
    align-items: center;
    font-size: 0.625rem;
    color: #6b7280;
    text-transform: uppercase;
`;

const StatusDot = styled.div<{ color: string }>`
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background-color: ${props => props.color};
    margin-right: 0.375rem;
`;

const MoreButton = styled.button`
    color: #6b7280;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    
    &:hover {
        color: white;
    }
`;

const Description = styled.p`
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0 0 1.5rem 0;
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
`;

const StatBox = styled.div`
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 0.5rem;
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
`;

const StatLabel = styled.div`
    font-size: 0.625rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
`;

const StatValue = styled.div`
    font-size: 1.125rem;
    font-family: monospace;
    color: white;
    font-weight: 600;
`;

const CardFooter = styled.div`
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
`;

const CardActions = styled.div`
    display: flex;
    gap: 6px;
`;

const ActionBtn = styled.button`
    padding: 5px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.12); }
`;

const ActionBtnDanger = styled.button`
    padding: 5px 12px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 6px;
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(248, 113, 113, 0.18); }
`;

const SyncButton = styled.button`
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 500;
    color: #8c52ff;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
        color: white;
    }
`;

const AddCard = styled.div`
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.02);
    min-height: 280px; /* Match card height approx */
    transition: all 0.2s;

    &:hover {
        border-color: rgba(255, 255, 255, 0.2);
        color: white;
        
        div { /* Icon wrapper */
            background-color: rgba(139, 92, 246, 0.1);
            color: #8c52ff;
            transform: scale(1.1);
        }
    }
`;

const AddIconWrapper = styled.div`
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.75rem;
    transition: all 0.3s;
`;

const AddText = styled.span`
    font-size: 0.875rem;
    font-weight: 500;
`;

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    
    .animate-spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
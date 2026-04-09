import type { Meta, StoryObj } from '@storybook/react';
import DataBoard from './layout';

const meta: Meta<typeof DataBoard> = {
    component: DataBoard,
    title: 'layouts/Data Board',
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof DataBoard>;

// Exemple de colonnes pour un dashboard d'utilisateurs
const dashboardColumns = [
    { id: 'ID', label: 'ID', width: 80, sortable: true },
    {
        id: 'nom-utilisateur',
        label: "Nom d'utilisateur",
        width: 180,
        sortable: true,
    },
    { id: 'email', label: 'Email', width: 220, sortable: true },
    { id: 'role', label: 'Rôle', width: 120, sortable: false },
    { id: 'statut', label: 'Statut', width: 100, sortable: true },
    {
        id: 'derniere-connexion',
        label: 'Dernière connexion',
        width: 150,
        sortable: true,
    },
];

// Exemple de colonnes pour un dashboard de ventes
const salesColumns = [
    { id: 'commande', label: 'Commande', width: 100, sortable: true },
    { id: 'client', label: 'Client', width: 180, sortable: true },
    { id: 'produit', label: 'Produit', width: 200, sortable: true },
    { id: 'montant', label: 'Montant', width: 120, sortable: true },
    { id: 'statut', label: 'Statut', width: 120, sortable: false },
    { id: 'date', label: 'Date', width: 130, sortable: true },
];

// Exemple de colonnes pour un dashboard de projets
const projectColumns = [
    { id: 'projet', label: 'Projet', width: 200, sortable: true },
    { id: 'manager', label: 'Manager', width: 150, sortable: true },
    { id: 'equipe', label: 'Équipe', width: 100, sortable: false },
    { id: 'progression', label: 'Progression', width: 120, sortable: true },
    { id: 'deadline', label: 'Deadline', width: 120, sortable: true },
    { id: 'priorite', label: 'Priorité', width: 100, sortable: true },
];

export const UsersDashboard: Story = {
    args: {
        columns: dashboardColumns,
        data: [
            {
                ID: 1,
                "Nom d'utilisateur": 'alice.martin',
                Email: 'alice@example.com',
                Rôle: 'Admin',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 2,
                "Nom d'utilisateur": 'bob.dupont',
                Email: 'bob@example.com',
                Rôle: 'User',
                Statut: 'Inactif',
                'Dernière connexion': '2024-07-20',
            },
            {
                ID: 3,
                "Nom d'utilisateur": 'claire.rousseau',
                Email: 'claire@example.com',
                Rôle: 'Moderator',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 4,
                "Nom d'utilisateur": 'david.martin',
                Email: 'david@example.com',
                Rôle: 'User',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-21',
            },
            {
                ID: 5,
                "Nom d'utilisateur": 'emma.wilson',
                Email: 'emma@example.com',
                Rôle: 'Admin',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 6,
                "Nom d'utilisateur": 'frank.lee',
                Email: 'frank@example.com',
                Rôle: 'User',
                Statut: 'Inactif',
                'Dernière connexion': '2024-07-19',
            },
            {
                ID: 7,
                "Nom d'utilisateur": 'grace.kim',
                Email: 'grace@example.com',
                Rôle: 'Moderator',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 8,
                "Nom d'utilisateur": 'henry.chen',
                Email: 'henry@example.com',
                Rôle: 'User',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-21',
            },
            {
                ID: 9,
                "Nom d'utilisateur": 'ivy.garcia',
                Email: 'ivy@example.com',
                Rôle: 'Admin',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 10,
                "Nom d'utilisateur": 'jack.rodriguez',
                Email: 'jack@example.com',
                Rôle: 'User',
                Statut: 'Inactif',
                'Dernière connexion': '2024-07-18',
            },
            {
                ID: 11,
                "Nom d'utilisateur": 'katie.brown',
                Email: 'katie@example.com',
                Rôle: 'User',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-22',
            },
            {
                ID: 12,
                "Nom d'utilisateur": 'luke.davis',
                Email: 'luke@example.com',
                Rôle: 'Moderator',
                Statut: 'Actif',
                'Dernière connexion': '2024-07-21',
            },
        ],
        itemsPerPage: 5,
        showPagination: true,
    },
    render: (args) => (
        <DataBoard {...args}>
            {({ paginatedData, startIndex, columns }) => (
                <>
                    {paginatedData.map((row, idx) => (
                        <tr key={startIndex + idx}>
                            {columns.map((col) => {
                                const label = col.label;
                                const value =
                                    (row as any)[col.id] ??
                                    (row as any)[label] ??
                                    '';
                                return <td key={col.id}>{value}</td>;
                            })}
                        </tr>
                    ))}
                </>
            )}
        </DataBoard>
    ),
    parameters: {
        docs: {
            description: {
                story: "Exemple d'un tableau de dashboard avec pagination pour la gestion des utilisateurs.",
            },
        },
    },
};

export const SalesDashboard: Story = {
    args: {
        columns: salesColumns,
        data: [
            {
                Commande: 'CMD-001',
                Client: 'Entreprise ABC',
                Produit: 'Logiciel CRM',
                Montant: '2,500€',
                Statut: 'Payé',
                Date: '2024-07-22',
            },
            {
                Commande: 'CMD-002',
                Client: 'Société XYZ',
                Produit: 'Formation',
                Montant: '1,200€',
                Statut: 'En attente',
                Date: '2024-07-21',
            },
            {
                Commande: 'CMD-003',
                Client: 'Start-up DEF',
                Produit: 'Consultation',
                Montant: '800€',
                Statut: 'Annulé',
                Date: '2024-07-20',
            },
            {
                Commande: 'CMD-004',
                Client: 'Corp GHI',
                Produit: 'Développement',
                Montant: '5,000€',
                Statut: 'Payé',
                Date: '2024-07-22',
            },
            {
                Commande: 'CMD-005',
                Client: 'SARL JKL',
                Produit: 'Maintenance',
                Montant: '300€',
                Statut: 'En cours',
                Date: '2024-07-21',
            },
            {
                Commande: 'CMD-006',
                Client: 'Asso MNO',
                Produit: 'Support',
                Montant: '150€',
                Statut: 'Payé',
                Date: '2024-07-20',
            },
            {
                Commande: 'CMD-007',
                Client: 'Groupe PQR',
                Produit: 'Audit',
                Montant: '2,000€',
                Statut: 'En attente',
                Date: '2024-07-19',
            },
            {
                Commande: 'CMD-008',
                Client: 'Firme STU',
                Produit: 'Licence',
                Montant: '999€',
                Statut: 'Payé',
                Date: '2024-07-18',
            },
        ],
        itemsPerPage: 3,
        showPagination: true,
    },
    render: (args) => (
        <DataBoard {...args}>
            {({ paginatedData, startIndex, columns }) => (
                <>
                    {paginatedData.map((row, idx) => (
                        <tr key={startIndex + idx}>
                            {columns.map((col) => {
                                const label = col.label;
                                const value =
                                    (row as any)[col.id] ??
                                    (row as any)[label] ??
                                    '';
                                return <td key={col.id}>{value}</td>;
                            })}
                        </tr>
                    ))}
                </>
            )}
        </DataBoard>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Tableau de dashboard avec pagination pour le suivi des ventes et commandes.',
            },
        },
    },
};

export const ProjectsDashboard: Story = {
    args: {
        columns: projectColumns,
        data: [
            {
                Projet: 'Refonte Site Web',
                Manager: 'Alice Martin',
                Équipe: '5',
                Progression: '75%',
                Deadline: '2024-08-15',
                Priorité: 'Haute',
            },
            {
                Projet: 'App Mobile',
                Manager: 'Bob Dupont',
                Équipe: '8',
                Progression: '45%',
                Deadline: '2024-09-30',
                Priorité: 'Moyenne',
            },
            {
                Projet: 'Migration DB',
                Manager: 'Claire Rousseau',
                Équipe: '3',
                Progression: '90%',
                Deadline: '2024-07-31',
                Priorité: 'Critique',
            },
            {
                Projet: 'API Gateway',
                Manager: 'David Chen',
                Équipe: '4',
                Progression: '60%',
                Deadline: '2024-08-30',
                Priorité: 'Haute',
            },
            {
                Projet: 'Dashboard Analytics',
                Manager: 'Emma Wilson',
                Équipe: '6',
                Progression: '30%',
                Deadline: '2024-10-15',
                Priorité: 'Moyenne',
            },
            {
                Projet: 'Security Audit',
                Manager: 'Frank Lee',
                Équipe: '2',
                Progression: '85%',
                Deadline: '2024-08-01',
                Priorité: 'Critique',
            },
        ],
        itemsPerPage: 4,
        showPagination: true,
    },
    render: (args) => (
        <DataBoard {...args}>
            {({ paginatedData, startIndex, columns }) => (
                <>
                    {paginatedData.map((row, idx) => (
                        <tr key={startIndex + idx}>
                            {columns.map((col) => {
                                const label = col.label;
                                const value =
                                    (row as any)[col.id] ??
                                    (row as any)[label] ??
                                    '';
                                return <td key={col.id}>{value}</td>;
                            })}
                        </tr>
                    ))}
                </>
            )}
        </DataBoard>
    ),
    parameters: {
        docs: {
            description: {
                story: "Dashboard de gestion de projets avec pagination pour le suivi de l'avancement.",
            },
        },
    },
};

export const WithoutPagination: Story = {
    args: {
        columns: [
            { id: 'ID', label: 'ID', width: 60, sortable: true },
            { id: 'nom', label: 'Nom', width: 200, sortable: true },
            { id: 'statut', label: 'Statut', width: 100, sortable: false },
        ],
        data: [
            { ID: 1, Nom: 'Item Alpha', Statut: 'Actif' },
            { ID: 2, Nom: 'Item Beta', Statut: 'Inactif' },
            { ID: 3, Nom: 'Item Gamma', Statut: 'En cours' },
        ],
        showPagination: false,
    },
    render: (args) => (
        <DataBoard {...args}>
            {({ paginatedData, startIndex, columns }) => (
                <>
                    {paginatedData.map((row, idx) => (
                        <tr key={startIndex + idx}>
                            {columns.map((col) => (
                                <td key={col.id}>
                                    {(row as any)[col.id] ??
                                        (row as any)[col.label] ??
                                        ''}
                                </td>
                            ))}
                        </tr>
                    ))}
                </>
            )}
        </DataBoard>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Version sans pagination pour des petites listes de données.',
            },
        },
    },
};

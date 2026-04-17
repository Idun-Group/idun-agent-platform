import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, Users, ChevronDown, Plus } from 'lucide-react';

// ── Public API ──────────────────────────────────────────────────────────────

export type NoProjectStateVariant = 'none-selected' | 'no-access-owner' | 'no-access-member';

export interface NoProjectStateProps {
    variant: NoProjectStateVariant;
    pageTitle?: string;
    pageSubtitle?: string;
}

const NoProjectState: React.FC<NoProjectStateProps> = ({ variant, pageTitle, pageSubtitle }) => {
    const { t } = useTranslation();

    return (
        <Wrapper>
            {(pageTitle || pageSubtitle) && (
                <Header>
                    {pageTitle && <Title>{pageTitle}</Title>}
                    {pageSubtitle && <Subtitle>{pageSubtitle}</Subtitle>}
                </Header>
            )}

            {variant === 'none-selected' && <NoneSelectedBanner t={t} />}
            {variant === 'no-access-owner' && <OwnerBanner t={t} />}
            {variant === 'no-access-member' && <MemberBanner t={t} />}

            <SkeletonGrid data-testid="no-project-skeleton-grid">
                {Array.from({ length: 6 }, (_, i) => (
                    <SkeletonCard key={i} data-testid="no-project-skeleton-card">
                        <SkelHeader>
                            <SkelIcon />
                            <SkelHeaderText>
                                <SkelBar $width={80} $height={12} />
                                <SkelBar $width={50} $height={6} />
                            </SkelHeaderText>
                        </SkelHeader>
                        <SkelDivider />
                        <SkelRow>
                            <SkelDot />
                            <SkelBar $width={65} $height={8} />
                        </SkelRow>
                        <SkelBar $width={30} $height={6} />
                        <SkelBtnRow>
                            <SkelBtn />
                            <SkelBtn />
                        </SkelBtnRow>
                    </SkeletonCard>
                ))}
            </SkeletonGrid>
        </Wrapper>
    );
};

export default NoProjectState;

// ── Variant banners ─────────────────────────────────────────────────────────

type TFn = (key: string, fallback?: string) => string;

const NoneSelectedBanner: React.FC<{ t: TFn }> = ({ t }) => (
    <Banner $tone="info" role="status">
        <BannerIconWrap>
            <FolderOpen size={16} aria-hidden="true" />
        </BannerIconWrap>
        <BannerText>
            <BannerTitle>{t('noProject.noneSelected.title', 'No project selected')}</BannerTitle>
            <BannerDesc>
                {t(
                    'noProject.noneSelected.description',
                    'Pick a project from the selector in the top navbar to load its resources.',
                )}
            </BannerDesc>
        </BannerText>
        <PrimaryButton type="button" aria-disabled="true">
            {t('noProject.noneSelected.cta', 'Select a project')}
            <ChevronDown size={12} aria-hidden="true" />
        </PrimaryButton>
    </Banner>
);

const OwnerBanner: React.FC<{ t: TFn }> = ({ t }) => (
    <Banner $tone="info" role="status">
        <BannerIconWrap>
            <FolderPlus size={16} aria-hidden="true" />
        </BannerIconWrap>
        <BannerText>
            <BannerTitle>{t('noProject.noAccessOwner.title', 'This workspace has no projects')}</BannerTitle>
            <BannerDesc>
                {t(
                    'noProject.noAccessOwner.description',
                    'Create a project to start configuring agents and resources.',
                )}
            </BannerDesc>
        </BannerText>
        <PrimaryLink to="/settings/workspace-projects">
            <Plus size={12} aria-hidden="true" />
            {t('noProject.noAccessOwner.cta', 'Create project')}
        </PrimaryLink>
    </Banner>
);

const MemberBanner: React.FC<{ t: TFn }> = ({ t }) => (
    <Banner $tone="muted" role="status">
        <BannerIconWrap>
            <Users size={16} aria-hidden="true" />
        </BannerIconWrap>
        <BannerText>
            <BannerTitle>{t('noProject.noAccessMember.title', 'No project access')}</BannerTitle>
            <BannerDesc>
                {t(
                    'noProject.noAccessMember.description',
                    'Ask a workspace owner to add you to a project.',
                )}
            </BannerDesc>
        </BannerText>
    </Banner>
);

// ── Animations ──────────────────────────────────────────────────────────────

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
`;

// ── Layout ──────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 32px;
    animation: ${fadeIn} 0.25s ease;
    flex: 1;
    min-height: 0;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Title = styled.h1`
    font-size: 20px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const Subtitle = styled.p`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

// ── Banner ──────────────────────────────────────────────────────────────────

const Banner = styled.div<{ $tone: 'info' | 'muted' }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.5;
    flex-wrap: wrap;

    ${({ $tone }) =>
        $tone === 'info'
            ? `
        background: hsl(var(--primary) / 0.08);
        border: 1px solid hsl(var(--primary) / 0.18);
        color: hsl(var(--foreground));
        --banner-icon-color: hsl(var(--primary));
    `
            : `
        background: var(--overlay-light);
        border: 1px solid var(--border-light);
        color: hsl(var(--muted-foreground));
        --banner-icon-color: hsl(var(--muted-foreground));
    `}
`;

const BannerIconWrap = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--banner-icon-color);
`;

const BannerText = styled.div`
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const BannerTitle = styled.span`
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const BannerDesc = styled.span`
    color: hsl(var(--muted-foreground));
`;

const PrimaryButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: opacity 0.15s;

    &:hover { opacity: 0.88; }
    &[aria-disabled='true'] {
        cursor: default;
        opacity: 0.75;
    }
    &[aria-disabled='true']:hover { opacity: 0.85; }
`;

const PrimaryLink = styled(Link)`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    text-decoration: none;
    transition: opacity 0.15s;

    &:hover { opacity: 0.88; }
`;

// ── Skeleton grid ───────────────────────────────────────────────────────────

const SkeletonGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
`;

const SkeletonCard = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px dashed hsl(var(--border));
    border-radius: 12px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    opacity: 0.7;
`;

const SkelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const SkelIcon = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 9px;
    flex-shrink: 0;
    background:
        linear-gradient(
            90deg,
            var(--overlay-light) 0%,
            var(--overlay-medium) 50%,
            var(--overlay-light) 100%
        );
    background-size: 600px 100%;
    animation: ${shimmer} 1.8s infinite linear;
`;

const SkelHeaderText = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const SkelBar = styled.div<{ $width: number; $height: number }>`
    width: ${({ $width }) => `${$width}%`};
    height: ${({ $height }) => `${$height}px`};
    border-radius: 4px;
    background:
        linear-gradient(
            90deg,
            var(--overlay-light) 0%,
            var(--overlay-medium) 50%,
            var(--overlay-light) 100%
        );
    background-size: 600px 100%;
    animation: ${shimmer} 1.8s infinite linear;
`;

const SkelDivider = styled.div`
    height: 1px;
    background: var(--border-subtle);
`;

const SkelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const SkelDot = styled.div`
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background:
        linear-gradient(
            90deg,
            var(--overlay-light) 0%,
            var(--overlay-medium) 50%,
            var(--overlay-light) 100%
        );
    background-size: 600px 100%;
    animation: ${shimmer} 1.8s infinite linear;
`;

const SkelBtnRow = styled.div`
    display: flex;
    gap: 6px;
    margin-top: 4px;
`;

const SkelBtn = styled.div`
    flex: 1;
    height: 26px;
    border-radius: 6px;
    background: var(--overlay-light);
`;

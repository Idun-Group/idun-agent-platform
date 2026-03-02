import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    itemName: string;
    description?: string;
}

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: var(--overlay-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: hsl(var(--card));
    border-radius: 16px;
    width: 440px;
    max-width: 94vw;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border-light);
    overflow: hidden;
`;

const Header = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: 14px;
`;

const IconWrap = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
`;

const HeaderText = styled.div``;

const Title = styled.h2`
    font-size: 16px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 2px;
`;

const Subtitle = styled.p`
    font-size: 12px;
    color: hsl(var(--text-tertiary));
    margin: 0;
`;

const Body = styled.div`
    padding: 20px 24px;
`;

const Message = styled.p`
    font-size: 14px;
    color: hsl(var(--text-secondary));
    margin: 0 0 8px;
    line-height: 1.55;
`;

const ItemName = styled.span`
    color: hsl(var(--foreground));
    font-weight: 600;
`;

const CustomDescription = styled.p`
    font-size: 13px;
    color: hsl(var(--text-tertiary));
    margin: 8px 0 0;
    line-height: 1.5;
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 12px 0 0;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(248, 113, 113, 0.2);
`;

const Footer = styled.div`
    padding: 16px 24px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const CancelBtn = styled.button`
    padding: 9px 18px;
    background: transparent;
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    color: hsl(var(--text-secondary));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: var(--overlay-light); color: hsl(var(--foreground)); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DeleteBtn = styled.button`
    padding: 9px 20px;
    background: hsl(var(--destructive));
    border: none;
    border-radius: 8px;
    color: hsl(var(--destructive-foreground));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;

    &:hover:not(:disabled) { opacity: 0.88; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Spinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid var(--overlay-strong);
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const DeleteConfirmModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, itemName, description }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsDeleting(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleClose = () => {
        if (isDeleting) return;
        setError(null);
        onClose();
    };

    return (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <Modal>
                <Header>
                    <IconWrap>🗑️</IconWrap>
                    <HeaderText>
                        <Title>Confirm Removal</Title>
                        <Subtitle>This action cannot be undone</Subtitle>
                    </HeaderText>
                </Header>

                <Body>
                    <Message>
                        Are you sure you want to remove <ItemName>{itemName}</ItemName>?
                    </Message>
                    {description && <CustomDescription>{description}</CustomDescription>}
                    {error && <ErrorMsg>{error}</ErrorMsg>}
                </Body>

                <Footer>
                    <CancelBtn onClick={handleClose} disabled={isDeleting}>
                        Cancel
                    </CancelBtn>
                    <DeleteBtn onClick={handleConfirm} disabled={isDeleting}>
                        {isDeleting && <Spinner />}
                        {isDeleting ? 'Removing…' : 'Remove'}
                    </DeleteBtn>
                </Footer>
            </Modal>
        </Overlay>
    );
};

export default DeleteConfirmModal;

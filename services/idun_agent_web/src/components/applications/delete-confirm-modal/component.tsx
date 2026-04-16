import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { AlertTriangle } from 'lucide-react';

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
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: #141a26;
    border-radius: 12px;
    width: 440px;
    max-width: 94vw;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
`;

const Header = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
    color: #e8edf5;
    margin: 0 0 2px;
`;

const Subtitle = styled.p`
    font-size: 12px;
    color: #4a5568;
    margin: 0;
`;

const Body = styled.div`
    padding: 20px 24px;
`;

const Message = styled.p`
    font-size: 14px;
    color: #8a9bb5;
    margin: 0 0 8px;
    line-height: 1.55;
`;

const ItemName = styled.span`
    color: #e8edf5;
    font-weight: 600;
`;

const CustomDescription = styled.p`
    font-size: 13px;
    color: #4a5568;
    margin: 8px 0 0;
    line-height: 1.5;
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: #f87171;
    margin: 12px 0 0;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.08);
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
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #8a9bb5;
    font-size: 14px;
    font-weight: 500;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.04); color: #e8edf5; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DeleteBtn = styled.button`
    padding: 9px 20px;
    background: #dc2626;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;

    &:hover:not(:disabled) { background: #b91c1c; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Spinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
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
                    <IconWrap><AlertTriangle size={20} color="#f87171" /></IconWrap>
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

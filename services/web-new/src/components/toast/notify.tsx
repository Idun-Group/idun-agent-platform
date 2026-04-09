import React from 'react';
import { toast, type ToastOptions } from 'react-toastify';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import styled from 'styled-components';

/* ── Layout ── */

const Row = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 60px;
    justify-content: center;
    align-items: anchor-center;
    padding-left: 15px;
`;

const IconWrap = styled.div<{ $color: string }>`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-top: 1px;
    color: ${p => p.$color};
`;

const Message = styled.span`
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
    color: rgba(226, 228, 240, 0.92);
`;

/* ── Renderers ── */

const SuccessContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="#34d399"><CheckCircle2 size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const ErrorContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="#f87171"><XCircle size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const WarningContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="#f59e0b"><AlertTriangle size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const InfoContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="#0C5CAB"><Info size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

/* ── Public API ── */

/**
 * Drop-in replacement for `toast.success / error / warning / info`.
 *
 * Uses Lucide icons instead of the default react-toastify emojis
 * and wraps text in a properly padded row layout.
 *
 * @example
 *   import { notify } from '@/components/toast/notify';
 *   notify.success('Agent updated');
 *   notify.error('Something went wrong');
 */
export const notify = {
    success(message: string, opts?: ToastOptions) {
        return toast.success(<SuccessContent message={message} />, { icon: false, ...opts });
    },
    error(message: string, opts?: ToastOptions) {
        return toast.error(<ErrorContent message={message} />, { icon: false, ...opts });
    },
    warning(message: string, opts?: ToastOptions) {
        return toast.warning(<WarningContent message={message} />, { icon: false, ...opts });
    },
    info(message: string, opts?: ToastOptions) {
        return toast.info(<InfoContent message={message} />, { icon: false, ...opts });
    },
};

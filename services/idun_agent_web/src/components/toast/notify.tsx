import React from 'react';
import { toast, type ToastOptions } from 'react-toastify';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import styled from 'styled-components';

/**
 * Toast content renderers for Option A (Minimal Bar).
 *
 * Layout contract: icon (18px, flex-shrink: 0) + message (flex: 1, min-width: 0
 * so long strings wrap instead of overflowing). The close button is positioned
 * absolutely from `toast-styles.tsx` — nothing to reserve space for here beyond
 * the body padding defined there.
 */

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
`;

const IconWrap = styled.span<{ $color: string }>`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: ${({ $color }) => $color};
`;

const Message = styled.span`
    flex: 1;
    min-width: 0;
    word-break: break-word;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    letter-spacing: -0.005em;
    color: hsl(var(--foreground));
`;

const SuccessContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="hsl(var(--success, 142 71% 45%))"><CheckCircle2 size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const ErrorContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="hsl(var(--destructive, 0 72% 51%))"><XCircle size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const WarningContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="hsl(var(--warning, 45 93% 47%))"><AlertTriangle size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

const InfoContent: React.FC<{ message: string }> = ({ message }) => (
    <Row>
        <IconWrap $color="hsl(var(--primary))"><Info size={18} /></IconWrap>
        <Message>{message}</Message>
    </Row>
);

/**
 * Drop-in replacement for `toast.success / error / warning / info`.
 *
 * @example
 *   import { notify } from '@/components/toast/notify';
 *   notify.success('Agent updated');
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

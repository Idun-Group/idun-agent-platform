import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

interface TooltipProps {
    /** Tooltip text. When empty or undefined, the tooltip never shows. */
    message?: string;
    /** If false, suppresses the tooltip regardless of message. */
    enabled?: boolean;
    /** Vertical placement. Defaults to 'top'. */
    placement?: 'top' | 'bottom';
    /** Wrapper element className passthrough. */
    className?: string;
    /** Inline style passthrough for layout tweaks on the trigger wrapper. */
    style?: CSSProperties;
    children: ReactNode;
}

/**
 * Portal-based hover tooltip. The bubble is rendered into `document.body` so
 * it escapes any ancestor `overflow`, `clip`, or `transform` that would clip a
 * positioned descendant. Works with hover and keyboard focus.
 */
const Tooltip = ({
    message,
    enabled = true,
    placement = 'top',
    className,
    style,
    children,
}: TooltipProps) => {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

    const active = enabled && !!message;

    const measure = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setCoords({
            top: placement === 'top' ? rect.top : rect.bottom,
            left: rect.left + rect.width / 2,
        });
    }, [placement]);

    const show = useCallback(() => {
        if (!active) return;
        measure();
        setVisible(true);
    }, [active, measure]);

    const hide = useCallback(() => {
        setVisible(false);
    }, []);

    // Re-measure on scroll/resize while visible — keeps the bubble anchored to
    // the trigger when the page shifts (e.g. a parent drawer opens).
    useEffect(() => {
        if (!visible) return;
        const onScroll = () => measure();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [visible, measure]);

    return (
        <>
            <TriggerWrap
                ref={triggerRef}
                className={className}
                style={style}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                {children}
            </TriggerWrap>
            {active && visible && coords
                ? createPortal(
                      <Bubble
                          style={{
                              top: coords.top,
                              left: coords.left,
                              transform:
                                  placement === 'top'
                                      ? 'translate(-50%, calc(-100% - 8px))'
                                      : 'translate(-50%, 8px)',
                          }}
                      >
                          {message}
                      </Bubble>,
                      document.body,
                  )
                : null}
        </>
    );
};

export default Tooltip;

const TriggerWrap = styled.span`
    position: relative;
    display: inline-flex;
`;

const Bubble = styled.div`
    position: fixed;
    padding: 6px 10px;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
    white-space: nowrap;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    z-index: 9999;
    animation: tooltip-fade 120ms ease;

    @keyframes tooltip-fade {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
`;

import styled from 'styled-components';
import { lighten } from '../../../utils/style-variables';

export const Button = styled.button<{
    $variants?: 'base' | 'transparent' | 'colored';
    $color?: string;
}>`
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: ${({ $variants: variants, $color: color }) => {
        switch (variants) {
            case 'base':
                return '#8c52ff';
            case 'transparent':
                return 'transparent';
            case 'colored':
                return color;
            default:
                return 'transparent';
        }
    }};
    border: none;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;

    &:hover:enabled {
        background-color: ${({ $variants: type, $color: color }) => {
            switch (type) {
                case 'base':
                    return '#7a47e6';
                case 'transparent':
                    return '#8c52ff';
                case 'colored':
                    return lighten(color!, 2);
                default:
                    return 'transparent';
            }
        }};
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background-color: #cccccc;
        color: #888888;
    }
`;

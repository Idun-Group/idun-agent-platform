import styled from 'styled-components';
import Popup from '../../../layouts/container/popup/layout';

const Loader = () => {
    return (
        <Popup>
            <LoaderContainer />
        </Popup>
    );
};
export default Loader;

const LoaderContainer = styled.div`
    width: 96px;
    height: 96px;
    border-radius: 50%;
    display: inline-block;
    position: relative;
    border: 6px solid;
    border-color: #fff #fff transparent transparent;
    box-sizing: border-box;
    animation: rotation 1s linear infinite;

    &::after,
    &::before {
        content: '';
        box-sizing: border-box;
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        margin: auto;
        border: 6px solid;
        border-color: transparent transparent #8c52ff;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        box-sizing: border-box;
        animation: rotationBack 0.5s linear infinite;
        transform-origin: center center;
    }

    &::before {
        width: 64px;
        height: 64px;
        border-color: #fff #fff transparent transparent;
        animation: rotation s linear infinite;
    }

    @keyframes rotation {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
    @keyframes rotationBack {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(-360deg);
        }
    }
`;

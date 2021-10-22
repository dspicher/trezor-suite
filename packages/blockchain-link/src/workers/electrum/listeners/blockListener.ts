import { RESPONSES } from '../../../constants';
import { blockheaderToBlockhash } from '../utils';
import type WorkerCommon from '../../common';
import type { BlockHeader, ElectrumAPI } from '../api';

const blockListener = (client: ElectrumAPI, common: WorkerCommon) => {
    const onBlock = ({ height, hex }: BlockHeader) => {
        common.response({
            id: -1,
            type: RESPONSES.NOTIFICATION,
            payload: {
                type: 'block',
                payload: {
                    blockHeight: height,
                    blockHash: blockheaderToBlockhash(hex),
                },
            },
        });
    };

    const subscribe = () => {
        if (!common.getSubscription('block')) {
            common.addSubscription('block');
            client.on('blockchain.headers.subscribe', onBlock);
        }
        return { subscribed: true };
    };

    const unsubscribe = () => {
        if (common.getSubscription('block')) {
            client.off('blockchain.headers.subscribe', onBlock);
            common.removeSubscription('block');
        }
        return { subscribed: false };
    };

    return {
        subscribe,
        unsubscribe,
    };
};

export default blockListener;

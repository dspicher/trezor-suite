import { RESPONSES } from '../../../constants';
import { createAddressManager } from '../utils';
import type WorkerCommon from '../../common';
import type { ElectrumAPI, StatusChange } from '../api';
import type { Subscribe, Unsubscribe } from '../../../types/messages';

type Payload<T extends { type: string; payload: any }> = Extract<
    T['payload'],
    { type: 'addresses' | 'accounts' }
>;

const txListener = (client: ElectrumAPI, common: WorkerCommon) => {
    const addressManager = createAddressManager();

    const onTransaction = ([scripthash, _status]: StatusChange) => {
        const { descriptor, addresses } = addressManager.getInfo(scripthash);
        common.response({
            id: -1,
            type: RESPONSES.NOTIFICATION,
            payload: {
                type: 'notification',
                payload: {
                    descriptor,
                    tx: undefined as any, // TODO
                },
            },
        });
    };

    const subscribe = async (data: Payload<Subscribe>) => {
        const shToSubscribe =
            data.type === 'accounts'
                ? addressManager.addAccounts(data.accounts)
                : addressManager.addAddresses(data.addresses);

        if (!shToSubscribe.length) return { subscribed: false };

        if (!common.getSubscription('notification')) {
            client.on('blockchain.scripthash.subscribe', onTransaction);
            common.addSubscription('notification');
        }

        await Promise.all(
            shToSubscribe.map(scripthash =>
                client.request('blockchain.scripthash.subscribe', scripthash)
            )
        );
        return { subscribed: true };
    };

    const unsubscribe = async (data: Payload<Unsubscribe>) => {
        const shToUnsubscribe =
            data.type === 'accounts'
                ? addressManager.removeAccounts(data.accounts)
                : addressManager.removeAddresses(data.addresses);

        if (!shToUnsubscribe.length) return { subscribed: false };

        if (common.getSubscription('notification') && !addressManager.getCount()) {
            client.off('blockchain.scripthash.subscribe', onTransaction);
            common.removeSubscription('notification');
        }

        await Promise.all(
            shToUnsubscribe.map(scripthash =>
                client.request('blockchain.scripthash.unsubscribe', scripthash)
            )
        );
        return { subscribed: false };
    };

    return {
        subscribe,
        unsubscribe,
    };
};

export default txListener;

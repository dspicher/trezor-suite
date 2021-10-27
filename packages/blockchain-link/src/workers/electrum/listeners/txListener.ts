import { RESPONSES } from '../../../constants';
import { createAddressManager, getTransactions } from '../utils';
import { transformTransaction } from '../../blockbook/utils';
import type WorkerCommon from '../../common';
import type { ElectrumAPI, HistoryTx, StatusChange } from '../api';
import type { Subscribe, Unsubscribe } from '../../../types/messages';

type Payload<T extends { type: string; payload: any }> = Extract<
    T['payload'],
    { type: 'addresses' | 'accounts' }
>;

// TODO optimize if neccessary
const mostRecent = (previous: HistoryTx | undefined, current: HistoryTx) => {
    if (previous === undefined) return current;
    if (previous.height === -1) return previous;
    if (current.height === -1) return current;
    if (previous.height === 0) return previous;
    if (current.height === 0) return current;
    return previous.height >= current.height ? previous : current;
};

const txListener = (client: ElectrumAPI, common: WorkerCommon) => {
    const addressManager = createAddressManager();

    const onTransaction = async ([scripthash, _status]: StatusChange) => {
        const { descriptor, addresses } = addressManager.getInfo(scripthash);
        const history = await client.request('blockchain.scripthash.get_history', scripthash);
        const recent = history.reduce<HistoryTx | undefined>(mostRecent, undefined);
        if (!recent) return;
        const [tx] = await getTransactions(client, [recent.tx_hash]);
        common.response({
            id: -1,
            type: RESPONSES.NOTIFICATION,
            payload: {
                type: 'notification',
                payload: {
                    descriptor,
                    tx: transformTransaction(descriptor, addresses, tx),
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

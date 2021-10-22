import { Api, flatten, tryGetScripthash, discovery, AddressHistory } from '../utils';
import type { ElectrumAPI, HistoryTx } from '../api';
import type { GetAccountInfo as Req } from '../../../types/messages';
import type { GetAccountInfo as Res } from '../../../types/responses';
import type { Address } from '../../../types';

const PAGE_DEFAULT = 0;
const PAGE_SIZE_DEFAULT = 25;

type AddressInfo = Omit<AddressHistory, 'scripthash'> & {
    confirmed: number;
    unconfirmed: number;
};

const getBalances =
    (client: ElectrumAPI) =>
    (addresses: AddressHistory[]): Promise<AddressInfo[]> =>
        Promise.all(
            addresses.map(async ({ address, path, history, scripthash }) => {
                const { confirmed, unconfirmed } = history.length
                    ? await client.request('blockchain.scripthash.get_balance', scripthash)
                    : {
                          confirmed: 0,
                          unconfirmed: 0,
                      };
                return {
                    address,
                    path,
                    history,
                    confirmed,
                    unconfirmed,
                };
            })
        );

const getAccountInfo: Api<Req, Res> = async (client, payload) => {
    const { descriptor, details, page, pageSize } = payload;

    // basic | tokens | tokenBalances are identical for BTC for ADDRESS ONLY

    const parsed = tryGetScripthash(descriptor);
    if (parsed.valid) {
        const { confirmed, unconfirmed, history } = await Promise.all([
            client.request('blockchain.scripthash.get_balance', parsed.scripthash),
            client.request('blockchain.scripthash.get_history', parsed.scripthash),
        ]).then(([{ confirmed, unconfirmed }, history]) => ({
            confirmed,
            unconfirmed,
            history,
        }));
        const historyUnconfirmed = history.filter(r => r.height <= 0).length;
        return {
            descriptor,
            balance: confirmed.toString(),
            availableBalance: (confirmed + unconfirmed).toString(),
            empty: !history.length,
            history: {
                total: history.length - historyUnconfirmed,
                unconfirmed: historyUnconfirmed,
                ...(details === 'txs'
                    ? { transactions: [] } // TODO
                    : {}),
            },
            ...(details === 'txids' || details === 'txs'
                ? {
                      page: {
                          index: 1,
                          size: pageSize || PAGE_SIZE_DEFAULT,
                          total: 1,
                      },
                  }
                : {}),
        };
    }
    const transformAddressInfo = ({ address, path, history }: AddressInfo): Address => ({
        address,
        path,
        transfers: history.length,
        ...(details && ['tokenBalances', 'txids', 'txs'].includes(details) && history.length
            ? {
                  balance: 'TODO',
                  sent: 'TODO',
                  received: 'TODO',
              }
            : {}),
    });

    const receive = await discovery(client, descriptor, 'receive').then(getBalances(client));
    const change = await discovery(client, descriptor, 'change').then(getBalances(client));
    const batch = receive.concat(change);
    const [confirmed, unconfirmed] = batch.reduce(
        ([c, u], { confirmed, unconfirmed }) => [c + confirmed, u + unconfirmed],
        [0, 0]
    );
    const history = flatten(batch.map(({ history }) => history));
    const historyUnconfirmed = history.filter(r => r.height <= 0).length;
    return {
        descriptor,
        balance: confirmed.toString(),
        availableBalance: (confirmed + unconfirmed).toString(),
        empty: !history.length,
        history: {
            total: history.length - historyUnconfirmed,
            unconfirmed: historyUnconfirmed,
        },
        ...(details === 'tokens' || details === 'tokenBalances'
            ? {
                  addresses: {
                      change: change.map(transformAddressInfo),
                      unused: receive
                          .filter(recv => !recv.history.length)
                          .map(transformAddressInfo),
                      used: receive.filter(recv => recv.history.length).map(transformAddressInfo),
                  },
              }
            : {}),
    };
};

export default getAccountInfo;

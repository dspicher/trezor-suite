import { Api, addressToScripthash } from '../utils';
import type { GetAccountBalanceHistory as Req } from '../../../types/messages';
import type { GetAccountBalanceHistory as Res } from '../../../types/responses';

const getAccountBalanceHistory: Api<Req, Res> = async (client, { descriptor, from, to }) => {
    const scripthash = addressToScripthash(descriptor);
    const res = await client.request('blockchain.scripthash.get_history', scripthash); // TODO
    return res as any; // TODO!!!
};

export default getAccountBalanceHistory;
